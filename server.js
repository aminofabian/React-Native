import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { initDB } from './config/database.js';
import routes from './routes/index.js';
import exportRoutes from './routes/exportRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            connectSrc: ["'self'"]
        }
    }
}));

// Performance middleware
app.use(compression());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api', limiter);

// CORS configuration
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API documentation endpoint
app.get('/api', (req, res) => {
    res.json({
        name: 'Expense Tracker API',
        version: '2.0.0',
        description: 'Advanced expense tracking with Quarter Formula, AI analytics, and comprehensive financial management',
        features: [
            'Transaction Management',
            'Category & Budget Tracking',
            'Quarter Formula Implementation',
            'Advanced Analytics & AI Insights',
            'Smart Notifications',
            'Goal Tracking with Milestones',
            'Recurring Transactions',
            'Data Export/Import',
            'Financial Reports'
        ],
        endpoints: {
            transactions: '/api/transactions',
            categories: '/api/categories',
            budgets: '/api/budgets',
            quarter_formula: '/api/quarter-formula',
            analytics: '/api/analytics',
            notifications: '/api/notifications',
            goals: '/api/goals',
            recurring: '/api/recurring',
            export: '/api/export'
        },
        documentation: 'See README.md for detailed API documentation'
    });
});

// Main API routes
app.use('/api', routes);
app.use('/api/export', exportRoutes);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        message: `The requested endpoint ${req.originalUrl} was not found on this server.`,
        available_endpoints: ['/api', '/health']
    });
});

// Error handling middleware (must be last)
app.use(errorHandler);

const port = process.env.PORT || 5002;

// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    process.exit(0);
});

// Initialize database and start server
async function startServer() {
    try {
        console.log('🚀 Starting Expense Tracker Backend v2.0.0...');
        
        await initDB();
        console.log('✅ Database setup complete');
        
        app.listen(port, () => {
            console.log(`🌟 Server is running on port ${port}`);
            console.log(`📊 Health check: http://localhost:${port}/health`);
            console.log(`📖 API docs: http://localhost:${port}/api`);
            console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
            
            // Log available features
            console.log('\n🎯 Available Features:');
            console.log('  • Transaction Management with Smart Categorization');
            console.log('  • Quarter Formula (25% allocation system)');
            console.log('  • AI-Powered Analytics & Insights');
            console.log('  • Smart Budget Alerts & Notifications');
            console.log('  • Goal Tracking with Milestone Rewards');
            console.log('  • Automated Recurring Transactions');
            console.log('  • Data Export/Import (CSV, JSON, Backup)');
            console.log('  • Comprehensive Financial Reports\n');
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();