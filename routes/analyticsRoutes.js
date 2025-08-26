import express from 'express';
import { getAdvancedAnalytics } from '../controllers/analyticsController.js';
import { validateUserId } from '../middleware/validation.js';

const router = express.Router();

// Get comprehensive analytics for a user
router.get('/:userId', validateUserId, getAdvancedAnalytics);

export default router;
