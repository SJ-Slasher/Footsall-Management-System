const express = require('express');
const pool = require('../config/database');

const router = express.Router();

const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
};

// Get all time slots
router.get('/time-slots', async (req, res) => {
    try {
        const [slots] = await pool.query(
            'SELECT * FROM time_slots WHERE is_active = TRUE ORDER BY start_time'
        );
        res.json({ slots });
    } catch (error) {
        console.error('Get time slots error:', error);
        res.status(500).json({ error: 'Failed to get time slots' });
    }
});

// Get available slots for a specific date and court
router.get('/available', async (req, res) => {
    try {
        const { date, court_id } = req.query;

        if (!date || !court_id) {
            return res.status(400).json({ error: 'Date and court_id are required' });
        }

        const [allSlots] = await pool.query(
            'SELECT * FROM time_slots WHERE is_active = TRUE ORDER BY start_time'
        );

        // Get booked slots for the date and court
        const [bookedSlots] = await pool.query(
            `SELECT bts.time_slot_id FROM booking_time_slots bts
             JOIN bookings b ON bts.booking_id = b.id
             WHERE b.booking_date = ? AND b.court_id = ? AND b.status != 'cancelled'`,
            [date, court_id]
        );

        const bookedSlotIds = bookedSlots.map(b => b.time_slot_id);

        // Mark availability based on existing bookings
        let availableSlots = allSlots.map(slot => ({
            ...slot,
            is_available: !bookedSlotIds.includes(slot.id)
        }));

        // If requesting today's slots, hide any time slots that start in the past
        const today = new Date().toISOString().split('T')[0];
        if (date === today) {
            const now = new Date();
            const currentTime = now.toTimeString().split(' ')[0]; // HH:MM:SS
            availableSlots = availableSlots.map(slot => {
                if (slot.start_time <= currentTime) {
                    return { ...slot, is_available: false };
                }
                return slot;
            });
        }

        res.json({ slots: availableSlots });
    } catch (error) {
        console.error('Get available slots error:', error);
        res.status(500).json({ error: 'Failed to get available slots' });
    }
});

// Create a booking with multiple time slots
router.post('/', requireAuth, async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { court_id, booking_date, time_slot_ids, notes } = req.body;
        const user_id = req.session.userId;

        if (!time_slot_ids || time_slot_ids.length === 0) {
            return res.status(400).json({ error: 'Please select at least one time slot' });
        }

        // Prevent booking on past dates or times
        const todayStr = new Date().toISOString().split('T')[0];
        if (booking_date < todayStr) {
            return res.status(400).json({ error: 'Cannot book on a past date' });
        }
        if (booking_date === todayStr) {
            const now = new Date();
            const currentTime = now.toTimeString().split(' ')[0];
            // fetch slot times for the requested ids
            const [slots] = await connection.query(
                'SELECT id, start_time FROM time_slots WHERE id IN (?)',
                [time_slot_ids]
            );
            const hasPast = slots.some(s => s.start_time <= currentTime);
            if (hasPast) {
                return res.status(400).json({ error: 'Cannot book time slots that have already started' });
            }
        }

        // Get court price
        const [courts] = await connection.query('SELECT price_per_hour FROM courts WHERE id = ?', [court_id]);
        if (courts.length === 0) {
            return res.status(404).json({ error: 'Court not found' });
        }

        const total_amount = courts[0].price_per_hour * time_slot_ids.length;

        // Check if any slots are already booked
        const [existing] = await connection.query(
            `SELECT bts.time_slot_id FROM booking_time_slots bts
             JOIN bookings b ON bts.booking_id = b.id
             WHERE b.court_id = ? AND b.booking_date = ? AND b.status != 'cancelled'
             AND bts.time_slot_id IN (?)`,
            [court_id, booking_date, time_slot_ids]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Some selected slots are already booked' });
        }

        await connection.beginTransaction();

        // Create booking
        const [result] = await connection.query(
            `INSERT INTO bookings (user_id, court_id, booking_date, total_amount, notes, status)
             VALUES (?, ?, ?, ?, ?, 'pending')`,
            [user_id, court_id, booking_date, total_amount, notes]
        );

        const bookingId = result.insertId;

        // Insert time slots for the booking
        const slotValues = time_slot_ids.map(slotId => [bookingId, slotId]);
        await connection.query(
            'INSERT INTO booking_time_slots (booking_id, time_slot_id) VALUES ?',
            [slotValues]
        );

        await connection.commit();

        res.status(201).json({
            message: 'Booking created successfully',
            bookingId: bookingId
        });
    } catch (error) {
        await connection.rollback();
        console.error('Create booking error:', error);
        res.status(500).json({ error: 'Failed to create booking' });
    } finally {
        connection.release();
    }
});

// Get user's bookings
router.get('/my-bookings', requireAuth, async (req, res) => {
    try {
        const [bookings] = await pool.query(
            `SELECT b.*, c.name as court_name, c.price_per_hour
             FROM bookings b
             JOIN courts c ON b.court_id = c.id
             WHERE b.user_id = ?
             ORDER BY b.booking_date DESC, b.created_at DESC`,
            [req.session.userId]
        );

        // Get time slots for each booking
        for (let booking of bookings) {
            const [slots] = await pool.query(
                `SELECT ts.* FROM time_slots ts
                 JOIN booking_time_slots bts ON ts.id = bts.time_slot_id
                 WHERE bts.booking_id = ?
                 ORDER BY ts.start_time`,
                [booking.id]
            );
            booking.time_slots = slots;
        }

        res.json({ bookings });
    } catch (error) {
        console.error('Get bookings error:', error);
        res.status(500).json({ error: 'Failed to get bookings' });
    }
});

// Cancel a booking
router.put('/:id/cancel', requireAuth, async (req, res) => {
    try {
        const bookingId = req.params.id;

        const [bookings] = await pool.query(
            'SELECT * FROM bookings WHERE id = ? AND user_id = ?',
            [bookingId, req.session.userId]
        );

        if (bookings.length === 0) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        await pool.query(
            "UPDATE bookings SET status = 'cancelled' WHERE id = ?",
            [bookingId]
        );

        res.json({ message: 'Booking cancelled successfully' });
    } catch (error) {
        console.error('Cancel booking error:', error);
        res.status(500).json({ error: 'Failed to cancel booking' });
    }
});

module.exports = router;
