import express from 'express';
import {
    getAllDances, getDanceById, createDance, updateDance, deleteDance, getDanceStats, downloadPdf, uploadPdf, uploadMiddleware
} from '../controllers/danceController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Routes publiques
router.get('/', getAllDances);
router.get('/stats', getDanceStats);
router.get('/:id', getDanceById);
router.get('/:id/download-pdf', downloadPdf);

// Routes protégées (nécessitent une authentification)
router.post('/', authenticateToken, createDance);
router.post('/upload-pdf', authenticateToken, uploadMiddleware, uploadPdf);
router.put('/:id', authenticateToken, updateDance);
router.delete('/:id', authenticateToken, deleteDance);

export default router;
