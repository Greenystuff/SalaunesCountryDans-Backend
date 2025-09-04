import { Request, Response } from 'express';
import { InternalRules, IInternalRules } from '../models/InternalRules';
import minioService from '../services/minioService';
import multer from 'multer';

// Étendre le type Request pour inclure le fichier uploadé et l'utilisateur
interface MulterRequest extends Request {
    file?: Express.Multer.File;
    user?: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
    };
}

// Configuration multer pour l'upload de PDF
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
    },
    fileFilter: (req, file, cb) => {
        // Accepter seulement les PDF
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Seuls les fichiers PDF sont acceptés'));
        }
    },
});

// Middleware pour l'upload
export const uploadMiddleware = upload.single('pdf');

/**
 * Uploader un nouveau règlement intérieur
 */
export const uploadInternalRules = async (req: MulterRequest, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Aucun fichier PDF fourni',
            });
        }

        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Utilisateur non authentifié',
            });
        }

        const { title, version, description } = req.body;

        // Vérifier si la version existe déjà
        const existingVersion = await InternalRules.findOne({ version });
        if (existingVersion) {
            return res.status(400).json({
                success: false,
                message: `Un règlement avec la version "${version}" existe déjà`,
            });
        }

        // Générer un nom de fichier unique
        const timestamp = Date.now();
        const sanitizedVersion = version.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `reglement-interieur-${sanitizedVersion}-${timestamp}.pdf`;

        // Upload vers MinIO
        const success = await minioService.uploadFile(
            'documents',
            fileName,
            req.file.buffer,
            req.file.mimetype
        );

        if (!success) {
            return res.status(500).json({
                success: false,
                message: "Erreur lors de l'upload vers MinIO",
            });
        }

        // Créer l'entrée en base de données
        const newRules = new InternalRules({
            title: title || 'Règlement Intérieur',
            version,
            description,
            pdfFile: fileName,
            fileSize: req.file.size,
            uploadDate: new Date(),
            isActive: true, // Le nouveau règlement devient automatiquement actif
            uploadedBy: req.user.id,
        });

        await newRules.save();

        // Populer les données utilisateur
        await newRules.populate('uploadedBy', 'firstName lastName email');

        res.status(201).json({
            success: true,
            message: 'Règlement intérieur uploadé avec succès',
            data: {
                ...newRules.toObject(),
                pdfUrl: minioService.getPublicUrl('documents', fileName),
            },
        });
    } catch (error: any) {
        console.error("❌ Erreur lors de l'upload du règlement intérieur:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Erreur lors de l'upload du règlement intérieur",
        });
    }
};

/**
 * Récupérer le règlement intérieur actif
 */
export const getActiveInternalRules = async (req: Request, res: Response) => {
    try {
        const activeRules = await InternalRules.getActiveRules();

        if (!activeRules) {
            return res.status(404).json({
                success: false,
                message: 'Aucun règlement intérieur actif trouvé',
            });
        }

        res.json({
            success: true,
            data: {
                ...activeRules.toObject(),
                pdfUrl: minioService.getPublicUrl('documents', activeRules.pdfFile),
            },
        });
    } catch (error: any) {
        console.error('❌ Erreur lors de la récupération du règlement actif:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération du règlement intérieur',
        });
    }
};

/**
 * Récupérer toutes les versions du règlement intérieur
 */
export const getAllInternalRulesVersions = async (req: Request, res: Response) => {
    try {
        const allVersions = await InternalRules.getAllVersions();

        const versionsWithUrls = allVersions.map((rules) => ({
            ...rules.toObject(),
            pdfUrl: minioService.getPublicUrl('documents', rules.pdfFile),
        }));

        res.json({
            success: true,
            data: versionsWithUrls,
        });
    } catch (error: any) {
        console.error('❌ Erreur lors de la récupération des versions:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des versions du règlement',
        });
    }
};

/**
 * Récupérer un règlement intérieur par ID
 */
export const getInternalRulesById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const rules = await InternalRules.findById(id).populate(
            'uploadedBy',
            'firstName lastName email'
        );

        if (!rules) {
            return res.status(404).json({
                success: false,
                message: 'Règlement intérieur introuvable',
            });
        }

        res.json({
            success: true,
            data: {
                ...rules.toObject(),
                pdfUrl: minioService.getPublicUrl('documents', rules.pdfFile),
            },
        });
    } catch (error: any) {
        console.error('❌ Erreur lors de la récupération du règlement:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération du règlement intérieur',
        });
    }
};

/**
 * Définir un règlement comme actif
 */
export const setActiveInternalRules = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const rules = await InternalRules.findById(id);
        if (!rules) {
            return res.status(404).json({
                success: false,
                message: 'Règlement intérieur introuvable',
            });
        }

        await InternalRules.setActiveRules(rules._id as any);

        res.json({
            success: true,
            message: 'Règlement intérieur défini comme actif',
        });
    } catch (error: any) {
        console.error('❌ Erreur lors de la définition du règlement actif:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise à jour du règlement actif',
        });
    }
};

/**
 * Mettre à jour les métadonnées d'un règlement intérieur
 */
export const updateInternalRules = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { title, description } = req.body;

        const rules = await InternalRules.findById(id);
        if (!rules) {
            return res.status(404).json({
                success: false,
                message: 'Règlement intérieur introuvable',
            });
        }

        // Mettre à jour seulement les champs autorisés
        if (title !== undefined) rules.title = title;
        if (description !== undefined) rules.description = description;

        await rules.save();
        await rules.populate('uploadedBy', 'firstName lastName email');

        res.json({
            success: true,
            message: 'Règlement intérieur mis à jour avec succès',
            data: {
                ...rules.toObject(),
                pdfUrl: minioService.getPublicUrl('documents', rules.pdfFile),
            },
        });
    } catch (error: any) {
        console.error('❌ Erreur lors de la mise à jour du règlement:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise à jour du règlement intérieur',
        });
    }
};

/**
 * Supprimer un règlement intérieur
 */
export const deleteInternalRules = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const rules = await InternalRules.findById(id);
        if (!rules) {
            return res.status(404).json({
                success: false,
                message: 'Règlement intérieur introuvable',
            });
        }

        // Vérifier si c'est le règlement actif
        if (rules.isActive) {
            return res.status(400).json({
                success: false,
                message:
                    "Impossible de supprimer le règlement intérieur actif. Activez un autre règlement d'abord.",
            });
        }

        // Supprimer le fichier de MinIO
        try {
            await minioService.deleteFile('documents', rules.pdfFile);
        } catch (error) {
            console.warn(
                'Erreur lors de la suppression du fichier MinIO, mais on continue:',
                error
            );
        }

        // Supprimer l'entrée en base
        await InternalRules.findByIdAndDelete(id);

        res.json({
            success: true,
            message: 'Règlement intérieur supprimé avec succès',
        });
    } catch (error: any) {
        console.error('❌ Erreur lors de la suppression du règlement:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la suppression du règlement intérieur',
        });
    }
};

/**
 * Télécharger un règlement intérieur
 */
export const downloadInternalRules = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const rules = await InternalRules.findById(id);
        if (!rules) {
            return res.status(404).json({
                success: false,
                message: 'Règlement intérieur introuvable',
            });
        }

        // Générer une URL présignée pour le téléchargement
        const downloadUrl = await minioService.getPresignedUrl(rules.pdfFile, 3600); // Valide 1 heure

        if (!downloadUrl) {
            return res.status(500).json({
                success: false,
                message: 'Erreur lors de la génération du lien de téléchargement',
            });
        }

        res.json({
            success: true,
            downloadUrl,
            filename: `${rules.title}_v${rules.version}.pdf`,
        });
    } catch (error: any) {
        console.error('❌ Erreur lors de la génération du lien de téléchargement:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la génération du lien de téléchargement',
        });
    }
};

/**
 * Obtenir les statistiques sur les règlements intérieurs
 */
export const getInternalRulesStats = async (req: Request, res: Response) => {
    try {
        const totalVersions = await InternalRules.countDocuments();
        const activeRules = await InternalRules.getActiveRules();

        const latestVersions = await InternalRules.find({})
            .sort({ uploadDate: -1 })
            .limit(5)
            .populate('uploadedBy', 'firstName lastName');

        res.json({
            success: true,
            data: {
                totalVersions,
                activeVersion: activeRules ? activeRules.version : null,
                latestVersions: latestVersions.map((rules) => ({
                    _id: rules._id,
                    version: rules.version,
                    title: rules.title,
                    uploadDate: rules.uploadDate,
                    isActive: rules.isActive,
                    uploadedBy: rules.uploadedBy,
                })),
            },
        });
    } catch (error: any) {
        console.error('❌ Erreur lors de la récupération des statistiques:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des statistiques',
        });
    }
};
