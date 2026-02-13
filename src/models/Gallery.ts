import mongoose, { Document, Schema } from 'mongoose';

// Types pour les variantes vidéo
export interface IVideoVariant {
    resolution: '480p' | '720p' | '1080p';
    fileName: string;
    width: number;
    height: number;
    fileSize: number;
    bitrate: number; // kbps
    hlsManifest?: string;
    hlsSegments?: string[];
    status: 'pending' | 'processing' | 'completed' | 'failed';
    processingError?: string;
}

export interface IGallery extends Document {
    title: string;
    description?: string;
    altText?: string;
    category?: string;
    tags?: string[];

    // Discriminateur de type média
    mediaType: 'image' | 'video';

    // Champs images (conservés pour rétrocompatibilité)
    imageFile?: string; // Référence vers le fichier image dans MinIO
    originalImageUrl?: string; // URL originale si importée depuis une source externe

    // Champs communs
    width?: number;
    height?: number;
    fileSize?: number;
    mimeType?: string;

    // Champs vidéo
    videoFile?: string; // Fichier original dans MinIO
    duration?: number; // Durée en secondes
    thumbnailFile?: string; // Thumbnail auto-généré

    // Transcoding
    processingStatus?: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
    processingProgress?: number; // 0-100
    processingError?: string;
    processingStartedAt?: Date;
    processingCompletedAt?: Date;

    // Variantes transcodées
    variants?: IVideoVariant[];

    isActive: boolean;
    order: number; // Pour l'ordre d'affichage
    createdAt: Date;
    updatedAt: Date;
}

// Schéma pour les variantes vidéo
const VideoVariantSchema = new Schema<IVideoVariant>(
    {
        resolution: {
            type: String,
            enum: ['480p', '720p', '1080p'],
            required: true,
        },
        fileName: {
            type: String,
            required: true,
        },
        width: {
            type: Number,
            required: true,
        },
        height: {
            type: Number,
            required: true,
        },
        fileSize: {
            type: Number,
            required: true,
        },
        bitrate: {
            type: Number,
            required: true,
        },
        hlsManifest: String,
        hlsSegments: [String],
        status: {
            type: String,
            enum: ['pending', 'processing', 'completed', 'failed'],
            default: 'pending',
        },
        processingError: String,
    },
    { _id: false }
);

const GallerySchema = new Schema<IGallery>(
    {
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },
        description: {
            type: String,
            trim: true,
            maxlength: 1000,
        },
        altText: {
            type: String,
            trim: true,
            maxlength: 200,
        },
        category: {
            type: String,
            trim: true,
            maxlength: 100,
        },
        tags: [
            {
                type: String,
                trim: true,
                maxlength: 50,
            },
        ],
        // Discriminateur de type média (défaut: image pour rétrocompatibilité)
        mediaType: {
            type: String,
            enum: ['image', 'video'],
            default: 'image',
        },
        // Champs images (imageFile optionnel maintenant)
        imageFile: {
            type: String,
            required: function(this: IGallery) {
                return this.mediaType === 'image';
            },
        },
        originalImageUrl: {
            type: String,
            trim: true,
        },
        // Champs communs
        width: {
            type: Number,
            min: 1,
        },
        height: {
            type: Number,
            min: 1,
        },
        fileSize: {
            type: Number,
            min: 0,
        },
        mimeType: {
            type: String,
            trim: true,
        },
        // Champs vidéo
        videoFile: String,
        duration: Number,
        thumbnailFile: String,
        // Transcoding
        processingStatus: {
            type: String,
            enum: ['pending', 'processing', 'completed', 'failed', 'partial'],
        },
        processingProgress: {
            type: Number,
            min: 0,
            max: 100,
        },
        processingError: String,
        processingStartedAt: Date,
        processingCompletedAt: Date,
        // Variantes
        variants: [VideoVariantSchema],
        isActive: {
            type: Boolean,
            default: true,
        },
        order: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
        collection: 'gallery',
    }
);

// Index pour améliorer les performances
GallerySchema.index({ mediaType: 1, isActive: 1, order: 1 });
GallerySchema.index({ category: 1 });
GallerySchema.index({ tags: 1 });
GallerySchema.index({ processingStatus: 1 }); // Pour les requêtes de transcoding

export default mongoose.model<IGallery>('Gallery', GallerySchema);
