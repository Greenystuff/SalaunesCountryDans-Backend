import mongoose, { Schema, Document } from 'mongoose';

export interface IPasswordChangeRequest extends Document {
    userId: mongoose.Schema.Types.ObjectId;
    token: string;
    newPasswordHash: string;
    userEmail: string;
    userName: string;
    ipAddress?: string;
    userAgent?: string;
    expiresAt: Date;
    isUsed: boolean;
    createdAt: Date;
}

const passwordChangeRequestSchema = new Schema<IPasswordChangeRequest>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        token: {
            type: String,
            required: true,
            unique: true,
        },
        newPasswordHash: {
            type: String,
            required: true,
        },
        userEmail: {
            type: String,
            required: true,
        },
        userName: {
            type: String,
            required: true,
        },
        ipAddress: {
            type: String,
        },
        userAgent: {
            type: String,
        },
        expiresAt: {
            type: Date,
            required: true,
            default: () => new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        },
        isUsed: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

// Index TTL pour suppression automatique des tokens expirés
passwordChangeRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordChangeRequest = mongoose.model<IPasswordChangeRequest>(
    'PasswordChangeRequest',
    passwordChangeRequestSchema
);
