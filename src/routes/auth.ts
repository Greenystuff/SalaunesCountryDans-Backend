import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import * as authController from '../controllers/authController';

const router = express.Router();

// Routes d'authentification (publiques)
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/validate-password-change', authController.validatePasswordChange);

// Routes protégées (nécessitent une authentification)
router.use(authenticateToken);

// Routes de profil utilisateur
router.get('/profile', authController.getProfile);
router.put('/profile', authController.updateProfile);
router.post('/refresh-token', authController.refreshToken);
router.put('/change-password', authController.requestPasswordChange);
router.post('/avatar', authController.uploadAvatarMiddleware, authController.uploadAvatar);
router.delete('/avatar', authController.removeAvatar);

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
