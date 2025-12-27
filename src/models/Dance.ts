import mongoose, { Document, Schema } from 'mongoose';

export interface IDance extends Document {
    name: string;
    level: 'Débutant' | 'Novice' | 'Intermédiaire';
    date: string; // Date au format ISO (YYYY-MM-DD)
    dateDisplay?: string; // Date d'affichage en français (ex: "10 juin 2025")
    youtubeLink1: string;
    youtubeLink2: string;
    pdfLink: string; // URL originale
    pdfFile?: string; // Référence vers le fichier PDF dans MinIO
    createdAt: Date;
    updatedAt: Date;
}

const DanceSchema = new Schema<IDance>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        level: {
            type: String,
            enum: ['Débutant', 'Intermédiaire', 'Novice'],
            required: true,
            index: true,
        },
        date: {
            type: String,
            required: true,
            index: true,
            validate: {
                validator: function (v: string) {
                    // Valider que la date est au format ISO (YYYY-MM-DD)
                    return /^\d{4}-\d{2}-\d{2}$/.test(v);
                },
                message: (props: any) =>
                    `${props.value} doit être au format ISO (YYYY-MM-DD) pour permettre le tri correct`,
            },
        },
        dateDisplay: {
            type: String,
            default: null,
        },
        youtubeLink1: {
            type: String,
            default: '',
        },
        youtubeLink2: {
            type: String,
            default: '',
        },
        pdfLink: {
            type: String,
            default: '',
        },
        pdfFile: {
            type: String, // Nom du fichier dans MinIO
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'dances',
    }
);

// Middleware pour automatiquement définir dateDisplay quand date est modifiée
DanceSchema.pre('save', function (next) {
    if (this.isModified('date') && this.date) {
        // Vérifier que la date est au format ISO
        if (!/^\d{4}-\d{2}-\d{2}$/.test(this.date)) {
            return next(
                new Error(
                    `La date doit être au format ISO (YYYY-MM-DD), reçu: ${this.date}. ` +
                        `Utilisez parseFrenchDate() pour convertir une date française.`
                )
            );
        }

        // Si dateDisplay n'est pas défini, le créer à partir de la date
        if (!this.dateDisplay) {
            const dateObj = new Date(this.date);
            if (!isNaN(dateObj.getTime())) {
                this.dateDisplay = dateObj.toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                });
            }
        }
    }
    next();
});

// Index composés pour les recherches fréquentes
DanceSchema.index({ name: 'text' }); // Index de texte pour la recherche

// Méthodes statiques
DanceSchema.statics.findByLevel = function (level: string) {
    return this.find({ level }).sort({ date: -1 });
};

DanceSchema.statics.searchByName = function (searchTerm: string) {
    return this.find({
        name: { $regex: searchTerm, $options: 'i' },
    }).sort({ name: 1 });
};

// Méthodes d'instance
DanceSchema.methods.hasPdf = function (): boolean {
    return !!(this.pdfFile || this.pdfLink);
};

DanceSchema.methods.hasYoutubeVideos = function (): boolean {
    return !!(this.youtubeLink1 || this.youtubeLink2);
};

export default mongoose.model<IDance>('Dance', DanceSchema);
