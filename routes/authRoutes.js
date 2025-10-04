
const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Register
router.post(
    '/register',
    [
        body('name').trim().notEmpty().withMessage('Name is required'),
        body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
        body('role').optional().isIn(['admin', 'user']).withMessage('Invalid role'),
    ],
    authController.register
);

// Login with password
router.post(
    '/login',
    [
        body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
        body('password').notEmpty().withMessage('Password is required'),
    ],
    authController.login
);

// Request OTP
router.post(
    '/request-otp',
    [
        body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    ],
    authController.requestOTP
);

// Verify OTP and login
router.post(
    '/verify-otp',
    [
        body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
        body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
    ],
    authController.verifyOTP
);

// Get current user
router.get('/me', authenticate, authController.getCurrentUser);

module.exports = router;