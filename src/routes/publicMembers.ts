import express from 'express';
import {
    publicRegister,
    checkEmailExists,
    getPublicStats,
} from '../controllers/publicMemberController';

const router = express.Router();

// Routes publiques pour l'inscription en ligne
router.post('/register', publicRegister);
router.get('/check-email/:email', checkEmailExists);
router.get('/stats', getPublicStats);

export default router;
