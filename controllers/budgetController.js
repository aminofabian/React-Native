import { sql } from '../config/db.js';

export const setBudget = async (req, res) => {
    const { user_id, category, amount, month_year } = req.body;
    
    try {
        const result = await sql `
            INSERT INTO budgets (user_id, category, amount, month_year) 
            VALUES (${user_id}, ${category}, ${amount}, ${month_year}) 
            ON CONFLICT (user_id, category, month_year) 
            DO UPDATE SET amount = ${amount}
            RETURNING *
        `;
        res.status(201).json(result[0]);
    } catch (error) {
        console.error('Error setting budget:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const getBudgetAnalysis = async (req, res) => {
    const { userId } = req.params;
    const { month_year } = req.query;
    
    try {
        const currentMonth = month_year || new Date().toISOString().slice(0, 7);
        
        const budgetVsActual = await sql `
            SELECT 
                b.category,
                b.amount as budget_amount,
                COALESCE(SUM(t.amount), 0) as actual_amount,
                b.amount - COALESCE(SUM(t.amount), 0) as remaining,
                CASE 
                    WHEN COALESCE(SUM(t.amount), 0) > b.amount THEN 'over_budget'
                    WHEN COALESCE(SUM(t.amount), 0) = b.amount THEN 'at_budget'
                    ELSE 'under_budget'
                END as status
            FROM budgets b
            LEFT JOIN transactions t ON b.user_id = t.user_id 
                AND b.category = t.category 
                AND t.type = 'expense'
                AND TO_CHAR(t.date, 'YYYY-MM') = ${currentMonth}
            WHERE b.user_id = ${userId} AND b.month_year = ${currentMonth}
            GROUP BY b.category, b.amount
            ORDER BY b.category
        `;
        
        res.json({
            user_id: userId,
            month: currentMonth,
            budget_analysis: budgetVsActual
        });
    } catch (error) {
        console.error('Error fetching budget analysis:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
