import { Request, Response } from 'express';
import Dance, { IDance } from '../models/Dance';
import minioService from '../services/minioService';
import multer from 'multer';

// Étendre le type Request pour inclure le fichier uploadé
interface MulterRequest extends Request {
    file?: Express.Multer.File;
}

/**
 * Parse une date française en date ISO
 * Ex: "10 juin 2025" -> "2025-06-10"
 */
const parseFrenchDate = (dateStr: string): string => {
    const months: { [key: string]: number } = {
        janvier: 1,
        février: 2,
        mars: 3,
        avril: 4,
        mai: 5,
        juin: 6,
        juillet: 7,
        août: 8,
        septembre: 9,
        octobre: 10,
        novembre: 11,
        décembre: 12,
    };

    // Regex pour capturer "jour mois année"
    const match = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (match) {
        const [, day, monthName, year] = match;
        const month = months[monthName.toLowerCase()];
        if (month) {
            return `${year}-${month.toString().padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
    }

    // Si on ne peut pas parser, retourner la date originale
    return dateStr;
};

// Configuration multer pour l'upload de fichiers
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB max
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Seuls les fichiers PDF sont autorisés'));
        }
    },
});

export const uploadPdf = async (req: MulterRequest, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Aucun fichier PDF fourni',
            });
        }

        const { danceName } = req.body;
        const file = req.file;

        // Générer un nom de fichier unique
        const timestamp = Date.now();
        const fileName = `dances/${danceName
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')}-${timestamp}.pdf`;

        // Upload vers MinIO
        const success = await minioService.uploadFile('pdfs', fileName, file.buffer, file.mimetype);

        if (success) {
            res.json({
                success: true,
                fileName: fileName,
                message: 'PDF uploadé avec succès',
            });
        } else {
            res.status(500).json({
                success: false,
                message: "Erreur lors de l'upload vers MinIO",
            });
        }
    } catch (error) {
        console.error("❌ Erreur lors de l'upload du PDF:", error);
        res.status(500).json({
            success: false,
            message: "Erreur lors de l'upload du PDF",
        });
    }
};

// Middleware pour l'upload
export const uploadMiddleware = upload.single('pdf');

export const getAllDances = async (req: Request, res: Response) => {
    try {
        const {
            page,
            limit,
            level,
            style,
            search,
            sortBy = 'date',
            sortOrder = 'desc',
        } = req.query;

        // Construire le filtre
        const filter: any = {};

        if (level) filter.level = level;
        if (style) filter.style = style;
        if (search) {
            filter.name = { $regex: search as string, $options: 'i' };
        }

        // Construire le tri
        const sort: any = {};
        sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

        // Récupérer les danses
        let dances;
        let total;

        if (page && limit) {
            // Pagination si demandée explicitement
            const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
            dances = await Dance.find(filter)
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit as string))
                .lean();
            total = await Dance.countDocuments(filter);
        } else {
            // Récupérer toutes les danses si pas de pagination
            dances = await Dance.find(filter).sort(sort).lean();
            total = dances.length;
        }

        // Générer les URLs des PDFs pour chaque danse
        const dancesWithUrls = await Promise.all(
            dances.map(async (dance) => {
                const danceObj: any = dance.toObject ? dance.toObject() : dance;

                // Utiliser dateDisplay si disponible, sinon formater la date ISO
                if (danceObj.dateDisplay) {
                    danceObj.date = danceObj.dateDisplay;
                } else if (danceObj.date) {
                    // Formater la date ISO en français
                    const dateObj = new Date(danceObj.date);
                    if (!isNaN(dateObj.getTime())) {
                        danceObj.date = dateObj.toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                        });
                    }
                }

                if (danceObj.pdfFile) {
                    try {
                        // Utiliser l'URL publique au lieu de l'URL signée
                        danceObj.pdfUrl = minioService.getPublicUrl('pdfs', danceObj.pdfFile);
                    } catch (error) {
                        console.error(
                            `❌ Erreur lors de la génération de l'URL pour ${danceObj.pdfFile}:`,
                            error
                        );
                        danceObj.pdfUrl = null;
                    }
                } else {
                    danceObj.pdfUrl = null;
                }
                return danceObj;
            })
        );

        const response: any = {
            success: true,
            data: dancesWithUrls,
        };

        // Ajouter la pagination seulement si elle était demandée
        if (page && limit) {
            response.pagination = {
                page: parseInt(page as string),
                limit: parseInt(limit as string),
                total,
                pages: Math.ceil(total / parseInt(limit as string)),
            };
        } else {
            response.total = total;
        }

        res.json(response);
    } catch (error) {
        console.error('Erreur lors de la récupération des danses:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des danses',
        });
    }
};

export const getDanceById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const dance: any = await Dance.findById(id).lean();

        if (!dance) {
            return res.status(404).json({
                success: false,
                message: 'Danse non trouvée',
            });
        }

        // Utiliser dateDisplay si disponible
        if (dance.dateDisplay) {
            dance.date = dance.dateDisplay;
        }

        if (dance.pdfFile) {
            try {
                // Utiliser l'URL publique au lieu de l'URL signée
                dance.pdfUrl = minioService.getPublicUrl('pdfs', dance.pdfFile);
            } catch (error) {
                console.error(
                    `❌ Erreur lors de la génération de l'URL pour ${dance.pdfFile}:`,
                    error
                );
                dance.pdfUrl = null;
            }
        } else {
            dance.pdfUrl = null;
        }

        res.json({
            success: true,
            data: dance,
        });
    } catch (error) {
        console.error('Erreur lors de la récupération de la danse:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération de la danse',
        });
    }
};

export const createDance = async (req: Request, res: Response) => {
    try {
        const danceData = req.body;

        // Parser la date française en date ISO
        if (danceData.date) {
            const originalDate = danceData.date; // Garder la date française originale
            danceData.date = parseFrenchDate(danceData.date);
            danceData.dateDisplay = originalDate; // Garder la date française pour l'affichage
        }

        // Si un PDF est fourni via URL, le télécharger
        if (danceData.pdfLink) {
            const pdfFileName = await minioService.downloadAndUploadPdf(
                danceData.pdfLink,
                danceData.name
            );

            if (pdfFileName) {
                danceData.pdfFile = pdfFileName;
            }
        }

        const dance = new Dance(danceData);
        await dance.save();

        res.status(201).json({
            success: true,
            data: dance,
            message: 'Danse créée avec succès',
        });
    } catch (error) {
        console.error('Erreur lors de la création de la danse:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la création de la danse',
        });
    }
};

export const updateDance = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const dance = await Dance.findById(id);

        if (!dance) {
            return res.status(404).json({
                success: false,
                message: 'Danse non trouvée',
            });
        }

        // Parser la date française en date ISO
        if (updateData.date) {
            const originalDate = updateData.date; // Garder la date française originale
            updateData.date = parseFrenchDate(updateData.date);
            updateData.dateDisplay = originalDate; // Garder la date française pour l'affichage
        }

        // Si un nouveau PDF est fourni, le télécharger
        if (updateData.pdfLink && updateData.pdfLink !== dance.pdfLink) {
            console.log(`📥 Téléchargement du nouveau PDF pour: ${dance.name}`);

            // Supprimer l'ancien fichier si il existe
            if (dance.pdfFile) {
                await minioService.deleteFile('pdfs', dance.pdfFile);
            }

            const pdfFileName = await minioService.downloadAndUploadPdf(
                updateData.pdfLink,
                dance.name
            );

            if (pdfFileName) {
                updateData.pdfFile = pdfFileName;
                console.log(`✅ Nouveau PDF téléchargé: ${pdfFileName}`);
            }
        }

        const updatedDance = await Dance.findByIdAndUpdate(id, updateData, {
            new: true,
            runValidators: true,
        });

        res.json({
            success: true,
            data: updatedDance,
            message: 'Danse mise à jour avec succès',
        });
    } catch (error) {
        console.error('Erreur lors de la mise à jour de la danse:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise à jour de la danse',
        });
    }
};

export const deleteDance = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const dance = await Dance.findById(id);

        if (!dance) {
            return res.status(404).json({
                success: false,
                message: 'Danse non trouvée',
            });
        }

        // Supprimer le fichier PDF associé
        if (dance.pdfFile) {
            await minioService.deleteFile('pdfs', dance.pdfFile);
        }

        await Dance.findByIdAndDelete(id);

        res.json({
            success: true,
            message: 'Danse supprimée avec succès',
        });
    } catch (error) {
        console.error('Erreur lors de la suppression de la danse:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la suppression de la danse',
        });
    }
};

export const getDanceStats = async (req: Request, res: Response) => {
    try {
        const totalDances = await Dance.countDocuments();
        const dancesWithPdf = await Dance.countDocuments({ pdfFile: { $exists: true, $ne: null } });
        const dancesWithYoutube = await Dance.countDocuments({
            $or: [{ youtubeLink1: { $ne: '' } }, { youtubeLink2: { $ne: '' } }],
        });

        const levelStats = await Dance.aggregate([
            { $group: { _id: '$level', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]);

        const styleStats = await Dance.aggregate([
            { $group: { _id: '$style', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]);

        res.json({
            success: true,
            data: {
                total: totalDances,
                withPdf: dancesWithPdf,
                withYoutube: dancesWithYoutube,
                levels: levelStats,
                styles: styleStats,
            },
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des statistiques:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des statistiques',
        });
    }
};

export const downloadPdf = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const dance = await Dance.findById(id);

        if (!dance) {
            return res.status(404).json({
                success: false,
                message: 'Danse non trouvée',
            });
        }

        if (!dance.pdfFile) {
            return res.status(404).json({
                success: false,
                message: 'Aucun PDF disponible pour cette danse',
            });
        }

        // Générer une URL de téléchargement temporaire
        const downloadUrl = await minioService.getPresignedUrl(dance.pdfFile, 3600);

        res.json({
            success: true,
            data: {
                downloadUrl,
                fileName: dance.pdfFile,
                danceName: dance.name,
            },
        });
    } catch (error) {
        console.error('Erreur lors de la génération du lien de téléchargement:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la génération du lien de téléchargement',
        });
    }
};
