import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
    statusCode?: number;
    isOperational?: boolean;
}

export const errorHandler = (
    err: AppError,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    let error = { ...err };
    error.message = err.message;

    // Log de l'erreur
    console.error('❌ Erreur:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
    });

    // Erreur Mongoose - ID invalide
    if (err.name === 'CastError') {
        const message = 'Ressource non trouvée';
        error = {
            message,
            statusCode: 404,
            isOperational: true,
        } as AppError;
    }

    // Erreur Mongoose - Validation
    if (err.name === 'ValidationError') {
        const message = Object.values((err as any).errors)
            .map((val: any) => val.message)
            .join(', ');
        error = {
            message,
            statusCode: 400,
            isOperational: true,
        } as AppError;
    }

    // Erreur Mongoose - Duplicate key
    if ((err as any).code === 11000) {
        const message = 'Une ressource avec ces informations existe déjà';
        error = {
            message,
            statusCode: 400,
            isOperational: true,
        } as AppError;
    }

    // Erreur JWT
    if (err.name === 'JsonWebTokenError') {
        const message = 'Token invalide';
        error = {
            message,
            statusCode: 401,
            isOperational: true,
        } as AppError;
    }

    // Erreur JWT expiré
    if (err.name === 'TokenExpiredError') {
        const message = 'Token expiré';
        error = {
            message,
            statusCode: 401,
            isOperational: true,
        } as AppError;
    }

    // Erreur de syntaxe JSON
    if (err instanceof SyntaxError && 'body' in err) {
        const message = 'Format JSON invalide';
        error = {
            message,
            statusCode: 400,
            isOperational: true,
        } as AppError;
    }

    // Réponse d'erreur
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Erreur interne du serveur';

    res.status(statusCode).json({
        success: false,
        error: {
            message,
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
        },
        ...(process.env.NODE_ENV === 'development' && {
            timestamp: new Date().toISOString(),
            path: req.path,
            method: req.method,
        }),
    });
};
