import mongoose, { Document, Schema } from 'mongoose';

export interface ICourse extends Document {
    title: string;
    description?: string;
    level: 'Débutant' | 'Novice' | 'Intermédiaire';
    teacher?: string;
    location?: string;
    start: Date;
    end: Date;
    recurrence: 'Aucune' | 'Hebdomadaire' | 'Toutes les 2 semaines' | 'Mensuelle';
    createdAt: Date;
    updatedAt: Date;
}

const courseSchema = new Schema<ICourse>(
    {
        title: {
            type: String,
            required: [true, 'Le titre du cours est requis'],
            trim: true,
            maxlength: [100, 'Le titre ne peut pas dépasser 100 caractères'],
        },
        description: {
            type: String,
            trim: true,
            maxlength: [500, 'La description ne peut pas dépasser 500 caractères'],
        },
        level: {
            type: String,
            required: [true, 'Le niveau est requis'],
            enum: {
                values: ['Débutant', 'Novice', 'Intermédiaire'],
                message: 'Le niveau doit être Débutant, Novice ou Intermédiaire',
            },
        },
        teacher: {
            type: String,
            trim: true,
            maxlength: [50, "Le nom de l'animateur ne peut pas dépasser 50 caractères"],
        },
        location: {
            type: String,
            trim: true,
            maxlength: [100, 'Le lieu ne peut pas dépasser 100 caractères'],
        },
        start: {
            type: Date,
            required: [true, 'La date et heure de début sont requises'],
        },
        end: {
            type: Date,
            required: [true, 'La date et heure de fin sont requises'],
            validate: {
                validator: function (this: ICourse, end: Date) {
                    return end > this.start;
                },
                message: 'La date de fin doit être postérieure à la date de début',
            },
        },
        recurrence: {
            type: String,
            required: [true, 'La récurrence est requise'],
            enum: {
                values: ['Aucune', 'Hebdomadaire', 'Toutes les 2 semaines', 'Mensuelle'],
                message:
                    'La récurrence doit être Aucune, Hebdomadaire, Toutes les 2 semaines ou Mensuelle',
            },
            default: 'Aucune',
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Index pour optimiser les requêtes
courseSchema.index({ start: 1 });
courseSchema.index({ level: 1 });
courseSchema.index({ teacher: 1 });
courseSchema.index({ location: 1 });

// Méthode virtuelle pour calculer la durée
courseSchema.virtual('duration').get(function (this: ICourse) {
    return Math.round((this.end.getTime() - this.start.getTime()) / (1000 * 60));
});

// Interface pour les méthodes statiques
interface ICourseModel extends mongoose.Model<ICourse> {
    findByDate(date: Date): Promise<ICourse[]>;
    findUpcoming(limit?: number): Promise<ICourse[]>;
}

// Méthode statique pour récupérer les cours d'une date
courseSchema.statics.findByDate = function (date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.find({
        start: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ start: 1 });
};

// Méthode statique pour récupérer les cours à venir
courseSchema.statics.findUpcoming = function (limit = 20) {
    const now = new Date();
    return this.find({
        end: { $gte: now },
    })
        .sort({ start: 1 })
        .limit(limit);
};

export const Course = mongoose.model<ICourse, ICourseModel>('Course', courseSchema);
