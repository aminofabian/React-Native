import express from 'express';
import { setBudget, getBudgetAnalysis } from '../controllers/budgetController.js';
import { validateUserId, validateBudget } from '../middleware/validation.js';

const router = express.Router();

// Set monthly budget for categories
router.post('/', validateBudget, setBudget);

// Get budget vs actual spending
router.get('/:userId', validateUserId, getBudgetAnalysis);

export default router;
