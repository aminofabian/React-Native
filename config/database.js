import { sql } from './db.js';
import { initGoalsTable } from '../controllers/goalController.js';
import { initRecurringTable } from '../controllers/recurringController.js';

export async function initDB() {
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

        // Initialize advanced features tables
        await initGoalsTable();
        await initRecurringTable();

        // Create database indexes for performance
        await sql `CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date DESC)`;
        await sql `CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category)`;
        await sql `CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)`;
        await sql `CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month_year)`;
        await sql `CREATE INDEX IF NOT EXISTS idx_goals_user_status ON financial_goals(user_id, status)`;
        await sql `CREATE INDEX IF NOT EXISTS idx_recurring_user_active ON recurring_transactions(user_id, is_active)`;
        await sql `CREATE INDEX IF NOT EXISTS idx_recurring_next_execution ON recurring_transactions(next_execution_date)`;

        // Insert default categories for new users with Quarter Formula alignment
        await sql `INSERT INTO categories (user_id, name, type, color, icon) VALUES 
            -- Income categories
            ('default', 'Salary', 'income', '#10B981', 'money'),
            ('default', 'Freelance', 'income', '#10B981', 'briefcase'),
            ('default', 'Investment', 'income', '#10B981', 'chart-line'),
            ('default', 'Business', 'income', '#10B981', 'building'),
            ('default', 'Other Income', 'income', '#10B981', 'plus-circle'),
            
            -- Household Expenses (25% Quarter)
            ('default', 'Housing', 'expense', '#F97316', 'home'),
            ('default', 'Food & Dining', 'expense', '#EF4444', 'utensils'),
            ('default', 'Utilities', 'expense', '#84CC16', 'zap'),
            ('default', 'Transportation', 'expense', '#F59E0B', 'car'),
            ('default', 'Groceries', 'expense', '#EF4444', 'shopping-cart'),
            
            -- Personal Money (25% Quarter)
            ('default', 'Entertainment', 'expense', '#EC4899', 'film'),
            ('default', 'Shopping', 'expense', '#8B5CF6', 'shopping-bag'),
            ('default', 'Personal Care', 'expense', '#06B6D4', 'heart'),
            ('default', 'Hobbies', 'expense', '#EC4899', 'gamepad-2'),
            ('default', 'Dining Out', 'expense', '#EF4444', 'coffee'),
            
            -- Savings & Investments (25% Quarter)
            ('default', 'Investment', 'expense', '#10B981', 'trending-up'),
            ('default', 'Retirement Savings', 'expense', '#10B981', 'piggy-bank'),
            ('default', 'Goal Savings', 'expense', '#10B981', 'target'),
            
            -- Emergency Fund (25% Quarter)
            ('default', 'Emergency Fund', 'expense', '#EF4444', 'shield'),
            ('default', 'Insurance', 'expense', '#06B6D4', 'shield-check'),
            ('default', 'Healthcare', 'expense', '#06B6D4', 'heart-pulse'),
            ('default', 'Unexpected Expenses', 'expense', '#F59E0B', 'alert-triangle')
        ON CONFLICT DO NOTHING`;

        console.log('Enhanced database initialized with Quarter Formula structure and advanced features');
    } catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    }
}
