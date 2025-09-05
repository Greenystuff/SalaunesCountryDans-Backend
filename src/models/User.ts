import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    avatar?: string;
    role: 'admin' | 'manager' | 'user';
    permissions?: string[];
    isActive: boolean;
    lastLogin?: Date;
    passwordChangedAt?: Date;
    passwordResetToken?: string;
    passwordResetExpires?: Date;
    createdAt: Date;
    updatedAt: Date;
    comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
    {
        email: {
            type: String,
            required: [true, "L'email est requis"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Format d'email invalide"],
        },
        password: {
            type: String,
            required: [true, 'Le mot de passe est requis'],
            minlength: [8, 'Le mot de passe doit contenir au moins 8 caractères'],
            select: false, // Ne pas inclure le mot de passe dans les requêtes par défaut
        },
        firstName: {
            type: String,
            required: [true, 'Le prénom est requis'],
            trim: true,
            maxlength: [50, 'Le prénom ne peut pas dépasser 50 caractères'],
        },
        lastName: {
            type: String,
            required: [true, 'Le nom est requis'],
            trim: true,
            maxlength: [50, 'Le nom ne peut pas dépasser 50 caractères'],
        },
        phone: {
            type: String,
            trim: true,
            match: [/^(\+33|0)[1-9](\d{8})$/, 'Format de téléphone invalide'],
        },
        avatar: {
            type: String,
            trim: true,
        },
        role: {
            type: String,
            enum: ['admin', 'manager', 'user'],
            default: 'user',
        },
        permissions: {
            type: [String],
            default: [],
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        lastLogin: {
            type: Date,
        },
        passwordChangedAt: {
            type: Date,
        },
        passwordResetToken: {
            type: String,
        },
        passwordResetExpires: {
            type: Date,
        },
    },
    {
        timestamps: true,
        toJSON: {
            transform: function (doc: any, ret: any) {
                delete ret.password;
                delete ret.passwordResetToken;
                delete ret.passwordResetExpires;
                return ret;
            },
        },
    }
);

// Index pour améliorer les performances
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

// Middleware pre-save pour hasher le mot de passe
userSchema.pre('save', async function (next) {
    // Ne hasher que si le mot de passe a été modifié
    if (!this.isModified('password')) return next();

    try {
        // Hasher le mot de passe avec un salt de 12
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);

        // Mettre à jour passwordChangedAt
        this.passwordChangedAt = new Date(Date.now() - 1000); // -1 seconde pour s'assurer que le token JWT est créé après
        next();
    } catch (error) {
        next(error as Error);
    }
});

// Méthode pour comparer les mots de passe
(userSchema.methods as any).comparePassword = async function (
    candidatePassword: string
): Promise<boolean> {
    try {
        return await bcrypt.compare(candidatePassword, this['password']);
    } catch (error) {
        throw new Error('Erreur lors de la comparaison des mots de passe');
    }
};

// Importer les permissions disponibles
import { availablePermissions } from '../config/permissions';

// Méthode statique pour créer un utilisateur admin par défaut
(userSchema.statics as any).createDefaultAdmin = async function () {
    try {
        const adminExists = await this.findOne({ role: 'admin' });

        if (!adminExists) {
            // Récupérer toutes les permissions disponibles
            const permissions = [...availablePermissions];

            const defaultAdmin = new this({
                email: 'bisabell@free.fr',
                password: 'Yesyoucan',
                firstName: 'Isabelle',
                lastName: 'Boutin',
                role: 'admin',
                isActive: true,
                permissions: permissions, // Ajouter toutes les permissions
            });

            await defaultAdmin.save();
            console.log('✅ Utilisateur admin par défaut créé avec toutes les permissions');
        } else {
            // Vérifier que l'admin existant a bien toutes les permissions
            const permissions = [...availablePermissions];
            const needsUpdate = !adminExists.permissions || 
                                adminExists.permissions.length !== permissions.length ||
                                permissions.some(p => !adminExists.permissions.includes(p));

            if (needsUpdate) {
                adminExists.permissions = permissions;
                await adminExists.save();
                console.log('✅ Permissions de l\'admin par défaut mises à jour');
            }
        }
    } catch (error) {
        console.error("❌ Erreur lors de la création/mise à jour de l'admin par défaut:", error);
    }
};

export const User = mongoose.model<IUser>('User', userSchema);
