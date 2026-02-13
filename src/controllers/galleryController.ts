import { Request, Response } from 'express';
import Gallery, { IGallery } from '../models/Gallery';
import minioService from '../services/minioService';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'fs-extra';
import path from 'path';
import videoQueueService from '../services/videoQueueService';

// Interface pour les requêtes avec fichier
interface MulterRequest extends Request {
    file?: Express.Multer.File;
}

// Configuration Multer pour les images
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
    },
    fileFilter: (req, file, cb) => {
        // Vérifier le type MIME
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Seules les images sont autorisées'));
        }
    },
});

// Récupérer toutes les images de la galerie
export const getAllGalleryImages = async (req: Request, res: Response) => {
    try {
        const { page, limit, category, isActive, sortBy } = req.query;

        let query: any = {};

        // Filtre par catégorie
        if (category) {
            query.category = category;
        }

        // Filtre par statut actif
        if (isActive !== undefined) {
            query.isActive = isActive === 'true';
        }

        // Configuration du tri
        let sortOptions: any = { order: 1, createdAt: -1 }; // Tri par défaut

        if (sortBy) {
            switch (sortBy) {
                case 'recent':
                    sortOptions = { createdAt: -1 }; // Plus récent en premier
                    break;
                case 'oldest':
                    sortOptions = { createdAt: 1 }; // Plus ancien en premier
                    break;
                case 'title':
                    sortOptions = { title: 1 }; // Alphabétique par titre
                    break;
                case 'order':
                default:
                    sortOptions = { order: 1, createdAt: -1 }; // Ordre défini
                    break;
            }
        }

        let galleryQuery = Gallery.find(query).sort(sortOptions);

        // Pagination
        if (page && limit) {
            const pageNum = parseInt(page as string);
            const limitNum = parseInt(limit as string);
            const skip = (pageNum - 1) * limitNum;

            galleryQuery = galleryQuery.skip(skip).limit(limitNum);
        }

        const images = await galleryQuery.exec();

        // Ajouter les URLs publiques MinIO
        const imagesWithUrls = await Promise.all(
            images.map(async (image) => {
                const imageObj = image.toObject();
                try {
                    // Vérifier si le fichier existe avant de générer l'URL
                    const fileExists = await minioService.fileExists('gallery', image.imageFile);
                    if (!fileExists) {
                        console.warn(`Fichier non trouvé dans MinIO: ${image.imageFile}`);
                        return {
                            ...imageObj,
                            imageUrl: null,
                        };
                    }

                    const publicUrl = minioService.getPublicUrl('gallery', image.imageFile);
                    return {
                        ...imageObj,
                        imageUrl: publicUrl,
                    };
                } catch (error) {
                    console.error(
                        `Erreur lors de la génération de l'URL pour ${image.imageFile}:`,
                        error
                    );
                    return {
                        ...imageObj,
                        imageUrl: null,
                    };
                }
            })
        );

        // Compter le total pour la pagination
        const total = await Gallery.countDocuments(query);

        res.json({
            success: true,
            data: imagesWithUrls,
            total,
            message: 'Images de la galerie récupérées avec succès',
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des images:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des images',
        });
    }
};

// Récupérer une image par ID
export const getGalleryImageById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const image = await Gallery.findById(id);

        if (!image) {
            return res.status(404).json({
                success: false,
                message: 'Image non trouvée',
            });
        }

        // Ajouter l'URL publique MinIO
        const imageObj = image.toObject() as any;
        try {
            // Vérifier si le fichier existe avant de générer l'URL
            const fileExists = await minioService.fileExists('gallery', image.imageFile);
            if (!fileExists) {
                console.warn(`Fichier non trouvé dans MinIO: ${image.imageFile}`);
                imageObj.imageUrl = null;
            } else {
                const publicUrl = minioService.getPublicUrl('gallery', image.imageFile);
                imageObj.imageUrl = publicUrl;
            }
        } catch (error) {
            console.error(`Erreur lors de la génération de l'URL pour ${image.imageFile}:`, error);
            imageObj.imageUrl = null;
        }

        res.json({
            success: true,
            data: imageObj,
            message: 'Image récupérée avec succès',
        });
    } catch (error) {
        console.error("Erreur lors de la récupération de l'image:", error);
        res.status(500).json({
            success: false,
            message: "Erreur lors de la récupération de l'image",
        });
    }
};

// Upload d'une image
export const uploadImage = async (req: MulterRequest, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Aucune image fournie',
            });
        }

        const { title, description, altText, category, tags, originalImageUrl } = req.body;

        // Générer un nom de fichier unique
        const timestamp = Date.now();
        const originalName = req.file.originalname;
        const extension = originalName.split('.').pop();
        const fileName = `${originalName.replace(/\.[^/.]+$/, '')}-${timestamp}.${extension}`;

        // Upload vers MinIO
        await minioService.uploadFile('gallery', fileName, req.file.buffer, req.file.mimetype);

        // Créer l'entrée en base de données
        const galleryData: any = {
            title,
            description,
            altText,
            category,
            tags: tags ? tags.split(',').map((tag: string) => tag.trim()) : [],
            imageFile: fileName,
            originalImageUrl,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
        };

        // Obtenir les dimensions de l'image avec Sharp
        let width: number | undefined;
        let height: number | undefined;

        try {
            const metadata = await sharp(req.file.buffer).metadata();
            width = metadata.width;
            height = metadata.height;

            // Mettre à jour les dimensions dans les données
            galleryData.width = width;
            galleryData.height = height;
        } catch (error) {
            console.warn("Impossible d'analyser les dimensions de l'image:", error);
        }

        const image = new Gallery(galleryData);
        await image.save();

        // Générer l'URL publique
        const publicUrl = await minioService.getPublicUrl('gallery', fileName);

        res.status(201).json({
            success: true,
            data: {
                ...image.toObject(),
                imageUrl: publicUrl,
            },
            message: 'Image uploadée avec succès',
        });
    } catch (error) {
        console.error("Erreur lors de l'upload de l'image:", error);
        res.status(500).json({
            success: false,
            message: "Erreur lors de l'upload de l'image",
        });
    }
};

// Créer une entrée de galerie (sans upload)
export const createGalleryEntry = async (req: Request, res: Response) => {
    try {
        const galleryData = req.body;
        const image = new Gallery(galleryData);
        await image.save();

        res.status(201).json({
            success: true,
            data: image,
            message: 'Entrée de galerie créée avec succès',
        });
    } catch (error) {
        console.error("Erreur lors de la création de l'entrée:", error);
        res.status(500).json({
            success: false,
            message: "Erreur lors de la création de l'entrée",
        });
    }
};

// Mettre à jour une image
export const updateGalleryImage = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const image = await Gallery.findById(id);
        if (!image) {
            return res.status(404).json({
                success: false,
                message: 'Image non trouvée',
            });
        }

        // Si des tags sont fournis sous forme de string, les convertir en array
        if (updateData.tags && typeof updateData.tags === 'string') {
            updateData.tags = updateData.tags.split(',').map((tag: string) => tag.trim());
        }

        const updatedImage = await Gallery.findByIdAndUpdate(id, updateData, {
            new: true,
            runValidators: true,
        });

        res.json({
            success: true,
            data: updatedImage,
            message: 'Image mise à jour avec succès',
        });
    } catch (error) {
        console.error("Erreur lors de la mise à jour de l'image:", error);
        res.status(500).json({
            success: false,
            message: "Erreur lors de la mise à jour de l'image",
        });
    }
};

// Supprimer une image
export const deleteGalleryImage = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const image = await Gallery.findById(id);

        if (!image) {
            return res.status(404).json({
                success: false,
                message: 'Image non trouvée',
            });
        }

        // Supprimer le fichier de MinIO
        try {
            await minioService.deleteFile('gallery', image.imageFile);
        } catch (error) {
            console.error('Erreur lors de la suppression du fichier MinIO:', error);
            // Continuer même si la suppression du fichier échoue
        }

        // Supprimer l'entrée de la base de données
        await Gallery.findByIdAndDelete(id);

        res.json({
            success: true,
            message: 'Image supprimée avec succès',
        });
    } catch (error) {
        console.error("Erreur lors de la suppression de l'image:", error);
        res.status(500).json({
            success: false,
            message: "Erreur lors de la suppression de l'image",
        });
    }
};

// Middleware d'upload
export const uploadMiddleware = upload.single('image');

// ============================================
// CONTROLLERS VIDÉO
// ============================================

/**
 * Upload une vidéo et lance le transcoding asynchrone
 */
export const uploadVideo = async (req: MulterRequest, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Aucune vidéo fournie',
            });
        }

        const { title, description, altText, category, tags } = req.body;

        // Validation des champs requis
        if (!title) {
            // Nettoyer le fichier temporaire
            await fs.remove(req.file.path).catch(console.error);
            return res.status(400).json({
                success: false,
                message: 'Le titre est requis',
            });
        }

        console.log(`📤 Upload vidéo reçu: ${req.file.originalname} (${Math.round(req.file.size / (1024 * 1024))}MB)`);

        // Créer le document Gallery avec mediaType='video'
        const videoData: any = {
            mediaType: 'video',
            title,
            description,
            altText,
            category,
            tags: tags ? tags.split(',').map((tag: string) => tag.trim()) : [],
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            processingStatus: 'pending',
            processingProgress: 0,
            isActive: true,
        };

        const video = new Gallery(videoData);
        await video.save();

        console.log(`✅ Document vidéo créé: ${video._id}`);

        // Ajouter à la queue de transcoding de manière asynchrone
        videoQueueService
            .addToQueue(video._id.toString(), req.file.path, req.file.originalname)
            .then(() => {
                console.log(`✅ Job de transcoding ajouté pour la vidéo ${video._id}`);
            })
            .catch((error) => {
                console.error(`❌ Erreur lors de l'ajout à la queue:`, error);
                // Mettre à jour le statut en cas d'erreur
                Gallery.findByIdAndUpdate(video._id, {
                    processingStatus: 'failed',
                    processingError: 'Échec de l\'ajout à la queue de transcoding',
                }).catch(console.error);
            });

        // Répondre immédiatement avec le statut "pending"
        res.status(202).json({
            success: true,
            data: video,
            message: 'Vidéo uploadée avec succès. Le transcoding va commencer.',
        });
    } catch (error) {
        console.error('❌ Erreur lors de l\'upload de la vidéo:', error);

        // Nettoyer le fichier temporaire en cas d'erreur
        if (req.file && req.file.path) {
            await fs.remove(req.file.path).catch(console.error);
        }

        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'upload de la vidéo',
        });
    }
};

/**
 * Récupère le statut du transcoding d'une vidéo
 */
export const getVideoStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const video = await Gallery.findById(id).select(
            'mediaType processingStatus processingProgress processingError processingStartedAt processingCompletedAt variants'
        );

        if (!video) {
            return res.status(404).json({
                success: false,
                message: 'Vidéo non trouvée',
            });
        }

        if (video.mediaType !== 'video') {
            return res.status(400).json({
                success: false,
                message: 'Cette ressource n\'est pas une vidéo',
            });
        }

        // Préparer les informations sur les variantes
        const variantsInfo = video.variants?.map((v) => ({
            resolution: v.resolution,
            status: v.status,
            hlsUrl: v.hlsManifest ? minioService.getVideoUrl(v.hlsManifest) : null,
            width: v.width,
            height: v.height,
            fileSize: v.fileSize,
            bitrate: v.bitrate,
            error: v.processingError,
        }));

        // Récupérer le statut du job BullMQ
        const jobStatus = await videoQueueService.getJobStatus(id);

        res.json({
            success: true,
            data: {
                videoId: video._id,
                status: video.processingStatus,
                progress: video.processingProgress,
                error: video.processingError,
                startedAt: video.processingStartedAt,
                completedAt: video.processingCompletedAt,
                variants: variantsInfo,
                jobStatus,
            },
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération du statut vidéo:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération du statut vidéo',
        });
    }
};

/**
 * Réessaie le transcoding d'une vidéo échouée
 */
export const retryVideoTranscoding = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const video = await Gallery.findById(id);

        if (!video) {
            return res.status(404).json({
                success: false,
                message: 'Vidéo non trouvée',
            });
        }

        if (video.mediaType !== 'video') {
            return res.status(400).json({
                success: false,
                message: 'Cette ressource n\'est pas une vidéo',
            });
        }

        if (video.processingStatus !== 'failed' && video.processingStatus !== 'partial') {
            return res.status(400).json({
                success: false,
                message: `Impossible de réessayer: statut actuel = ${video.processingStatus}`,
            });
        }

        // Vérifier si le fichier original existe
        if (!video.videoFile) {
            return res.status(400).json({
                success: false,
                message: 'Fichier vidéo original non trouvé',
            });
        }

        console.log(`🔄 Retry du transcoding pour la vidéo ${id}`);

        // Télécharger le fichier original depuis MinIO vers un fichier temporaire
        const tempDir = path.join(process.cwd(), 'temp-uploads', `retry-${Date.now()}`);
        await fs.ensureDir(tempDir);

        const extension = path.extname(video.videoFile) || '.mp4';
        const tempFilePath = path.join(tempDir, `retry-${id}${extension}`);

        const downloadSuccess = await minioService.downloadVideoFile(video.videoFile, tempFilePath);

        if (!downloadSuccess) {
            await fs.remove(tempDir);
            return res.status(500).json({
                success: false,
                message: 'Impossible de télécharger le fichier original depuis MinIO',
            });
        }

        // Lancer le retry du transcoding
        const job = await videoQueueService.retryJob(id, tempFilePath, video.title || 'Vidéo sans titre');

        if (!job) {
            await fs.remove(tempDir);
            return res.status(500).json({
                success: false,
                message: 'Erreur lors de la création du job de retry',
            });
        }

        // Nettoyer le fichier temporaire après un délai (le worker aura eu le temps de le lire)
        setTimeout(async () => {
            try {
                await fs.remove(tempDir);
                console.log(`🧹 Fichier temporaire de retry nettoyé: ${tempDir}`);
            } catch (error) {
                console.error(`❌ Erreur lors du nettoyage du fichier temporaire:`, error);
            }
        }, 60000); // 60 secondes

        res.json({
            success: true,
            message: 'Retry du transcoding lancé avec succès',
            data: {
                jobId: job.id,
                videoId: id,
            },
        });

    } catch (error) {
        console.error('❌ Erreur lors du retry du transcoding:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors du retry du transcoding',
        });
    }
};

/**
 * Récupère toutes les ressources (images + vidéos) de la galerie
 * Mise à jour pour supporter les deux types
 */
export const getAllMediaItems = async (req: Request, res: Response) => {
    try {
        const { page, limit, category, isActive, sortBy, mediaType } = req.query;

        let query: any = {};

        // Filtre par type de média
        if (mediaType && (mediaType === 'image' || mediaType === 'video')) {
            query.mediaType = mediaType;
        }

        // Filtre par catégorie
        if (category) {
            query.category = category;
        }

        // Filtre par statut actif
        if (isActive !== undefined) {
            query.isActive = isActive === 'true';
        }

        // Configuration du tri
        let sortOptions: any = { order: 1, createdAt: -1 };

        if (sortBy) {
            switch (sortBy) {
                case 'recent':
                    sortOptions = { createdAt: -1 };
                    break;
                case 'oldest':
                    sortOptions = { createdAt: 1 };
                    break;
                case 'title':
                    sortOptions = { title: 1 };
                    break;
                case 'order':
                default:
                    sortOptions = { order: 1, createdAt: -1 };
                    break;
            }
        }

        let galleryQuery = Gallery.find(query).sort(sortOptions);

        // Pagination
        if (page && limit) {
            const pageNum = parseInt(page as string);
            const limitNum = parseInt(limit as string);
            const skip = (pageNum - 1) * limitNum;

            galleryQuery = galleryQuery.skip(skip).limit(limitNum);
        }

        const items = await galleryQuery.exec();

        // Ajouter les URLs publiques pour images et vidéos
        const itemsWithUrls = await Promise.all(
            items.map(async (item) => {
                const itemObj = item.toObject() as any;

                try {
                    if (item.mediaType === 'image') {
                        // Traitement des images
                        const fileExists = await minioService.fileExists('gallery', item.imageFile);
                        if (fileExists) {
                            itemObj.imageUrl = minioService.getPublicUrl('gallery', item.imageFile);
                        } else {
                            itemObj.imageUrl = null;
                        }
                    } else if (item.mediaType === 'video') {
                        // Traitement des vidéos
                        if (item.videoFile) {
                            itemObj.videoUrl = minioService.getVideoUrl(item.videoFile);
                        }
                        if (item.thumbnailFile) {
                            itemObj.thumbnailUrl = minioService.getVideoUrl(item.thumbnailFile);
                        }
                        // Ajouter les URLs des variantes HLS
                        if (item.variants && item.variants.length > 0) {
                            itemObj.variants = item.variants.map((v: any) => ({
                                ...v.toObject?.() || v,
                                hlsUrl: v.hlsManifest ? minioService.getVideoUrl(v.hlsManifest) : null,
                            }));
                        }
                    }

                    return itemObj;
                } catch (error) {
                    console.error(`Erreur lors de la génération des URLs pour ${item._id}:`, error);
                    return itemObj;
                }
            })
        );

        // Compter le total pour la pagination
        const total = await Gallery.countDocuments(query);

        res.json({
            success: true,
            data: itemsWithUrls,
            total,
            message: 'Médias de la galerie récupérés avec succès',
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des médias:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des médias',
        });
    }
};
