let currentUser = null;
let courts = [];
let allBookings = [];
let allUsers = [];

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadDashboardData();
    setupEventListeners();
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
        
        if (currentUser.role !== 'admin') {
            window.location.href = '/player.html';
            return;
        }

        document.getElementById('admin-name').textContent = currentUser.full_name;
        document.getElementById('admin-avatar').textContent = currentUser.full_name.charAt(0).toUpperCase();
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = '/';
    }
}

function setupEventListeners() {
    document.getElementById('logout-btn').addEventListener('click', logout);

    document.querySelectorAll('.navbar-nav a, [data-section]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = e.target.dataset.section || e.currentTarget.dataset.section;
            if (section) {
                showSection(section);
                document.querySelectorAll('.navbar-nav a').forEach(l => l.classList.remove('active'));
                document.querySelector(`.navbar-nav a[data-section="${section}"]`)?.classList.add('active');
            }
        });
    });

    document.getElementById('refresh-stats').addEventListener('click', loadDashboardData);

    document.getElementById('add-court-btn').addEventListener('click', () => openCourtModal());
    document.getElementById('close-court-modal').addEventListener('click', () => closeModal('court-modal'));
    document.getElementById('cancel-court-modal').addEventListener('click', () => closeModal('court-modal'));
    document.getElementById('save-court-btn').addEventListener('click', saveCourt);

    document.getElementById('close-status-modal').addEventListener('click', () => closeModal('status-modal'));
    document.getElementById('cancel-status-modal').addEventListener('click', () => closeModal('status-modal'));
    document.getElementById('update-status-btn').addEventListener('click', updateBookingStatus);

    document.getElementById('close-role-modal').addEventListener('click', () => closeModal('role-modal'));
    document.getElementById('cancel-role-modal').addEventListener('click', () => closeModal('role-modal'));
    document.getElementById('update-role-btn').addEventListener('click', updateUserRole);

    document.getElementById('booking-filter-status').addEventListener('change', filterBookings);
    document.getElementById('booking-filter-court').addEventListener('change', filterBookings);
    document.getElementById('booking-filter-date').addEventListener('change', filterBookings);
    document.getElementById('user-filter-role').addEventListener('change', filterUsers);
    document.getElementById('user-search').addEventListener('input', debounce(filterUsers, 300));
}

function showSection(section) {
    const sections = ['dashboard', 'bookings', 'courts', 'users'];
    sections.forEach(s => {
        document.getElementById(`${s}-section`).style.display = s === section ? 'block' : 'none';
    });

    if (section === 'bookings') loadAllBookings();
    if (section === 'courts') loadCourts();
    if (section === 'users') loadUsers();
}

async function loadDashboardData() {
    try {
        const [statsRes, bookingsRes, availabilityRes] = await Promise.all([
            fetch('/api/admin/stats'),
            fetch('/api/admin/bookings'),
            fetch('/api/courts/availability')
        ]);

        const stats = await statsRes.json();
        const bookings = await bookingsRes.json();
        const availability = await availabilityRes.json();

        document.getElementById('stat-total-bookings').textContent = stats.totalBookings || 0;

        // ensure numeric values for revenue so toFixed() is safe
        const totalRevenueNum = parseFloat(stats.totalRevenue) || 0;
        document.getElementById('stat-total-revenue').textContent = `Rs ${totalRevenueNum.toFixed(0)}`;

        document.getElementById('stat-total-users').textContent = stats.totalUsers || 0;
        document.getElementById('stat-active-courts').textContent = stats.activeCourts || 0;
        
        if (document.getElementById('stat-today-bookings')) {
            document.getElementById('stat-today-bookings').textContent = stats.todayBookings || 0;
        }
        if (document.getElementById('stat-pending-bookings')) {
            document.getElementById('stat-pending-bookings').textContent = stats.pendingBookings || 0;
        }
        if (document.getElementById('stat-month-revenue')) {
            const monthRevenueNum = parseFloat(stats.monthRevenue) || 0;
            document.getElementById('stat-month-revenue').textContent = `Rs ${monthRevenueNum.toFixed(0)}`;
        }

        renderRecentBookings(bookings.bookings?.slice(0, 5) || []);
        renderCourtAvailability(availability.courts || []);
    } catch (error) {
        console.error('Load dashboard error:', error);
    }
}

function renderCourtAvailability(courts) {
    const container = document.getElementById('court-availability-grid');
    if (!container) return;
    
    if (courts.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">No courts available</p>';
        return;
    }
    
    container.innerHTML = courts.map(court => {
        const percentage = Math.round((court.available_slots / court.total_slots) * 100);
        let statusClass = 'success';
        let statusText = 'Available';
        
        if (court.availability_status === 'fully_booked') {
            statusClass = 'error';
            statusText = 'Fully Booked';
        } else if (court.availability_status === 'limited') {
            statusClass = 'warning';
            statusText = 'Limited';
        }
        
        return `
            <div class="availability-card">
                <div class="availability-header">
                    <span class="availability-court-name">${court.name}</span>
                    <span class="badge badge-${statusClass === 'error' ? 'cancelled' : statusClass === 'warning' ? 'pending' : 'confirmed'}">${statusText}</span>
                </div>
                <div class="availability-bar">
                    <div class="availability-fill" style="width: ${percentage}%; background: var(--${statusClass})"></div>
                </div>
                <div class="availability-info">
                    <span>${court.available_slots} of ${court.total_slots} slots available</span>
                    <span class="text-${statusClass}">${percentage}%</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderRecentBookings(bookings) {
    const tbody = document.getElementById('recent-bookings-table');
    
    if (bookings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No recent bookings</td></tr>';
        return;
    }

    tbody.innerHTML = bookings.map(booking => {
        const timeSlots = booking.time_slots || [];
        const timeDisplay = timeSlots.length > 0 
            ? timeSlots.map(s => formatTime(s.start_time)).join(', ')
            : '-';

        return `
            <tr>
                <td><span class="font-semibold">#${booking.id}</span></td>
                <td>${booking.full_name || 'Unknown'}</td>
                <td>${booking.court_name}</td>
                <td>${formatDate(booking.booking_date)}</td>
                <td>${timeDisplay}</td>
                <td><span class="badge badge-${booking.status}">${capitalizeFirst(booking.status)}</span></td>
            </tr>
        `;
    }).join('');
}

async function loadAllBookings() {
    const tbody = document.getElementById('all-bookings-table');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding: 2rem;">Loading...</td></tr>';

    try {
        const [bookingsRes, courtsRes] = await Promise.all([
            fetch('/api/admin/bookings'),
            fetch('/api/courts')
        ]);

        const bookingsData = await bookingsRes.json();
        const courtsData = await courtsRes.json();

        allBookings = bookingsData.bookings || [];
        courts = courtsData.courts || [];

        populateCourtFilter();
        renderAllBookings(allBookings);
    } catch (error) {
        console.error('Load bookings error:', error);
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Failed to load bookings</td></tr>';
    }
}

function populateCourtFilter() {
    const select = document.getElementById('booking-filter-court');
    select.innerHTML = '<option value="">All Courts</option>' +
        courts.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

function filterBookings() {
    const status = document.getElementById('booking-filter-status').value;
    const courtId = document.getElementById('booking-filter-court').value;
    const date = document.getElementById('booking-filter-date').value;

    let filtered = [...allBookings];

    if (status) filtered = filtered.filter(b => b.status === status);
    if (courtId) filtered = filtered.filter(b => b.court_id === parseInt(courtId));
    if (date) filtered = filtered.filter(b => b.booking_date === date);

    renderAllBookings(filtered);
}

function renderAllBookings(bookings) {
    const tbody = document.getElementById('all-bookings-table');
    
    if (bookings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding: 3rem;">No bookings found</td></tr>';
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
                <td>${booking.full_name || 'Unknown'}</td>
                <td>${booking.court_name}</td>
                <td>${formatDate(booking.booking_date)}</td>
                <td><div class="time-slots-display">${timeSlotsDisplay || '-'}</div></td>
                <td class="font-semibold">Rs ${parseFloat(booking.total_amount).toFixed(2)}</td>
                <td><span class="badge badge-${booking.status}">${capitalizeFirst(booking.status)}</span></td>
                <td>
                    <div class="actions">
                        <button class="btn btn-secondary btn-sm" onclick="openStatusModal(${booking.id}, '${booking.status}')">Update</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function openStatusModal(bookingId, currentStatus) {
    document.getElementById('status-booking-id').value = bookingId;
    document.getElementById('new-status').value = currentStatus;
    document.getElementById('status-modal').classList.add('active');
}

async function updateBookingStatus() {
    const bookingId = document.getElementById('status-booking-id').value;
    const newStatus = document.getElementById('new-status').value;

    const btn = document.getElementById('update-status-btn');
    btn.disabled = true;
    btn.textContent = 'Updating...';

    try {
        const response = await fetch(`/api/admin/bookings/${bookingId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });

        if (response.ok) {
            closeModal('status-modal');
            loadAllBookings();
            loadDashboardData();
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to update status');
        }
    } catch (error) {
        console.error('Update status error:', error);
        alert('An error occurred');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Update Status';
    }
}

// Courts
async function loadCourts() {
    const container = document.getElementById('admin-courts-grid');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const response = await fetch('/api/courts');
        const data = await response.json();
        courts = data.courts || [];
        renderAdminCourts();
    } catch (error) {
        console.error('Load courts error:', error);
        container.innerHTML = '<p class="text-muted">Failed to load courts</p>';
    }
}

function renderAdminCourts() {
    const container = document.getElementById('admin-courts-grid');
    
    if (courts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">!</div>
                <h3>No Courts</h3>
                <p>Add your first court to get started</p>
            </div>
        `;
        return;
    }

    container.innerHTML = courts.map(court => `
        <div class="court-card">
            <div class="court-image">
                <span class="court-badge">${court.status || 'Active'}</span>
            </div>
            <div class="court-content">
                <h3 class="court-name">${court.name}</h3>
                <p class="court-description">${court.description || 'No description provided.'}</p>
                <div class="court-footer">
                    <div class="court-price">
                        Rs ${parseFloat(court.price_per_hour).toFixed(0)}<span>/hour</span>
                    </div>
                    <div class="actions">
                        <button class="btn btn-secondary btn-sm" onclick="openCourtModal(${court.id})">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteCourt(${court.id})">Delete</button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function openCourtModal(courtId = null) {
    const modal = document.getElementById('court-modal');
    const title = document.getElementById('court-modal-title');
    
    if (courtId) {
        const court = courts.find(c => c.id === courtId);
        if (court) {
            title.textContent = 'Edit Court';
            document.getElementById('court-id').value = court.id;
            document.getElementById('court-name').value = court.name;
            document.getElementById('court-description').value = court.description || '';
            document.getElementById('court-price').value = court.price_per_hour;
            document.getElementById('court-status').value = court.status || 'active';
        }
    } else {
        title.textContent = 'Add New Court';
        document.getElementById('court-form').reset();
        document.getElementById('court-id').value = '';
    }
    
    modal.classList.add('active');
}

async function saveCourt() {
    const courtId = document.getElementById('court-id').value;
    const courtData = {
        name: document.getElementById('court-name').value,
        description: document.getElementById('court-description').value,
        price_per_hour: parseFloat(document.getElementById('court-price').value),
        status: document.getElementById('court-status').value
    };

    if (!courtData.name || !courtData.price_per_hour) {
        alert('Please fill in required fields');
        return;
    }

    const btn = document.getElementById('save-court-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        const url = courtId ? `/api/admin/courts/${courtId}` : '/api/admin/courts';
        const method = courtId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(courtData)
        });

        if (response.ok) {
            closeModal('court-modal');
            loadCourts();
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to save court');
        }
    } catch (error) {
        console.error('Save court error:', error);
        alert('An error occurred');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Court';
    }
}

async function deleteCourt(courtId) {
    if (!confirm('Are you sure you want to delete this court?')) return;

    try {
        const response = await fetch(`/api/admin/courts/${courtId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            loadCourts();
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to delete court');
        }
    } catch (error) {
        console.error('Delete court error:', error);
        alert('An error occurred');
    }
}

// Users
async function loadUsers() {
    const tbody = document.getElementById('users-table');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding: 2rem;">Loading...</td></tr>';

    try {
        const response = await fetch('/api/admin/users');
        const data = await response.json();
        allUsers = data.users || [];
        renderUsers(allUsers);
    } catch (error) {
        console.error('Load users error:', error);
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Failed to load users</td></tr>';
    }
}

function filterUsers() {
    const role = document.getElementById('user-filter-role').value;
    const search = document.getElementById('user-search').value.toLowerCase();

    let filtered = [...allUsers];

    if (role) filtered = filtered.filter(u => u.role === role);
    if (search) {
        filtered = filtered.filter(u => 
            u.full_name.toLowerCase().includes(search) ||
            u.email.toLowerCase().includes(search) ||
            u.username.toLowerCase().includes(search)
        );
    }

    renderUsers(filtered);
}

function renderUsers(users) {
    const tbody = document.getElementById('users-table');
    
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding: 3rem;">No users found</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => `
        <tr>
            <td><span class="font-semibold">#${user.id}</span></td>
            <td>
                <div class="flex items-center gap-1">
                    <div class="user-avatar" style="width: 32px; height: 32px; font-size: 0.75rem;">${user.full_name.charAt(0).toUpperCase()}</div>
                    <div>
                        <div class="font-semibold">${user.full_name}</div>
                        <div class="text-muted" style="font-size: 0.75rem;">@${user.username}</div>
                    </div>
                </div>
            </td>
            <td>${user.email}</td>
            <td>${user.phone || '-'}</td>
            <td><span class="badge ${user.role === 'admin' ? 'badge-confirmed' : 'badge-pending'}">${capitalizeFirst(user.role)}</span></td>
            <td>${formatDate(user.created_at)}</td>
            <td>${user.booking_count || 0}</td>
            <td>
                <div class="actions">
                    <button class="btn btn-secondary btn-sm" onclick="openRoleModal(${user.id}, '${user.full_name}', '${user.role}')">Change Role</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function openRoleModal(userId, userName, currentRole) {
    document.getElementById('role-user-id').value = userId;
    document.getElementById('role-user-name').textContent = userName;
    document.getElementById('new-role').value = currentRole;
    document.getElementById('role-modal').classList.add('active');
}

async function updateUserRole() {
    const userId = document.getElementById('role-user-id').value;
    const newRole = document.getElementById('new-role').value;

    const btn = document.getElementById('update-role-btn');
    btn.disabled = true;
    btn.textContent = 'Updating...';

    try {
        const response = await fetch(`/api/admin/users/${userId}/role`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole })
        });

        if (response.ok) {
            closeModal('role-modal');
            loadUsers();
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to update role');
        }
    } catch (error) {
        console.error('Update role error:', error);
        alert('An error occurred');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Update Role';
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
    if (!dateString) return '-';
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
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
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

window.openCourtModal = openCourtModal;
window.deleteCourt = deleteCourt;
window.openStatusModal = openStatusModal;
window.openRoleModal = openRoleModal;
