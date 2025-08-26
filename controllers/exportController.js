import { sql } from '../config/db.js';

/**
 * Export/Import Controller
 * Handles data export to CSV, backup generation, and data import functionality
 */

export const exportTransactionsCSV = async (req, res) => {
    const { userId } = req.params;
    const { startDate, endDate, format = 'csv' } = req.query;

    try {
        let whereClause = `WHERE user_id = ${userId}`;
        
        if (startDate) {
            whereClause += ` AND date >= ${startDate}`;
        }
        
        if (endDate) {
            whereClause += ` AND date <= ${endDate}`;
        }

        const transactions = await sql`
            SELECT 
                id,
                amount,
                type,
                category,
                description,
                date,
                created_at
            FROM transactions 
            ${sql.unsafe(whereClause)}
            ORDER BY date DESC
        `;

        if (format === 'json') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="transactions_${userId}_${new Date().toISOString().split('T')[0]}.json"`);
            return res.json({
                user_id: userId,
                export_date: new Date().toISOString(),
                total_transactions: transactions.length,
                date_range: { start: startDate, end: endDate },
                transactions
            });
        }

        // Generate CSV
        const csvHeaders = ['ID', 'Date', 'Type', 'Category', 'Amount', 'Description', 'Created At'];
        const csvRows = [csvHeaders.join(',')];

        transactions.forEach(transaction => {
            const row = [
                transaction.id,
                transaction.date,
                transaction.type,
                `"${transaction.category}"`,
                transaction.amount,
                `"${(transaction.description || '').replace(/"/g, '""')}"`,
                transaction.created_at
            ];
            csvRows.push(row.join(','));
        });

        const csvContent = csvRows.join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="transactions_${userId}_${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csvContent);

    } catch (error) {
        console.error('Error exporting transactions:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const exportUserDataBackup = async (req, res) => {
    const { userId } = req.params;

    try {
        // Export all user data for backup
        const [transactions, categories, budgets, goals, recurring] = await Promise.all([
            sql`SELECT * FROM transactions WHERE user_id = ${userId} ORDER BY date DESC`,
            sql`SELECT * FROM categories WHERE user_id = ${userId} ORDER BY name`,
            sql`SELECT * FROM budgets WHERE user_id = ${userId} ORDER BY month_year DESC`,
            sql`SELECT * FROM financial_goals WHERE user_id = ${userId} ORDER BY created_at DESC`,
            sql`SELECT * FROM recurring_transactions WHERE user_id = ${userId} ORDER BY template_name`
        ]);

        // Get goal contributions and milestones
        const goalIds = goals.map(g => g.id);
        let goalContributions = [];
        let goalMilestones = [];

        if (goalIds.length > 0) {
            goalContributions = await sql`
                SELECT * FROM goal_contributions 
                WHERE goal_id = ANY(${goalIds})
                ORDER BY contribution_date DESC
            `;
            goalMilestones = await sql`
                SELECT * FROM goal_milestones 
                WHERE goal_id = ANY(${goalIds})
                ORDER BY milestone_percentage
            `;
        }

        // Get recurring execution logs
        const recurringIds = recurring.map(r => r.id);
        let recurringLogs = [];

        if (recurringIds.length > 0) {
            recurringLogs = await sql`
                SELECT * FROM recurring_execution_log 
                WHERE recurring_transaction_id = ANY(${recurringIds})
                ORDER BY execution_date DESC
            `;
        }

        const backup = {
            user_id: userId,
            backup_date: new Date().toISOString(),
            version: '1.0',
            data: {
                transactions,
                categories,
                budgets,
                financial_goals: goals,
                goal_contributions: goalContributions,
                goal_milestones: goalMilestones,
                recurring_transactions: recurring,
                recurring_execution_log: recurringLogs
            },
            summary: {
                total_transactions: transactions.length,
                total_categories: categories.length,
                total_budgets: budgets.length,
                total_goals: goals.length,
                total_recurring: recurring.length,
                date_range: {
                    earliest_transaction: transactions.length > 0 ? transactions[transactions.length - 1].date : null,
                    latest_transaction: transactions.length > 0 ? transactions[0].date : null
                }
            }
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="expense_tracker_backup_${userId}_${new Date().toISOString().split('T')[0]}.json"`);
        res.json(backup);

    } catch (error) {
        console.error('Error creating backup:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const importTransactionsCSV = async (req, res) => {
    const { userId } = req.params;
    const { transactions, dry_run = false } = req.body;

    if (!Array.isArray(transactions)) {
        return res.status(400).json({ error: 'Transactions must be an array' });
    }

    try {
        const results = {
            total_rows: transactions.length,
            successful_imports: 0,
            failed_imports: 0,
            errors: [],
            imported_transactions: []
        };

        for (let i = 0; i < transactions.length; i++) {
            const transaction = transactions[i];
            
            try {
                // Validate required fields
                if (!transaction.amount || !transaction.type || !transaction.category) {
                    throw new Error('Missing required fields: amount, type, or category');
                }

                if (!['income', 'expense'].includes(transaction.type)) {
                    throw new Error('Type must be either "income" or "expense"');
                }

                const amount = parseFloat(transaction.amount);
                if (isNaN(amount) || amount <= 0) {
                    throw new Error('Amount must be a positive number');
                }

                if (!dry_run) {
                    const result = await sql`
                        INSERT INTO transactions (user_id, amount, type, category, description, date)
                        VALUES (
                            ${userId}, 
                            ${amount}, 
                            ${transaction.type}, 
                            ${transaction.category}, 
                            ${transaction.description || null}, 
                            ${transaction.date || sql`CURRENT_DATE`}
                        )
                        RETURNING *
                    `;
                    
                    results.imported_transactions.push(result[0]);
                }

                results.successful_imports++;

            } catch (error) {
                results.failed_imports++;
                results.errors.push({
                    row: i + 1,
                    transaction: transaction,
                    error: error.message
                });
            }
        }

        res.json({
            user_id: userId,
            import_summary: results,
            dry_run
        });

    } catch (error) {
        console.error('Error importing transactions:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const restoreFromBackup = async (req, res) => {
    const { userId } = req.params;
    const { backup_data, restore_options = {} } = req.body;

    if (!backup_data || !backup_data.data) {
        return res.status(400).json({ error: 'Invalid backup data format' });
    }

    const {
        restore_transactions = true,
        restore_categories = true,
        restore_budgets = true,
        restore_goals = true,
        restore_recurring = true,
        clear_existing = false
    } = restore_options;

    try {
        const results = {
            restored_transactions: 0,
            restored_categories: 0,
            restored_budgets: 0,
            restored_goals: 0,
            restored_recurring: 0,
            errors: []
        };

        // Clear existing data if requested
        if (clear_existing) {
            await sql`DELETE FROM transactions WHERE user_id = ${userId}`;
            await sql`DELETE FROM categories WHERE user_id = ${userId}`;
            await sql`DELETE FROM budgets WHERE user_id = ${userId}`;
            await sql`DELETE FROM financial_goals WHERE user_id = ${userId}`;
            await sql`DELETE FROM recurring_transactions WHERE user_id = ${userId}`;
        }

        // Restore categories first (dependencies)
        if (restore_categories && backup_data.data.categories) {
            for (const category of backup_data.data.categories) {
                try {
                    await sql`
                        INSERT INTO categories (user_id, name, type, color, icon)
                        VALUES (${userId}, ${category.name}, ${category.type}, ${category.color}, ${category.icon})
                        ON CONFLICT (user_id, name, type) DO NOTHING
                    `;
                    results.restored_categories++;
                } catch (error) {
                    results.errors.push({ type: 'category', error: error.message, data: category });
                }
            }
        }

        // Restore transactions
        if (restore_transactions && backup_data.data.transactions) {
            for (const transaction of backup_data.data.transactions) {
                try {
                    await sql`
                        INSERT INTO transactions (user_id, amount, type, category, description, date)
                        VALUES (
                            ${userId}, ${transaction.amount}, ${transaction.type}, 
                            ${transaction.category}, ${transaction.description}, ${transaction.date}
                        )
                    `;
                    results.restored_transactions++;
                } catch (error) {
                    results.errors.push({ type: 'transaction', error: error.message, data: transaction });
                }
            }
        }

        // Restore budgets
        if (restore_budgets && backup_data.data.budgets) {
            for (const budget of backup_data.data.budgets) {
                try {
                    await sql`
                        INSERT INTO budgets (user_id, category, amount, month_year)
                        VALUES (${userId}, ${budget.category}, ${budget.amount}, ${budget.month_year})
                        ON CONFLICT (user_id, category, month_year) DO UPDATE SET amount = ${budget.amount}
                    `;
                    results.restored_budgets++;
                } catch (error) {
                    results.errors.push({ type: 'budget', error: error.message, data: budget });
                }
            }
        }

        // Restore goals
        if (restore_goals && backup_data.data.financial_goals) {
            for (const goal of backup_data.data.financial_goals) {
                try {
                    const goalResult = await sql`
                        INSERT INTO financial_goals (
                            user_id, title, description, goal_type, target_amount, 
                            current_amount, target_date, priority, status, category, auto_tracking
                        )
                        VALUES (
                            ${userId}, ${goal.title}, ${goal.description}, ${goal.goal_type}, 
                            ${goal.target_amount}, ${goal.current_amount}, ${goal.target_date}, 
                            ${goal.priority}, ${goal.status}, ${goal.category}, ${goal.auto_tracking}
                        )
                        RETURNING id
                    `;

                    // Restore goal milestones and contributions if available
                    const newGoalId = goalResult[0].id;
                    
                    if (backup_data.data.goal_milestones) {
                        const milestones = backup_data.data.goal_milestones.filter(m => m.goal_id === goal.id);
                        for (const milestone of milestones) {
                            await sql`
                                INSERT INTO goal_milestones (goal_id, milestone_percentage, milestone_amount, achieved_date, reward_description)
                                VALUES (${newGoalId}, ${milestone.milestone_percentage}, ${milestone.milestone_amount}, ${milestone.achieved_date}, ${milestone.reward_description})
                            `;
                        }
                    }

                    if (backup_data.data.goal_contributions) {
                        const contributions = backup_data.data.goal_contributions.filter(c => c.goal_id === goal.id);
                        for (const contribution of contributions) {
                            await sql`
                                INSERT INTO goal_contributions (goal_id, amount, contribution_date, note)
                                VALUES (${newGoalId}, ${contribution.amount}, ${contribution.contribution_date}, ${contribution.note})
                            `;
                        }
                    }

                    results.restored_goals++;
                } catch (error) {
                    results.errors.push({ type: 'goal', error: error.message, data: goal });
                }
            }
        }

        // Restore recurring transactions
        if (restore_recurring && backup_data.data.recurring_transactions) {
            for (const recurring of backup_data.data.recurring_transactions) {
                try {
                    await sql`
                        INSERT INTO recurring_transactions (
                            user_id, template_name, amount, type, category, description,
                            frequency, start_date, end_date, next_execution_date,
                            execution_count, is_active, auto_create, reminder_days_before
                        )
                        VALUES (
                            ${userId}, ${recurring.template_name}, ${recurring.amount}, ${recurring.type},
                            ${recurring.category}, ${recurring.description}, ${recurring.frequency},
                            ${recurring.start_date}, ${recurring.end_date}, ${recurring.next_execution_date},
                            ${recurring.execution_count}, ${recurring.is_active}, ${recurring.auto_create},
                            ${recurring.reminder_days_before}
                        )
                    `;
                    results.restored_recurring++;
                } catch (error) {
                    results.errors.push({ type: 'recurring', error: error.message, data: recurring });
                }
            }
        }

        res.json({
            user_id: userId,
            restore_summary: results,
            backup_info: {
                original_user: backup_data.user_id,
                backup_date: backup_data.backup_date,
                version: backup_data.version
            }
        });

    } catch (error) {
        console.error('Error restoring from backup:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const generateFinancialReport = async (req, res) => {
    const { userId } = req.params;
    const { period = 'monthly', format = 'json', year, month } = req.query;

    try {
        let dateFilter = '';
        let reportTitle = '';

        if (period === 'monthly' && year && month) {
            dateFilter = `AND date >= '${year}-${month.padStart(2, '0')}-01' AND date < '${year}-${(parseInt(month) + 1).toString().padStart(2, '0')}-01'`;
            reportTitle = `Monthly Financial Report - ${year}-${month.padStart(2, '0')}`;
        } else if (period === 'yearly' && year) {
            dateFilter = `AND EXTRACT(YEAR FROM date) = ${year}`;
            reportTitle = `Annual Financial Report - ${year}`;
        } else {
            reportTitle = 'Overall Financial Report';
        }

        // Get comprehensive financial data
        const [
            summary,
            categoryBreakdown,
            monthlyTrends,
            quarterFormula,
            goalProgress,
            recurringImpact
        ] = await Promise.all([
            // Financial summary
            sql`
                SELECT 
                    SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
                    SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expense,
                    COUNT(*) as total_transactions,
                    AVG(CASE WHEN type = 'expense' THEN amount END) as avg_expense,
                    MAX(CASE WHEN type = 'expense' THEN amount END) as max_expense
                FROM transactions 
                WHERE user_id = ${userId} ${sql.unsafe(dateFilter)}
            `,
            
            // Category breakdown
            sql`
                SELECT 
                    category,
                    type,
                    SUM(amount) as total_amount,
                    COUNT(*) as transaction_count,
                    AVG(amount) as avg_amount
                FROM transactions 
                WHERE user_id = ${userId} ${sql.unsafe(dateFilter)}
                GROUP BY category, type
                ORDER BY total_amount DESC
            `,
            
            // Monthly trends (if not monthly report)
            period !== 'monthly' ? sql`
                SELECT 
                    TO_CHAR(date, 'YYYY-MM') as month,
                    SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
                    SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense
                FROM transactions 
                WHERE user_id = ${userId} ${sql.unsafe(dateFilter)}
                GROUP BY TO_CHAR(date, 'YYYY-MM')
                ORDER BY month
            ` : [],
            
            // Quarter formula analysis
            sql`
                SELECT 
                    CASE 
                        WHEN category IN ('Housing', 'Food & Dining', 'Utilities', 'Transportation', 'Groceries') THEN 'Household'
                        WHEN category IN ('Entertainment', 'Shopping', 'Personal Care', 'Hobbies', 'Dining Out') THEN 'Personal'
                        WHEN category IN ('Investment', 'Retirement Savings', 'Goal Savings') THEN 'Savings'
                        WHEN category IN ('Emergency Fund', 'Insurance', 'Healthcare') THEN 'Emergency'
                        ELSE 'Other'
                    END as quarter_category,
                    SUM(amount) as total_spent
                FROM transactions 
                WHERE user_id = ${userId} AND type = 'expense' ${sql.unsafe(dateFilter)}
                GROUP BY quarter_category
            `,
            
            // Goal progress
            sql`
                SELECT 
                    title,
                    goal_type,
                    target_amount,
                    current_amount,
                    status,
                    ROUND((current_amount / target_amount) * 100, 2) as progress_percentage
                FROM financial_goals 
                WHERE user_id = ${userId}
                ORDER BY progress_percentage DESC
            `,
            
            // Recurring transaction impact
            sql`
                SELECT 
                    COUNT(*) as active_recurring,
                    SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as recurring_income,
                    SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as recurring_expenses
                FROM recurring_transactions 
                WHERE user_id = ${userId} AND is_active = true
            `
        ]);

        const reportData = {
            report_info: {
                title: reportTitle,
                user_id: userId,
                generated_at: new Date().toISOString(),
                period,
                date_filter: { year, month }
            },
            financial_summary: summary[0],
            category_breakdown: categoryBreakdown,
            monthly_trends: monthlyTrends,
            quarter_formula_analysis: quarterFormula,
            goal_progress: goalProgress,
            recurring_impact: recurringImpact[0]
        };

        // Calculate additional insights
        const totalIncome = parseFloat(reportData.financial_summary.total_income) || 0;
        const totalExpense = parseFloat(reportData.financial_summary.total_expense) || 0;
        
        reportData.insights = {
            net_balance: totalIncome - totalExpense,
            savings_rate: totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100).toFixed(2) : 0,
            top_expense_category: categoryBreakdown.find(c => c.type === 'expense')?.category || 'None',
            financial_health_grade: calculateHealthGrade(totalIncome, totalExpense, goalProgress.length)
        };

        if (format === 'csv') {
            // Generate CSV report
            const csvLines = [
                `Financial Report - ${reportTitle}`,
                '',
                'SUMMARY',
                `Total Income,$${totalIncome.toFixed(2)}`,
                `Total Expenses,$${totalExpense.toFixed(2)}`,
                `Net Balance,$${reportData.insights.net_balance.toFixed(2)}`,
                `Savings Rate,${reportData.insights.savings_rate}%`,
                '',
                'CATEGORY BREAKDOWN',
                'Category,Type,Total Amount,Transaction Count,Average Amount'
            ];

            categoryBreakdown.forEach(cat => {
                csvLines.push(`${cat.category},${cat.type},$${cat.total_amount},"${cat.transaction_count}",$${cat.avg_amount}`);
            });

            const csvContent = csvLines.join('\n');
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="financial_report_${userId}_${new Date().toISOString().split('T')[0]}.csv"`);
            res.send(csvContent);
        } else {
            res.json(reportData);
        }

    } catch (error) {
        console.error('Error generating financial report:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

function calculateHealthGrade(income, expenses, goalCount) {
    let score = 0;
    
    // Savings rate (40 points)
    if (income > 0) {
        const savingsRate = ((income - expenses) / income) * 100;
        if (savingsRate >= 20) score += 40;
        else if (savingsRate >= 10) score += 30;
        else if (savingsRate >= 0) score += 20;
    }
    
    // Goal engagement (30 points)
    if (goalCount >= 3) score += 30;
    else if (goalCount >= 1) score += 20;
    
    // Expense management (30 points)
    if (expenses <= income * 0.8) score += 30;
    else if (expenses <= income) score += 20;
    else score += 10;
    
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'F';
}
