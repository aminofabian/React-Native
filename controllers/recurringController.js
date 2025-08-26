import { sql } from '../config/db.js';

/**
 * Recurring Transactions Controller
 * Manages automated recurring income and expenses with smart scheduling
 */

export const initRecurringTable = async () => {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS recurring_transactions (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                template_name VARCHAR(200) NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                type VARCHAR(50) NOT NULL CHECK (type IN ('income', 'expense')),
                category VARCHAR(100) NOT NULL,
                description TEXT,
                frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'bi_weekly', 'monthly', 'quarterly', 'annually')),
                start_date DATE NOT NULL,
                end_date DATE, -- NULL for indefinite
                next_execution_date DATE NOT NULL,
                last_executed_date DATE,
                execution_count INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                auto_create BOOLEAN DEFAULT true, -- Automatically create transactions
                reminder_days_before INTEGER DEFAULT 1, -- Days before to remind user
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS recurring_execution_log (
                id SERIAL PRIMARY KEY,
                recurring_transaction_id INTEGER REFERENCES recurring_transactions(id) ON DELETE CASCADE,
                transaction_id INTEGER, -- Reference to created transaction
                execution_date DATE NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'skipped')),
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        console.log('Recurring transactions tables initialized successfully');
    } catch (error) {
        console.error('Error initializing recurring tables:', error);
        throw error;
    }
};

export const createRecurringTransaction = async (req, res) => {
    const {
        user_id,
        template_name,
        amount,
        type,
        category,
        description,
        frequency,
        start_date,
        end_date,
        auto_create = true,
        reminder_days_before = 1
    } = req.body;

    try {
        // Calculate next execution date based on frequency
        const nextExecutionDate = calculateNextExecutionDate(new Date(start_date), frequency);

        const result = await sql`
            INSERT INTO recurring_transactions (
                user_id, template_name, amount, type, category, description,
                frequency, start_date, end_date, next_execution_date,
                auto_create, reminder_days_before
            )
            VALUES (
                ${user_id}, ${template_name}, ${amount}, ${type}, ${category}, 
                ${description || null}, ${frequency}, ${start_date}, ${end_date || null}, 
                ${nextExecutionDate.toISOString().split('T')[0]}, ${auto_create}, ${reminder_days_before}
            )
            RETURNING *
        `;

        res.status(201).json({
            recurring_transaction: result[0],
            next_execution: nextExecutionDate.toISOString().split('T')[0],
            message: 'Recurring transaction created successfully'
        });

    } catch (error) {
        console.error('Error creating recurring transaction:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const getUserRecurringTransactions = async (req, res) => {
    const { userId } = req.params;
    const { is_active, type } = req.query;

    try {
        let whereClause = `WHERE user_id = ${userId}`;
        
        if (is_active !== undefined) {
            whereClause += ` AND is_active = ${is_active === 'true'}`;
        }
        
        if (type) {
            whereClause += ` AND type = ${type}`;
        }

        const recurringTransactions = await sql`
            SELECT 
                rt.*,
                CASE 
                    WHEN rt.next_execution_date <= CURRENT_DATE THEN 'due'
                    WHEN rt.next_execution_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'upcoming'
                    ELSE 'scheduled'
                END as execution_status,
                EXTRACT(DAYS FROM (rt.next_execution_date - CURRENT_DATE)) as days_until_next
            FROM recurring_transactions rt
            ${sql.unsafe(whereClause)}
            ORDER BY rt.next_execution_date ASC
        `;

        // Get execution history for each
        for (const rt of recurringTransactions) {
            const recentExecutions = await sql`
                SELECT * FROM recurring_execution_log
                WHERE recurring_transaction_id = ${rt.id}
                ORDER BY execution_date DESC
                LIMIT 5
            `;
            rt.recent_executions = recentExecutions;
        }

        res.json({
            user_id: userId,
            recurring_transactions: recurringTransactions,
            summary: {
                total: recurringTransactions.length,
                active: recurringTransactions.filter(rt => rt.is_active).length,
                due_today: recurringTransactions.filter(rt => rt.execution_status === 'due').length,
                upcoming_week: recurringTransactions.filter(rt => rt.execution_status === 'upcoming').length
            }
        });

    } catch (error) {
        console.error('Error fetching recurring transactions:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const executeRecurringTransactions = async (req, res) => {
    const { userId } = req.params;
    const { specific_id, dry_run = false } = req.query;

    try {
        let whereClause = `WHERE user_id = ${userId} AND is_active = true AND next_execution_date <= CURRENT_DATE`;
        
        if (specific_id) {
            whereClause += ` AND id = ${specific_id}`;
        }

        const dueTransactions = await sql`
            SELECT * FROM recurring_transactions 
            ${sql.unsafe(whereClause)}
        `;

        const results = [];

        for (const recurringTx of dueTransactions) {
            try {
                if (!dry_run) {
                    // Create the actual transaction
                    const transactionResult = await sql`
                        INSERT INTO transactions (user_id, amount, type, category, description, date)
                        VALUES (
                            ${recurringTx.user_id}, 
                            ${recurringTx.amount}, 
                            ${recurringTx.type}, 
                            ${recurringTx.category}, 
                            ${recurringTx.description || `Recurring: ${recurringTx.template_name}`}, 
                            CURRENT_DATE
                        )
                        RETURNING *
                    `;

                    // Log the execution
                    await sql`
                        INSERT INTO recurring_execution_log (
                            recurring_transaction_id, transaction_id, execution_date, 
                            amount, status
                        )
                        VALUES (
                            ${recurringTx.id}, ${transactionResult[0].id}, CURRENT_DATE, 
                            ${recurringTx.amount}, 'completed'
                        )
                    `;

                    // Update the recurring transaction
                    const nextExecution = calculateNextExecutionDate(
                        new Date(recurringTx.next_execution_date), 
                        recurringTx.frequency
                    );

                    // Check if we've reached the end date
                    const shouldContinue = !recurringTx.end_date || 
                        nextExecution <= new Date(recurringTx.end_date);

                    await sql`
                        UPDATE recurring_transactions
                        SET 
                            next_execution_date = ${shouldContinue ? nextExecution.toISOString().split('T')[0] : null},
                            last_executed_date = CURRENT_DATE,
                            execution_count = execution_count + 1,
                            is_active = ${shouldContinue},
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ${recurringTx.id}
                    `;

                    results.push({
                        recurring_id: recurringTx.id,
                        template_name: recurringTx.template_name,
                        status: 'executed',
                        transaction_id: transactionResult[0].id,
                        amount: recurringTx.amount,
                        next_execution: shouldContinue ? nextExecution.toISOString().split('T')[0] : 'completed'
                    });
                } else {
                    // Dry run - just show what would happen
                    results.push({
                        recurring_id: recurringTx.id,
                        template_name: recurringTx.template_name,
                        status: 'would_execute',
                        amount: recurringTx.amount,
                        execution_date: new Date().toISOString().split('T')[0]
                    });
                }

            } catch (execError) {
                console.error(`Error executing recurring transaction ${recurringTx.id}:`, execError);
                
                if (!dry_run) {
                    // Log the failed execution
                    await sql`
                        INSERT INTO recurring_execution_log (
                            recurring_transaction_id, execution_date, amount, 
                            status, error_message
                        )
                        VALUES (
                            ${recurringTx.id}, CURRENT_DATE, ${recurringTx.amount}, 
                            'failed', ${execError.message}
                        )
                    `;
                }

                results.push({
                    recurring_id: recurringTx.id,
                    template_name: recurringTx.template_name,
                    status: 'failed',
                    error: execError.message
                });
            }
        }

        res.json({
            user_id: userId,
            execution_summary: {
                total_processed: results.length,
                successful: results.filter(r => r.status === 'executed' || r.status === 'would_execute').length,
                failed: results.filter(r => r.status === 'failed').length,
                dry_run
            },
            results
        });

    } catch (error) {
        console.error('Error executing recurring transactions:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const updateRecurringTransaction = async (req, res) => {
    const { recurringId } = req.params;
    const updates = req.body;

    try {
        const allowedFields = [
            'template_name', 'amount', 'category', 'description', 
            'frequency', 'end_date', 'is_active', 'auto_create', 'reminder_days_before'
        ];
        
        const setPairs = [];
        const values = [];

        Object.entries(updates).forEach(([key, value]) => {
            if (allowedFields.includes(key)) {
                setPairs.push(`${key} = $${values.length + 1}`);
                values.push(value);
            }
        });

        if (setPairs.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        // If frequency is updated, recalculate next execution date
        if (updates.frequency) {
            const currentRecurring = await sql`
                SELECT next_execution_date FROM recurring_transactions WHERE id = ${recurringId}
            `;
            
            if (currentRecurring.length > 0) {
                const newNextExecution = calculateNextExecutionDate(
                    new Date(currentRecurring[0].next_execution_date), 
                    updates.frequency
                );
                
                setPairs.push(`next_execution_date = $${values.length + 1}`);
                values.push(newNextExecution.toISOString().split('T')[0]);
            }
        }

        setPairs.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(recurringId);

        const result = await sql`
            UPDATE recurring_transactions 
            SET ${sql.unsafe(setPairs.join(', '))}
            WHERE id = $${values.length}
            RETURNING *
        `.apply(null, values);

        if (result.length === 0) {
            return res.status(404).json({ error: 'Recurring transaction not found' });
        }

        res.json({
            message: 'Recurring transaction updated successfully',
            recurring_transaction: result[0]
        });

    } catch (error) {
        console.error('Error updating recurring transaction:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const deleteRecurringTransaction = async (req, res) => {
    const { recurringId } = req.params;

    try {
        const result = await sql`
            DELETE FROM recurring_transactions 
            WHERE id = ${recurringId}
            RETURNING *
        `;

        if (result.length === 0) {
            return res.status(404).json({ error: 'Recurring transaction not found' });
        }

        res.json({
            message: 'Recurring transaction deleted successfully',
            deleted_transaction: result[0]
        });

    } catch (error) {
        console.error('Error deleting recurring transaction:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const getRecurringInsights = async (req, res) => {
    const { userId } = req.params;

    try {
        // Calculate recurring income vs expenses
        const recurringBalance = await sql`
            SELECT 
                type,
                COUNT(*) as count,
                SUM(amount) as total_amount,
                AVG(amount) as avg_amount
            FROM recurring_transactions 
            WHERE user_id = ${userId} AND is_active = true
            GROUP BY type
        `;

        // Get upcoming transactions for next 30 days
        const upcomingTransactions = await sql`
            SELECT 
                template_name,
                amount,
                type,
                category,
                next_execution_date,
                frequency
            FROM recurring_transactions 
            WHERE user_id = ${userId} 
            AND is_active = true 
            AND next_execution_date <= CURRENT_DATE + INTERVAL '30 days'
            ORDER BY next_execution_date ASC
        `;

        // Calculate monthly impact
        const monthlyImpact = {};
        upcomingTransactions.forEach(tx => {
            const frequency = tx.frequency;
            let monthlyAmount = 0;

            switch (frequency) {
                case 'weekly':
                    monthlyAmount = parseFloat(tx.amount) * 4.33; // Average weeks per month
                    break;
                case 'bi_weekly':
                    monthlyAmount = parseFloat(tx.amount) * 2.17;
                    break;
                case 'monthly':
                    monthlyAmount = parseFloat(tx.amount);
                    break;
                case 'quarterly':
                    monthlyAmount = parseFloat(tx.amount) / 3;
                    break;
                case 'annually':
                    monthlyAmount = parseFloat(tx.amount) / 12;
                    break;
                default:
                    monthlyAmount = parseFloat(tx.amount) * 30; // Daily
            }

            if (!monthlyImpact[tx.type]) {
                monthlyImpact[tx.type] = 0;
            }
            monthlyImpact[tx.type] += monthlyAmount;
        });

        res.json({
            user_id: userId,
            recurring_summary: recurringBalance,
            upcoming_30_days: upcomingTransactions,
            monthly_impact: {
                recurring_income: Math.round((monthlyImpact.income || 0) * 100) / 100,
                recurring_expenses: Math.round((monthlyImpact.expense || 0) * 100) / 100,
                net_monthly_impact: Math.round(((monthlyImpact.income || 0) - (monthlyImpact.expense || 0)) * 100) / 100
            },
            recommendations: generateRecurringRecommendations(recurringBalance, monthlyImpact)
        });

    } catch (error) {
        console.error('Error generating recurring insights:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Helper function to calculate next execution date
function calculateNextExecutionDate(currentDate, frequency) {
    const nextDate = new Date(currentDate);

    switch (frequency) {
        case 'daily':
            nextDate.setDate(nextDate.getDate() + 1);
            break;
        case 'weekly':
            nextDate.setDate(nextDate.getDate() + 7);
            break;
        case 'bi_weekly':
            nextDate.setDate(nextDate.getDate() + 14);
            break;
        case 'monthly':
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
        case 'quarterly':
            nextDate.setMonth(nextDate.getMonth() + 3);
            break;
        case 'annually':
            nextDate.setFullYear(nextDate.getFullYear() + 1);
            break;
    }

    return nextDate;
}

function generateRecurringRecommendations(balance, monthlyImpact) {
    const recommendations = [];

    const incomeData = balance.find(b => b.type === 'income');
    const expenseData = balance.find(b => b.type === 'expense');

    if (!incomeData && expenseData) {
        recommendations.push({
            type: 'setup',
            priority: 'high',
            message: 'Consider setting up recurring income transactions',
            action: 'Add your salary or regular income sources as recurring transactions'
        });
    }

    if (monthlyImpact.expense > monthlyImpact.income) {
        recommendations.push({
            type: 'warning',
            priority: 'medium',
            message: 'Recurring expenses exceed recurring income',
            action: 'Review recurring expenses or add more income sources'
        });
    }

    if (expenseData && expenseData.count > 10) {
        recommendations.push({
            type: 'optimization',
            priority: 'low',
            message: 'You have many recurring expenses',
            action: 'Consider consolidating or reviewing subscriptions to reduce complexity'
        });
    }

    return recommendations;
}
