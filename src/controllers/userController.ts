import { Request, Response } from 'express';
import { User } from '../models/User';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import websocketService from '../services/websocketService';
import { availablePermissions } from '../config/permissions';

// Récupérer la liste des utilisateurs (seulement pour l'admin)
export const getUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        // L'admin ne peut pas voir les autres admins (il est le seul)
        const users = await User.find({ role: { $ne: 'admin' } })
            .select('-passwordChangedAt -passwordResetToken -passwordResetExpires')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: users.length,
            data: users
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des utilisateurs:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur'
        });
    }
};

// Récupérer un utilisateur spécifique
export const getUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const user = await User.findById(req.params.id)
            .select('-passwordChangedAt -passwordResetToken -passwordResetExpires');

        if (!user) {
            res.status(404).json({
                success: false,
                message: 'Utilisateur non trouvé'
            });
            return;
        }

        // Un admin ne peut pas voir les autres admins
        if (user.role === 'admin' && req.user._id.toString() !== user._id.toString()) {
            res.status(403).json({
                success: false,
                message: 'Accès non autorisé'
            });
            return;
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error("Erreur lors de la récupération de l'utilisateur:", error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur'
        });
    }
};

// Créer un nouvel utilisateur (manager)
export const createUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, firstName, lastName, phone, password, permissions } = req.body;

        // Validation des champs requis
        if (!email || !firstName || !lastName || !password) {
            res.status(400).json({
                success: false,
                message: 'Email, prénom, nom et mot de passe sont requis'
            });
            return;
        }

        // Vérifier que l'email n'existe pas déjà
        const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
        if (existingUser) {
            res.status(400).json({
                success: false,
                message: 'Un utilisateur avec cet email existe déjà'
            });
            return;
        }

        // Vérification des permissions
        const validPermissions = permissions.filter((perm: string) => 
            availablePermissions.includes(perm)
        );

        // Créer le nouvel utilisateur (toujours en tant que manager)
        const user = new User({
            email: email.toLowerCase().trim(),
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phone?.trim(),
            password, // Le hook pre-save s'occupera du hashage
            role: 'manager', // Seuls les managers peuvent être créés ici
            permissions: validPermissions,
            isActive: true
        });

        await user.save();

        // Notification aux admins
        websocketService.notifyAdmins(
            'success',
            `Nouvel utilisateur créé : ${user.firstName} ${user.lastName}`
        );

        res.status(201).json({
            success: true,
            message: 'Utilisateur créé avec succès',
            data: {
                id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                permissions: user.permissions,
                isActive: user.isActive
            }
        });
    } catch (error) {
        console.error("Erreur lors de la création de l'utilisateur:", error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur'
        });
    }
};

// Mettre à jour un utilisateur
export const updateUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { firstName, lastName, email, phone, isActive, permissions } = req.body;
        const userId = req.params.id;

        // Récupérer l'utilisateur à mettre à jour
        const user = await User.findById(userId);
        
        if (!user) {
            res.status(404).json({
                success: false,
                message: 'Utilisateur non trouvé'
            });
            return;
        }

        // Un admin ne peut pas modifier un autre admin
        if (user.role === 'admin' && req.user._id.toString() !== user._id.toString()) {
            res.status(403).json({
                success: false,
                message: "Modification d'un administrateur non autorisée"
            });
            return;
        }

        // Vérifier si l'email est déjà utilisé par un autre utilisateur
        if (email && email !== user.email) {
            const existingUser = await User.findOne({
                email: email.toLowerCase().trim(),
                _id: { $ne: userId }
            });

            if (existingUser) {
                res.status(400).json({
                    success: false,
                    message: 'Cet email est déjà utilisé'
                });
                return;
            }
        }

        // Vérification des permissions (uniquement pour les managers)
        let validPermissions = user.permissions || [];
        if (user.role === 'manager' && permissions) {
            validPermissions = permissions.filter((perm: string) => 
                availablePermissions.includes(perm)
            );
        }

        // Préparer les données de mise à jour
        const updateData: any = {
            firstName: firstName?.trim() ?? user.firstName,
            lastName: lastName?.trim() ?? user.lastName,
            email: email ? email.toLowerCase().trim() : user.email,
            phone: phone?.trim() ?? user.phone,
            permissions: user.role === 'manager' ? validPermissions : user.permissions,
        };

        // Seul l'administrateur peut activer/désactiver un compte
        if (req.user.role === 'admin' && typeof isActive === 'boolean') {
            updateData.isActive = isActive;
        }

        // Mise à jour de l'utilisateur
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedUser) {
            res.status(404).json({
                success: false,
                message: 'Utilisateur non trouvé'
            });
            return;
        }

        // Notification à l'utilisateur concerné
        websocketService.notifyUser(
            updatedUser._id.toString(),
            'info',
            'Votre profil a été mis à jour par un administrateur'
        );

        // Notification aux admins
        websocketService.notifyAdmins(
            'success',
            `Utilisateur mis à jour : ${updatedUser.firstName} ${updatedUser.lastName}`
        );

        res.status(200).json({
            success: true,
            message: 'Utilisateur mis à jour avec succès',
            data: {
                id: updatedUser._id,
                email: updatedUser.email,
                firstName: updatedUser.firstName,
                lastName: updatedUser.lastName,
                phone: updatedUser.phone,
                role: updatedUser.role,
                permissions: updatedUser.permissions,
                isActive: updatedUser.isActive,
                lastLogin: updatedUser.lastLogin,
                createdAt: updatedUser.createdAt,
                updatedAt: updatedUser.updatedAt
            }
        });
    } catch (error) {
        console.error("Erreur lors de la mise à jour de l'utilisateur:", error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur'
        });
    }
};

// Réinitialiser le mot de passe d'un utilisateur
export const resetUserPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.params.id;
        const { newPassword } = req.body;

        // Validation du nouveau mot de passe
        if (!newPassword || newPassword.length < 8) {
            res.status(400).json({
                success: false,
                message: 'Le nouveau mot de passe doit contenir au moins 8 caractères'
            });
            return;
        }

        // Récupérer l'utilisateur
        const user = await User.findById(userId);
        
        if (!user) {
            res.status(404).json({
                success: false,
                message: 'Utilisateur non trouvé'
            });
            return;
        }

        // Un admin ne peut pas modifier le mot de passe d'un autre admin
        if (user.role === 'admin' && req.user._id.toString() !== user._id.toString()) {
            res.status(403).json({
                success: false,
                message: "Modification du mot de passe d'un administrateur non autorisée"
            });
            return;
        }

        // Hasher le nouveau mot de passe
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Mettre à jour le mot de passe et la date de changement
        user.password = hashedPassword;
        user.passwordChangedAt = new Date();
        await user.save();

        // Notification à l'utilisateur concerné
        websocketService.notifyUser(
            user._id.toString(),
            'warning',
            'Votre mot de passe a été réinitialisé par un administrateur'
        );

        // Notification aux admins
        websocketService.notifyAdmins(
            'success',
            `Mot de passe réinitialisé pour : ${user.firstName} ${user.lastName}`
        );

        res.status(200).json({
            success: true,
            message: 'Mot de passe réinitialisé avec succès'
        });
    } catch (error) {
        console.error("Erreur lors de la réinitialisation du mot de passe:", error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur'
        });
    }
};

// Supprimer un utilisateur
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.params.id;

        // Récupérer l'utilisateur à supprimer
        const user = await User.findById(userId);
        
        if (!user) {
            res.status(404).json({
                success: false,
                message: 'Utilisateur non trouvé'
            });
            return;
        }

        // Un admin ne peut pas être supprimé
        if (user.role === 'admin') {
            res.status(403).json({
                success: false,
                message: "La suppression d'un administrateur n'est pas autorisée"
            });
            return;
        }

        // Supprimer l'utilisateur
        await User.findByIdAndDelete(userId);

        // Notification aux admins
        websocketService.notifyAdmins(
            'warning',
            `Utilisateur supprimé : ${user.firstName} ${user.lastName}`
        );

        res.status(200).json({
            success: true,
            message: 'Utilisateur supprimé avec succès'
        });
    } catch (error) {
        console.error("Erreur lors de la suppression de l'utilisateur:", error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur'
        });
    }
};

// Récupérer la liste des permissions disponibles
export const getAvailablePermissions = async (req: Request, res: Response): Promise<void> => {
    try {
        res.status(200).json({
            success: true,
            data: availablePermissions
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des permissions:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur'
        });
    }
};
