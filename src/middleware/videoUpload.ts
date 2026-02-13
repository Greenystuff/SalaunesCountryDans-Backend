import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { Request } from 'express';

// Configuration du stockage temporaire pour les vidéos
const videoStorage = multer.diskStorage({
    destination: async (req: Request, file: Express.Multer.File, cb) => {
        try {
            // Créer un répertoire temporaire unique pour chaque upload
            const tempDir = path.join(process.cwd(), 'temp-uploads', `upload-${Date.now()}`);
            await fs.ensureDir(tempDir);
            cb(null, tempDir);
        } catch (error) {
            cb(error as Error, '');
        }
    },
    filename: (req: Request, file: Express.Multer.File, cb) => {
        // Sanitizer le nom de fichier pour éviter les problèmes de sécurité
        const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueName = `${Date.now()}-${sanitized}`;
        cb(null, uniqueName);
    },
});

// Fonction de filtrage des types de fichiers
const videoFileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Liste des MIME types autorisés
    const allowedMimeTypes = [
        'video/mp4',
        'video/webm',
        'video/quicktime', // MOV
        'video/x-msvideo', // AVI
    ];

    // Vérifier le MIME type
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        const error = new Error(
            `Format vidéo non supporté: ${file.mimetype}. Formats acceptés: MP4, WebM, MOV, AVI`
        );
        cb(error as any);
    }
};

// Configuration Multer pour les vidéos
export const videoUpload = multer({
    storage: videoStorage,
    limits: {
        fileSize: parseInt(process.env.MAX_VIDEO_SIZE_MB || '1024') * 1024 * 1024, // Taille max en bytes
    },
    fileFilter: videoFileFilter,
});

// Middleware de cleanup des fichiers temporaires
export const cleanupTempFiles = async (req: any, res: any, next: any) => {
    // Enregistrer un listener pour nettoyer après la réponse
    res.on('finish', async () => {
        if (req.file && req.file.path) {
            const tempDir = path.dirname(req.file.path);
            try {
                // Attendre un peu pour s'assurer que le fichier n'est plus utilisé
                setTimeout(async () => {
                    if (await fs.pathExists(tempDir)) {
                        await fs.remove(tempDir);
                        console.log(`🧹 Nettoyé: ${tempDir}`);
                    }
                }, 5000); // 5 secondes de délai
            } catch (error) {
                console.error(`❌ Échec du nettoyage de ${tempDir}:`, error);
            }
        }
    });

    // Également nettoyer en cas d'erreur
    res.on('close', async () => {
        if (!res.writableEnded && req.file && req.file.path) {
            const tempDir = path.dirname(req.file.path);
            try {
                if (await fs.pathExists(tempDir)) {
                    await fs.remove(tempDir);
                    console.log(`🧹 Nettoyé après erreur: ${tempDir}`);
                }
            } catch (error) {
                console.error(`❌ Échec du nettoyage après erreur de ${tempDir}:`, error);
            }
        }
    });

    next();
};
