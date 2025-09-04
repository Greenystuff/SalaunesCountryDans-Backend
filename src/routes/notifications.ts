import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as notificationController from '../controllers/notificationController';

const router = Router();

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

/**
 * @route GET /admin/notifications
 * @description Récupérer les notifications de l'utilisateur
 * @query page - Numéro de page (défaut: 1)
 * @query limit - Nombre d'éléments par page (défaut: 20, max: 100)
 * @query unreadOnly - Afficher seulement les non lues (true/false)
 * @query category - Filtrer par catégorie (system, security, update, reminder, message)
 * @query type - Filtrer par type (success, error, warning, info)
 */
router.get('/', notificationController.getUserNotifications);

/**
 * @route GET /admin/notifications/unread-count
 * @description Récupérer le nombre de notifications non lues
 */
router.get('/unread-count', notificationController.getUnreadCount);

/**
 * @route PUT /admin/notifications/:notificationId/read
 * @description Marquer une notification comme lue
 * @param notificationId - ID de la notification
 */
router.put('/:notificationId/read', notificationController.markNotificationAsRead);

/**
 * @route PUT /admin/notifications/mark-all-read
 * @description Marquer toutes les notifications comme lues
 */
router.put('/mark-all-read', notificationController.markAllAsRead);

/**
 * @route DELETE /admin/notifications/:notificationId
 * @description Supprimer une notification
 * @param notificationId - ID de la notification
 */
router.delete('/:notificationId', notificationController.deleteNotification);

/**
 * @route DELETE /admin/notifications/read
 * @description Supprimer toutes les notifications lues
 */
router.delete('/read', notificationController.deleteAllRead);

/**
 * @route POST /admin/notifications/test
 * @description Créer une notification de test (admins seulement)
 * @body title - Titre de la notification
 * @body message - Message de la notification
 * @body type - Type (success, error, warning, info)
 * @body category - Catégorie (system, security, update, reminder, message)
 * @body isPersistent - Si la notification est persistante
 */
router.post('/test', notificationController.createTestNotification);

export default router;
