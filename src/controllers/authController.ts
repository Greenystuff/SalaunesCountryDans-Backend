import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { PasswordChangeRequest } from '../models/PasswordChangeRequest';
import { JWTPayload } from '../middleware/auth';
import minioService from '../services/minioService';
import websocketService from '../services/websocketService';
import { sendPasswordChangeValidation } from '../services/emailService';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

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
                    phone: user.phone,
                    avatar: user.avatar,
                    role: user.role,
                    isActive: user.isActive,
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

// Demander un changement de mot de passe (avec validation par email)
export const requestPasswordChange = async (req: Request, res: Response): Promise<void> => {
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

        // Supprimer les anciennes demandes de cet utilisateur
        await PasswordChangeRequest.deleteMany({
            userId: user._id,
            isUsed: false,
        });

        // Créer une nouvelle demande de changement
        const validationToken = uuidv4();
        const newPasswordHash = await bcrypt.hash(newPassword, 12);
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

        const passwordChangeRequest = new PasswordChangeRequest({
            userId: user._id,
            token: validationToken,
            newPasswordHash,
            userEmail: user.email,
            userName: `${user.firstName} ${user.lastName}`.trim() || user.email,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            expiresAt,
        });

        await passwordChangeRequest.save();

        // Envoyer un email de validation
        const expiresAtFormatted = expiresAt.toLocaleString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Paris',
        });

        // Envoyer l'email (comme SafeTale, on laisse l'exception remonter)
        await sendPasswordChangeValidation({
            userName: passwordChangeRequest.userName,
            userEmail: user.email,
            validationToken,
            ipAddress: passwordChangeRequest.ipAddress,
            userAgent: passwordChangeRequest.userAgent,
            expiresAt: expiresAtFormatted,
        });

        res.status(200).json({
            success: true,
            message: 'Email de validation envoyé. Vérifiez votre boîte de réception.',
        });
    } catch (error) {
        console.error('Erreur lors de la demande de changement de mot de passe:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur',
        });
    }
};

// Valider le changement de mot de passe
export const validatePasswordChange = async (req: Request, res: Response): Promise<void> => {
    try {
        const { token } = req.query;

        if (!token || typeof token !== 'string') {
            res.status(400).json({
                success: false,
                message: 'Token de validation requis',
            });
            return;
        }

        // Trouver la demande de changement
        const passwordRequest = await PasswordChangeRequest.findOne({
            token,
            isUsed: false,
            expiresAt: { $gt: new Date() },
        });

        if (!passwordRequest) {
            res.status(400).json({
                success: false,
                message: 'Token invalide ou expiré',
            });
            return;
        }

        // Trouver l'utilisateur
        const user = await User.findById(passwordRequest.userId);
        if (!user) {
            res.status(404).json({
                success: false,
                message: 'Utilisateur non trouvé',
            });
            return;
        }

        // Changer le mot de passe (le hash est déjà calculé)
        await User.findByIdAndUpdate(user._id, {
            password: passwordRequest.newPasswordHash,
        });

        // Marquer la demande comme utilisée
        passwordRequest.isUsed = true;
        await passwordRequest.save();

        // Notification WebSocket
        websocketService.notifyUser(
            user._id.toString(),
            'success',
            'Mot de passe modifié avec succès'
        );

        res.status(200).json({
            success: true,
            message: 'Mot de passe modifié avec succès',
        });
    } catch (error) {
        console.error('Erreur lors de la validation du changement de mot de passe:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur',
        });
    }
};

// Mettre à jour le profil utilisateur
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const { firstName, lastName, email, phone } = req.body;

        // Validation des champs requis
        if (!firstName || !lastName || !email) {
            res.status(400).json({
                success: false,
                message: 'Prénom, nom et email sont requis',
            });
            return;
        }

        // Vérifier si l'email est déjà utilisé par un autre utilisateur
        const existingUser = await User.findOne({
            email,
            _id: { $ne: req.user._id },
        });

        if (existingUser) {
            res.status(400).json({
                success: false,
                message: 'Cet email est déjà utilisé',
            });
            return;
        }

        // Mettre à jour l'utilisateur
        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            {
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                email: email.toLowerCase().trim(),
                phone: phone?.trim() || undefined,
            },
            { new: true, runValidators: true }
        );

        if (!updatedUser) {
            res.status(404).json({
                success: false,
                message: 'Utilisateur non trouvé',
            });
            return;
        }

        // Notification WebSocket de mise à jour du profil
        websocketService.notifyProfileUpdate(updatedUser._id.toString(), {
            id: updatedUser._id,
            email: updatedUser.email,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            phone: updatedUser.phone,
            avatar: updatedUser.avatar,
            role: updatedUser.role,
            isActive: updatedUser.isActive,
            lastLogin: updatedUser.lastLogin,
            createdAt: updatedUser.createdAt,
            updatedAt: updatedUser.updatedAt,
        });

        // Notification aux admins de la mise à jour
        websocketService.notifyAdmins(
            'info',
            `Profil mis à jour: ${updatedUser.firstName} ${updatedUser.lastName}`
        );

        res.status(200).json({
            success: true,
            message: 'Profil mis à jour avec succès',
            data: {
                user: {
                    id: updatedUser._id,
                    email: updatedUser.email,
                    firstName: updatedUser.firstName,
                    lastName: updatedUser.lastName,
                    phone: updatedUser.phone,
                    avatar: updatedUser.avatar,
                    role: updatedUser.role,
                    isActive: updatedUser.isActive,
                    lastLogin: updatedUser.lastLogin,
                    createdAt: updatedUser.createdAt,
                    updatedAt: updatedUser.updatedAt,
                },
            },
        });
    } catch (error) {
        console.error('Erreur lors de la mise à jour du profil:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur',
        });
    }
};

// Configuration multer pour l'upload d'avatar
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max
    },
    fileFilter: (req, file, cb) => {
        // Vérifier que c'est bien une image
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Seuls les fichiers image sont autorisés'));
        }
    },
});

// Middleware pour l'upload d'avatar
export const uploadAvatarMiddleware = upload.single('avatar');

// Upload d'avatar
export const uploadAvatar = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.file) {
            res.status(400).json({
                success: false,
                message: 'Aucun fichier fourni',
            });
            return;
        }

        // Générer un nom de fichier unique
        const fileExtension = req.file.originalname.split('.').pop();
        const fileName = `avatars/${req.user._id}-${uuidv4()}.${fileExtension}`;

        // Upload vers MinIO
        const bucketName = 'gallery'; // Utiliser le bucket gallery existant
        const uploadSuccess = await minioService.uploadFile(
            bucketName,
            fileName,
            req.file.buffer,
            req.file.mimetype
        );

        if (!uploadSuccess) {
            res.status(500).json({
                success: false,
                message: "Erreur lors de l'upload du fichier",
            });
            return;
        }

        // Supprimer l'ancien avatar s'il existe
        const user = await User.findById(req.user._id);
        if (user?.avatar) {
            // Extraire le nom de fichier de l'URL de l'ancien avatar
            const oldFileName = user.avatar.split('/').slice(-2).join('/');
            await minioService.deleteFile(bucketName, oldFileName);
        }

        // Générer l'URL publique
        const avatarUrl = minioService.getPublicUrl(bucketName, fileName);

        // Mettre à jour l'utilisateur avec la nouvelle URL d'avatar
        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { avatar: avatarUrl },
            { new: true }
        );

        if (!updatedUser) {
            res.status(404).json({
                success: false,
                message: 'Utilisateur non trouvé',
            });
            return;
        }

        // Notification WebSocket de mise à jour d'avatar
        websocketService.notifyUser(req.user._id, 'success', 'Avatar mis à jour avec succès');
        websocketService.notifyAdmins(
            'info',
            `Avatar mis à jour: ${updatedUser.firstName} ${updatedUser.lastName}`
        );

        // Notification de mise à jour du profil pour synchroniser l'avatar
        websocketService.notifyProfileUpdate(updatedUser._id.toString(), {
            id: updatedUser._id,
            email: updatedUser.email,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            phone: updatedUser.phone,
            avatar: updatedUser.avatar,
            role: updatedUser.role,
            isActive: updatedUser.isActive,
            lastLogin: updatedUser.lastLogin,
            createdAt: updatedUser.createdAt,
            updatedAt: updatedUser.updatedAt,
        });

        res.status(200).json({
            success: true,
            message: 'Avatar uploadé avec succès',
            data: {
                avatarUrl: avatarUrl,
            },
        });
    } catch (error) {
        console.error("Erreur lors de l'upload d'avatar:", error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur',
        });
    }
};

// Supprimer l'avatar
export const removeAvatar = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            res.status(404).json({
                success: false,
                message: 'Utilisateur non trouvé',
            });
            return;
        }

        if (!user.avatar) {
            res.status(400).json({
                success: false,
                message: 'Aucun avatar à supprimer',
            });
            return;
        }

        // Extraire le nom de fichier de l'URL
        const fileName = user.avatar.split('/').slice(-2).join('/');
        const bucketName = 'gallery';

        // Supprimer le fichier de MinIO
        const deleteSuccess = await minioService.deleteFile(bucketName, fileName);

        if (!deleteSuccess) {
            console.warn('Impossible de supprimer le fichier de MinIO, mais on continue');
        }

        // Supprimer l'URL de l'avatar de la base de données
        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { $unset: { avatar: 1 } },
            { new: true }
        );

        // Notification WebSocket de suppression d'avatar
        if (updatedUser) {
            websocketService.notifyUser(req.user._id, 'success', 'Avatar réinitialisé avec succès');
            websocketService.notifyAdmins(
                'info',
                `Avatar supprimé: ${updatedUser.firstName} ${updatedUser.lastName}`
            );

            // Notification de mise à jour du profil pour synchroniser la suppression
            websocketService.notifyProfileUpdate(updatedUser._id.toString(), {
                id: updatedUser._id,
                email: updatedUser.email,
                firstName: updatedUser.firstName,
                lastName: updatedUser.lastName,
                phone: updatedUser.phone,
                avatar: updatedUser.avatar, // Sera undefined après suppression
                role: updatedUser.role,
                isActive: updatedUser.isActive,
                lastLogin: updatedUser.lastLogin,
                createdAt: updatedUser.createdAt,
                updatedAt: updatedUser.updatedAt,
            });
        }

        res.status(200).json({
            success: true,
            message: 'Avatar supprimé avec succès',
        });
    } catch (error) {
        console.error("Erreur lors de la suppression d'avatar:", error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur',
        });
    }
};
