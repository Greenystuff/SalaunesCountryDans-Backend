import mongoose, { Document, Schema, Model } from 'mongoose';

// Interface pour une notification
export interface INotification extends Document {
    userId: mongoose.Types.ObjectId;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    category: 'system' | 'security' | 'update' | 'reminder' | 'message';
    isRead: boolean;
    isPersistent: boolean;
    metadata?: {
        [key: string]: any;
    };
    actionUrl?: string;
    actionText?: string;
    createdAt: Date;
    readAt?: Date;
    expiresAt?: Date;
}

// Interface pour les méthodes statiques
export interface INotificationModel extends Model<INotification> {
    getUnreadCount(userId: mongoose.Types.ObjectId): Promise<number>;
    getUserNotifications(
        userId: mongoose.Types.ObjectId,
        options?: {
            page?: number;
            limit?: number;
            unreadOnly?: boolean;
        }
    ): Promise<INotification[]>;
    markAllAsRead(userId: mongoose.Types.ObjectId): Promise<any>;
    cleanupExpired(): Promise<any>;
}

// Schéma de la notification
const notificationSchema = new Schema<INotification>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        title: {
            type: String,
            required: true,
            maxlength: 200,
        },
        message: {
            type: String,
            required: true,
            maxlength: 1000,
        },
        type: {
            type: String,
            enum: ['success', 'error', 'warning', 'info'],
            default: 'info',
        },
        category: {
            type: String,
            enum: ['system', 'security', 'update', 'reminder', 'message'],
            default: 'system',
        },
        isRead: {
            type: Boolean,
            default: false,
            index: true,
        },
        isPersistent: {
            type: Boolean,
            default: false,
        },
        metadata: {
            type: Schema.Types.Mixed,
            default: {},
        },
        actionUrl: {
            type: String,
            maxlength: 500,
        },
        actionText: {
            type: String,
            maxlength: 100,
        },
        readAt: {
            type: Date,
        },
        expiresAt: {
            type: Date,
            index: true,
        },
    },
    {
        timestamps: true,
        collection: 'notifications',
    }
);

// Index composé pour optimiser les requêtes
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Méthodes d'instance
notificationSchema.methods.markAsRead = function () {
    if (!this.isRead) {
        this.isRead = true;
        this.readAt = new Date();
        return this.save();
    }
    return Promise.resolve(this);
};

// Méthodes statiques
notificationSchema.statics.getUnreadCount = function (userId: mongoose.Types.ObjectId) {
    return this.countDocuments({
        userId,
        isRead: false,
        $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
    });
};

notificationSchema.statics.getUserNotifications = function (
    userId: mongoose.Types.ObjectId,
    options: {
        page?: number;
        limit?: number;
        unreadOnly?: boolean;
    } = {}
) {
    const { page = 1, limit = 20, unreadOnly = false } = options;

    const query: any = {
        userId,
        $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
    };

    if (unreadOnly) {
        query.isRead = false;
    }

    return this.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
};

notificationSchema.statics.markAllAsRead = function (userId: mongoose.Types.ObjectId) {
    return this.updateMany(
        {
            userId,
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
};

notificationSchema.statics.cleanupExpired = function () {
    return this.deleteMany({
        expiresAt: { $lt: new Date() },
    });
};

export const Notification = mongoose.model<INotification, INotificationModel>(
    'Notification',
    notificationSchema
);
