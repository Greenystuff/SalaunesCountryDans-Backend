import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Cheque, ICheque } from '../models/Cheque';
import { Member } from '../models/Member';

// Liste des chèques d'un membre
export const listMemberCheques = async (req: Request, res: Response) => {
    try {
        const { memberId } = req.params;
        const cheques = await Cheque.find({ memberId }).sort({ createdAt: -1 });
        res.json({ success: true, data: cheques });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des chèques',
        });
    }
};

// Créer un chèque pour un membre
export const createMemberCheque = async (req: Request, res: Response) => {
    try {
        const { memberId } = req.params;
        const exists = await Member.findById(memberId).select('_id');
        if (!exists) return res.status(404).json({ success: false, message: 'Membre non trouvé' });

        const payload: Partial<ICheque> = {
            ...req.body,
            memberId: new mongoose.Types.ObjectId(memberId),
        };
        const cheque = new Cheque(payload);
        await cheque.save();
        res.status(201).json({ success: true, data: cheque });
    } catch (error: any) {
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map((e: any) => e.message);
            return res.status(400).json({ success: false, message: 'Données invalides', errors });
        }
        res.status(500).json({ success: false, message: 'Erreur lors de la création du chèque' });
    }
};

// Mettre à jour un chèque
export const updateMemberCheque = async (req: Request, res: Response) => {
    try {
        const { memberId, checkId } = req.params;
        const cheque = await Cheque.findOneAndUpdate({ _id: checkId, memberId }, req.body, {
            new: true,
            runValidators: true,
        });
        if (!cheque) return res.status(404).json({ success: false, message: 'Chèque non trouvé' });
        res.json({ success: true, data: cheque });
    } catch (error: any) {
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map((e: any) => e.message);
            return res.status(400).json({ success: false, message: 'Données invalides', errors });
        }
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise à jour du chèque',
        });
    }
};

// Supprimer un chèque
export const deleteMemberCheque = async (req: Request, res: Response) => {
    try {
        const { memberId, checkId } = req.params;
        const cheque = await Cheque.findOneAndDelete({ _id: checkId, memberId });
        if (!cheque) return res.status(404).json({ success: false, message: 'Chèque non trouvé' });
        res.json({ success: true, message: 'Chèque supprimé' });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la suppression du chèque',
        });
    }
};

// Transition de statut
export const updateChequeStatus = async (req: Request, res: Response) => {
    try {
        const { memberId, checkId } = req.params;
        const { status, date } = req.body as {
            status: 'recu' | 'remis' | 'credite' | 'rejete' | 'retourne';
            date?: string;
        };
        const update: any = { status };
        const d = date ? new Date(date) : new Date();
        if (status === 'remis') update.depositedAt = d;
        if (status === 'credite') update.creditedAt = d;
        if (status === 'rejete' || status === 'retourne') update.bouncedAt = d;

        const cheque = await Cheque.findOneAndUpdate({ _id: checkId, memberId }, update, {
            new: true,
        });
        if (!cheque) return res.status(404).json({ success: false, message: 'Chèque non trouvé' });
        res.json({ success: true, data: cheque });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise à jour du statut du chèque',
        });
    }
};
