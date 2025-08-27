import { Request, Response } from 'express';
import Gallery, { IGallery } from '../models/Gallery';
import minioService from '../services/minioService';
import multer from 'multer';
import sharp from 'sharp';

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
                    const publicUrl = await minioService.getPublicUrl('gallery', image.imageFile);
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
            const publicUrl = await minioService.getPublicUrl('gallery', image.imageFile);
            imageObj.imageUrl = publicUrl;
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
