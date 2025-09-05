import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import * as userController from '../controllers/userController';

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Toutes les routes nécessitent le rôle admin
router.use(requireAdmin);

// Routes pour la gestion des utilisateurs
router.get('/', userController.getUsers);
router.get('/permissions', userController.getAvailablePermissions);
router.get('/:id', userController.getUser);
router.post('/', userController.createUser);
router.put('/:id', userController.updateUser);
router.put('/:id/reset-password', userController.resetUserPassword);
router.delete('/:id', userController.deleteUser);

export default router;
