import express from 'express';
import { 
    createGoal, 
    getUserGoals, 
    addGoalContribution, 
    getGoalProgress, 
    updateGoal, 
    deleteGoal, 
    getGoalSuggestions 
} from '../controllers/goalController.js';
import { validateUserId } from '../middleware/validation.js';

const router = express.Router();

// Create a new financial goal
router.post('/', createGoal);

// Get all goals for a user
router.get('/:userId', validateUserId, getUserGoals);

// Get goal suggestions based on user's financial patterns
router.get('/:userId/suggestions', validateUserId, getGoalSuggestions);

// Get detailed progress for a specific goal
router.get('/progress/:goalId', getGoalProgress);

// Add contribution to a goal
router.post('/:goalId/contribute', addGoalContribution);

// Update a goal
router.put('/:goalId', updateGoal);

// Delete a goal
router.delete('/:goalId', deleteGoal);

export default router;
