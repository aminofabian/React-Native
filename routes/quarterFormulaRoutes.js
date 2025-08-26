import express from 'express';
import { 
    calculateQuarterAllocation, 
    setQuarterBudgets, 
    getQuarterProgress 
} from '../controllers/quarterFormulaController.js';
import { validateUserId } from '../middleware/validation.js';

const router = express.Router();

// Calculate quarter formula allocation for a user
router.get('/allocation/:userId', validateUserId, calculateQuarterAllocation);

// Set quarter-based budgets
router.post('/budgets', setQuarterBudgets);

// Get quarter adherence progress over time
router.get('/progress/:userId', validateUserId, getQuarterProgress);

export default router;
