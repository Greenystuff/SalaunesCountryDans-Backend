import { Request, Response } from 'express';
import Payment, { IPayment } from '../models/Payment';
import { Member } from '../models/Member';
import { Cheque } from '../models/Cheque';

// Créer un paiement
export const createPayment = async (req: Request, res: Response) => {
    try {
        const { memberId } = req.params;
        const paymentData = req.body;

        // Vérifier que le membre existe
        const member = await Member.findById(memberId);
        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Membre non trouvé',
            });
        }

        // Si c'est un paiement par chèque, vérifier que le chèque existe
        if (paymentData.paymentMethod === 'chèque' && paymentData.chequeId) {
            const cheque = await Cheque.findById(paymentData.chequeId);
            if (!cheque) {
                return res.status(404).json({
                    success: false,
                    message: 'Chèque non trouvé',
                });
            }
        }

        const payment = new Payment({
            ...paymentData,
            memberId,
        });

        await payment.save();

        res.status(201).json({
            success: true,
            data: payment,
            message: 'Paiement créé avec succès',
        });
    } catch (error: any) {
        console.error('❌ Erreur lors de la création du paiement:', error);

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map((err: any) => err.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', '),
            });
        }

        res.status(500).json({
            success: false,
            message: 'Erreur lors de la création du paiement',
        });
    }
};

// Récupérer tous les paiements d'un membre
export const getMemberPayments = async (req: Request, res: Response) => {
    try {
        const { memberId } = req.params;
        const { page = 1, limit = 50 } = req.query;

        // Vérifier que le membre existe
        const member = await Member.findById(memberId);
        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Membre non trouvé',
            });
        }

        const payments = await Payment.find({ memberId })
            .populate('chequeId', 'checkNumber bankName amount status')
            .sort({ paymentDate: -1 })
            .limit(Number(limit) * 1)
            .skip((Number(page) - 1) * Number(limit));

        const total = await Payment.countDocuments({ memberId });

        res.json({
            success: true,
            data: payments,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error: any) {
        console.error('❌ Erreur lors de la récupération des paiements:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des paiements',
        });
    }
};

// Mettre à jour un paiement
export const updatePayment = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Si c'est un paiement par chèque, vérifier que le chèque existe
        if (updateData.paymentMethod === 'chèque' && updateData.chequeId) {
            const cheque = await Cheque.findById(updateData.chequeId);
            if (!cheque) {
                return res.status(404).json({
                    success: false,
                    message: 'Chèque non trouvé',
                });
            }
        }

        const payment = await Payment.findByIdAndUpdate(id, updateData, {
            new: true,
            runValidators: true,
        }).populate('chequeId', 'checkNumber bankName amount status');

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Paiement non trouvé',
            });
        }

        res.json({
            success: true,
            data: payment,
            message: 'Paiement mis à jour avec succès',
        });
    } catch (error: any) {
        console.error('❌ Erreur lors de la mise à jour du paiement:', error);

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map((err: any) => err.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', '),
            });
        }

        res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise à jour du paiement',
        });
    }
};

// Supprimer un paiement
export const deletePayment = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const payment = await Payment.findByIdAndDelete(id);

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Paiement non trouvé',
            });
        }

        res.json({
            success: true,
            message: 'Paiement supprimé avec succès',
        });
    } catch (error: any) {
        console.error('❌ Erreur lors de la suppression du paiement:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la suppression du paiement',
        });
    }
};

// Récupérer les statistiques des paiements d'un membre
export const getMemberPaymentStats = async (req: Request, res: Response) => {
    try {
        const { memberId } = req.params;

        // Vérifier que le membre existe
        const member = await Member.findById(memberId);
        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Membre non trouvé',
            });
        }

        const stats = await Payment.aggregate([
            { $match: { memberId: member._id } },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$amount' },
                    totalPayments: { $sum: 1 },
                    byMethod: {
                        $push: {
                            method: '$paymentMethod',
                            amount: '$amount',
                        },
                    },
                    byPurpose: {
                        $push: {
                            purpose: '$purpose',
                            amount: '$amount',
                        },
                    },
                },
            },
        ]);

        const result = stats[0] || {
            totalAmount: 0,
            totalPayments: 0,
            byMethod: [],
            byPurpose: [],
        };

        res.json({
            success: true,
            data: result,
        });
    } catch (error: any) {
        console.error('❌ Erreur lors de la récupération des statistiques:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des statistiques',
        });
    }
};
