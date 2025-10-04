const { validationResult } = require('express-validator');
const pool = require('../config/database');

// Create Task
exports.createTask = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { title, description, due_date, category, status = 'pending', priority = 'medium', assigned_to } = req.body;

        // Check if assigned_to user exists (if provided)
        let assignedToId = req.user.id; // Default to current user
        if (assigned_to) {
            if (req.user.role !== 'admin') {
                return res.status(403).json({ error: 'Only admins can assign tasks to others' });
            }
            const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [assigned_to]);
            if (userCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Assigned user not found' });
            }
            assignedToId = assigned_to;
        }

        const result = await pool.query(
            `INSERT INTO tasks (title, description, due_date, category, status, priority, created_by, assigned_to) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
             RETURNING *`,
            [title, description, due_date, category, status, priority, req.user.id, assignedToId]
        );

        res.status(201).json({
            message: 'Task created successfully',
            task: result.rows[0],
        });
    } catch (error) {
        console.error('Create task error:', error);
        res.status(500).json({ error: 'Failed to create task' });
    }
};

// Get Tasks List with Pagination and Search
exports.getTasks = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            status,
            category,
            priority,
            view = 'all', // all, today, overdue, completed
            sort_by = 'due_date',
            sort_order = 'ASC'
        } = req.query;

        const offset = (page - 1) * limit;
        
        let whereConditions = [];
        let queryParams = [];
        let paramCounter = 1;

        // User-specific or admin view
        if (req.user.role !== 'admin') {
            whereConditions.push(`assigned_to = $${paramCounter}`);
            queryParams.push(req.user.id);
            paramCounter++;
        }

        // Search
        if (search) {
            whereConditions.push(`(title ILIKE $${paramCounter} OR description ILIKE $${paramCounter})`);
            queryParams.push(`%${search}%`);
            paramCounter++;
        }

        // Status filter
        if (status) {
            whereConditions.push(`status = $${paramCounter}`);
            queryParams.push(status);
            paramCounter++;
        }

        // Category filter
        if (category) {
            whereConditions.push(`category = $${paramCounter}`);
            queryParams.push(category);
            paramCounter++;
        }

        // Priority filter
        if (priority) {
            whereConditions.push(`priority = $${paramCounter}`);
            queryParams.push(priority);
            paramCounter++;
        }

        // View-specific filters
        if (view === 'today') {
            whereConditions.push(`DATE(due_date) = CURRENT_DATE AND status != 'completed'`);
        } else if (view === 'overdue') {
            whereConditions.push(`due_date < NOW() AND status != 'completed'`);
        } else if (view === 'completed') {
            whereConditions.push(`status = 'completed'`);
        } else if (view === 'pending') {
            whereConditions.push(`status != 'completed'`);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Count total records
        const countQuery = `SELECT COUNT(*) FROM tasks ${whereClause}`;
        const countResult = await pool.query(countQuery, queryParams);
        const totalTasks = parseInt(countResult.rows[0].count);

        // Get tasks
        const validSortColumns = ['due_date', 'created_at', 'priority', 'status', 'title'];
        const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'due_date';
        const sortDirection = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

        queryParams.push(limit, offset);
        const tasksQuery = `
            SELECT t.*, 
                   u1.name as created_by_name, 
                   u2.name as assigned_to_name
            FROM tasks t
            LEFT JOIN users u1 ON t.created_by = u1.id
            LEFT JOIN users u2 ON t.assigned_to = u2.id
            ${whereClause}
            ORDER BY ${sortColumn} ${sortDirection}
            LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
        `;

        const tasksResult = await pool.query(tasksQuery, queryParams);

        res.json({
            tasks: tasksResult.rows,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalTasks / limit),
                totalTasks,
                limit: parseInt(limit),
            },
        });
    } catch (error) {
        console.error('Get tasks error:', error);
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
};

// Get Single Task
exports.getTaskById = async (req, res) => {
    try {
        const { id } = req.params;

        let query = `
            SELECT t.*, 
                   u1.name as created_by_name, 
                   u2.name as assigned_to_name
            FROM tasks t
            LEFT JOIN users u1 ON t.created_by = u1.id
            LEFT JOIN users u2 ON t.assigned_to = u2.id
            WHERE t.id = $1
        `;

        const params = [id];

        // Non-admin users can only see their own tasks
        if (req.user.role !== 'admin') {
            query += ` AND t.assigned_to = $2`;
            params.push(req.user.id);
        }

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        res.json({ task: result.rows[0] });
    } catch (error) {
        console.error('Get task error:', error);
        res.status(500).json({ error: 'Failed to fetch task' });
    }
};

// Update Task
exports.updateTask = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { title, description, due_date, category, status, priority, assigned_to, completed_at } = req.body;

        // Check if task exists and user has permission
        let checkQuery = 'SELECT * FROM tasks WHERE id = $1';
        const checkParams = [id];

        if (req.user.role !== 'admin') {
            checkQuery += ' AND assigned_to = $2';
            checkParams.push(req.user.id);
        }

        const taskCheck = await pool.query(checkQuery, checkParams);
        if (taskCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found or access denied' });
        }

        // Build update query dynamically
        const updates = [];
        const values = [];
        let paramCounter = 1;

        if (title !== undefined) {
            updates.push(`title = $${paramCounter}`);
            values.push(title);
            paramCounter++;
        }
        if (description !== undefined) {
            updates.push(`description = $${paramCounter}`);
            values.push(description);
            paramCounter++;
        }
        if (due_date !== undefined) {
            updates.push(`due_date = $${paramCounter}`);
            values.push(due_date);
            paramCounter++;
        }
        if (category !== undefined) {
            updates.push(`category = $${paramCounter}`);
            values.push(category);
            paramCounter++;
        }
        if (status !== undefined) {
            updates.push(`status = $${paramCounter}`);
            values.push(status);
            paramCounter++;
        }
        if (priority !== undefined) {
            updates.push(`priority = $${paramCounter}`);
            values.push(priority);
            paramCounter++;
        }
        if (completed_at !== undefined) {
            updates.push(`completed_at = $${paramCounter}`);
            values.push(completed_at);
            paramCounter++;
        }

        // Only admin can reassign tasks
        if (assigned_to !== undefined && req.user.role === 'admin') {
            updates.push(`assigned_to = $${paramCounter}`);
            values.push(assigned_to);
            paramCounter++;
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);
        const updateQuery = `
            UPDATE tasks 
            SET ${updates.join(', ')}
            WHERE id = $${paramCounter}
            RETURNING *
        `;

        const result = await pool.query(updateQuery, values);

        res.json({
            message: 'Task updated successfully',
            task: result.rows[0],
        });
    } catch (error) {
        console.error('Update task error:', error);
        res.status(500).json({ error: 'Failed to update task' });
    }
};

// Delete Task
exports.deleteTask = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if task exists and user has permission
        let checkQuery = 'SELECT * FROM tasks WHERE id = $1';
        const checkParams = [id];

        if (req.user.role !== 'admin') {
            checkQuery += ' AND assigned_to = $2';
            checkParams.push(req.user.id);
        }

        const taskCheck = await pool.query(checkQuery, checkParams);
        if (taskCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found or access denied' });
        }

        await pool.query('DELETE FROM tasks WHERE id = $1', [id]);

        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        console.error('Delete task error:', error);
        res.status(500).json({ error: 'Failed to delete task' });
    }
};

// Mark Task as Completed
exports.markAsCompleted = async (req, res) => {
    try {
        const { id } = req.params;

        let checkQuery = 'SELECT * FROM tasks WHERE id = $1';
        const checkParams = [id];

        if (req.user.role !== 'admin') {
            checkQuery += ' AND assigned_to = $2';
            checkParams.push(req.user.id);
        }

        const taskCheck = await pool.query(checkQuery, checkParams);
        if (taskCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found or access denied' });
        }

        const result = await pool.query(
            'UPDATE tasks SET status = $1, completed_at = NOW() WHERE id = $2 RETURNING *',
            ['completed', id]
        );

        res.json({
            message: 'Task marked as completed',
            task: result.rows[0],
        });
    } catch (error) {
        console.error('Mark completed error:', error);
        res.status(500).json({ error: 'Failed to mark task as completed' });
    }
};
