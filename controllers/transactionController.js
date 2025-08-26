import { sql } from '../config/db.js';

export const addTransaction = async (req, res) => {
    const { user_id, amount, type, category, description, date } = req.body;
    
    try {
        const result = await sql `
            INSERT INTO transactions (user_id, amount, type, category, description, date) 
            VALUES (${user_id}, ${amount}, ${type}, ${category}, ${description || null}, ${date || sql`CURRENT_DATE`}) 
            RETURNING *
        `;
        res.status(201).json(result[0]);
    } catch (error) {
        console.error('Error adding transaction:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const getTransactions = async (req, res) => {
    const { userId } = req.params;
    const { type, category, startDate, endDate, limit = 50, offset = 0 } = req.query;
    
    try {
        let whereClause = `WHERE user_id = ${userId}`;
        
        if (type) {
            whereClause += ` AND type = ${type}`;
        }
        if (category) {
            whereClause += ` AND category = ${category}`;
        }
        if (startDate) {
            whereClause += ` AND date >= ${startDate}`;
        }
        if (endDate) {
            whereClause += ` AND date <= ${endDate}`;
        }
        
        const transactions = await sql `
            SELECT * FROM transactions 
            ${sql.unsafe(whereClause)}
            ORDER BY date DESC, created_at DESC
            LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
        `;
        
        // Get total count for pagination
        const countResult = await sql `
            SELECT COUNT(*) as total FROM transactions 
            ${sql.unsafe(whereClause)}
        `;
        
        res.json({
            transactions,
            pagination: {
                total: parseInt(countResult[0].total),
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: parseInt(countResult[0].total) > parseInt(offset) + parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const getTransactionSummary = async (req, res) => {
    const { userId } = req.params;
    const { month, year } = req.query;
    
    try {
        let dateFilter = '';
        if (month && year) {
            dateFilter = `AND date >= '${year}-${month.padStart(2, '0')}-01' AND date < '${year}-${(parseInt(month) + 1).toString().padStart(2, '0')}-01'`;
        }
        
        // Get summary for specified period or all time
        const summaryResult = await sql `
            SELECT 
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense,
                COUNT(*) AS total_transactions,
                COUNT(CASE WHEN type = 'income' THEN 1 END) AS income_count,
                COUNT(CASE WHEN type = 'expense' THEN 1 END) AS expense_count
            FROM transactions 
            WHERE user_id = ${userId} ${sql.unsafe(dateFilter)}
        `;
        
        // Get top expense categories
        const topCategories = await sql `
            SELECT 
                category,
                SUM(amount) as total_amount,
                COUNT(*) as transaction_count
            FROM transactions 
            WHERE user_id = ${userId} AND type = 'expense' ${sql.unsafe(dateFilter)}
            GROUP BY category
            ORDER BY total_amount DESC
            LIMIT 5
        `;
        
        // Get monthly breakdown for the last 6 months
        const monthlyBreakdown = await sql `
            SELECT 
                TO_CHAR(date, 'YYYY-MM') as month,
                SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
                SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
            FROM transactions 
            WHERE user_id = ${userId} 
            AND date >= CURRENT_DATE - INTERVAL '6 months'
            GROUP BY TO_CHAR(date, 'YYYY-MM')
            ORDER BY month DESC
        `;
        
        const summary = summaryResult[0];
        const balance = summary.total_income - summary.total_expense;
        const savingsRate = summary.total_income > 0 ? ((summary.total_income - summary.total_expense) / summary.total_income * 100).toFixed(2) : 0;
        
        res.json({
            user_id: userId,
            period: month && year ? `${year}-${month}` : 'all-time',
            summary: {
                total_income: parseFloat(summary.total_income),
                total_expense: parseFloat(summary.total_expense),
                balance: parseFloat(balance),
                savings_rate_percent: parseFloat(savingsRate),
                total_transactions: parseInt(summary.total_transactions),
                income_count: parseInt(summary.income_count),
                expense_count: parseInt(summary.expense_count)
            },
            insights: {
                top_expense_categories: topCategories,
                monthly_breakdown: monthlyBreakdown,
                average_daily_expense: summary.total_expense > 0 ? (summary.total_expense / 30).toFixed(2) : 0
            }
        });
    } catch (error) {       
        console.error('Error fetching summary:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const deleteTransaction = async (req, res) => {
    const { transactionId } = req.params;
    
    try {
        const result = await sql `
            DELETE FROM transactions WHERE id = ${transactionId} RETURNING *
        `;
        if (result.length === 0) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        res.json({ message: 'Transaction deleted successfully', deletedTransaction: result[0] });
    } catch (error) {
        console.error('Error deleting transaction:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const updateTransaction = async (req, res) => {
    const { transactionId } = req.params;
    const { amount, type, category, description, date } = req.body;
    
    try {
        const result = await sql `
            UPDATE transactions 
            SET amount = ${amount}, type = ${type}, category = ${category}, 
                description = ${description}, date = ${date}
            WHERE id = ${transactionId} 
            RETURNING *
        `;
        
        if (result.length === 0) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        
        res.json(result[0]);
    } catch (error) {
        console.error('Error updating transaction:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const getRawTransactions = async (req, res) => {
    const { userId } = req.params;
    
    try {
        const transactions = await sql `
            SELECT * FROM transactions WHERE user_id = ${userId}
        `;
        
        res.json({
            user_id: userId,
            raw_transactions: transactions,
            count: transactions.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
