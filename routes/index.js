import express from 'express';
import categoryRoutes from './categoryRoutes.js';
import transactionRoutes from './transactionRoutes.js';
import budgetRoutes from './budgetRoutes.js';
import quarterFormulaRoutes from './quarterFormulaRoutes.js';
import analyticsRoutes from './analyticsRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import goalRoutes from './goalRoutes.js';
import recurringRoutes from './recurringRoutes.js';

const router = express.Router();

// Mount route modules
router.use('/categories', categoryRoutes);
router.use('/transactions', transactionRoutes);
router.use('/budgets', budgetRoutes);
router.use('/quarter-formula', quarterFormulaRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/notifications', notificationRoutes);
router.use('/goals', goalRoutes);
router.use('/recurring', recurringRoutes);

export default router;
