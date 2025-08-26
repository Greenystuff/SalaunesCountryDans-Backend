import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import * as authController from '../controllers/authController';

const router = Router();

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

// TODO: Ajouter ici les routes de gestion des données
// Exemples:
// router.get('/users', userController.getAllUsers);
// router.post('/users', userController.createUser);
// router.put('/users/:id', userController.updateUser);
// router.delete('/users/:id', userController.deleteUser);

// Route de test admin
router.get('/dashboard', (req, res) => {
    res.json({
        success: true,
        message: 'Accès au dashboard admin autorisé',
        user: req.user,
    });
});

export default router;
