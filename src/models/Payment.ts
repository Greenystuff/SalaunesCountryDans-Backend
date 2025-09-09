import mongoose, { Document, Schema } from 'mongoose';

// Interface pour les paiements
export interface IPayment extends Document {
    memberId: mongoose.Types.ObjectId;
    amount: number;
    paymentMethod: 'chèque' | 'Espèce' | 'Virement' | 'Carte bancaire';
    purpose: string;
    description?: string;
    paymentDate: Date;
    chequeId?: mongoose.Types.ObjectId; // Référence vers le chèque si applicable
    createdAt: Date;
    updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
    {
        memberId: {
            type: Schema.Types.ObjectId,
            ref: 'Member',
            required: [true, "L'ID du membre est requis"],
        },
        amount: {
            type: Number,
            required: [true, 'Le montant est requis'],
            min: [0, 'Le montant ne peut pas être négatif'],
        },
        paymentMethod: {
            type: String,
            required: [true, 'Le moyen de paiement est requis'],
            enum: {
                values: ['chèque', 'Espèce', 'Virement', 'Carte bancaire'],
                message:
                    'Le moyen de paiement doit être "chèque", "Espèce", "Virement" ou "Carte bancaire"',
            },
        },
        purpose: {
            type: String,
            required: [true, "L'objet du paiement est requis"],
            trim: true,
            maxlength: [100, "L'objet ne peut pas dépasser 100 caractères"],
        },
        description: {
            type: String,
            trim: true,
            maxlength: [200, 'La description ne peut pas dépasser 200 caractères'],
        },
        paymentDate: {
            type: Date,
            required: [true, 'La date de paiement est requise'],
            default: Date.now,
        },
        chequeId: {
            type: Schema.Types.ObjectId,
            ref: 'Cheque',
        },
    },
    {
        timestamps: true,
    }
);

// Index pour optimiser les requêtes
paymentSchema.index({ memberId: 1, paymentDate: -1 });
paymentSchema.index({ paymentMethod: 1 });
paymentSchema.index({ purpose: 1 });

export default mongoose.model<IPayment>('Payment', paymentSchema);
