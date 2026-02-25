const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const bookingRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');
const courtRoutes = require('./routes/courts');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes will be registered shortly; static assets are served after any
// explicit route handlers below so that we don't accidentally bypass them.

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'futsal-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/courts', courtRoutes);

// Serve HTML pages
// serve landing page at root or explicit path
app.get('/', (req, res) => {
    // if you want the auth/login page to stay at /
    // uncomment the next line and use '/landing' for the new page instead
    // res.sendFile(path.join(__dirname, 'public', 'index.html'));

    // send landing page as the default homepage
    res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

app.get('/landing', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// auth page route – index.html contains login/register forms
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/player', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// serve static assets (css/js/images). ``index:false`` prevents express
// from sending `/public/index.html` when requesting `/` which would
// otherwise override our landing route above.
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
