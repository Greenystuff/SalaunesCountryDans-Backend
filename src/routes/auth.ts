import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import * as authController from '../controllers/authController';

const router = express.Router();

// Routes d'authentification (publiques)
router.post('/login', authController.login);
router.post('/logout', authController.logout);

// Routes protégées (nécessitent une authentification)
router.use(authenticateToken);

// Routes de profil utilisateur
router.get('/profile', authController.getProfile);
router.post('/refresh-token', authController.refreshToken);
router.post('/change-password', authController.changePassword);

// Routes admin (nécessitent le rôle admin)
router.use(requireAdmin);

// Route de test admin
router.get('/dashboard', (req, res) => {
    res.json({
        success: true,
        message: 'Accès au dashboard admin autorisé',
        user: req.user,
    });
});

export default router;
