// Enhanced validation middleware for API endpoints with comprehensive input sanitization

// Input sanitization helpers
const sanitizeString = (str, maxLength = 255) => {
    if (!str) return null;
    return str.toString().trim().slice(0, maxLength);
};

const sanitizeNumber = (num, min = 0, max = 999999999) => {
    const parsed = parseFloat(num);
    if (isNaN(parsed)) return null;
    return Math.max(min, Math.min(max, parsed));
};

const sanitizeDate = (date) => {
    if (!date) return null;
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) return null;
    return parsed.toISOString().split('T')[0];
};

const sanitizeUserId = (userId) => {
    if (!userId) return null;
    const sanitized = sanitizeString(userId, 100);
    // Basic pattern validation for user IDs
    if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) return null;
    return sanitized;
};

// Enhanced user ID validation
export const validateUserId = (req, res, next) => {
    const userId = req.params.userId || req.body.user_id;
    
    if (!userId || userId.trim() === '') {
        return res.status(400).json({ 
            error: 'Valid user ID is required',
            details: 'User ID cannot be empty'
        });
    }
    
    const sanitizedUserId = sanitizeUserId(userId);
    if (!sanitizedUserId) {
        return res.status(400).json({ 
            error: 'Invalid user ID format',
            details: 'User ID must contain only alphanumeric characters, underscores, and hyphens'
        });
    }
    
    // Update the request with sanitized value
    if (req.params.userId) req.params.userId = sanitizedUserId;
    if (req.body.user_id) req.body.user_id = sanitizedUserId;
    
    next();
};

// Enhanced transaction validation
export const validateTransaction = (req, res, next) => {
    const errors = [];
    
    // Validate and sanitize user_id
    const user_id = sanitizeUserId(req.body.user_id);
    if (!user_id) {
        errors.push('Valid user_id is required');
    }
    
    // Validate and sanitize amount
    const amount = sanitizeNumber(req.body.amount, 0.01, 999999999.99);
    if (!amount) {
        errors.push('Amount must be a positive number between 0.01 and 999,999,999.99');
    }
    
    // Validate type
    const type = sanitizeString(req.body.type, 10);
    if (!['income', 'expense'].includes(type)) {
        errors.push('Type must be either "income" or "expense"');
    }
    
    // Validate and sanitize category
    const category = sanitizeString(req.body.category, 100);
    if (!category || category.length < 1) {
        errors.push('Category is required and must be at least 1 character');
    }
    
    // Validate and sanitize description (optional)
    const description = sanitizeString(req.body.description, 500);
    
    // Validate and sanitize date (optional)
    let date = null;
    if (req.body.date) {
        date = sanitizeDate(req.body.date);
        if (!date) {
            errors.push('Date must be in valid YYYY-MM-DD format');
        }
    }
    
    if (errors.length > 0) {
        return res.status(400).json({ 
            error: 'Validation failed',
            details: errors
        });
    }
    
    // Update request body with sanitized values
    req.body = {
        user_id,
        amount,
        type,
        category,
        description,
        date
    };
    
    next();
};

// Enhanced category validation
export const validateCategory = (req, res, next) => {
    const errors = [];
    
    // Validate and sanitize user_id
    const user_id = sanitizeUserId(req.body.user_id);
    if (!user_id) {
        errors.push('Valid user_id is required');
    }
    
    // Validate and sanitize name
    const name = sanitizeString(req.body.name, 100);
    if (!name || name.length < 1) {
        errors.push('Category name is required and must be at least 1 character');
    }
    
    // Validate type
    const type = sanitizeString(req.body.type, 10);
    if (!['income', 'expense'].includes(type)) {
        errors.push('Type must be either "income" or "expense"');
    }
    
    // Validate and sanitize color (optional)
    let color = sanitizeString(req.body.color, 7);
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
        errors.push('Color must be a valid hex color code (e.g., #FF5733)');
    }
    if (!color) color = '#3B82F6'; // Default color
    
    // Validate and sanitize icon (optional)
    const icon = sanitizeString(req.body.icon, 50);
    
    if (errors.length > 0) {
        return res.status(400).json({ 
            error: 'Validation failed',
            details: errors
        });
    }
    
    // Update request body with sanitized values
    req.body = {
        user_id,
        name,
        type,
        color,
        icon
    };
    
    next();
};

// Enhanced budget validation
export const validateBudget = (req, res, next) => {
    const errors = [];
    
    // Validate and sanitize user_id
    const user_id = sanitizeUserId(req.body.user_id);
    if (!user_id) {
        errors.push('Valid user_id is required');
    }
    
    // Validate and sanitize category
    const category = sanitizeString(req.body.category, 100);
    if (!category || category.length < 1) {
        errors.push('Category is required');
    }
    
    // Validate and sanitize amount
    const amount = sanitizeNumber(req.body.amount, 0.01, 999999999.99);
    if (!amount) {
        errors.push('Budget amount must be a positive number between 0.01 and 999,999,999.99');
    }
    
    // Validate and sanitize month_year
    const month_year = sanitizeString(req.body.month_year, 7);
    if (!month_year || !/^\d{4}-\d{2}$/.test(month_year)) {
        errors.push('month_year must be in YYYY-MM format (e.g., 2024-01)');
    }
    
    if (errors.length > 0) {
        return res.status(400).json({ 
            error: 'Validation failed',
            details: errors
        });
    }
    
    // Update request body with sanitized values
    req.body = {
        user_id,
        category,
        amount,
        month_year
    };
    
    next();
};

// Enhanced transaction ID validation
export const validateTransactionId = (req, res, next) => {
    const { transactionId } = req.params;
    
    if (!transactionId) {
        return res.status(400).json({ 
            error: 'Transaction ID is required',
            details: 'Transaction ID parameter cannot be empty'
        });
    }
    
    const sanitizedId = sanitizeNumber(transactionId, 1);
    if (!sanitizedId || !Number.isInteger(sanitizedId)) {
        return res.status(400).json({ 
            error: 'Invalid transaction ID',
            details: 'Transaction ID must be a positive integer'
        });
    }
    
    req.params.transactionId = sanitizedId;
    next();
};

// Goal validation
export const validateGoal = (req, res, next) => {
    const errors = [];
    
    // Validate and sanitize user_id
    const user_id = sanitizeUserId(req.body.user_id);
    if (!user_id) {
        errors.push('Valid user_id is required');
    }
    
    // Validate and sanitize title
    const title = sanitizeString(req.body.title, 200);
    if (!title || title.length < 1) {
        errors.push('Goal title is required');
    }
    
    // Validate goal_type
    const validGoalTypes = ['savings', 'debt_payoff', 'emergency_fund', 'investment', 'purchase', 'custom'];
    const goal_type = sanitizeString(req.body.goal_type, 50);
    if (!validGoalTypes.includes(goal_type)) {
        errors.push(`Goal type must be one of: ${validGoalTypes.join(', ')}`);
    }
    
    // Validate and sanitize target_amount
    const target_amount = sanitizeNumber(req.body.target_amount, 0.01, 999999999.99);
    if (!target_amount) {
        errors.push('Target amount must be a positive number');
    }
    
    // Validate and sanitize target_date (optional)
    let target_date = null;
    if (req.body.target_date) {
        target_date = sanitizeDate(req.body.target_date);
        if (!target_date) {
            errors.push('Target date must be in valid YYYY-MM-DD format');
        } else if (new Date(target_date) <= new Date()) {
            errors.push('Target date must be in the future');
        }
    }
    
    // Validate priority (optional)
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    let priority = sanitizeString(req.body.priority, 20) || 'medium';
    if (!validPriorities.includes(priority)) {
        priority = 'medium';
    }
    
    if (errors.length > 0) {
        return res.status(400).json({ 
            error: 'Validation failed',
            details: errors
        });
    }
    
    // Update request body with sanitized values
    req.body = {
        ...req.body,
        user_id,
        title,
        goal_type,
        target_amount,
        target_date,
        priority
    };
    
    next();
};

// Recurring transaction validation
export const validateRecurringTransaction = (req, res, next) => {
    const errors = [];
    
    // Validate and sanitize user_id
    const user_id = sanitizeUserId(req.body.user_id);
    if (!user_id) {
        errors.push('Valid user_id is required');
    }
    
    // Validate and sanitize template_name
    const template_name = sanitizeString(req.body.template_name, 200);
    if (!template_name || template_name.length < 1) {
        errors.push('Template name is required');
    }
    
    // Validate and sanitize amount
    const amount = sanitizeNumber(req.body.amount, 0.01, 999999999.99);
    if (!amount) {
        errors.push('Amount must be a positive number');
    }
    
    // Validate type
    const type = sanitizeString(req.body.type, 10);
    if (!['income', 'expense'].includes(type)) {
        errors.push('Type must be either "income" or "expense"');
    }
    
    // Validate frequency
    const validFrequencies = ['daily', 'weekly', 'bi_weekly', 'monthly', 'quarterly', 'annually'];
    const frequency = sanitizeString(req.body.frequency, 20);
    if (!validFrequencies.includes(frequency)) {
        errors.push(`Frequency must be one of: ${validFrequencies.join(', ')}`);
    }
    
    // Validate start_date
    const start_date = sanitizeDate(req.body.start_date);
    if (!start_date) {
        errors.push('Start date is required and must be in YYYY-MM-DD format');
    }
    
    // Validate end_date (optional)
    let end_date = null;
    if (req.body.end_date) {
        end_date = sanitizeDate(req.body.end_date);
        if (!end_date) {
            errors.push('End date must be in valid YYYY-MM-DD format');
        } else if (start_date && new Date(end_date) <= new Date(start_date)) {
            errors.push('End date must be after start date');
        }
    }
    
    if (errors.length > 0) {
        return res.status(400).json({ 
            error: 'Validation failed',
            details: errors
        });
    }
    
    // Update request body with sanitized values
    req.body = {
        ...req.body,
        user_id,
        template_name,
        amount,
        type,
        frequency,
        start_date,
        end_date
    };
    
    next();
};

// Query parameter validation
export const validateQueryParams = (req, res, next) => {
    // Sanitize common query parameters
    if (req.query.limit) {
        const limit = sanitizeNumber(req.query.limit, 1, 1000);
        req.query.limit = limit || 50;
    }
    
    if (req.query.offset) {
        const offset = sanitizeNumber(req.query.offset, 0);
        req.query.offset = offset || 0;
    }
    
    if (req.query.startDate) {
        const startDate = sanitizeDate(req.query.startDate);
        if (!startDate) {
            return res.status(400).json({ 
                error: 'Invalid startDate format',
                details: 'Date must be in YYYY-MM-DD format'
            });
        }
        req.query.startDate = startDate;
    }
    
    if (req.query.endDate) {
        const endDate = sanitizeDate(req.query.endDate);
        if (!endDate) {
            return res.status(400).json({ 
                error: 'Invalid endDate format',
                details: 'Date must be in YYYY-MM-DD format'
            });
        }
        req.query.endDate = endDate;
    }
    
    next();
};
