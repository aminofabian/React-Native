import { sql } from '../config/db.js';

/**
 * Quarter Formula Controller
 * Implements the 25% income allocation system:
 * - 25% Household Expenses
 * - 25% Personal Money  
 * - 25% Savings & Investments
 * - 25% Emergency Fund (12.5% true emergencies + 12.5% buffer/opportunities)
 */

export const calculateQuarterAllocation = async (req, res) => {
    const { userId } = req.params;
    const { month, year } = req.query;
    
    try {
        const currentMonth = month && year ? `${year}-${month.padStart(2, '0')}` : new Date().toISOString().slice(0, 7);
        
        // Get total income for the period
        const incomeResult = await sql`
            SELECT COALESCE(SUM(amount), 0) as total_income
            FROM transactions 
            WHERE user_id = ${userId} 
            AND type = 'income'
            AND TO_CHAR(date, 'YYYY-MM') = ${currentMonth}
        `;
        
        const totalIncome = parseFloat(incomeResult[0].total_income);
        const quarterAmount = totalIncome * 0.25;
        
        // Get actual spending by quarter categories
        const spendingByQuarter = await sql`
            SELECT 
                CASE 
                    WHEN category IN ('Housing', 'Food & Dining', 'Utilities', 'Transportation') THEN 'household'
                    WHEN category IN ('Entertainment', 'Shopping', 'Personal Care', 'Hobbies') THEN 'personal'
                    WHEN category IN ('Investment', 'Retirement Savings', 'Goal Savings') THEN 'savings'
                    WHEN category IN ('Emergency Fund', 'Insurance', 'Healthcare') THEN 'emergency'
                    ELSE 'other'
                END as quarter_category,
                COALESCE(SUM(amount), 0) as actual_spending
            FROM transactions 
            WHERE user_id = ${userId} 
            AND type = 'expense'
            AND TO_CHAR(date, 'YYYY-MM') = ${currentMonth}
            GROUP BY quarter_category
        `;
        
        // Build quarter allocation object
        const quarterAllocation = {
            household: { allocated: quarterAmount, spent: 0, remaining: quarterAmount, status: 'under_budget' },
            personal: { allocated: quarterAmount, spent: 0, remaining: quarterAmount, status: 'under_budget' },
            savings: { allocated: quarterAmount, spent: 0, remaining: quarterAmount, status: 'under_budget' },
            emergency: { 
                allocated: quarterAmount, 
                spent: 0, 
                remaining: quarterAmount, 
                status: 'under_budget',
                breakdown: {
                    true_emergencies: quarterAmount * 0.5,
                    buffer_opportunities: quarterAmount * 0.5
                }
            }
        };
        
        // Update with actual spending
        spendingByQuarter.forEach(row => {
            const quarter = row.quarter_category;
            if (quarterAllocation[quarter]) {
                const spent = parseFloat(row.actual_spending);
                quarterAllocation[quarter].spent = spent;
                quarterAllocation[quarter].remaining = quarterAllocation[quarter].allocated - spent;
                
                // Determine status
                if (spent > quarterAllocation[quarter].allocated) {
                    quarterAllocation[quarter].status = 'over_budget';
                } else if (spent === quarterAllocation[quarter].allocated) {
                    quarterAllocation[quarter].status = 'at_budget';
                } else {
                    quarterAllocation[quarter].status = 'under_budget';
                }
            }
        });
        
        // Calculate adherence score
        const adherenceScore = Object.values(quarterAllocation)
            .filter(q => q.status)
            .reduce((score, quarter) => {
                if (quarter.status === 'under_budget') return score + 25;
                if (quarter.status === 'at_budget') return score + 20;
                return score + Math.max(0, 15 - ((quarter.spent - quarter.allocated) / quarter.allocated * 100));
            }, 0);
        
        res.json({
            user_id: userId,
            period: currentMonth,
            total_income: totalIncome,
            quarter_amount: quarterAmount,
            allocation: quarterAllocation,
            adherence_score: Math.round(adherenceScore),
            recommendations: generateQuarterRecommendations(quarterAllocation, totalIncome)
        });
        
    } catch (error) {
        console.error('Error calculating quarter allocation:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const setQuarterBudgets = async (req, res) => {
    const { user_id, monthly_income, month_year } = req.body;
    
    try {
        const quarterAmount = monthly_income * 0.25;
        
        // Define quarter categories and their budgets
        const quarterCategories = [
            { category: 'Household Expenses', amount: quarterAmount },
            { category: 'Personal Money', amount: quarterAmount },
            { category: 'Savings & Investments', amount: quarterAmount },
            { category: 'Emergency Fund', amount: quarterAmount }
        ];
        
        // Insert/update quarter budgets
        const budgetPromises = quarterCategories.map(({ category, amount }) =>
            sql`
                INSERT INTO budgets (user_id, category, amount, month_year) 
                VALUES (${user_id}, ${category}, ${amount}, ${month_year}) 
                ON CONFLICT (user_id, category, month_year) 
                DO UPDATE SET amount = ${amount}
                RETURNING *
            `
        );
        
        const results = await Promise.all(budgetPromises);
        
        res.status(201).json({
            user_id,
            month_year,
            monthly_income,
            quarter_amount: quarterAmount,
            budgets_set: results.map(r => r[0])
        });
        
    } catch (error) {
        console.error('Error setting quarter budgets:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const getQuarterProgress = async (req, res) => {
    const { userId } = req.params;
    
    try {
        // Get last 6 months of quarter adherence
        const progressData = await sql`
            WITH monthly_income AS (
                SELECT 
                    TO_CHAR(date, 'YYYY-MM') as month,
                    SUM(amount) as income
                FROM transactions 
                WHERE user_id = ${userId} AND type = 'income'
                AND date >= CURRENT_DATE - INTERVAL '6 months'
                GROUP BY TO_CHAR(date, 'YYYY-MM')
            ),
            monthly_expenses AS (
                SELECT 
                    TO_CHAR(date, 'YYYY-MM') as month,
                    CASE 
                        WHEN category IN ('Housing', 'Food & Dining', 'Utilities', 'Transportation') THEN 'household'
                        WHEN category IN ('Entertainment', 'Shopping', 'Personal Care', 'Hobbies') THEN 'personal'
                        WHEN category IN ('Investment', 'Retirement Savings', 'Goal Savings') THEN 'savings'
                        WHEN category IN ('Emergency Fund', 'Insurance', 'Healthcare') THEN 'emergency'
                        ELSE 'other'
                    END as quarter_category,
                    SUM(amount) as spending
                FROM transactions 
                WHERE user_id = ${userId} AND type = 'expense'
                AND date >= CURRENT_DATE - INTERVAL '6 months'
                GROUP BY TO_CHAR(date, 'YYYY-MM'), quarter_category
            )
            SELECT 
                i.month,
                i.income,
                i.income * 0.25 as quarter_target,
                e.quarter_category,
                COALESCE(e.spending, 0) as actual_spending
            FROM monthly_income i
            LEFT JOIN monthly_expenses e ON i.month = e.month
            ORDER BY i.month DESC
        `;
        
        res.json({
            user_id: userId,
            quarter_progress: progressData,
            average_adherence: calculateAverageAdherence(progressData)
        });
        
    } catch (error) {
        console.error('Error fetching quarter progress:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

function generateQuarterRecommendations(allocation, totalIncome) {
    const recommendations = [];
    
    Object.entries(allocation).forEach(([quarter, data]) => {
        if (data.status === 'over_budget') {
            recommendations.push({
                type: 'warning',
                quarter,
                message: `${quarter} spending is ${((data.spent - data.allocated) / data.allocated * 100).toFixed(1)}% over budget`,
                action: `Consider reducing ${quarter} expenses by $${(data.spent - data.allocated).toFixed(2)}`
            });
        } else if (data.status === 'under_budget' && data.remaining > 50) {
            recommendations.push({
                type: 'opportunity',
                quarter,
                message: `You have $${data.remaining.toFixed(2)} remaining in ${quarter}`,
                action: quarter === 'savings' ? 'Consider investing this surplus' : 'This surplus can be reallocated'
            });
        }
    });
    
    if (totalIncome === 0) {
        recommendations.push({
            type: 'setup',
            message: 'No income recorded for this period',
            action: 'Add your income transactions to use the Quarter Formula'
        });
    }
    
    return recommendations;
}

function calculateAverageAdherence(progressData) {
    // Calculate average adherence score across all months
    const monthlyScores = [];
    const monthlyData = {};
    
    progressData.forEach(row => {
        if (!monthlyData[row.month]) {
            monthlyData[row.month] = { income: row.income, quarters: {} };
        }
        monthlyData[row.month].quarters[row.quarter_category] = {
            target: row.quarter_target,
            actual: row.actual_spending
        };
    });
    
    Object.values(monthlyData).forEach(monthData => {
        let monthScore = 0;
        let quarterCount = 0;
        
        Object.values(monthData.quarters).forEach(quarter => {
            if (quarter.actual <= quarter.target) {
                monthScore += 25;
            } else {
                monthScore += Math.max(0, 15 - ((quarter.actual - quarter.target) / quarter.target * 100));
            }
            quarterCount++;
        });
        
        if (quarterCount > 0) {
            monthlyScores.push(monthScore / quarterCount * 4); // Normalize to 100
        }
    });
    
    return monthlyScores.length > 0 
        ? Math.round(monthlyScores.reduce((a, b) => a + b, 0) / monthlyScores.length)
        : 0;
}
