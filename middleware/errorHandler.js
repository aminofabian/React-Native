// Global error handling middleware

export const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);
    
    // Default error
    let statusCode = 500;
    let message = 'Internal Server Error';
    
    // Handle specific error types
    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = err.message;
    } else if (err.name === 'UnauthorizedError') {
        statusCode = 401;
        message = 'Unauthorized';
    } else if (err.name === 'NotFoundError') {
        statusCode = 404;
        message = 'Resource not found';
    } else if (err.code === '23505') { // PostgreSQL unique constraint violation
        statusCode = 409;
        message = 'Resource already exists';
    } else if (err.code === '23503') { // PostgreSQL foreign key constraint violation
        statusCode = 400;
        message = 'Invalid reference';
    }
    
    res.status(statusCode).json({
        error: message,
        status: statusCode,
        timestamp: new Date().toISOString()
    });
};

export const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
