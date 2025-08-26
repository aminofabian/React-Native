import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { sql } from './config/db.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5002;

async function initDB(){
    try {
        // Create transactions table with better expense tracking structure
        await sql `CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY, 
            user_id varchar(255) NOT NULL,
            amount DECIMAL(10, 2) NOT NULL,
            type VARCHAR(50) NOT NULL CHECK (type IN ('income', 'expense')),
            category VARCHAR(100) NOT NULL,
            description TEXT,
            date DATE NOT NULL DEFAULT CURRENT_DATE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;

        // Create categories table for expense categorization
        await sql `CREATE TABLE IF NOT EXISTS categories (
            id SERIAL PRIMARY KEY,
            user_id varchar(255) NOT NULL,
            name VARCHAR(100) NOT NULL,
            type VARCHAR(50) NOT NULL CHECK (type IN ('income', 'expense')),
            color VARCHAR(7) DEFAULT '#3B82F6',
            icon VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, name, type)
        )`;

        // Create budgets table for monthly budget tracking
        await sql `CREATE TABLE IF NOT EXISTS budgets (
            id SERIAL PRIMARY KEY,
            user_id varchar(255) NOT NULL,
            category VARCHAR(100) NOT NULL,
            amount DECIMAL(10, 2) NOT NULL,
            month_year VARCHAR(7) NOT NULL, -- Format: '2024-01'
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, category, month_year)
        )`;

        // Insert default categories for new users
        await sql `INSERT INTO categories (user_id, name, type, color, icon) VALUES 
            ('default', 'Salary', 'income', '#10B981', 'money'),
            ('default', 'Freelance', 'income', '#10B981', 'briefcase'),
            ('default', 'Investment', 'income', '#10B981', 'chart-line'),
            ('default', 'Food & Dining', 'expense', '#EF4444', 'utensils'),
            ('default', 'Transportation', 'expense', '#F59E0B', 'car'),
            ('default', 'Shopping', 'expense', '#8B5CF6', 'shopping-bag'),
            ('default', 'Entertainment', 'expense', '#EC4899', 'film'),
            ('default', 'Healthcare', 'expense', '#06B6D4', 'heart'),
            ('default', 'Utilities', 'expense', '#84CC16', 'zap'),
            ('default', 'Housing', 'expense', '#F97316', 'home')
        ON CONFLICT DO NOTHING`;

        console.log('Database initialized with expense tracking structure');
    } catch (error) {
        console.error('Error initializing database:', error);
        process.exit(1);
    }
}

// Get user's categories
app.get('/api/categories/:userId', async (req, res) => {
    const { userId } = req.params;
    
    if (!userId || userId.trim() === '') {
        return res.status(400).json({ error: 'Valid user ID is required' });
    }
    
    try {
        const categories = await sql `
            SELECT * FROM categories 
            WHERE user_id = ${userId} OR user_id = 'default'
            ORDER BY type, name
        `;
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Add new category
app.post('/api/categories', async (req, res) => {
    const { user_id, name, type, color, icon } = req.body;
    
    if (!user_id || !name || !type) {
        return res.status(400).json({ 
            error: 'user_id, name, and type are required' 
        });
    }
    
    if (!['income', 'expense'].includes(type)) {
        return res.status(400).json({ 
            error: 'Type must be either "income" or "expense"' 
        });
    }
    
    try {
        const result = await sql `
            INSERT INTO categories (user_id, name, type, color, icon) 
            VALUES (${user_id}, ${name}, ${type}, ${color || '#3B82F6'}, ${icon || 'tag'}) 
            RETURNING *
        `;
        res.status(201).json(result[0]);
    } catch (error) {
        console.error('Error adding category:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Add transaction
app.post('/api/transactions', async (req, res) => {
    const { user_id, amount, type, category, description, date } = req.body;
    
    if (!user_id || !amount || !type || !category) {
        return res.status(400).json({ 
            error: 'user_id, amount, type, and category are required' 
        });
    }
    
    if (!['income', 'expense'].includes(type)) {
        return res.status(400).json({ 
            error: 'Type must be either "income" or "expense"' 
        });
    }
    
    if (amount <= 0) {
        return res.status(400).json({ 
            error: 'Amount must be greater than 0' 
        });
    }
    
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
});

// Get transactions with filtering
app.get('/api/transactions/:userId', async (req, res) => {
    const { userId } = req.params;
    const { type, category, startDate, endDate, limit = 50, offset = 0 } = req.query;
    
    if (!userId || userId.trim() === '') {
        return res.status(400).json({ error: 'Valid user ID is required' });
    }
    
    try {
        let whereClause = `WHERE user_id = ${userId}`;
        const params = [];
        
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
});

// Get comprehensive summary with better expense insights
app.get('/api/transactions/summary/:userId', async (req, res) => {
    const { userId } = req.params;
    const { month, year } = req.query;
    
    if (!userId || userId.trim() === '') {
        return res.status(400).json({ error: 'Valid user ID is required' });
    }
    
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
});

// Set monthly budget for categories
app.post('/api/budgets', async (req, res) => {
    const { user_id, category, amount, month_year } = req.body;
    
    if (!user_id || !category || !amount || !month_year) {
        return res.status(400).json({ 
            error: 'user_id, category, amount, and month_year are required' 
        });
    }
    
    if (amount <= 0) {
        return res.status(400).json({ 
            error: 'Budget amount must be greater than 0' 
        });
    }
    
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
});

// Get budget vs actual spending
app.get('/api/budgets/:userId', async (req, res) => {
    const { userId } = req.params;
    const { month_year } = req.query;
    
    if (!userId || userId.trim() === '') {
        return res.status(400).json({ error: 'Valid user ID is required' });
    }
    
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
});

// Delete transaction
app.delete('/api/transactions/:transactionId', async (req, res) => {
    const { transactionId } = req.params;
    
    if (!transactionId) {
        return res.status(400).json({ error: 'Transaction ID is required' });
    }
    
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
});

// Update transaction
app.put('/api/transactions/:transactionId', async (req, res) => {
    const { transactionId } = req.params;
    const { amount, type, category, description, date } = req.body;
    
    if (!transactionId) {
        return res.status(400).json({ error: 'Transaction ID is required' });
    }
    
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
});

// SIMPLE DEBUG ENDPOINT - Show raw transaction data
app.get('/api/debug/raw/:userId', async (req, res) => {
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
});

initDB().then(() => {
    console.log('Database setup complete');
}).catch((error) => {
    console.error('Database setup failed:', error);
    process.exit(1);
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});