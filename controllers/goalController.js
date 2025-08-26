import { sql } from '../config/db.js';

/**
 * Goal Tracking Controller
 * Manages financial goals, milestones, and progress tracking
 */

// Initialize goals table
export const initGoalsTable = async () => {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS financial_goals (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                title VARCHAR(200) NOT NULL,
                description TEXT,
                goal_type VARCHAR(50) NOT NULL CHECK (goal_type IN ('savings', 'debt_payoff', 'emergency_fund', 'investment', 'purchase', 'custom')),
                target_amount DECIMAL(12, 2) NOT NULL,
                current_amount DECIMAL(12, 2) DEFAULT 0,
                target_date DATE,
                priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
                status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
                category VARCHAR(100), -- Links to expense categories for tracking
                auto_tracking BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS goal_milestones (
                id SERIAL PRIMARY KEY,
                goal_id INTEGER REFERENCES financial_goals(id) ON DELETE CASCADE,
                milestone_percentage DECIMAL(5, 2) NOT NULL, -- e.g., 25.00 for 25%
                milestone_amount DECIMAL(12, 2) NOT NULL,
                achieved_date TIMESTAMP,
                reward_description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS goal_contributions (
                id SERIAL PRIMARY KEY,
                goal_id INTEGER REFERENCES financial_goals(id) ON DELETE CASCADE,
                amount DECIMAL(10, 2) NOT NULL,
                contribution_date DATE DEFAULT CURRENT_DATE,
                transaction_id INTEGER, -- Optional link to transactions table
                note TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        console.log('Goals tables initialized successfully');
    } catch (error) {
        console.error('Error initializing goals tables:', error);
        throw error;
    }
};

export const createGoal = async (req, res) => {
    const { 
        user_id, 
        title, 
        description, 
        goal_type, 
        target_amount, 
        target_date, 
        priority = 'medium',
        category,
        auto_tracking = false
    } = req.body;
    
    try {
        const result = await sql`
            INSERT INTO financial_goals (
                user_id, title, description, goal_type, target_amount, 
                target_date, priority, category, auto_tracking
            ) 
            VALUES (
                ${user_id}, ${title}, ${description}, ${goal_type}, ${target_amount}, 
                ${target_date || null}, ${priority}, ${category || null}, ${auto_tracking}
            ) 
            RETURNING *
        `;
        
        const goal = result[0];
        
        // Create default milestones (25%, 50%, 75%, 100%)
        const milestones = [25, 50, 75, 100].map(percentage => ({
            goal_id: goal.id,
            milestone_percentage: percentage,
            milestone_amount: (target_amount * percentage) / 100
        }));
        
        for (const milestone of milestones) {
            await sql`
                INSERT INTO goal_milestones (goal_id, milestone_percentage, milestone_amount)
                VALUES (${milestone.goal_id}, ${milestone.milestone_percentage}, ${milestone.milestone_amount})
            `;
        }
        
        res.status(201).json({
            goal,
            milestones_created: milestones.length,
            message: 'Goal created successfully with default milestones'
        });
        
    } catch (error) {
        console.error('Error creating goal:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const getUserGoals = async (req, res) => {
    const { userId } = req.params;
    const { status = 'active', goal_type } = req.query;
    
    try {
        let whereClause = `WHERE user_id = ${userId}`;
        
        if (status && status !== 'all') {
            whereClause += ` AND status = ${status}`;
        }
        
        if (goal_type) {
            whereClause += ` AND goal_type = ${goal_type}`;
        }
        
        const goals = await sql`
            SELECT 
                g.*,
                ROUND((g.current_amount / g.target_amount) * 100, 2) as progress_percentage,
                CASE 
                    WHEN g.target_date IS NOT NULL THEN 
                        EXTRACT(DAYS FROM (g.target_date - CURRENT_DATE))
                    ELSE NULL
                END as days_remaining,
                COUNT(gc.id) as total_contributions,
                COALESCE(SUM(gc.amount), 0) as total_contributed
            FROM financial_goals g
            LEFT JOIN goal_contributions gc ON g.id = gc.goal_id
            ${sql.unsafe(whereClause)}
            GROUP BY g.id
            ORDER BY 
                CASE g.priority 
                    WHEN 'critical' THEN 1 
                    WHEN 'high' THEN 2 
                    WHEN 'medium' THEN 3 
                    WHEN 'low' THEN 4 
                END,
                g.target_date ASC NULLS LAST
        `;
        
        // Get milestones for each goal
        for (const goal of goals) {
            const milestones = await sql`
                SELECT * FROM goal_milestones 
                WHERE goal_id = ${goal.id}
                ORDER BY milestone_percentage
            `;
            goal.milestones = milestones;
        }
        
        res.json({
            user_id: userId,
            goals,
            summary: {
                total_goals: goals.length,
                active_goals: goals.filter(g => g.status === 'active').length,
                completed_goals: goals.filter(g => g.status === 'completed').length,
                total_target_amount: goals.reduce((sum, g) => sum + parseFloat(g.target_amount), 0),
                total_saved: goals.reduce((sum, g) => sum + parseFloat(g.current_amount), 0)
            }
        });
        
    } catch (error) {
        console.error('Error fetching user goals:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const addGoalContribution = async (req, res) => {
    const { goalId } = req.params;
    const { amount, note, contribution_date } = req.body;
    
    try {
        // Add contribution
        const contributionResult = await sql`
            INSERT INTO goal_contributions (goal_id, amount, note, contribution_date)
            VALUES (${goalId}, ${amount}, ${note || null}, ${contribution_date || sql`CURRENT_DATE`})
            RETURNING *
        `;
        
        // Update goal current amount
        await sql`
            UPDATE financial_goals 
            SET current_amount = current_amount + ${amount},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${goalId}
        `;
        
        // Check if any milestones were reached
        const updatedGoal = await sql`
            SELECT current_amount, target_amount FROM financial_goals WHERE id = ${goalId}
        `;
        
        const progressPercentage = (updatedGoal[0].current_amount / updatedGoal[0].target_amount) * 100;
        
        const achievedMilestones = await sql`
            UPDATE goal_milestones 
            SET achieved_date = CURRENT_TIMESTAMP
            WHERE goal_id = ${goalId} 
            AND milestone_percentage <= ${progressPercentage}
            AND achieved_date IS NULL
            RETURNING *
        `;
        
        // Check if goal is completed
        let goalCompleted = false;
        if (updatedGoal[0].current_amount >= updatedGoal[0].target_amount) {
            await sql`
                UPDATE financial_goals 
                SET status = 'completed', updated_at = CURRENT_TIMESTAMP
                WHERE id = ${goalId}
            `;
            goalCompleted = true;
        }
        
        res.status(201).json({
            contribution: contributionResult[0],
            milestones_achieved: achievedMilestones,
            goal_completed: goalCompleted,
            new_progress_percentage: Math.round(progressPercentage * 100) / 100
        });
        
    } catch (error) {
        console.error('Error adding goal contribution:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const getGoalProgress = async (req, res) => {
    const { goalId } = req.params;
    
    try {
        const goal = await sql`
            SELECT 
                g.*,
                ROUND((g.current_amount / g.target_amount) * 100, 2) as progress_percentage,
                CASE 
                    WHEN g.target_date IS NOT NULL THEN 
                        EXTRACT(DAYS FROM (g.target_date - CURRENT_DATE))
                    ELSE NULL
                END as days_remaining
            FROM financial_goals g
            WHERE id = ${goalId}
        `;
        
        if (goal.length === 0) {
            return res.status(404).json({ error: 'Goal not found' });
        }
        
        // Get contribution history
        const contributions = await sql`
            SELECT * FROM goal_contributions 
            WHERE goal_id = ${goalId}
            ORDER BY contribution_date DESC
        `;
        
        // Get milestones
        const milestones = await sql`
            SELECT * FROM goal_milestones 
            WHERE goal_id = ${goalId}
            ORDER BY milestone_percentage
        `;
        
        // Calculate progress statistics
        const totalContributed = contributions.reduce((sum, c) => sum + parseFloat(c.amount), 0);
        const averageContribution = contributions.length > 0 ? totalContributed / contributions.length : 0;
        
        // Calculate projected completion date if there's a pattern
        let projectedCompletion = null;
        if (contributions.length >= 2) {
            const recentContributions = contributions.slice(0, 3);
            const avgMonthlyContribution = recentContributions.reduce((sum, c) => sum + parseFloat(c.amount), 0) / recentContributions.length;
            const remainingAmount = parseFloat(goal[0].target_amount) - parseFloat(goal[0].current_amount);
            
            if (avgMonthlyContribution > 0) {
                const monthsToCompletion = Math.ceil(remainingAmount / avgMonthlyContribution);
                projectedCompletion = new Date();
                projectedCompletion.setMonth(projectedCompletion.getMonth() + monthsToCompletion);
            }
        }
        
        res.json({
            goal: goal[0],
            contributions,
            milestones,
            statistics: {
                total_contributed: totalContributed,
                average_contribution: Math.round(averageContribution * 100) / 100,
                contributions_count: contributions.length,
                projected_completion: projectedCompletion,
                on_track: goal[0].target_date ? 
                    (projectedCompletion ? projectedCompletion <= new Date(goal[0].target_date) : null) : null
            }
        });
        
    } catch (error) {
        console.error('Error fetching goal progress:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const updateGoal = async (req, res) => {
    const { goalId } = req.params;
    const updates = req.body;
    
    try {
        // Build update query dynamically
        const allowedFields = ['title', 'description', 'target_amount', 'target_date', 'priority', 'status', 'category'];
        const updatePairs = [];
        const values = [];
        
        Object.entries(updates).forEach(([key, value]) => {
            if (allowedFields.includes(key)) {
                updatePairs.push(`${key} = $${values.length + 1}`);
                values.push(value);
            }
        });
        
        if (updatePairs.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }
        
        values.push(goalId); // Add goalId for WHERE clause
        
        const result = await sql`
            UPDATE financial_goals 
            SET ${sql.unsafe(updatePairs.join(', '))}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${values.length}
            RETURNING *
        `.apply(null, values);
        
        if (result.length === 0) {
            return res.status(404).json({ error: 'Goal not found' });
        }
        
        res.json({
            message: 'Goal updated successfully',
            goal: result[0]
        });
        
    } catch (error) {
        console.error('Error updating goal:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const deleteGoal = async (req, res) => {
    const { goalId } = req.params;
    
    try {
        const result = await sql`
            DELETE FROM financial_goals 
            WHERE id = ${goalId}
            RETURNING *
        `;
        
        if (result.length === 0) {
            return res.status(404).json({ error: 'Goal not found' });
        }
        
        res.json({
            message: 'Goal deleted successfully',
            deleted_goal: result[0]
        });
        
    } catch (error) {
        console.error('Error deleting goal:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const getGoalSuggestions = async (req, res) => {
    const { userId } = req.params;
    
    try {
        // Analyze user's financial patterns to suggest goals
        const financialSummary = await sql`
            SELECT 
                SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
                SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expenses,
                COUNT(DISTINCT category) as category_count
            FROM transactions 
            WHERE user_id = ${userId} 
            AND date >= CURRENT_DATE - INTERVAL '3 months'
        `;
        
        const data = financialSummary[0];
        const monthlyIncome = parseFloat(data.total_income) / 3; // Average monthly
        const monthlyExpenses = parseFloat(data.total_expenses) / 3;
        const monthlySavings = monthlyIncome - monthlyExpenses;
        
        const suggestions = [];
        
        // Emergency fund suggestion
        if (monthlySavings > 0) {
            const emergencyFundTarget = monthlyExpenses * 6; // 6 months of expenses
            suggestions.push({
                goal_type: 'emergency_fund',
                title: 'Emergency Fund',
                description: 'Build 6 months of expenses for financial security',
                target_amount: Math.round(emergencyFundTarget),
                priority: 'high',
                suggested_monthly_contribution: Math.min(monthlySavings * 0.5, emergencyFundTarget / 12),
                reasoning: 'Financial security is crucial for unexpected situations'
            });
        }
        
        // Savings goal based on quarter formula
        if (monthlyIncome > 0) {
            const quarterSavings = monthlyIncome * 0.25;
            suggestions.push({
                goal_type: 'savings',
                title: 'Quarter Formula Savings',
                description: 'Save 25% of income following the Quarter Formula',
                target_amount: Math.round(quarterSavings * 12), // Annual target
                priority: 'medium',
                suggested_monthly_contribution: quarterSavings,
                reasoning: 'Following the Quarter Formula for balanced financial health'
            });
        }
        
        // Investment goal for surplus savings
        if (monthlySavings > monthlyIncome * 0.2) {
            suggestions.push({
                goal_type: 'investment',
                title: 'Investment Portfolio',
                description: 'Start building wealth through investments',
                target_amount: Math.round(monthlySavings * 12),
                priority: 'medium',
                suggested_monthly_contribution: monthlySavings * 0.3,
                reasoning: 'You have good savings capacity - time to grow wealth'
            });
        }
        
        res.json({
            user_id: userId,
            financial_snapshot: {
                monthly_income: Math.round(monthlyIncome),
                monthly_expenses: Math.round(monthlyExpenses),
                monthly_savings: Math.round(monthlySavings),
                savings_rate: monthlyIncome > 0 ? Math.round((monthlySavings / monthlyIncome) * 100) : 0
            },
            suggested_goals: suggestions
        });
        
    } catch (error) {
        console.error('Error generating goal suggestions:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
