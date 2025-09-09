import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import * as authController from '../controllers/authController';

const router = express.Router();

// Rate limiting spécifique pour l'authentification (plus restrictif)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limite à 10 tentatives de connexion par IP par fenêtre
    message: {
        error: 'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Ne pas ignorer les requêtes échouées pour l'auth (sécurité)
    skipFailedRequests: false,
});

// Routes d'authentification (publiques)
router.post('/login', authLimiter, authController.login);
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
