import mongoose, { Document, Schema } from 'mongoose';

export interface IEvent extends Document {
    title: string;
    description?: string;
    type: 'Cours' | 'Événement' | 'Compétition' | 'Stage' | 'Autre';
    level?: 'Débutant' | 'Novice' | 'Intermédiaire' | 'Avancé' | 'Tous niveaux';
    instructor?: string;
    location?: string;
    start: Date;
    end: Date;
    recurrence: 'Aucune' | 'Hebdomadaire' | 'Toutes les 2 semaines' | 'Mensuelle';
    maxParticipants?: number;
    price?: number;
    isPublic: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const eventSchema = new Schema<IEvent>(
    {
        title: {
            type: String,
            required: [true, "Le titre de l'événement est requis"],
            trim: true,
            maxlength: [100, 'Le titre ne peut pas dépasser 100 caractères'],
        },
        description: {
            type: String,
            trim: true,
            maxlength: [500, 'La description ne peut pas dépasser 500 caractères'],
        },
        type: {
            type: String,
            required: [true, "Le type d'événement est requis"],
            enum: {
                values: ['Cours', 'Événement', 'Compétition', 'Stage', 'Autre'],
                message: 'Le type doit être Cours, Événement, Compétition, Stage ou Autre',
            },
            default: 'Cours',
        },
        level: {
            type: String,
            enum: {
                values: ['Débutant', 'Novice', 'Intermédiaire', 'Avancé', 'Tous niveaux'],
                message:
                    'Le niveau doit être Débutant, Novice, Intermédiaire, Avancé ou Tous niveaux',
            },
        },
        instructor: {
            type: String,
            trim: true,
            maxlength: [50, "Le nom de l'instructeur ne peut pas dépasser 50 caractères"],
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
        maxParticipants: {
            type: Number,
            min: [1, 'Le nombre maximum de participants doit être au moins 1'],
            max: [1000, 'Le nombre maximum de participants ne peut pas dépasser 1000'],
        },
        price: {
            type: Number,
            min: [0, 'Le prix ne peut pas être négatif'],
        },
        isPublic: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Index pour optimiser les requêtes
eventSchema.index({ start: 1 });
eventSchema.index({ type: 1 });
eventSchema.index({ level: 1 });
eventSchema.index({ instructor: 1 });
eventSchema.index({ location: 1 });
eventSchema.index({ isPublic: 1 });

// Validation personnalisée pour s'assurer que end > start
eventSchema.pre('save', function (next) {
    if (this.end <= this.start) {
        const error = new Error('La date de fin doit être postérieure à la date de début');
        return next(error);
    }
    next();
});

eventSchema.pre('findOneAndUpdate', function (next) {
    const update = this.getUpdate() as any;
    if (update && update.start && update.end && update.end <= update.start) {
        const error = new Error('La date de fin doit être postérieure à la date de début');
        return next(error);
    }
    next();
});

// Méthode virtuelle pour calculer la durée
eventSchema.virtual('duration').get(function (this: IEvent) {
    if (!this.end || !this.start) return null;
    return Math.round((this.end.getTime() - this.start.getTime()) / (1000 * 60));
});

// Interface pour les méthodes statiques
interface IEventModel extends mongoose.Model<IEvent> {
    findByDate(date: Date): Promise<IEvent[]>;
    findUpcoming(limit?: number): Promise<IEvent[]>;
    findByType(type: string): Promise<IEvent[]>;
}

// Méthode statique pour récupérer les événements d'une date spécifique
eventSchema.statics.findByDate = function (date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.find({
        start: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ start: 1 });
};

// Méthode statique pour récupérer les événements à venir
eventSchema.statics.findUpcoming = function (limit = 20) {
    const now = new Date();
    return this.find({
        end: { $gte: now },
    })
        .sort({ start: 1 })
        .limit(limit);
};

// Méthode statique pour récupérer les événements par type
eventSchema.statics.findByType = function (type: string) {
    return this.find({ type }).sort({ start: 1 });
};

export const Event = mongoose.model<IEvent, IEventModel>('Event', eventSchema) as IEventModel;
