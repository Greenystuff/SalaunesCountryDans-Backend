import mongoose, { Document, Schema } from 'mongoose';

// Interface pour les chèques déposés
interface ICheckDeposit {
    amount: number;
    depositDate: Date;
}

// Interface pour le membre
export interface IMember extends Document {
    firstName: string;
    lastName: string;
    birthDate: Date;
    address: string;
    postalCode: string;
    city: string;
    homePhone?: string;
    mobilePhone?: string;
    email: string;
    imageRights: boolean;
    enrolledCourses: mongoose.Types.ObjectId[];
    status: 'pré-inscrit' | 'inscrit' | 'actif' | 'inactif';

    // Date d'essai prévue (pour les pré-inscrits)
    intendedTrialDate?: Date;

    // Champs remplis par l'admin
    registrationDate?: Date;
    annualFeePaymentMethod?: 'chèque' | 'Espèce';
    membershipPaymentMethod?: 'chèque' | 'Espèce';
    checkDeposits?: ICheckDeposit[];

    createdAt: Date;
    updatedAt: Date;

    // Méthodes d'instance
    enrollInCourse(courseId: mongoose.Types.ObjectId): Promise<IMember>;
    unenrollFromCourse(courseId: mongoose.Types.ObjectId): Promise<IMember>;
    addCheckDeposit(amount: number, depositDate: Date): Promise<IMember>;
}

const checkDepositSchema = new Schema<ICheckDeposit>(
    {
        amount: {
            type: Number,
            required: [true, 'Le montant du chèque est requis'],
            min: [0, 'Le montant ne peut pas être négatif'],
        },
        depositDate: {
            type: Date,
            required: [true, 'La date de dépôt est requise'],
        },
    },
    { _id: false }
);

const memberSchema = new Schema<IMember>(
    {
        firstName: {
            type: String,
            required: [true, 'Le prénom est requis'],
            trim: true,
            maxlength: [50, 'Le prénom ne peut pas dépasser 50 caractères'],
        },
        lastName: {
            type: String,
            required: [true, 'Le nom est requis'],
            trim: true,
            maxlength: [50, 'Le nom ne peut pas dépasser 50 caractères'],
        },
        birthDate: {
            type: Date,
            required: [true, 'La date de naissance est requise'],
            validate: {
                validator: function (birthDate: Date) {
                    const today = new Date();
                    const age = today.getFullYear() - birthDate.getFullYear();
                    const monthDiff = today.getMonth() - birthDate.getMonth();

                    if (
                        monthDiff < 0 ||
                        (monthDiff === 0 && today.getDate() < birthDate.getDate())
                    ) {
                        return age - 1 >= 0;
                    }
                    return age >= 0;
                },
                message: 'La date de naissance ne peut pas être dans le futur',
            },
        },
        address: {
            type: String,
            required: [true, "L'adresse est requise"],
            trim: true,
            maxlength: [200, "L'adresse ne peut pas dépasser 200 caractères"],
        },
        postalCode: {
            type: String,
            required: [true, 'Le code postal est requis'],
            trim: true,
            match: [/^\d{5}$/, 'Le code postal doit contenir exactement 5 chiffres'],
        },
        city: {
            type: String,
            required: [true, 'La ville est requise'],
            trim: true,
            maxlength: [100, 'La ville ne peut pas dépasser 100 caractères'],
        },
        homePhone: {
            type: String,
            trim: true,
            match: [/^(\+33|0)[1-9](\d{8})$/, 'Format de téléphone invalide'],
        },
        mobilePhone: {
            type: String,
            trim: true,
            match: [/^(\+33|0)[6-7](\d{8})$/, 'Format de téléphone mobile invalide'],
        },
        email: {
            type: String,
            required: [true, "L'email est requis"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Format d'email invalide"],
        },
        imageRights: {
            type: Boolean,
            required: [true, "Le droit à l'image est requis"],
            default: false,
        },
        enrolledCourses: [
            {
                type: Schema.Types.ObjectId,
                ref: 'Course',
            },
        ],
        status: {
            type: String,
            required: [true, 'Le statut est requis'],
            enum: {
                values: ['pré-inscrit', 'inscrit', 'actif', 'inactif'],
                message: 'Le statut doit être pré-inscrit, inscrit, actif ou inactif',
            },
            default: 'pré-inscrit',
        },

        // Champs remplis par l'admin
        registrationDate: {
            type: Date,
            validate: {
                validator: function (this: IMember, registrationDate: Date) {
                    if (!registrationDate) return true; // Nullable
                    return registrationDate <= new Date();
                },
                message: "La date d'inscription ne peut pas être dans le futur",
            },
        },
        annualFeePaymentMethod: {
            type: String,
            enum: {
                values: ['chèque', 'Espèce'],
                message: 'Le moyen de paiement doit être "chèque" ou "Espèce"',
            },
        },
        membershipPaymentMethod: {
            type: String,
            enum: {
                values: ['chèque', 'Espèce'],
                message: 'Le moyen de paiement doit être "chèque" ou "Espèce"',
            },
        },
        intendedTrialDate: {
            type: Date,
            validate: {
                validator: function (this: IMember, trialDate: Date) {
                    if (!trialDate) return true; // Nullable
                    return trialDate >= new Date(); // Doit être dans le futur
                },
                message: "La date d'essai prévue doit être dans le futur",
            },
        },
        checkDeposits: [checkDepositSchema],
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Validation personnalisée pour s'assurer qu'au moins un téléphone est fourni
memberSchema.pre('validate', function (next) {
    if (!this.homePhone && !this.mobilePhone) {
        this.invalidate(
            'homePhone',
            'Au moins un numéro de téléphone (domicile ou portable) doit être fourni'
        );
    }
    next();
});

// Index pour optimiser les requêtes
memberSchema.index({ email: 1 });
memberSchema.index({ lastName: 1, firstName: 1 });
memberSchema.index({ city: 1 });
memberSchema.index({ postalCode: 1 });
memberSchema.index({ enrolledCourses: 1 });

// Méthode virtuelle pour calculer l'âge
memberSchema.virtual('age').get(function (this: IMember) {
    const today = new Date();
    const birthDate = this.birthDate;
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
});

// Méthode virtuelle pour le nom complet
memberSchema.virtual('fullName').get(function (this: IMember) {
    return `${this.firstName} ${this.lastName}`;
});

// Méthode virtuelle pour le téléphone principal
memberSchema.virtual('primaryPhone').get(function (this: IMember) {
    return this.mobilePhone || this.homePhone;
});

// Méthode pour ajouter un cours
memberSchema.methods.enrollInCourse = function (courseId: mongoose.Types.ObjectId) {
    if (!this.enrolledCourses.includes(courseId)) {
        this.enrolledCourses.push(courseId);
    }
    return this.save();
};

// Méthode pour retirer un cours
memberSchema.methods.unenrollFromCourse = function (courseId: mongoose.Types.ObjectId) {
    this.enrolledCourses = this.enrolledCourses.filter((id) => !id.equals(courseId));
    return this.save();
};

// Méthode pour ajouter un chèque déposé
memberSchema.methods.addCheckDeposit = function (amount: number, depositDate: Date) {
    if (!this.checkDeposits) {
        this.checkDeposits = [];
    }
    this.checkDeposits.push({ amount, depositDate });
    return this.save();
};

// Interface pour les méthodes statiques
interface IMemberModel extends mongoose.Model<IMember> {
    findByCity(city: string): Promise<IMember[]>;
    findByAgeRange(minAge: number, maxAge: number): Promise<IMember[]>;
    findWithImageRights(): Promise<IMember[]>;
    findEnrolledInCourse(courseId: mongoose.Types.ObjectId): Promise<IMember[]>;
}

// Méthode statique pour récupérer les membres par ville
memberSchema.statics.findByCity = function (city: string) {
    return this.find({ city: new RegExp(city, 'i') }).sort({ lastName: 1, firstName: 1 });
};

// Méthode statique pour récupérer les membres par tranche d'âge
memberSchema.statics.findByAgeRange = function (minAge: number, maxAge: number) {
    const today = new Date();
    const maxBirthDate = new Date(today.getFullYear() - minAge, today.getMonth(), today.getDate());
    const minBirthDate = new Date(today.getFullYear() - maxAge, today.getMonth(), today.getDate());

    return this.find({
        birthDate: { $gte: minBirthDate, $lte: maxBirthDate },
    }).sort({ lastName: 1, firstName: 1 });
};

// Méthode statique pour récupérer les membres avec droit à l'image
memberSchema.statics.findWithImageRights = function () {
    return this.find({ imageRights: true }).sort({ lastName: 1, firstName: 1 });
};

// Méthode statique pour récupérer les membres inscrits à un cours
memberSchema.statics.findEnrolledInCourse = function (courseId: mongoose.Types.ObjectId) {
    return this.find({ enrolledCourses: courseId }).sort({ lastName: 1, firstName: 1 });
};

export const Member = mongoose.model<IMember, IMemberModel>('Member', memberSchema) as IMemberModel;
