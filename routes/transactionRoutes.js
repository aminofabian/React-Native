import express from 'express';
import { 
    addTransaction, 
    getTransactions, 
    getTransactionSummary, 
    deleteTransaction, 
    updateTransaction,
    getRawTransactions 
} from '../controllers/transactionController.js';
import { 
    validateUserId, 
    validateTransaction, 
    validateTransactionId 
} from '../middleware/validation.js';

const router = express.Router();

// Add transaction
router.post('/', validateTransaction, addTransaction);

// Get transactions with filtering
router.get('/:userId', validateUserId, getTransactions);

// Get comprehensive summary
router.get('/summary/:userId', validateUserId, getTransactionSummary);

// Delete transaction
router.delete('/:transactionId', validateTransactionId, deleteTransaction);

// Update transaction
router.put('/:transactionId', validateTransactionId, updateTransaction);

// Debug endpoint - Show raw transaction data
router.get('/debug/raw/:userId', validateUserId, getRawTransactions);

export default router;
