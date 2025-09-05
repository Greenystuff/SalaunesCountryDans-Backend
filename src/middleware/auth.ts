import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';

// Étendre l'interface Request pour inclure l'utilisateur
declare global {
    namespace Express {
        interface Request {
            user?: any;
        }
    }
}

export interface JWTPayload {
    userId: string;
    email: string;
    role: string;
    iat: number;
    exp: number;
}

export const authenticateToken = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            res.status(401).json({
                success: false,
                message: "Token d'accès requis",
            });
            return;
        }

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            res.status(500).json({
                success: false,
                message: 'Erreur de configuration JWT',
            });
            return;
        }

        // Vérifier et décoder le token
        const decoded = jwt.verify(token, jwtSecret) as JWTPayload;

        // Vérifier si l'utilisateur existe toujours en base
        const user = await User.findById(decoded.userId).select('-password');
        if (!user) {
            res.status(401).json({
                success: false,
                message: 'Utilisateur non trouvé',
            });
            return;
        }

        // Vérifier si l'utilisateur est actif
        if (!user.isActive) {
            res.status(401).json({
                success: false,
                message: 'Compte utilisateur désactivé',
            });
            return;
        }

        // Ajouter l'utilisateur à la requête
        req.user = user;
        next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            res.status(401).json({
                success: false,
                message: 'Token invalide',
            });
        } else if (error instanceof jwt.TokenExpiredError) {
            res.status(401).json({
                success: false,
                message: 'Token expiré',
            });
        } else {
            console.error("Erreur d'authentification:", error);
            res.status(500).json({
                success: false,
                message: 'Erreur interne du serveur',
            });
        }
    }
};

// Middleware pour vérifier les rôles
export const requireRole = (roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: 'Authentification requise',
            });
            return;
        }

        if (!roles.includes(req.user.role)) {
            res.status(403).json({
                success: false,
                message: 'Permissions insuffisantes',
            });
            return;
        }

        next();
    };
};

// Middleware pour vérifier les permissions spécifiques
export const requirePermission = (permission: string) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: 'Authentification requise',
            });
            return;
        }

        // L'admin a toutes les permissions
        if (req.user.role === 'admin') {
            next();
            return;
        }

        // Vérifier si l'utilisateur a la permission requise
        if (!req.user.permissions || !req.user.permissions.includes(permission)) {
            res.status(403).json({
                success: false,
                message: 'Permission insuffisante',
            });
            return;
        }

        next();
    };
};

// Middleware spécifique pour les administrateurs
export const requireAdmin = requireRole(['admin']);

// Middleware pour vérifier la propriété de la ressource
export const requireOwnership = (resourceField: string = 'userId') => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: 'Authentification requise',
            });
            return;
        }

        // Les admins peuvent accéder à tout
        if (req.user.role === 'admin') {
            next();
            return;
        }

        // Vérifier la propriété de la ressource
        const resourceUserId = req.params[resourceField] || req.body[resourceField];
        if (resourceUserId && resourceUserId !== req.user._id.toString()) {
            res.status(403).json({
                success: false,
                message: 'Accès non autorisé à cette ressource',
            });
            return;
        }

        next();
    };
};
