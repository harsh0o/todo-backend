
const express = require('express');
const adminController = require('../controllers/adminController');
const { authenticate, authorizeAdmin } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorizeAdmin);

// Get dashboard statistics
router.get('/dashboard', adminController.getDashboard);

// Get all users
router.get('/users', adminController.getAllUsers);

module.exports = router;