const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

const router = express.Router();

const requireAdmin = async (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const [users] = await pool.query(
        'SELECT role FROM users WHERE id = ?',
        [req.session.userId]
    );

    if (users.length === 0 || users[0].role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    next();
};

// Dashboard stats
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        const [totalBookings] = await pool.query('SELECT COUNT(*) as count FROM bookings');
        const [pendingBookings] = await pool.query("SELECT COUNT(*) as count FROM bookings WHERE status = 'pending'");
        const [confirmedBookings] = await pool.query("SELECT COUNT(*) as count FROM bookings WHERE status = 'confirmed'");
        const [paidBookings] = await pool.query("SELECT COUNT(*) as count FROM bookings WHERE status = 'paid'");
        const [completedBookings] = await pool.query("SELECT COUNT(*) as count FROM bookings WHERE status = 'completed'");
        const [totalUsers] = await pool.query("SELECT COUNT(*) as count FROM users");
        const [activeCourts] = await pool.query("SELECT COUNT(*) as count FROM courts WHERE is_available = TRUE");
        // Total revenue only from paid and completed bookings
        const [totalRevenue] = await pool.query("SELECT COALESCE(SUM(total_amount), 0) as total FROM bookings WHERE status IN ('paid', 'completed')");
        const [todayBookings] = await pool.query(
            'SELECT COUNT(*) as count FROM bookings WHERE booking_date = CURDATE()'
        );
        
        // Get today's earnings (paid and completed only)
        const [todayEarnings] = await pool.query(
            "SELECT COALESCE(SUM(total_amount), 0) as total FROM bookings WHERE booking_date = CURDATE() AND status IN ('paid', 'completed')"
        );
        
        // Get this month's bookings and revenue
        const [monthBookings] = await pool.query(
            'SELECT COUNT(*) as count FROM bookings WHERE MONTH(booking_date) = MONTH(CURDATE()) AND YEAR(booking_date) = YEAR(CURDATE())'
        );
        const [monthRevenue] = await pool.query(
            "SELECT COALESCE(SUM(total_amount), 0) as total FROM bookings WHERE MONTH(booking_date) = MONTH(CURDATE()) AND YEAR(booking_date) = YEAR(CURDATE()) AND status IN ('paid', 'completed')"
        );

        // convert mysql decimal strings to numbers before returning
        res.json({
            totalBookings: totalBookings[0].count,
            pendingBookings: pendingBookings[0].count,
            confirmedBookings: confirmedBookings[0].count,
            paidBookings: paidBookings[0].count,
            completedBookings: completedBookings[0].count,
            totalUsers: totalUsers[0].count,
            activeCourts: activeCourts[0].count,
            totalRevenue: parseFloat(totalRevenue[0].total) || 0,
            todayBookings: todayBookings[0].count,
            todayEarnings: parseFloat(todayEarnings[0].total) || 0,
            monthBookings: monthBookings[0].count,
            monthRevenue: parseFloat(monthRevenue[0].total) || 0
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// Get all bookings
router.get('/bookings', requireAdmin, async (req, res) => {
    try {
        const { status, date } = req.query;
        let query = `
            SELECT b.*, u.username, u.full_name, u.phone, u.email,
                   c.name as court_name
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN courts c ON b.court_id = c.id
            WHERE 1=1
        `;
        const params = [];

        if (status && status !== 'all') {
            query += ' AND b.status = ?';
            params.push(status);
        }

        if (date) {
            query += ' AND b.booking_date = ?';
            params.push(date);
        }

        query += ' ORDER BY b.booking_date DESC, b.created_at DESC';

        const [bookings] = await pool.query(query, params);

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
        console.error('Get all bookings error:', error);
        res.status(500).json({ error: 'Failed to get bookings' });
    }
});

// Update booking status
router.put('/bookings/:id/status', requireAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['pending', 'confirmed', 'paid', 'cancelled', 'completed'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        await pool.query(
            'UPDATE bookings SET status = ? WHERE id = ?',
            [status, req.params.id]
        );

        res.json({ message: 'Booking status updated' });
    } catch (error) {
        console.error('Update booking status error:', error);
        res.status(500).json({ error: 'Failed to update booking status' });
    }
});

// Get all users
router.get('/users', requireAdmin, async (req, res) => {
    try {
        const [users] = await pool.query(
            `SELECT u.id, u.username, u.email, u.full_name, u.phone, u.role, u.created_at,
                    (SELECT COUNT(*) FROM bookings WHERE user_id = u.id) as booking_count
             FROM users u
             ORDER BY u.created_at DESC`
        );
        res.json({ users });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// Delete user
router.delete('/users/:id', requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;

        if (parseInt(userId) === req.session.userId) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        await pool.query('DELETE FROM users WHERE id = ?', [userId]);
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Get all courts (admin)
router.get('/courts', requireAdmin, async (req, res) => {
    try {
        const [courts] = await pool.query('SELECT * FROM courts ORDER BY name');
        res.json({ courts });
    } catch (error) {
        console.error('Get courts error:', error);
        res.status(500).json({ error: 'Failed to get courts' });
    }
});

// Add court
router.post('/courts', requireAdmin, async (req, res) => {
    try {
        const { name, description, price_per_hour } = req.body;

        const [result] = await pool.query(
            'INSERT INTO courts (name, description, price_per_hour) VALUES (?, ?, ?)',
            [name, description, price_per_hour]
        );

        res.status(201).json({
            message: 'Court added successfully',
            courtId: result.insertId
        });
    } catch (error) {
        console.error('Add court error:', error);
        res.status(500).json({ error: 'Failed to add court' });
    }
});

// Update court
router.put('/courts/:id', requireAdmin, async (req, res) => {
    try {
        const { name, description, price_per_hour, is_available } = req.body;

        await pool.query(
            'UPDATE courts SET name = ?, description = ?, price_per_hour = ?, is_available = ? WHERE id = ?',
            [name, description, price_per_hour, is_available, req.params.id]
        );

        res.json({ message: 'Court updated successfully' });
    } catch (error) {
        console.error('Update court error:', error);
        res.status(500).json({ error: 'Failed to update court' });
    }
});

// Delete court
router.delete('/courts/:id', requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM courts WHERE id = ?', [req.params.id]);
        res.json({ message: 'Court deleted successfully' });
    } catch (error) {
        console.error('Delete court error:', error);
        res.status(500).json({ error: 'Failed to delete court' });
    }
});

module.exports = router;
