import { Request, Response } from 'express';
import { Member } from '../models/Member';
import { Event } from '../models/Event';
import { User } from '../models/User';
import notificationService from '../services/notificationService';
import websocketService from '../services/websocketService';

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

        // Vérifier que les événements existent si fournis
        if (memberData.enrolledEvents && memberData.enrolledEvents.length > 0) {
            const eventIds = memberData.enrolledEvents.map((enrollment: any) => enrollment.eventId);
            const events = await Event.find({ _id: { $in: eventIds } });
            if (events.length !== eventIds.length) {
                return res.status(400).json({
                    success: false,
                    message: "Certains événements spécifiés n'existent pas",
                });
            }
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

        // Notifier tous les managers de la nouvelle pré-inscription
        console.log('🔔 Début de la notification des managers pour le membre:', member._id);
        try {
            await notifyManagersOfNewPreRegistration(member);
            console.log('✅ Notification des managers terminée');
        } catch (notificationError) {
            console.error('❌ Erreur lors de la notification des managers:', notificationError);
            // On continue même si la notification échoue
        }

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

/**
 * Notifier tous les managers d'une nouvelle pré-inscription
 */
async function notifyManagersOfNewPreRegistration(member: any) {
    try {
        console.log(
            '📋 Fonction notifyManagersOfNewPreRegistration appelée pour:',
            member.firstName,
            member.lastName
        );

        // Récupérer tous les utilisateurs avec le rôle 'manager' ou 'admin'
        const managers = await User.find({
            role: { $in: ['manager', 'admin'] },
            isActive: true,
        });

        if (managers.length === 0) {
            console.log('⚠️ Aucun manager trouvé pour la notification de pré-inscription');
            return;
        }

        // Préparer les informations du membre pour la notification
        const memberInfo = {
            id: member._id,
            firstName: member.firstName,
            lastName: member.lastName,
            email: member.email,
            city: member.city,
            intendedTrialDate: member.intendedTrialDate,
            enrolledEvents: member.enrolledEvents || [],
            createdAt: member.createdAt,
        };

        // Créer le message de notification
        const notificationTitle = 'Nouvelle pré-inscription';
        const notificationMessage = `${member.firstName} ${member.lastName} s'est pré-inscrit(e)${
            member.city ? ` depuis ${member.city}` : ''
        }${
            member.intendedTrialDate
                ? ` pour un essai le ${new Date(member.intendedTrialDate).toLocaleDateString(
                      'fr-FR'
                  )}`
                : ''
        }.`;

        // Notifier chaque manager
        for (const manager of managers) {
            try {
                // Créer une notification persistante
                await notificationService.createNotification({
                    userId: manager._id.toString(),
                    title: notificationTitle,
                    message: notificationMessage,
                    type: 'info',
                    category: 'system',
                    isPersistent: true,
                    metadata: {
                        memberId: member._id.toString(),
                        memberInfo: memberInfo,
                        actionType: 'new_pre_registration',
                    },
                    actionUrl: `/members/${member._id}`,
                    actionText: 'Voir le profil',
                    sendRealTime: true,
                });

                console.log(
                    `✅ Notification de pré-inscription envoyée au manager ${manager.email}`
                );
            } catch (error) {
                console.error(
                    `❌ Erreur lors de l'envoi de notification au manager ${manager.email}:`,
                    error
                );
            }
        }

        // Envoyer également une notification en temps réel via websocket à tous les managers connectés
        websocketService.notifyAdmins('info', notificationMessage, notificationTitle);

        console.log(
            `📢 ${managers.length} manager(s) notifié(s) de la pré-inscription de ${member.firstName} ${member.lastName}`
        );
    } catch (error) {
        console.error('❌ Erreur lors de la notification des managers:', error);
    }
}
