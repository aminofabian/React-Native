import express from 'express';
import { 
    createRecurringTransaction, 
    getUserRecurringTransactions, 
    executeRecurringTransactions, 
    updateRecurringTransaction, 
    deleteRecurringTransaction, 
    getRecurringInsights 
} from '../controllers/recurringController.js';
import { validateUserId } from '../middleware/validation.js';

const router = express.Router();

// Create a new recurring transaction
router.post('/', createRecurringTransaction);

// Get all recurring transactions for a user
router.get('/:userId', validateUserId, getUserRecurringTransactions);

// Execute due recurring transactions
router.post('/:userId/execute', validateUserId, executeRecurringTransactions);

// Get recurring transaction insights
router.get('/:userId/insights', validateUserId, getRecurringInsights);

// Update a recurring transaction
router.put('/:recurringId', updateRecurringTransaction);

// Delete a recurring transaction
router.delete('/:recurringId', deleteRecurringTransaction);

export default router;
