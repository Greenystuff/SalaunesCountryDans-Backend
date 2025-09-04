import mongoose from 'mongoose';
import { Notification, INotification } from '../models/Notification';
import websocketService from './websocketService';

// Interface pour créer une notification
export interface CreateNotificationData {
    userId: string | mongoose.Types.ObjectId;
    title: string;
    message: string;
    type?: 'success' | 'error' | 'warning' | 'info';
    category?: 'system' | 'security' | 'update' | 'reminder' | 'message';
    isPersistent?: boolean;
    metadata?: { [key: string]: any };
    actionUrl?: string;
    actionText?: string;
    expiresAt?: Date;
    sendRealTime?: boolean; // Si on envoie la notification en temps réel via websocket
}

// Interface pour les options de requête
export interface NotificationQueryOptions {
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
    category?: string;
    type?: string;
}

class NotificationService {
    /**
     * Créer une nouvelle notification
     */
    async createNotification(data: CreateNotificationData): Promise<INotification> {
        try {
            const userId =
                typeof data.userId === 'string'
                    ? new mongoose.Types.ObjectId(data.userId)
                    : data.userId;

            const notificationData = {
                userId,
                title: data.title,
                message: data.message,
                type: data.type || 'info',
                category: data.category || 'system',
                isPersistent: data.isPersistent || false,
                metadata: data.metadata || {},
                actionUrl: data.actionUrl,
                actionText: data.actionText,
                expiresAt: data.expiresAt,
            };

            const notification = new Notification(notificationData);
            await notification.save();

            console.log(`✅ Notification créée pour l'utilisateur ${userId}:`, {
                title: data.title,
                type: data.type,
                category: data.category,
            });

            // Envoyer en temps réel si demandé (par défaut true)
            if (data.sendRealTime !== false) {
                await this.sendRealTimeNotification(userId.toString(), notification);
            }

            return notification;
        } catch (error) {
            console.error('❌ Erreur lors de la création de la notification:', error);
            throw new Error('Impossible de créer la notification');
        }
    }

    /**
     * Créer plusieurs notifications en lot
     */
    async createBulkNotifications(
        notifications: CreateNotificationData[]
    ): Promise<INotification[]> {
        try {
            const createdNotifications: INotification[] = [];

            for (const notifData of notifications) {
                const notification = await this.createNotification(notifData);
                createdNotifications.push(notification);
            }

            return createdNotifications;
        } catch (error) {
            console.error('❌ Erreur lors de la création en lot des notifications:', error);
            throw new Error('Impossible de créer les notifications en lot');
        }
    }

    /**
     * Envoyer une notification en temps réel via websocket
     */
    private async sendRealTimeNotification(
        userId: string,
        notification: INotification
    ): Promise<void> {
        try {
            const notificationData = {
                id: notification._id,
                title: notification.title,
                message: notification.message,
                type: notification.type,
                category: notification.category,
                isPersistent: notification.isPersistent,
                metadata: notification.metadata,
                actionUrl: notification.actionUrl,
                actionText: notification.actionText,
                createdAt: notification.createdAt,
                isRead: notification.isRead,
            };

            // Envoyer via websocket si l'utilisateur est connecté
            websocketService.notifyUser(userId, notification.type, notification.message, {
                ...notificationData,
                isRealTimeNotification: true,
            });

            console.log(`📡 Notification temps réel envoyée à l'utilisateur ${userId}`);
        } catch (error) {
            console.error("❌ Erreur lors de l'envoi temps réel:", error);
        }
    }

    /**
     * Récupérer les notifications d'un utilisateur
     */
    async getUserNotifications(
        userId: string | mongoose.Types.ObjectId,
        options: NotificationQueryOptions = {}
    ): Promise<{
        notifications: INotification[];
        total: number;
        unreadCount: number;
        hasMore: boolean;
    }> {
        try {
            const userObjectId =
                typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

            const { page = 1, limit = 20, unreadOnly = false, category, type } = options;

            // Construire la requête
            const query: any = {
                userId: userObjectId,
                $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
            };

            if (unreadOnly) {
                query.isRead = false;
            }
            if (category) {
                query.category = category;
            }
            if (type) {
                query.type = type;
            }

            // Requêtes parallèles pour les données et les compteurs
            const [notifications, total, unreadCount] = await Promise.all([
                Notification.find(query)
                    .sort({ createdAt: -1 })
                    .skip((page - 1) * limit)
                    .limit(limit)
                    .lean(),
                Notification.countDocuments(query),
                Notification.getUnreadCount(userObjectId),
            ]);

            const hasMore = total > page * limit;

            return {
                notifications: notifications as INotification[],
                total,
                unreadCount,
                hasMore,
            };
        } catch (error) {
            console.error('❌ Erreur lors de la récupération des notifications:', error);
            throw new Error('Impossible de récupérer les notifications');
        }
    }

    /**
     * Marquer une notification comme lue
     */
    async markAsRead(
        notificationId: string | mongoose.Types.ObjectId,
        userId: string | mongoose.Types.ObjectId
    ): Promise<INotification | null> {
        try {
            const notification = await Notification.findOne({
                _id: notificationId,
                userId: typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId,
            });

            if (!notification) {
                throw new Error('Notification non trouvée');
            }

            if (!notification.isRead) {
                notification.isRead = true;
                notification.readAt = new Date();
                await notification.save();

                console.log(`📖 Notification ${notificationId} marquée comme lue`);
            }

            return notification;
        } catch (error) {
            console.error('❌ Erreur lors du marquage comme lue:', error);
            throw error;
        }
    }

    /**
     * Marquer toutes les notifications d'un utilisateur comme lues
     */
    async markAllAsRead(userId: string | mongoose.Types.ObjectId): Promise<number> {
        try {
            const userObjectId =
                typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

            const result = await Notification.updateMany(
                {
                    userId: userObjectId,
                    isRead: false,
                    $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
                },
                {
                    $set: {
                        isRead: true,
                        readAt: new Date(),
                    },
                }
            );

            console.log(
                `📖 ${result.modifiedCount} notifications marquées comme lues pour l'utilisateur ${userId}`
            );

            // Notifier le client du changement
            websocketService.notifyUser(
                userObjectId.toString(),
                'info',
                'Toutes les notifications ont été marquées comme lues',
                {
                    type: 'notifications_updated',
                    unreadCount: 0,
                }
            );

            return result.modifiedCount;
        } catch (error) {
            console.error('❌ Erreur lors du marquage global comme lu:', error);
            throw new Error('Impossible de marquer les notifications comme lues');
        }
    }

    /**
     * Supprimer une notification
     */
    async deleteNotification(
        notificationId: string | mongoose.Types.ObjectId,
        userId: string | mongoose.Types.ObjectId
    ): Promise<boolean> {
        try {
            const result = await Notification.deleteOne({
                _id: notificationId,
                userId: typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId,
            });

            const deleted = result.deletedCount > 0;

            if (deleted) {
                console.log(`🗑️ Notification ${notificationId} supprimée`);
            }

            return deleted;
        } catch (error) {
            console.error('❌ Erreur lors de la suppression de la notification:', error);
            throw new Error('Impossible de supprimer la notification');
        }
    }

    /**
     * Supprimer toutes les notifications lues d'un utilisateur
     */
    async deleteAllRead(userId: string | mongoose.Types.ObjectId): Promise<number> {
        try {
            const userObjectId =
                typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

            const result = await Notification.deleteMany({
                userId: userObjectId,
                isRead: true,
            });

            console.log(
                `🗑️ ${result.deletedCount} notifications lues supprimées pour l'utilisateur ${userId}`
            );

            return result.deletedCount;
        } catch (error) {
            console.error('❌ Erreur lors de la suppression des notifications lues:', error);
            throw new Error('Impossible de supprimer les notifications lues');
        }
    }

    /**
     * Obtenir le nombre de notifications non lues
     */
    async getUnreadCount(userId: string | mongoose.Types.ObjectId): Promise<number> {
        try {
            const userObjectId =
                typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

            return await Notification.getUnreadCount(userObjectId);
        } catch (error) {
            console.error('❌ Erreur lors du comptage des non lues:', error);
            return 0;
        }
    }

    /**
     * Nettoyer les notifications expirées (tâche de maintenance)
     */
    async cleanupExpired(): Promise<number> {
        try {
            const result = await Notification.deleteMany({
                expiresAt: { $lt: new Date() },
            });

            if (result.deletedCount > 0) {
                console.log(`🧹 ${result.deletedCount} notifications expirées nettoyées`);
            }

            return result.deletedCount;
        } catch (error) {
            console.error('❌ Erreur lors du nettoyage des notifications expirées:', error);
            return 0;
        }
    }

    /**
     * Envoyer les notifications en attente à un utilisateur qui vient de se connecter
     */
    async sendPendingNotifications(userId: string): Promise<void> {
        try {
            const { notifications } = await this.getUserNotifications(userId, {
                unreadOnly: true,
                limit: 10,
            });

            if (notifications.length > 0) {
                // Envoyer un message spécial pour indiquer les notifications en attente
                websocketService.notifyUser(
                    userId,
                    'info',
                    `Vous avez ${notifications.length} notification(s) en attente`,
                    {
                        type: 'pending_notifications',
                        count: notifications.length,
                        notifications: notifications.slice(0, 3), // Envoyer les 3 premières
                    }
                );

                console.log(
                    `📬 ${notifications.length} notifications en attente envoyées à l'utilisateur ${userId}`
                );
            }
        } catch (error) {
            console.error("❌ Erreur lors de l'envoi des notifications en attente:", error);
        }
    }
}

// Instance singleton
const notificationService = new NotificationService();

// Tâche de nettoyage automatique (toutes les heures)
setInterval(async () => {
    try {
        await notificationService.cleanupExpired();
    } catch (error) {
        console.error('❌ Erreur lors du nettoyage automatique:', error);
    }
}, 60 * 60 * 1000); // 1 heure

export default notificationService;
