import mongoose, { Document, Schema } from 'mongoose';

export type ChequeStatus = 'recu' | 'remis' | 'credite' | 'rejete' | 'retourne';
export type ChequePurpose = 'cotisation' | 'adhesion' | 'autre';

export interface ICheque extends Document {
    memberId: mongoose.Types.ObjectId;
    amount: number;
    purpose: ChequePurpose;
    checkNumber?: string;
    bankName?: string;
    ibanLast4?: string; // stocker uniquement les 4 derniers
    issuedAt?: Date;
    depositedAt?: Date;
    creditedAt?: Date;
    bouncedAt?: Date;
    status: ChequeStatus;
    remitBatch?: string;
    imageUrl?: string;
    notes?: string;
    createdBy?: mongoose.Types.ObjectId; // admin
    createdAt: Date;
    updatedAt: Date;
}

const chequeSchema = new Schema<ICheque>(
    {
        memberId: {
            type: Schema.Types.ObjectId,
            ref: 'Member',
            required: true,
            index: true,
        },
        amount: {
            type: Number,
            required: [true, 'Le montant est requis'],
            min: [0.01, 'Le montant doit être > 0'],
        },
        purpose: {
            type: String,
            enum: ['cotisation', 'adhesion', 'autre'],
            default: 'autre',
        },
        checkNumber: { type: String, trim: true, maxlength: 32 },
        bankName: { type: String, trim: true, maxlength: 100 },
        ibanLast4: { type: String, trim: true, maxlength: 4 },
        issuedAt: { type: Date },
        depositedAt: { type: Date },
        creditedAt: { type: Date },
        bouncedAt: { type: Date },
        status: {
            type: String,
            enum: ['recu', 'remis', 'credite', 'rejete', 'retourne'],
            default: 'recu',
            index: true,
        },
        remitBatch: { type: String, trim: true, maxlength: 50 },
        imageUrl: { type: String, trim: true },
        notes: { type: String, trim: true, maxlength: 500 },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    {
        timestamps: true,
    }
);

chequeSchema.index({ memberId: 1, createdAt: -1 });

// Validations de cohérence des dates
chequeSchema.pre('save', function (next) {
    if (this.depositedAt && this.issuedAt && this.depositedAt < this.issuedAt) {
        return next(
            new Error("La date de remise ne peut pas être antérieure à la date d'émission")
        );
    }
    if (this.creditedAt && this.depositedAt && this.creditedAt < this.depositedAt) {
        return next(new Error('La date de crédit ne peut pas être antérieure à la date de remise'));
    }
    next();
});

export const Cheque = mongoose.model<ICheque>('Cheque', chequeSchema);
