import express from 'express';
import { 
    getActiveNotifications, 
    markNotificationAsRead, 
    getNotificationSettings, 
    updateNotificationSettings 
} from '../controllers/notificationController.js';
import { validateUserId } from '../middleware/validation.js';

const router = express.Router();

// Get active notifications for a user
router.get('/:userId', validateUserId, getActiveNotifications);

// Mark notification as read
router.patch('/:notificationId/read', markNotificationAsRead);

// Get user notification settings
router.get('/:userId/settings', validateUserId, getNotificationSettings);

// Update user notification settings
router.put('/:userId/settings', validateUserId, updateNotificationSettings);

export default router;
