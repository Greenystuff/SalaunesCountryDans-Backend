import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { getDashboardStats } from '../controllers/dashboardController';

const router = express.Router();

// Route protégée pour les statistiques du dashboard
router.use(authenticateToken);
router.get('/stats', getDashboardStats);

export default router;
