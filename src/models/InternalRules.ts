import mongoose, { Document, Schema } from 'mongoose';

// Interface pour le règlement intérieur
export interface IInternalRules extends Document {
    title: string;
    version: string;
    description?: string;
    pdfFile: string; // Nom du fichier dans MinIO
    fileSize: number; // Taille du fichier en bytes
    uploadDate: Date;
    isActive: boolean; // Un seul règlement peut être actif à la fois
    uploadedBy: mongoose.Types.ObjectId; // Référence vers l'utilisateur qui a uploadé
    createdAt: Date;
    updatedAt: Date;
}

const internalRulesSchema = new Schema<IInternalRules>(
    {
        title: {
            type: String,
            required: [true, 'Le titre est requis'],
            trim: true,
            maxlength: [200, 'Le titre ne peut pas dépasser 200 caractères'],
            default: 'Règlement Intérieur',
        },
        version: {
            type: String,
            required: [true, 'La version est requise'],
            trim: true,
            maxlength: [50, 'La version ne peut pas dépasser 50 caractères'],
        },
        description: {
            type: String,
            trim: true,
            maxlength: [500, 'La description ne peut pas dépasser 500 caractères'],
        },
        pdfFile: {
            type: String,
            required: [true, 'Le nom du fichier PDF est requis'],
        },
        fileSize: {
            type: Number,
            required: [true, 'La taille du fichier est requise'],
            min: [0, 'La taille du fichier ne peut pas être négative'],
        },
        uploadDate: {
            type: Date,
            required: [true, "La date d'upload est requise"],
            default: Date.now,
        },
        isActive: {
            type: Boolean,
            required: [true, 'Le statut actif est requis'],
            default: true,
        },
        uploadedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, "L'utilisateur qui a uploadé est requis"],
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Index pour optimiser les requêtes
internalRulesSchema.index({ isActive: 1 });
internalRulesSchema.index({ uploadDate: -1 });
internalRulesSchema.index({ version: 1 });

// Méthode virtuelle pour générer l'URL publique
internalRulesSchema.virtual('pdfUrl').get(function (this: IInternalRules) {
    // Cette URL sera générée dynamiquement dans le contrôleur
    return `/internal-rules/${this._id}/download`;
});

// Middleware pour s'assurer qu'un seul règlement est actif à la fois
internalRulesSchema.pre('save', async function (next) {
    if (this.isActive && this.isNew) {
        // Désactiver tous les autres règlements si celui-ci est défini comme actif
        await InternalRules.updateMany({ _id: { $ne: this._id } }, { $set: { isActive: false } });
    }
    next();
});

// Méthodes statiques
interface IInternalRulesModel extends mongoose.Model<IInternalRules> {
    getActiveRules(): Promise<IInternalRules | null>;
    getAllVersions(): Promise<IInternalRules[]>;
    setActiveRules(rulesId: mongoose.Types.ObjectId): Promise<void>;
}

// Méthode statique pour récupérer le règlement actif
internalRulesSchema.statics.getActiveRules = function () {
    return this.findOne({ isActive: true }).populate('uploadedBy', 'firstName lastName email');
};

// Méthode statique pour récupérer toutes les versions
internalRulesSchema.statics.getAllVersions = function () {
    return this.find({})
        .populate('uploadedBy', 'firstName lastName email')
        .sort({ uploadDate: -1 });
};

// Méthode statique pour définir un règlement comme actif
internalRulesSchema.statics.setActiveRules = async function (rulesId: mongoose.Types.ObjectId) {
    // Désactiver tous les règlements
    await this.updateMany({}, { $set: { isActive: false } });
    // Activer le règlement spécifié
    await this.updateOne({ _id: rulesId }, { $set: { isActive: true } });
};

export const InternalRules = mongoose.model<IInternalRules, IInternalRulesModel>(
    'InternalRules',
    internalRulesSchema
) as IInternalRulesModel;
