
// Get Dashboard Statistics
exports.getDashboard = async (req, res) => {
    try {
        // Total tasks
        const totalTasksResult = await pool.query('SELECT COUNT(*) as count FROM tasks');
        const totalTasks = parseInt(totalTasksResult.rows[0].count);

        // Total users
        const totalUsersResult = await pool.query('SELECT COUNT(*) as count FROM users');
        const totalUsers = parseInt(totalUsersResult.rows[0].count);

        // Average tasks per user (last 7 days)
        const avgTasksResult = await pool.query(`
            SELECT 
                COUNT(*)::float / NULLIF((SELECT COUNT(DISTINCT assigned_to) FROM tasks WHERE created_at >= NOW() - INTERVAL '7 days'), 0) as avg
            FROM tasks 
            WHERE created_at >= NOW() - INTERVAL '7 days'
        `);
        const avgTasksPerUser = parseFloat(avgTasksResult.rows[0].avg || 0).toFixed(2);

        // Task distribution by status
        const statusDistResult = await pool.query(`
            SELECT status, COUNT(*) as count 
            FROM tasks 
            GROUP BY status
        `);
        const taskDistribution = statusDistResult.rows;

        // Tasks added last 7 days
        const last7DaysResult = await pool.query(`
            SELECT COUNT(*) as count 
            FROM tasks 
            WHERE created_at >= NOW() - INTERVAL '7 days'
        `);
        const tasksLast7Days = parseInt(last7DaysResult.rows[0].count);

        // Tasks added previous 7 days (8-14 days ago)
        const previous7DaysResult = await pool.query(`
            SELECT COUNT(*) as count 
            FROM tasks 
            WHERE created_at >= NOW() - INTERVAL '14 days' 
              AND created_at < NOW() - INTERVAL '7 days'
        `);
        const tasksPrevious7Days = parseInt(previous7DaysResult.rows[0].count);

        // Task distribution by category
        const categoryDistResult = await pool.query(`
            SELECT category, COUNT(*) as count 
            FROM tasks 
            GROUP BY category
        `);
        const categoryDistribution = categoryDistResult.rows;

        // Task distribution by priority
        const priorityDistResult = await pool.query(`
            SELECT priority, COUNT(*) as count 
            FROM tasks 
            GROUP BY priority
        `);
        const priorityDistribution = priorityDistResult.rows;

        // Top users by task count
        const topUsersResult = await pool.query(`
            SELECT u.name, u.email, COUNT(t.id) as task_count
            FROM users u
            LEFT JOIN tasks t ON u.id = t.assigned_to
            GROUP BY u.id, u.name, u.email
            ORDER BY task_count DESC
            LIMIT 5
        `);
        const topUsers = topUsersResult.rows;

        res.json({
            dashboard: {
                totalTasks,
                totalUsers,
                avgTasksPerUser,
                taskDistribution,
                categoryDistribution,
                priorityDistribution,
                tasksComparison: {
                    last7Days: tasksLast7Days,
                    previous7Days: tasksPrevious7Days,
                    percentageChange: tasksPrevious7Days > 0 
                        ? (((tasksLast7Days - tasksPrevious7Days) / tasksPrevious7Days) * 100).toFixed(2)
                        : 0
                },
                topUsers
            }
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
};

// Get All Users
exports.getAllUsers = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, email, role, is_active, created_at 
            FROM users 
            ORDER BY created_at DESC
        `);

        res.json({ users: result.rows });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
};
