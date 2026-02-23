
let currentUser = null;
let currentStep = 1;
let selectedCourt = null;
let selectedDate = null;
let selectedTimeSlots = [];
let courts = [];
let allTimeSlots = [];
let bookingToCancel = null;

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadCourts();
    setupEventListeners();
    generateDatePicker();
});

async function checkAuth() {
    try {
        const response = await fetch('/api/auth/me');
        
        if (!response.ok) {
            window.location.href = '/';
            return;
        }

        const data = await response.json();
        currentUser = data.user;
        
        if (currentUser.role === 'admin') {
            window.location.href = '/admin.html';
            return;
        }

        document.getElementById('user-name').textContent = currentUser.full_name;
        document.getElementById('user-avatar').textContent = currentUser.full_name.charAt(0).toUpperCase();
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = '/';
    }
}

function setupEventListeners() {
    document.getElementById('logout-btn').addEventListener('click', logout);

    document.querySelectorAll('.navbar-nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = e.target.dataset.section;
            showSection(section);
            
            document.querySelectorAll('.navbar-nav a').forEach(l => l.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    document.getElementById('next-to-step-2').addEventListener('click', () => goToStep(2));
    document.getElementById('next-to-step-3').addEventListener('click', () => goToStep(3));
    document.getElementById('next-to-step-4').addEventListener('click', () => goToStep(4));
    document.getElementById('back-to-step-1').addEventListener('click', () => goToStep(1));
    document.getElementById('back-to-step-2').addEventListener('click', () => goToStep(2));
    document.getElementById('back-to-step-3').addEventListener('click', () => goToStep(3));

    document.getElementById('confirm-booking').addEventListener('click', confirmBooking);

    document.getElementById('new-booking-btn').addEventListener('click', () => {
        showSection('booking');
        document.querySelectorAll('.navbar-nav a').forEach(l => l.classList.remove('active'));
        document.querySelector('[data-section="booking"]').classList.add('active');
    });

    document.getElementById('filter-status').addEventListener('change', loadMyBookings);
    document.getElementById('filter-court').addEventListener('change', loadMyBookings);

    document.getElementById('close-success-modal').addEventListener('click', () => closeModal('success-modal'));
    document.getElementById('view-bookings-btn').addEventListener('click', () => {
        closeModal('success-modal');
        showSection('my-bookings');
        document.querySelectorAll('.navbar-nav a').forEach(l => l.classList.remove('active'));
        document.querySelector('[data-section="my-bookings"]').classList.add('active');
    });
    document.getElementById('new-booking-modal-btn').addEventListener('click', () => {
        closeModal('success-modal');
        resetBookingForm();
    });

    document.getElementById('close-cancel-modal').addEventListener('click', () => closeModal('cancel-modal'));
    document.getElementById('cancel-modal-close').addEventListener('click', () => closeModal('cancel-modal'));
    document.getElementById('confirm-cancel-btn').addEventListener('click', cancelBooking);
}

function showSection(section) {
    document.getElementById('booking-section').style.display = section === 'booking' ? 'block' : 'none';
    document.getElementById('my-bookings-section').style.display = section === 'my-bookings' ? 'block' : 'none';

    if (section === 'my-bookings') {
        loadMyBookings();
    }
}

function goToStep(step) {
    currentStep = step;
    
    document.querySelectorAll('.booking-step').forEach(s => {
        const stepNum = parseInt(s.dataset.step);
        s.classList.remove('active', 'completed');
        if (stepNum < step) s.classList.add('completed');
        if (stepNum === step) s.classList.add('active');
    });

    const connectors = document.querySelectorAll('.step-connector');
    connectors.forEach((connector, index) => {
        if (index < step - 1) {
            connector.classList.add('completed');
        } else {
            connector.classList.remove('completed');
        }
    });

    for (let i = 1; i <= 4; i++) {
        document.getElementById(`step-${i}-content`).style.display = i === step ? 'block' : 'none';
    }

    if (step === 3 && selectedCourt && selectedDate) {
        loadAvailableSlots();
    }

    if (step === 4) {
        updateBookingSummary();
    }
}

function generateDatePicker() {
    const container = document.getElementById('date-picker-grid');
    const today = new Date();
    const dates = [];

    for (let i = 0; i < 14; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        dates.push(date);
    }

    container.innerHTML = dates.map((date, index) => {
        const dateStr = date.toISOString().split('T')[0];
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const dayNum = date.getDate();
        const monthName = date.toLocaleDateString('en-US', { month: 'short' });
        
        return `
            <div class="date-option ${index === 0 ? 'selected' : ''}" data-date="${dateStr}">
                <div class="date-option-day">${dayName}</div>
                <div class="date-option-date">${dayNum}</div>
                <div class="date-option-month">${monthName}</div>
            </div>
        `;
    }).join('');

    selectedDate = dates[0].toISOString().split('T')[0];

    container.querySelectorAll('.date-option').forEach(option => {
        option.addEventListener('click', () => {
            container.querySelectorAll('.date-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            selectedDate = option.dataset.date;
            selectedTimeSlots = [];
            updateSelectedSlotsDisplay();
            document.getElementById('next-to-step-3').disabled = false;
        });
    });

    document.getElementById('next-to-step-3').disabled = false;
}

async function loadCourts() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const response = await fetch(`/api/courts/availability?date=${today}`);
        const data = await response.json();
        courts = data.courts;
        renderCourts();
        populateCourtFilter();
    } catch (error) {
        console.error('Load courts error:', error);
    }
}

function renderCourts() {
    const container = document.getElementById('courts-grid');
    
    if (courts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">!</div>
                <h3>No Courts Available</h3>
                <p>Please check back later</p>
            </div>
        `;
        return;
    }

    container.innerHTML = courts.map(court => {
        let availabilityBadge = '';
        let availabilityClass = '';
        
        if (court.availability_status === 'fully_booked') {
            availabilityBadge = '<span class="court-availability-badge booked">Fully Booked Today</span>';
            availabilityClass = 'court-unavailable';
        } else if (court.availability_status === 'limited') {
            availabilityBadge = `<span class="court-availability-badge limited">${court.available_slots} slots left</span>`;
        } else {
            availabilityBadge = `<span class="court-availability-badge available">${court.available_slots} slots available</span>`;
        }
        
        return `
            <div class="court-card ${availabilityClass}" data-id="${court.id}">
                <div class="court-image">
                    <span class="court-badge">${court.status || 'Active'}</span>
                </div>
                <div class="court-content">
                    <h3 class="court-name">${court.name}</h3>
                    <p class="court-description">${court.description || 'Premium futsal court with professional-grade turf and lighting.'}</p>
                    ${availabilityBadge}
                    <div class="court-meta">
                        <span class="court-meta-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            1 hour slots
                        </span>
                        <span class="court-meta-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                <circle cx="9" cy="7" r="4"></circle>
                            </svg>
                            10 players
                        </span>
                    </div>
                    <div class="court-footer">
                        <div class="court-price">
                            Rs ${parseFloat(court.price_per_hour).toFixed(0)}<span>/hour</span>
                        </div>
                        <div class="court-select-indicator">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.court-card').forEach(card => {
        card.addEventListener('click', () => selectCourt(card));
    });
}

function selectCourt(card) {
    document.querySelectorAll('.court-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    
    const courtId = parseInt(card.dataset.id);
    selectedCourt = courts.find(c => c.id === courtId);
    
    document.getElementById('next-to-step-2').disabled = false;
    
    selectedTimeSlots = [];
    updateSelectedSlotsDisplay();
}

function populateCourtFilter() {
    const select = document.getElementById('filter-court');
    select.innerHTML = '<option value="">All Courts</option>' + 
        courts.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

async function loadAvailableSlots() {
    const container = document.getElementById('time-slots-grid');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const response = await fetch(`/api/bookings/available?date=${selectedDate}&court_id=${selectedCourt.id}`);
        const data = await response.json();
        allTimeSlots = data.slots;
        renderTimeSlots(data.slots);
    } catch (error) {
        console.error('Load slots error:', error);
        container.innerHTML = '<p class="text-muted">Failed to load time slots</p>';
    }
}

function renderTimeSlots(slots) {
    const container = document.getElementById('time-slots-grid');
    
    if (slots.length === 0) {
        container.innerHTML = '<p class="text-muted">No time slots available for this date</p>';
        return;
    }

    container.innerHTML = slots.map(slot => {
        const isSelected = selectedTimeSlots.some(s => s.id === slot.id);
        return `
            <div class="time-slot ${slot.is_available ? '' : 'unavailable'} ${isSelected ? 'selected' : ''}" 
                 data-id="${slot.id}" 
                 data-start="${slot.start_time}" 
                 data-end="${slot.end_time}">
                <div class="time-slot-time">${formatTime(slot.start_time)} - ${formatTime(slot.end_time)}</div>
                <div class="time-slot-status">${slot.is_available ? 'Available' : 'Booked'}</div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.time-slot:not(.unavailable)').forEach(slot => {
        slot.addEventListener('click', () => toggleTimeSlot(slot));
    });
}

function toggleTimeSlot(slotElement) {
    const slotId = parseInt(slotElement.dataset.id);
    const slotData = {
        id: slotId,
        start_time: slotElement.dataset.start,
        end_time: slotElement.dataset.end
    };

    const existingIndex = selectedTimeSlots.findIndex(s => s.id === slotId);

    if (existingIndex > -1) {
        selectedTimeSlots.splice(existingIndex, 1);
        slotElement.classList.remove('selected');
    } else {
        selectedTimeSlots.push(slotData);
        slotElement.classList.add('selected');
    }

    selectedTimeSlots.sort((a, b) => a.start_time.localeCompare(b.start_time));

    updateSelectedSlotsDisplay();
    document.getElementById('next-to-step-4').disabled = selectedTimeSlots.length === 0;
}

function removeTimeSlot(slotId) {
    selectedTimeSlots = selectedTimeSlots.filter(s => s.id !== slotId);
    
    const slotElement = document.querySelector(`.time-slot[data-id="${slotId}"]`);
    if (slotElement) {
        slotElement.classList.remove('selected');
    }
    
    updateSelectedSlotsDisplay();
    document.getElementById('next-to-step-4').disabled = selectedTimeSlots.length === 0;
}

function updateSelectedSlotsDisplay() {
    const container = document.getElementById('selected-slots-container');
    const list = document.getElementById('selected-slots-list');
    const count = document.getElementById('selected-count');

    if (selectedTimeSlots.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    count.textContent = `${selectedTimeSlots.length} slot${selectedTimeSlots.length > 1 ? 's' : ''} selected`;
    
    list.innerHTML = selectedTimeSlots.map(slot => `
        <span class="selected-slot-tag">
            ${formatTime(slot.start_time)} - ${formatTime(slot.end_time)}
            <span class="remove-slot" onclick="removeTimeSlot(${slot.id})">x</span>
        </span>
    `).join('');
}

function updateBookingSummary() {
    if (!selectedCourt || selectedTimeSlots.length === 0) return;

    const slotsCount = selectedTimeSlots.length;
    const totalAmount = selectedCourt.price_per_hour * slotsCount;

    document.getElementById('summary-court').textContent = selectedCourt.name;
    document.getElementById('summary-date').textContent = formatDate(selectedDate);
    document.getElementById('summary-slots').textContent = `${slotsCount} slot${slotsCount > 1 ? 's' : ''}`;
    document.getElementById('summary-duration').textContent = `${slotsCount} hour${slotsCount > 1 ? 's' : ''}`;
    document.getElementById('summary-price-per-hour').textContent = `Rs ${parseFloat(selectedCourt.price_per_hour).toFixed(2)}`;
    document.getElementById('summary-total').textContent = `Rs ${totalAmount.toFixed(2)}`;
}

async function confirmBooking() {
    if (selectedTimeSlots.length === 0) return;

    const notes = document.getElementById('booking-notes').value;
    const timeSlotIds = selectedTimeSlots.map(s => s.id);
    
    const btn = document.getElementById('confirm-booking');
    btn.disabled = true;
    btn.textContent = 'Processing...';

    try {
        const response = await fetch('/api/bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                court_id: selectedCourt.id,
                booking_date: selectedDate,
                time_slot_ids: timeSlotIds,
                notes: notes
            })
        });

        const data = await response.json();

        if (response.ok) {
            document.getElementById('success-modal').classList.add('active');
            resetBookingForm();
        } else {
            alert(data.error || 'Failed to create booking');
        }
    } catch (error) {
        console.error('Booking error:', error);
        alert('An error occurred. Please try again.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirm Booking';
    }
}

function resetBookingForm() {
    selectedCourt = null;
    selectedTimeSlots = [];
    currentStep = 1;
    
    document.querySelectorAll('.court-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('next-to-step-2').disabled = true;
    document.getElementById('next-to-step-4').disabled = true;
    document.getElementById('booking-notes').value = '';
    
    goToStep(1);
    generateDatePicker();
}

async function loadMyBookings() {
    const tbody = document.getElementById('bookings-table-body');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding: 3rem;">Loading bookings...</td></tr>';

    try {
        const response = await fetch('/api/bookings/my-bookings');
        const data = await response.json();
        
        let bookings = data.bookings || [];
        
        const statusFilter = document.getElementById('filter-status').value;
        const courtFilter = document.getElementById('filter-court').value;
        
        if (statusFilter) {
            bookings = bookings.filter(b => b.status === statusFilter);
        }
        
        if (courtFilter) {
            bookings = bookings.filter(b => b.court_id === parseInt(courtFilter));
        }
        
        renderBookings(bookings);
        updateQuickStats(data.bookings || []);
    } catch (error) {
        console.error('Load bookings error:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Failed to load bookings</td></tr>';
    }
}

function renderBookings(bookings) {
    const tbody = document.getElementById('bookings-table-body');
    
    if (bookings.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="empty-state">
                        <div class="empty-state-icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                        </div>
                        <h3>No Bookings Found</h3>
                        <p>You haven't made any bookings yet</p>
                        <button class="btn btn-primary" onclick="showSection('booking'); document.querySelectorAll('.navbar-nav a').forEach(l => l.classList.remove('active')); document.querySelector('[data-section=booking]').classList.add('active');">Book Now</button>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = bookings.map(booking => {
        const timeSlots = booking.time_slots || [];
        const timeSlotsDisplay = timeSlots.map(s => 
            `<span class="time-slot-badge">${formatTime(s.start_time)}</span>`
        ).join(' ');

        return `
            <tr>
                <td><span class="font-semibold">#${booking.id}</span></td>
                <td>${booking.court_name}</td>
                <td>${formatDate(booking.booking_date)}</td>
                <td><div class="time-slots-display">${timeSlotsDisplay || '-'}</div></td>
                <td class="font-semibold">Rs ${parseFloat(booking.total_amount).toFixed(2)}</td>
                <td><span class="badge badge-${booking.status}">${capitalizeFirst(booking.status)}</span></td>
                <td>
                    ${booking.status === 'pending' || booking.status === 'confirmed' ? 
                        `<button class="btn btn-danger btn-sm" onclick="showCancelModal(${booking.id})">Cancel</button>` : 
                        '<span class="text-muted">-</span>'}
                </td>
            </tr>
        `;
    }).join('');
}

function updateQuickStats(bookings) {
    const total = bookings.length;
    const confirmed = bookings.filter(b => b.status === 'confirmed').length;
    const today = new Date().toISOString().split('T')[0];
    const upcoming = bookings.filter(b => b.booking_date >= today && b.status !== 'cancelled').length;

    document.getElementById('total-bookings').textContent = total;
    document.getElementById('confirmed-bookings').textContent = confirmed;
    document.getElementById('upcoming-bookings').textContent = upcoming;
}

function showCancelModal(bookingId) {
    bookingToCancel = bookingId;
    document.getElementById('cancel-booking-id').value = bookingId;
    document.getElementById('cancel-modal').classList.add('active');
}

async function cancelBooking() {
    if (!bookingToCancel) return;

    const btn = document.getElementById('confirm-cancel-btn');
    btn.disabled = true;
    btn.textContent = 'Cancelling...';

    try {
        const response = await fetch(`/api/bookings/${bookingToCancel}/cancel`, {
            method: 'PUT'
        });

        const data = await response.json();

        if (response.ok) {
            closeModal('cancel-modal');
            loadMyBookings();
        } else {
            alert(data.error || 'Failed to cancel booking');
        }
    } catch (error) {
        console.error('Cancel error:', error);
        alert('An error occurred');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Cancel Booking';
        bookingToCancel = null;
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        console.error('Logout error:', error);
    }
}

function formatDate(dateString) {
    const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
}

function formatTime(timeString) {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

window.removeTimeSlot = removeTimeSlot;
