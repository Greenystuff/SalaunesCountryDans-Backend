import { Request, Response } from 'express';
import { Member } from '../models/Member';

// Inscription publique d'un nouveau membre
export const publicRegister = async (req: Request, res: Response) => {
    try {
        const memberData = req.body;

        // Vérifier si l'email existe déjà
        const existingMember = await Member.findOne({ email: memberData.email });
        if (existingMember) {
            return res.status(400).json({
                success: false,
                message: 'Un membre avec cet email existe déjà',
            });
        }

        // Créer le membre avec le statut "pré-inscrit"
        const member = new Member({
            ...memberData,
            status: 'pré-inscrit',
            // Les champs admin restent vides
            registrationDate: undefined,
            annualFeePaymentMethod: undefined,
            membershipPaymentMethod: undefined,
            checkDeposits: [],
        });

        await member.save();

        res.status(201).json({
            success: true,
            message:
                'Inscription enregistrée avec succès ! Vous recevrez un email de confirmation.',
            data: {
                id: member._id,
                firstName: member.firstName,
                lastName: member.lastName,
                email: member.email,
                status: member.status,
            },
        });
    } catch (error: any) {
        console.error("❌ Erreur lors de l'inscription publique:", error);

        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map((err: any) => err.message);
            return res.status(400).json({
                success: false,
                message: 'Données invalides',
                errors,
            });
        }

        res.status(500).json({
            success: false,
            message: "Erreur lors de l'inscription",
        });
    }
};

// Vérifier si un email est déjà inscrit
export const checkEmailExists = async (req: Request, res: Response) => {
    try {
        const { email } = req.params;

        const existingMember = await Member.findOne({ email: email.toLowerCase() });

        res.json({
            success: true,
            exists: !!existingMember,
            status: existingMember?.status || null,
        });
    } catch (error) {
        console.error("❌ Erreur lors de la vérification de l'email:", error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la vérification',
        });
    }
};

// Récupérer les statistiques publiques des membres
export const getPublicStats = async (req: Request, res: Response) => {
    try {
        const totalMembers = await Member.countDocuments({ status: { $in: ['inscrit', 'actif'] } });
        const preRegisteredMembers = await Member.countDocuments({ status: 'pré-inscrit' });

        res.json({
            success: true,
            data: {
                totalActiveMembers: totalMembers,
                preRegisteredMembers,
            },
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des statistiques publiques:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des statistiques',
        });
    }
};
