import { sql } from '../config/db.js';

/**
 * Advanced Analytics Controller
 * Provides AI-powered insights, spending pattern recognition, and predictive analytics
 */

export const getAdvancedAnalytics = async (req, res) => {
    const { userId } = req.params;
    const { period = '6months' } = req.query;
    
    try {
        const analytics = await Promise.all([
            getSpendingPatterns(userId, period),
            getPredictiveInsights(userId),
            getFinancialHealthScore(userId),
            getAnomalyDetection(userId),
            getCashFlowProjection(userId)
        ]);
        
        res.json({
            user_id: userId,
            generated_at: new Date().toISOString(),
            period,
            analytics: {
                spending_patterns: analytics[0],
                predictions: analytics[1],
                health_score: analytics[2],
                anomalies: analytics[3],
                cash_flow_projection: analytics[4]
            }
        });
        
    } catch (error) {
        console.error('Error generating analytics:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const getSpendingPatterns = async (userId, period = '6months') => {
    try {
        // Analyze spending patterns by day of week, time of month, and seasonality
        const patterns = await sql`
            WITH spending_analysis AS (
                SELECT 
                    EXTRACT(DOW FROM date) as day_of_week,
                    EXTRACT(DAY FROM date) as day_of_month,
                    EXTRACT(MONTH FROM date) as month,
                    category,
                    amount,
                    date
                FROM transactions 
                WHERE user_id = ${userId} 
                AND type = 'expense'
                AND date >= CURRENT_DATE - INTERVAL '${sql.unsafe(period === '1year' ? '1 year' : '6 months')}'
            )
            SELECT 
                day_of_week,
                AVG(amount) as avg_daily_spending,
                COUNT(*) as transaction_count,
                ARRAY_AGG(DISTINCT category) as common_categories
            FROM spending_analysis
            GROUP BY day_of_week
            ORDER BY day_of_week
        `;
        
        const monthlyTrends = await sql`
            SELECT 
                EXTRACT(MONTH FROM date) as month,
                category,
                SUM(amount) as total_spending,
                COUNT(*) as frequency
            FROM transactions 
            WHERE user_id = ${userId} 
            AND type = 'expense'
            AND date >= CURRENT_DATE - INTERVAL '${sql.unsafe(period === '1year' ? '1 year' : '6 months')}'
            GROUP BY EXTRACT(MONTH FROM date), category
            ORDER BY month, total_spending DESC
        `;
        
        return {
            weekly_patterns: patterns,
            monthly_trends: monthlyTrends,
            insights: generatePatternInsights(patterns, monthlyTrends)
        };
        
    } catch (error) {
        console.error('Error analyzing spending patterns:', error);
        return null;
    }
};

export const getPredictiveInsights = async (userId) => {
    try {
        // Predict next month's spending based on historical data
        const historicalData = await sql`
            SELECT 
                TO_CHAR(date, 'YYYY-MM') as month,
                category,
                SUM(amount) as monthly_spending
            FROM transactions 
            WHERE user_id = ${userId} 
            AND type = 'expense'
            AND date >= CURRENT_DATE - INTERVAL '12 months'
            GROUP BY TO_CHAR(date, 'YYYY-MM'), category
            ORDER BY month DESC
        `;
        
        const predictions = {};
        const categoryTrends = {};
        
        // Group by category and calculate trends
        historicalData.forEach(row => {
            if (!categoryTrends[row.category]) {
                categoryTrends[row.category] = [];
            }
            categoryTrends[row.category].push(parseFloat(row.monthly_spending));
        });
        
        // Simple linear regression for prediction
        Object.entries(categoryTrends).forEach(([category, amounts]) => {
            if (amounts.length >= 3) {
                const trend = calculateTrend(amounts);
                const avgSpending = amounts.reduce((a, b) => a + b, 0) / amounts.length;
                const nextMonthPrediction = Math.max(0, avgSpending + trend);
                
                predictions[category] = {
                    predicted_amount: Math.round(nextMonthPrediction * 100) / 100,
                    confidence: calculateConfidence(amounts),
                    trend: trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable'
                };
            }
        });
        
        return {
            next_month_predictions: predictions,
            total_predicted_spending: Object.values(predictions)
                .reduce((sum, pred) => sum + pred.predicted_amount, 0),
            recommendations: generatePredictionRecommendations(predictions)
        };
        
    } catch (error) {
        console.error('Error generating predictions:', error);
        return null;
    }
};

export const getFinancialHealthScore = async (userId) => {
    try {
        const metrics = await sql`
            WITH recent_data AS (
                SELECT 
                    SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
                    SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expenses,
                    COUNT(DISTINCT category) as category_diversity
                FROM transactions 
                WHERE user_id = ${userId} 
                AND date >= CURRENT_DATE - INTERVAL '3 months'
            ),
            savings_rate AS (
                SELECT 
                    CASE 
                        WHEN total_income > 0 THEN ((total_income - total_expenses) / total_income) * 100
                        ELSE 0
                    END as savings_percentage
                FROM recent_data
            ),
            budget_adherence AS (
                SELECT 
                    COUNT(*) as total_budgets,
                    COUNT(CASE WHEN status = 'under_budget' THEN 1 END) as successful_budgets
                FROM (
                    SELECT 
                        b.category,
                        CASE 
                            WHEN COALESCE(SUM(t.amount), 0) <= b.amount THEN 'under_budget'
                            ELSE 'over_budget'
                        END as status
                    FROM budgets b
                    LEFT JOIN transactions t ON b.user_id = t.user_id 
                        AND b.category = t.category 
                        AND t.type = 'expense'
                        AND TO_CHAR(t.date, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
                    WHERE b.user_id = ${userId}
                    GROUP BY b.category, b.amount
                ) budget_status
            )
            SELECT 
                rd.total_income,
                rd.total_expenses,
                rd.category_diversity,
                sr.savings_percentage,
                ba.total_budgets,
                ba.successful_budgets
            FROM recent_data rd
            CROSS JOIN savings_rate sr
            CROSS JOIN budget_adherence ba
        `;
        
        const data = metrics[0];
        
        // Calculate health score (0-100)
        let healthScore = 0;
        const factors = [];
        
        // Savings rate (30 points max)
        const savingsRate = parseFloat(data.savings_percentage) || 0;
        if (savingsRate >= 20) {
            healthScore += 30;
            factors.push({ factor: 'Excellent savings rate', impact: 30, status: 'positive' });
        } else if (savingsRate >= 10) {
            healthScore += 20;
            factors.push({ factor: 'Good savings rate', impact: 20, status: 'positive' });
        } else if (savingsRate >= 0) {
            healthScore += 10;
            factors.push({ factor: 'Basic savings rate', impact: 10, status: 'neutral' });
        } else {
            factors.push({ factor: 'Negative savings rate', impact: 0, status: 'negative' });
        }
        
        // Budget adherence (25 points max)
        const budgetAdherence = data.total_budgets > 0 
            ? (data.successful_budgets / data.total_budgets) * 100 
            : 0;
        const budgetPoints = Math.round((budgetAdherence / 100) * 25);
        healthScore += budgetPoints;
        factors.push({ 
            factor: 'Budget adherence', 
            impact: budgetPoints, 
            status: budgetAdherence >= 75 ? 'positive' : budgetAdherence >= 50 ? 'neutral' : 'negative' 
        });
        
        // Category diversity (20 points max)
        const diversity = Math.min(parseInt(data.category_diversity) || 0, 8);
        const diversityPoints = Math.round((diversity / 8) * 20);
        healthScore += diversityPoints;
        factors.push({ 
            factor: 'Expense categorization', 
            impact: diversityPoints, 
            status: diversity >= 5 ? 'positive' : 'neutral' 
        });
        
        // Income stability (25 points max) - simplified check
        const hasIncome = parseFloat(data.total_income) > 0;
        const incomePoints = hasIncome ? 25 : 0;
        healthScore += incomePoints;
        factors.push({ 
            factor: 'Income stability', 
            impact: incomePoints, 
            status: hasIncome ? 'positive' : 'negative' 
        });
        
        return {
            overall_score: Math.min(healthScore, 100),
            grade: getHealthGrade(healthScore),
            factors,
            recommendations: generateHealthRecommendations(healthScore, factors),
            metrics: {
                savings_rate: savingsRate,
                budget_adherence: budgetAdherence,
                category_diversity: diversity,
                monthly_income: parseFloat(data.total_income) || 0,
                monthly_expenses: parseFloat(data.total_expenses) || 0
            }
        };
        
    } catch (error) {
        console.error('Error calculating financial health score:', error);
        return null;
    }
};

export const getAnomalyDetection = async (userId) => {
    try {
        // Detect unusual spending patterns
        const anomalies = await sql`
            WITH category_stats AS (
                SELECT 
                    category,
                    AVG(amount) as avg_amount,
                    STDDEV(amount) as std_amount,
                    COUNT(*) as transaction_count
                FROM transactions 
                WHERE user_id = ${userId} 
                AND type = 'expense'
                AND date >= CURRENT_DATE - INTERVAL '6 months'
                GROUP BY category
                HAVING COUNT(*) >= 5
            ),
            recent_transactions AS (
                SELECT 
                    t.*,
                    cs.avg_amount,
                    cs.std_amount
                FROM transactions t
                JOIN category_stats cs ON t.category = cs.category
                WHERE t.user_id = ${userId} 
                AND t.type = 'expense'
                AND t.date >= CURRENT_DATE - INTERVAL '30 days'
            )
            SELECT 
                id,
                date,
                category,
                amount,
                description,
                avg_amount,
                ABS(amount - avg_amount) / NULLIF(std_amount, 0) as z_score
            FROM recent_transactions
            WHERE ABS(amount - avg_amount) / NULLIF(std_amount, 0) > 2
            ORDER BY z_score DESC
            LIMIT 10
        `;
        
        return {
            unusual_transactions: anomalies.map(anomaly => ({
                ...anomaly,
                severity: anomaly.z_score > 3 ? 'high' : anomaly.z_score > 2.5 ? 'medium' : 'low',
                deviation_percentage: ((anomaly.amount - anomaly.avg_amount) / anomaly.avg_amount * 100).toFixed(1)
            })),
            summary: {
                total_anomalies: anomalies.length,
                high_severity_count: anomalies.filter(a => a.z_score > 3).length
            }
        };
        
    } catch (error) {
        console.error('Error detecting anomalies:', error);
        return null;
    }
};

export const getCashFlowProjection = async (userId) => {
    try {
        // Project cash flow for next 3 months based on patterns
        const historicalData = await sql`
            SELECT 
                TO_CHAR(date, 'YYYY-MM') as month,
                SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as monthly_income,
                SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as monthly_expenses
            FROM transactions 
            WHERE user_id = ${userId} 
            AND date >= CURRENT_DATE - INTERVAL '6 months'
            GROUP BY TO_CHAR(date, 'YYYY-MM')
            ORDER BY month
        `;
        
        if (historicalData.length === 0) {
            return { projection: [], confidence: 'low', message: 'Insufficient data for projection' };
        }
        
        const avgIncome = historicalData.reduce((sum, row) => sum + parseFloat(row.monthly_income), 0) / historicalData.length;
        const avgExpenses = historicalData.reduce((sum, row) => sum + parseFloat(row.monthly_expenses), 0) / historicalData.length;
        
        const projection = [];
        let runningBalance = 0;
        
        for (let i = 1; i <= 3; i++) {
            const projectedDate = new Date();
            projectedDate.setMonth(projectedDate.getMonth() + i);
            const monthStr = projectedDate.toISOString().slice(0, 7);
            
            const projectedIncome = avgIncome * (1 + (Math.random() - 0.5) * 0.1); // ±5% variation
            const projectedExpenses = avgExpenses * (1 + (Math.random() - 0.5) * 0.1);
            
            runningBalance += projectedIncome - projectedExpenses;
            
            projection.push({
                month: monthStr,
                projected_income: Math.round(projectedIncome * 100) / 100,
                projected_expenses: Math.round(projectedExpenses * 100) / 100,
                net_flow: Math.round((projectedIncome - projectedExpenses) * 100) / 100,
                running_balance: Math.round(runningBalance * 100) / 100
            });
        }
        
        return {
            projection,
            confidence: historicalData.length >= 4 ? 'high' : 'medium',
            trends: {
                income_trend: calculateTrend(historicalData.map(row => parseFloat(row.monthly_income))),
                expense_trend: calculateTrend(historicalData.map(row => parseFloat(row.monthly_expenses)))
            }
        };
        
    } catch (error) {
        console.error('Error projecting cash flow:', error);
        return null;
    }
};

// Helper functions
function calculateTrend(values) {
    if (values.length < 2) return 0;
    const n = values.length;
    const sumX = (n * (n + 1)) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, y, x) => sum + (x + 1) * y, 0);
    const sumX2 = (n * (n + 1) * (2 * n + 1)) / 6;
    
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
}

function calculateConfidence(values) {
    if (values.length < 3) return 'low';
    const variance = values.reduce((sum, val, _, arr) => {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        return sum + Math.pow(val - mean, 2);
    }, 0) / values.length;
    
    const coefficientOfVariation = Math.sqrt(variance) / (values.reduce((a, b) => a + b, 0) / values.length);
    
    if (coefficientOfVariation < 0.3) return 'high';
    if (coefficientOfVariation < 0.6) return 'medium';
    return 'low';
}

function generatePatternInsights(patterns, trends) {
    const insights = [];
    
    // Find highest spending day
    const highestSpendingDay = patterns.reduce((max, day) => 
        day.avg_daily_spending > max.avg_daily_spending ? day : max
    );
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    insights.push({
        type: 'pattern',
        message: `You tend to spend most on ${dayNames[highestSpendingDay.day_of_week]}`,
        value: `$${highestSpendingDay.avg_daily_spending.toFixed(2)} average`
    });
    
    return insights;
}

function generatePredictionRecommendations(predictions) {
    const recommendations = [];
    
    Object.entries(predictions).forEach(([category, prediction]) => {
        if (prediction.trend === 'increasing' && prediction.predicted_amount > 200) {
            recommendations.push({
                type: 'warning',
                category,
                message: `${category} spending is predicted to increase`,
                action: `Consider setting a budget limit for ${category}`
            });
        }
    });
    
    return recommendations;
}

function generateHealthRecommendations(score, factors) {
    const recommendations = [];
    
    if (score < 50) {
        recommendations.push({
            priority: 'high',
            message: 'Focus on building emergency savings',
            action: 'Aim to save at least 10% of your income'
        });
    }
    
    const negativeFactor = factors.find(f => f.status === 'negative');
    if (negativeFactor) {
        recommendations.push({
            priority: 'medium',
            message: `Improve your ${negativeFactor.factor.toLowerCase()}`,
            action: 'This will significantly boost your financial health score'
        });
    }
    
    return recommendations;
}

function getHealthGrade(score) {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'F';
}
