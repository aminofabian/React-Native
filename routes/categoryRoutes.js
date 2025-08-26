import express from 'express';
import { getCategories, addCategory } from '../controllers/categoryController.js';
import { validateUserId, validateCategory } from '../middleware/validation.js';

const router = express.Router();

// Get user's categories
router.get('/:userId', validateUserId, getCategories);

// Add new category
router.post('/', validateCategory, addCategory);

export default router;
