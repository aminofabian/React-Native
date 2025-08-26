import express from 'express';
import { 
    exportTransactionsCSV, 
    exportUserDataBackup, 
    importTransactionsCSV, 
    restoreFromBackup, 
    generateFinancialReport 
} from '../controllers/exportController.js';
import { validateUserId } from '../middleware/validation.js';

const router = express.Router();

// Export transactions to CSV/JSON
router.get('/transactions/:userId', validateUserId, exportTransactionsCSV);

// Export complete user data backup
router.get('/backup/:userId', validateUserId, exportUserDataBackup);

// Import transactions from CSV
router.post('/import/transactions/:userId', validateUserId, importTransactionsCSV);

// Restore from backup
router.post('/restore/:userId', validateUserId, restoreFromBackup);

// Generate comprehensive financial report
router.get('/report/:userId', validateUserId, generateFinancialReport);

export default router;
