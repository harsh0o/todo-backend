
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const pool = require('../config/database');
const { sendOTPEmail } = require('../utils/email');

// Generate JWT Token
const generateToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE,
    });
};

// Generate 6-digit OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Register User
exports.register = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, email, password, role = 'user' } = req.body;

        // Check if user exists
        const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const result = await pool.query(
            'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
            [name, email, hashedPassword, role]
        );

        const user = result.rows[0];
        const token = generateToken(user.id);

        res.status(201).json({
            message: 'User registered successfully',
            user,
            token,
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
};

// Login with Password
exports.login = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password } = req.body;

        // Find user
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        if (!user.is_active) {
            return res.status(401).json({ error: 'Account is inactive' });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = generateToken(user.id);

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
            token,
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
};

// Request OTP
exports.requestOTP = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email } = req.body;

        // Check if user exists
        const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Generate OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Save OTP to database
        await pool.query(
            'INSERT INTO otps (email, otp, expires_at) VALUES ($1, $2, $3)',
            [email, otp, expiresAt]
        );

        // Send OTP via email
        const emailSent = await sendOTPEmail(email, otp);
        
        if (!emailSent) {
            return res.status(500).json({ error: 'Failed to send OTP email' });
        }

        res.json({
            message: 'OTP sent successfully to your email',
            expiresIn: '10 minutes',
        });
    } catch (error) {
        console.error('Request OTP error:', error);
        res.status(500).json({ error: 'Failed to send OTP' });
    }
};

// Verify OTP and Login
exports.verifyOTP = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, otp } = req.body;

        // Find valid OTP
        const otpResult = await pool.query(
            'SELECT * FROM otps WHERE email = $1 AND otp = $2 AND is_used = false AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
            [email, otp]
        );

        if (otpResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid or expired OTP' });
        }

        // Mark OTP as used
        await pool.query('UPDATE otps SET is_used = true WHERE id = $1', [otpResult.rows[0].id]);

        // Get user details
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = userResult.rows[0];

        if (!user.is_active) {
            return res.status(401).json({ error: 'Account is inactive' });
        }

        const token = generateToken(user.id);

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
            token,
        });
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ error: 'OTP verification failed' });
    }
};

// Get Current User
exports.getCurrentUser = async (req, res) => {
    try {
        res.json({ user: req.user });
    } catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
};