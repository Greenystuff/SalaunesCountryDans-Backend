import mongoose, { Document, Schema } from 'mongoose';

export interface IGallery extends Document {
    title: string;
    description?: string;
    altText?: string;
    category?: string;
    tags?: string[];
    imageFile: string; // Référence vers le fichier image dans MinIO
    originalImageUrl?: string; // URL originale si importée depuis une source externe
    width?: number;
    height?: number;
    fileSize?: number;
    mimeType?: string;
    isActive: boolean;
    order: number; // Pour l'ordre d'affichage
    createdAt: Date;
    updatedAt: Date;
}

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
        imageFile: {
            type: String,
            required: true,
        },
        originalImageUrl: {
            type: String,
            trim: true,
        },
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
GallerySchema.index({ isActive: 1, order: 1 });
GallerySchema.index({ category: 1 });
GallerySchema.index({ tags: 1 });

export default mongoose.model<IGallery>('Gallery', GallerySchema);
