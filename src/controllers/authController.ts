import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { JWTPayload } from '../middleware/auth';

// Générer un token JWT
const generateToken = (userId: string, email: string, role: string): string => {
    const jwtSecret = process.env.JWT_SECRET;
    const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';

    if (!jwtSecret) {
        throw new Error('JWT_SECRET non configuré');
    }

    return (jwt as any).sign({ userId, email, role }, jwtSecret, { expiresIn: jwtExpiresIn });
};

// Connexion admin
export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;

        // Validation des champs requis
        if (!email || !password) {
            res.status(400).json({
                success: false,
                message: 'Email et mot de passe requis',
            });
            return;
        }

        // Rechercher l'utilisateur avec le mot de passe
        const user = await User.findOne({ email }).select('+password');

        if (!user) {
            res.status(401).json({
                success: false,
                message: 'Identifiants invalides',
            });
            return;
        }

        // Vérifier si l'utilisateur est actif
        if (!user.isActive) {
            res.status(401).json({
                success: false,
                message: 'Compte désactivé',
            });
            return;
        }

        // Vérifier le mot de passe
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            res.status(401).json({
                success: false,
                message: 'Identifiants invalides',
            });
            return;
        }

        // Mettre à jour la dernière connexion
        user.lastLogin = new Date();
        await user.save();

        // Générer le token JWT
        const token = generateToken(user._id.toString(), user.email, user.role);

        // Réponse de succès
        res.status(200).json({
            success: true,
            message: 'Connexion réussie',
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                    lastLogin: user.lastLogin,
                },
                token,
                expiresIn: process.env.JWT_EXPIRES_IN || '24h',
            },
        });
    } catch (error) {
        console.error('Erreur lors de la connexion:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur',
        });
    }
};

// Déconnexion (côté client - invalider le token)
export const logout = async (req: Request, res: Response): Promise<void> => {
    try {
        // Note: Pour une invalidation côté serveur, vous devriez implémenter une liste noire de tokens
        // Pour l'instant, on se contente de confirmer la déconnexion

        res.status(200).json({
            success: true,
            message: 'Déconnexion réussie',
        });
    } catch (error) {
        console.error('Erreur lors de la déconnexion:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur',
        });
    }
};

// Obtenir le profil de l'utilisateur connecté
export const getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            res.status(404).json({
                success: false,
                message: 'Utilisateur non trouvé',
            });
            return;
        }

        res.status(200).json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                    lastLogin: user.lastLogin,
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt,
                },
            },
        });
    } catch (error) {
        console.error('Erreur lors de la récupération du profil:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur',
        });
    }
};

// Rafraîchir le token
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = await User.findById(req.user._id);

        if (!user || !user.isActive) {
            res.status(401).json({
                success: false,
                message: 'Utilisateur non trouvé ou inactif',
            });
            return;
        }

        // Générer un nouveau token
        const newToken = generateToken(user._id.toString(), user.email, user.role);

        res.status(200).json({
            success: true,
            data: {
                token: newToken,
                expiresIn: process.env.JWT_EXPIRES_IN || '24h',
            },
        });
    } catch (error) {
        console.error('Erreur lors du rafraîchissement du token:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur',
        });
    }
};

// Changer le mot de passe
export const changePassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            res.status(400).json({
                success: false,
                message: 'Ancien et nouveau mot de passe requis',
            });
            return;
        }

        if (newPassword.length < 8) {
            res.status(400).json({
                success: false,
                message: 'Le nouveau mot de passe doit contenir au moins 8 caractères',
            });
            return;
        }

        // Récupérer l'utilisateur avec le mot de passe
        const user = await User.findById(req.user._id).select('+password');

        if (!user) {
            res.status(404).json({
                success: false,
                message: 'Utilisateur non trouvé',
            });
            return;
        }

        // Vérifier l'ancien mot de passe
        const isCurrentPasswordValid = await user.comparePassword(currentPassword);
        if (!isCurrentPasswordValid) {
            res.status(400).json({
                success: false,
                message: 'Ancien mot de passe incorrect',
            });
            return;
        }

        // Mettre à jour le mot de passe
        user.password = newPassword;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Mot de passe modifié avec succès',
        });
    } catch (error) {
        console.error('Erreur lors du changement de mot de passe:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur',
        });
    }
};
