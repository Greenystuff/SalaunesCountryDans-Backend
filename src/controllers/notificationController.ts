import { Request, Response } from 'express';
import notificationService from '../services/notificationService';
import { IUser } from '../models/User';

// Interface pour étendre Request avec user
interface AuthenticatedRequest extends Request {
    user?: IUser;
}

/**
 * Récupérer les notifications de l'utilisateur connecté
 */
export const getUserNotifications = async (
    req: AuthenticatedRequest,
    res: Response
): Promise<void> => {
    try {
        if (!req.user?._id) {
            res.status(401).json({
                success: false,
                message: 'Utilisateur non authentifié',
            });
            return;
        }

        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const unreadOnly = req.query.unreadOnly === 'true';
        const category = req.query.category as string;
        const type = req.query.type as string;

        const result = await notificationService.getUserNotifications(req.user._id.toString(), {
            page,
            limit,
            unreadOnly,
            category,
            type,
        });

        res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error: any) {
        console.error('❌ Erreur lors de la récupération des notifications:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Erreur lors de la récupération des notifications',
        });
    }
};

/**
 * Récupérer le nombre de notifications non lues
 */
export const getUnreadCount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        if (!req.user?._id) {
            res.status(401).json({
                success: false,
                message: 'Utilisateur non authentifié',
            });
            return;
        }

        const unreadCount = await notificationService.getUnreadCount(req.user._id.toString());

        res.status(200).json({
            success: true,
            data: { unreadCount },
        });
    } catch (error: any) {
        console.error('❌ Erreur lors du comptage des notifications non lues:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Erreur lors du comptage des notifications',
        });
    }
};

/**
 * Marquer une notification comme lue
 */
export const markNotificationAsRead = async (
    req: AuthenticatedRequest,
    res: Response
): Promise<void> => {
    try {
        if (!req.user?._id) {
            res.status(401).json({
                success: false,
                message: 'Utilisateur non authentifié',
            });
            return;
        }

        const { notificationId } = req.params;

        if (!notificationId) {
            res.status(400).json({
                success: false,
                message: 'ID de notification requis',
            });
            return;
        }

        const notification = await notificationService.markAsRead(
            notificationId,
            req.user._id.toString()
        );

        if (!notification) {
            res.status(404).json({
                success: false,
                message: 'Notification non trouvée',
            });
            return;
        }

        res.status(200).json({
            success: true,
            data: { notification },
            message: 'Notification marquée comme lue',
        });
    } catch (error: any) {
        console.error('❌ Erreur lors du marquage de la notification:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Erreur lors du marquage de la notification',
        });
    }
};

/**
 * Marquer toutes les notifications comme lues
 */
export const markAllAsRead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        if (!req.user?._id) {
            res.status(401).json({
                success: false,
                message: 'Utilisateur non authentifié',
            });
            return;
        }

        const modifiedCount = await notificationService.markAllAsRead(req.user._id.toString());

        res.status(200).json({
            success: true,
            data: { modifiedCount },
            message: `${modifiedCount} notification(s) marquée(s) comme lues`,
        });
    } catch (error: any) {
        console.error('❌ Erreur lors du marquage global:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Erreur lors du marquage des notifications',
        });
    }
};

/**
 * Supprimer une notification
 */
export const deleteNotification = async (
    req: AuthenticatedRequest,
    res: Response
): Promise<void> => {
    try {
        if (!req.user?._id) {
            res.status(401).json({
                success: false,
                message: 'Utilisateur non authentifié',
            });
            return;
        }

        const { notificationId } = req.params;

        if (!notificationId) {
            res.status(400).json({
                success: false,
                message: 'ID de notification requis',
            });
            return;
        }

        const deleted = await notificationService.deleteNotification(
            notificationId,
            req.user._id.toString()
        );

        if (!deleted) {
            res.status(404).json({
                success: false,
                message: 'Notification non trouvée',
            });
            return;
        }

        res.status(200).json({
            success: true,
            message: 'Notification supprimée avec succès',
        });
    } catch (error: any) {
        console.error('❌ Erreur lors de la suppression de la notification:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Erreur lors de la suppression de la notification',
        });
    }
};

/**
 * Supprimer toutes les notifications lues
 */
export const deleteAllRead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        if (!req.user?._id) {
            res.status(401).json({
                success: false,
                message: 'Utilisateur non authentifié',
            });
            return;
        }

        const deletedCount = await notificationService.deleteAllRead(req.user._id.toString());

        res.status(200).json({
            success: true,
            data: { deletedCount },
            message: `${deletedCount} notification(s) lue(s) supprimée(s)`,
        });
    } catch (error: any) {
        console.error('❌ Erreur lors de la suppression des notifications lues:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Erreur lors de la suppression des notifications lues',
        });
    }
};

/**
 * Créer une notification de test (uniquement pour les admins)
 */
export const createTestNotification = async (
    req: AuthenticatedRequest,
    res: Response
): Promise<void> => {
    try {
        if (!req.user?._id) {
            res.status(401).json({
                success: false,
                message: 'Utilisateur non authentifié',
            });
            return;
        }

        if (req.user.role !== 'admin') {
            res.status(403).json({
                success: false,
                message: 'Accès réservé aux administrateurs',
            });
            return;
        }

        const { title, message, type, category, isPersistent } = req.body;

        if (!title || !message) {
            res.status(400).json({
                success: false,
                message: 'Titre et message requis',
            });
            return;
        }

        const notification = await notificationService.createNotification({
            userId: req.user._id.toString(),
            title,
            message,
            type: type || 'info',
            category: category || 'system',
            isPersistent: isPersistent || false,
        });

        res.status(201).json({
            success: true,
            data: { notification },
            message: 'Notification de test créée avec succès',
        });
    } catch (error: any) {
        console.error('❌ Erreur lors de la création de la notification de test:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Erreur lors de la création de la notification de test',
        });
    }
};
