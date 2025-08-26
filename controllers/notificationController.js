import { sql } from '../config/db.js';

/**
 * Smart Notification System
 * Provides intelligent alerts for budget limits, financial goals, and spending patterns
 */

export const getActiveNotifications = async (req, res) => {
    const { userId } = req.params;
    
    try {
        const notifications = await Promise.all([
            generateBudgetAlerts(userId),
            generateSpendingAlerts(userId),
            generateGoalAlerts(userId),
            generateInsightNotifications(userId)
        ]);
        
        const allNotifications = notifications.flat().filter(Boolean);
        
        // Sort by priority and date
        allNotifications.sort((a, b) => {
            const priorityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
            if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            }
            return new Date(b.created_at) - new Date(a.created_at);
        });
        
        res.json({
            user_id: userId,
            notifications: allNotifications,
            summary: {
                total: allNotifications.length,
                critical: allNotifications.filter(n => n.priority === 'critical').length,
                unread: allNotifications.filter(n => !n.read).length
            }
        });
        
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const generateBudgetAlerts = async (userId) => {
    try {
        const currentMonth = new Date().toISOString().slice(0, 7);
        
        const budgetStatus = await sql`
            SELECT 
                b.category,
                b.amount as budget_amount,
                COALESCE(SUM(t.amount), 0) as spent_amount,
                (COALESCE(SUM(t.amount), 0) / b.amount) * 100 as usage_percentage
            FROM budgets b
            LEFT JOIN transactions t ON b.user_id = t.user_id 
                AND b.category = t.category 
                AND t.type = 'expense'
                AND TO_CHAR(t.date, 'YYYY-MM') = ${currentMonth}
            WHERE b.user_id = ${userId} 
            AND b.month_year = ${currentMonth}
            GROUP BY b.category, b.amount
        `;
        
        const alerts = [];
        
        budgetStatus.forEach(budget => {
            const percentage = parseFloat(budget.usage_percentage);
            const spent = parseFloat(budget.spent_amount);
            const budgetAmount = parseFloat(budget.budget_amount);
            
            if (percentage >= 100) {
                alerts.push({
                    id: `budget_exceeded_${budget.category}`,
                    type: 'budget_alert',
                    priority: 'critical',
                    title: 'Budget Exceeded',
                    message: `You've exceeded your ${budget.category} budget by $${(spent - budgetAmount).toFixed(2)}`,
                    category: budget.category,
                    action: 'Review and adjust spending',
                    created_at: new Date().toISOString(),
                    read: false
                });
            } else if (percentage >= 90) {
                alerts.push({
                    id: `budget_warning_${budget.category}`,
                    type: 'budget_alert',
                    priority: 'high',
                    title: 'Budget Warning',
                    message: `You've used ${percentage.toFixed(1)}% of your ${budget.category} budget`,
                    category: budget.category,
                    action: 'Consider reducing spending',
                    created_at: new Date().toISOString(),
                    read: false
                });
            } else if (percentage >= 75) {
                alerts.push({
                    id: `budget_reminder_${budget.category}`,
                    type: 'budget_alert',
                    priority: 'medium',
                    title: 'Budget Reminder',
                    message: `You've used ${percentage.toFixed(1)}% of your ${budget.category} budget`,
                    category: budget.category,
                    action: 'Track remaining spending',
                    created_at: new Date().toISOString(),
                    read: false
                });
            }
        });
        
        return alerts;
        
    } catch (error) {
        console.error('Error generating budget alerts:', error);
        return [];
    }
};

export const generateSpendingAlerts = async (userId) => {
    try {
        // Check for unusual spending patterns in the last 7 days
        const recentSpending = await sql`
            WITH daily_spending AS (
                SELECT 
                    date,
                    SUM(amount) as daily_total
                FROM transactions 
                WHERE user_id = ${userId} 
                AND type = 'expense'
                AND date >= CURRENT_DATE - INTERVAL '30 days'
                GROUP BY date
            ),
            spending_stats AS (
                SELECT 
                    AVG(daily_total) as avg_daily,
                    STDDEV(daily_total) as std_daily
                FROM daily_spending
            )
            SELECT 
                ds.date,
                ds.daily_total,
                ss.avg_daily,
                ss.std_daily,
                CASE 
                    WHEN ds.daily_total > (ss.avg_daily + 2 * ss.std_daily) THEN 'high'
                    WHEN ds.daily_total > (ss.avg_daily + ss.std_daily) THEN 'elevated'
                    ELSE 'normal'
                END as spending_level
            FROM daily_spending ds
            CROSS JOIN spending_stats ss
            WHERE ds.date >= CURRENT_DATE - INTERVAL '7 days'
            AND ds.daily_total > (ss.avg_daily + ss.std_daily)
            ORDER BY ds.date DESC
        `;
        
        const alerts = [];
        
        recentSpending.forEach(day => {
            if (day.spending_level === 'high') {
                alerts.push({
                    id: `high_spending_${day.date}`,
                    type: 'spending_alert',
                    priority: 'high',
                    title: 'Unusual High Spending',
                    message: `You spent $${day.daily_total} on ${new Date(day.date).toLocaleDateString()}, which is significantly higher than usual`,
                    action: 'Review transactions for this day',
                    created_at: new Date().toISOString(),
                    read: false
                });
            } else if (day.spending_level === 'elevated') {
                alerts.push({
                    id: `elevated_spending_${day.date}`,
                    type: 'spending_alert',
                    priority: 'medium',
                    title: 'Elevated Spending',
                    message: `Higher than average spending on ${new Date(day.date).toLocaleDateString()}`,
                    action: 'Monitor spending patterns',
                    created_at: new Date().toISOString(),
                    read: false
                });
            }
        });
        
        return alerts;
        
    } catch (error) {
        console.error('Error generating spending alerts:', error);
        return [];
    }
};

export const generateGoalAlerts = async (userId) => {
    try {
        // Check savings goals progress (if goals table exists)
        const savingsProgress = await sql`
            SELECT 
                SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
                SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expenses
            FROM transactions 
            WHERE user_id = ${userId} 
            AND date >= date_trunc('month', CURRENT_DATE)
        `;
        
        const alerts = [];
        const data = savingsProgress[0];
        const monthlyIncome = parseFloat(data.total_income) || 0;
        const monthlyExpenses = parseFloat(data.total_expenses) || 0;
        const savingsRate = monthlyIncome > 0 ? ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100 : 0;
        
        // Savings rate alerts
        if (savingsRate < 0) {
            alerts.push({
                id: 'negative_savings',
                type: 'goal_alert',
                priority: 'critical',
                title: 'Negative Savings Rate',
                message: 'Your expenses exceed your income this month',
                action: 'Review and reduce expenses immediately',
                created_at: new Date().toISOString(),
                read: false
            });
        } else if (savingsRate < 10) {
            alerts.push({
                id: 'low_savings',
                type: 'goal_alert',
                priority: 'high',
                title: 'Low Savings Rate',
                message: `Your savings rate is ${savingsRate.toFixed(1)}%. Consider aiming for at least 10%`,
                action: 'Increase income or reduce expenses',
                created_at: new Date().toISOString(),
                read: false
            });
        } else if (savingsRate >= 20) {
            alerts.push({
                id: 'excellent_savings',
                type: 'goal_alert',
                priority: 'low',
                title: 'Excellent Savings Rate',
                message: `Congratulations! Your savings rate is ${savingsRate.toFixed(1)}%`,
                action: 'Consider investing surplus savings',
                created_at: new Date().toISOString(),
                read: false
            });
        }
        
        return alerts;
        
    } catch (error) {
        console.error('Error generating goal alerts:', error);
        return [];
    }
};

export const generateInsightNotifications = async (userId) => {
    try {
        const alerts = [];
        
        // Check for missing transactions (no income/expense for 7+ days)
        const lastTransaction = await sql`
            SELECT MAX(date) as last_date
            FROM transactions 
            WHERE user_id = ${userId}
        `;
        
        if (lastTransaction[0].last_date) {
            const daysSinceLastTransaction = Math.floor(
                (new Date() - new Date(lastTransaction[0].last_date)) / (1000 * 60 * 60 * 24)
            );
            
            if (daysSinceLastTransaction >= 7) {
                alerts.push({
                    id: 'missing_transactions',
                    type: 'insight',
                    priority: 'medium',
                    title: 'Missing Transactions',
                    message: `It's been ${daysSinceLastTransaction} days since your last transaction`,
                    action: 'Add recent transactions to keep tracking accurate',
                    created_at: new Date().toISOString(),
                    read: false
                });
            }
        }
        
        // Quarter Formula adherence check
        const quarterCheck = await sql`
            SELECT 
                SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as monthly_income,
                SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as monthly_expenses
            FROM transactions 
            WHERE user_id = ${userId} 
            AND date >= date_trunc('month', CURRENT_DATE)
        `;
        
        const monthlyIncome = parseFloat(quarterCheck[0].monthly_income) || 0;
        const quarterAmount = monthlyIncome * 0.25;
        
        if (monthlyIncome > 0 && quarterAmount > 100) {
            alerts.push({
                id: 'quarter_formula_reminder',
                type: 'insight',
                priority: 'low',
                title: 'Quarter Formula Opportunity',
                message: `Based on your $${monthlyIncome.toFixed(2)} income, consider allocating $${quarterAmount.toFixed(2)} per quarter category`,
                action: 'Set up Quarter Formula budgets',
                created_at: new Date().toISOString(),
                read: false
            });
        }
        
        return alerts;
        
    } catch (error) {
        console.error('Error generating insight notifications:', error);
        return [];
    }
};

export const markNotificationAsRead = async (req, res) => {
    const { notificationId } = req.params;
    const { userId } = req.body;
    
    try {
        // In a real system, you'd update a notifications table
        // For now, we'll just return success
        res.json({
            message: 'Notification marked as read',
            notification_id: notificationId,
            user_id: userId
        });
        
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const getNotificationSettings = async (req, res) => {
    const { userId } = req.params;
    
    try {
        // Default notification settings
        const settings = {
            user_id: userId,
            budget_alerts: {
                enabled: true,
                threshold: 75, // Alert when 75% of budget is used
                critical_threshold: 90
            },
            spending_alerts: {
                enabled: true,
                unusual_spending: true,
                daily_limit_alerts: true
            },
            goal_alerts: {
                enabled: true,
                savings_rate_alerts: true,
                milestone_celebrations: true
            },
            insight_notifications: {
                enabled: true,
                weekly_summaries: true,
                quarter_formula_tips: true
            }
        };
        
        res.json(settings);
        
    } catch (error) {
        console.error('Error fetching notification settings:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const updateNotificationSettings = async (req, res) => {
    const { userId } = req.params;
    const settings = req.body;
    
    try {
        // In a real system, you'd save these to a user_settings table
        res.json({
            message: 'Notification settings updated successfully',
            user_id: userId,
            settings
        });
        
    } catch (error) {
        console.error('Error updating notification settings:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
