import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: 'admin' | 'user';
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
        role: {
            type: String,
            enum: ['admin', 'user'],
            default: 'user',
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
userSchema.index({ email: 1 });
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

// Méthode statique pour créer un utilisateur admin par défaut
(userSchema.statics as any).createDefaultAdmin = async function () {
    try {
        const adminExists = await this.findOne({ role: 'admin' });

        if (!adminExists) {
            const defaultAdmin = new this({
                email: 'admin@salaunes-country-dans.fr',
                password: 'Admin123!',
                firstName: 'Admin',
                lastName: 'Salaunes',
                role: 'admin',
                isActive: true,
            });

            await defaultAdmin.save();
            console.log('✅ Utilisateur admin par défaut créé');
        }
    } catch (error) {
        console.error("❌ Erreur lors de la création de l'admin par défaut:", error);
    }
};

export const User = mongoose.model<IUser>('User', userSchema);
