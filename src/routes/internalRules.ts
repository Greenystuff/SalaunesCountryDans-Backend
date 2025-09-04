import express from 'express';
import {
    uploadInternalRules,
    getActiveInternalRules,
    getAllInternalRulesVersions,
    getInternalRulesById,
    setActiveInternalRules,
    updateInternalRules,
    deleteInternalRules,
    downloadInternalRules,
    getInternalRulesStats,
    uploadMiddleware,
} from '../controllers/internalRulesController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Routes publiques
router.get('/active', getActiveInternalRules);
router.get('/stats', getInternalRulesStats);

// Routes protégées (nécessitent une authentification)
router.use(authenticateToken);

// Routes CRUD principales
router.get('/', getAllInternalRulesVersions);
router.get('/:id', getInternalRulesById);
router.post('/upload', uploadMiddleware, uploadInternalRules);
router.put('/:id', updateInternalRules);
router.delete('/:id', deleteInternalRules);

// Routes d'actions spécifiques
router.post('/:id/set-active', setActiveInternalRules);
router.get('/:id/download', downloadInternalRules);

export default router;
