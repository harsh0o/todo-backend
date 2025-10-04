
const express = require('express');
const { body } = require('express-validator');
const taskController = require('../controllers/taskController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Create task
router.post(
    '/',
    [
        body('title').trim().notEmpty().withMessage('Title is required'),
        body('description').optional().trim(),
        body('due_date').isISO8601().withMessage('Valid due date is required'),
        body('category').trim().notEmpty().withMessage('Category is required'),
        body('status').optional().isIn(['pending', 'in_progress', 'completed', 'overdue']),
        body('priority').optional().isIn(['low', 'medium', 'high']),
        body('assigned_to').optional().isInt(),
    ],
    taskController.createTask
);

// Get tasks list (with pagination and search)
router.get('/', taskController.getTasks);

// Get single task
router.get('/:id', taskController.getTaskById);

// Update task
router.put(
    '/:id',
    [
        body('title').optional().trim().notEmpty().withMessage('Title cannot be empty'),
        body('description').optional().trim(),
        body('due_date').optional().isISO8601().withMessage('Valid due date is required'),
        body('category').optional().trim().notEmpty().withMessage('Category cannot be empty'),
        body('status').optional().isIn(['pending', 'in_progress', 'completed', 'overdue']),
        body('priority').optional().isIn(['low', 'medium', 'high']),
        body('assigned_to').optional().isInt(),
        body('completed_at').optional().isISO8601(),
    ],
    taskController.updateTask
);

// Mark task as completed
router.patch('/:id/complete', taskController.markAsCompleted);

// Delete task
router.delete('/:id', taskController.deleteTask);

module.exports = router;
