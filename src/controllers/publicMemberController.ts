import { Request, Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { Member } from '../models/Member';
import { Event } from '../models/Event';
import { User } from '../models/User';
import minioService from '../services/minioService';
import notificationService from '../services/notificationService';
import websocketService from '../services/websocketService';

// Configuration multer pour l'upload de la photo de pré-inscription (en mémoire)
const photoUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 Mo max
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Seuls les fichiers image sont autorisés'));
        }
    },
});

// Middleware optionnel : la pré-inscription peut être envoyée en JSON (sans photo)
// ou en multipart/form-data (avec une photo dans le champ "photo").
export const uploadMemberPhotoMiddleware = (
    req: Request,
    res: Response,
    next: (err?: any) => void
) => {
    photoUpload.single('photo')(req, res, (err: any) => {
        if (err) {
            // Erreurs Multer (taille dépassée, type non autorisé, etc.)
            const message =
                err.code === 'LIMIT_FILE_SIZE'
                    ? 'La photo ne doit pas dépasser 5 Mo'
                    : err.message || "Erreur lors de l'envoi de la photo";
            return res.status(400).json({ success: false, message });
        }
        next();
    });
};

// Applique les inscriptions entrantes à un membre existant, sans doublon.
// Réutilise la déduplication de Member.enrollInEvent (récurrent / ponctuel / toutes occurrences).
async function mergeIncomingEnrollments(member: any, incomingEnrollments: any[]) {
    for (const enrollment of incomingEnrollments) {
        if (!enrollment?.eventId) continue;
        await member.enrollInEvent(
            new mongoose.Types.ObjectId(enrollment.eventId),
            !!enrollment.isRecurring,
            enrollment.occurrenceDate ? new Date(enrollment.occurrenceDate) : undefined,
            !!enrollment.isAllOccurrences,
            enrollment.trialDate ? new Date(enrollment.trialDate) : undefined
        );
    }
}

// Optimise et envoie la photo de pré-inscription vers MinIO (optionnelle).
// En cas de renouvellement, on ne remplace pas une photo déjà présente.
async function handleMemberPhoto(
    member: any,
    file: Express.Multer.File | undefined,
    isRenewal: boolean
) {
    if (!file || (isRenewal && member.photoUrl)) {
        return;
    }

    try {
        const optimized = await sharp(file.buffer)
            .rotate() // respecte l'orientation EXIF
            .resize(512, 512, { fit: 'cover', position: 'centre' })
            .webp({ quality: 82 }) // supprime les métadonnées (dont GPS) par défaut
            .toBuffer();

        const fileName = `member-photos/${member._id.toString()}-${uuidv4()}.webp`;
        const uploadSuccess = await minioService.uploadFile(
            'gallery',
            fileName,
            optimized,
            'image/webp'
        );

        if (uploadSuccess) {
            member.photoUrl = minioService.getPublicUrl('gallery', fileName);
            await member.save();
        }
    } catch (photoError) {
        console.error("❌ Erreur lors de l'upload de la photo de pré-inscription:", photoError);
        // On continue : la photo est optionnelle
    }
}

// Inscription publique d'un membre.
// - Email inconnu → création d'une nouvelle pré-inscription.
// - Email déjà présent (ex. membre d'une saison précédente) → renouvellement :
//   on enrichit la fiche existante du nouvel événement + date d'essai, SANS écraser
//   ses coordonnées (celles-ci ne sont modifiables que par l'admin).
export const publicRegister = async (req: Request, res: Response) => {
    try {
        const memberData = req.body;

        // Normalisation des champs lorsque la requête arrive en multipart/form-data
        // (les valeurs sont alors transmises sous forme de chaînes de caractères)
        if (typeof memberData.enrolledEvents === 'string') {
            try {
                memberData.enrolledEvents = JSON.parse(memberData.enrolledEvents || '[]');
            } catch {
                memberData.enrolledEvents = [];
            }
        }
        memberData.imageRights =
            memberData.imageRights === true || memberData.imageRights === 'true';

        // La photo (optionnelle) n'est pas un champ du modèle : on l'écarte du body
        delete memberData.photo;
        delete memberData.photoUrl;

        // Email normalisé (le schéma stocke déjà en minuscules) pour retrouver une fiche existante
        const email = (memberData.email || '').toLowerCase().trim();

        // Vérifier que les événements existent si fournis
        const incomingEnrollments: any[] = Array.isArray(memberData.enrolledEvents)
            ? memberData.enrolledEvents
            : [];
        if (incomingEnrollments.length > 0) {
            const eventIds = incomingEnrollments.map((enrollment: any) => enrollment.eventId);
            const events = await Event.find({ _id: { $in: eventIds } });
            if (events.length !== eventIds.length) {
                return res.status(400).json({
                    success: false,
                    message: "Certains événements spécifiés n'existent pas",
                });
            }
        }

        const existingMember = await Member.findOne({ email });
        const isRenewal = !!existingMember;
        let member;

        if (existingMember) {
            // Renouvellement : on n'ajoute que le nouvel événement et la date d'essai.
            await mergeIncomingEnrollments(existingMember, incomingEnrollments);

            if (memberData.intendedTrialDate) {
                existingMember.intendedTrialDate = new Date(memberData.intendedTrialDate);
            }
            // Réactive un ancien membre, sans jamais rétrograder un membre inscrit/actif.
            if (existingMember.status === 'inactif') {
                existingMember.status = 'pré-inscrit';
            }

            await existingMember.save();
            member = existingMember;
        } else {
            // Nouvelle pré-inscription
            member = new Member({
                ...memberData,
                status: 'pré-inscrit',
                // Les champs admin restent vides
                registrationDate: undefined,
                checkDeposits: [],
            });
            await member.save();
        }

        // Photo (optionnelle) : en cas d'échec, la pré-inscription reste valide
        await handleMemberPhoto(member, req.file, isRenewal);

        // Notifier tous les managers (nouvelle pré-inscription ou renouvellement)
        try {
            await notifyManagersOfNewPreRegistration(member, isRenewal);
        } catch (notificationError) {
            console.error('❌ Erreur lors de la notification des managers:', notificationError);
            // On continue même si la notification échoue
        }

        res.status(isRenewal ? 200 : 201).json({
            success: true,
            message: isRenewal
                ? 'Votre pré-inscription a bien été mise à jour ! Vous recevrez un email de confirmation.'
                : 'Inscription enregistrée avec succès ! Vous recevrez un email de confirmation.',
            data: {
                id: member._id,
                firstName: member.firstName,
                lastName: member.lastName,
                email: member.email,
                status: member.status,
                photoUrl: member.photoUrl,
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
 * Notifier tous les managers d'une nouvelle pré-inscription ou d'un renouvellement
 */
async function notifyManagersOfNewPreRegistration(member: any, isRenewal = false) {
    try {
        // Récupérer tous les utilisateurs avec le rôle 'manager' ou 'admin'
        const managers = await User.find({
            role: { $in: ['manager', 'admin'] },
            isActive: true,
        });

        if (managers.length === 0) {
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
        const notificationTitle = isRenewal
            ? 'Renouvellement de pré-inscription'
            : 'Nouvelle pré-inscription';
        const action = isRenewal ? "s'est ré-inscrit(e)" : "s'est pré-inscrit(e)";
        const notificationMessage = `${member.firstName} ${member.lastName} ${action}${
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
                        actionType: isRenewal
                            ? 'pre_registration_renewal'
                            : 'new_pre_registration',
                    },
                    actionUrl: `/members?view=${member._id.toString()}`,
                    actionText: 'Voir le profil',
                    sendRealTime: true,
                });
            } catch (error) {
                console.error(
                    `❌ Erreur lors de l'envoi de notification au manager ${manager.email}:`,
                    error
                );
            }
        }

        // Envoyer également une notification en temps réel via websocket à tous les managers connectés
        websocketService.notifyAdmins('info', notificationMessage, notificationTitle);
    } catch (error) {
        console.error('❌ Erreur lors de la notification des managers:', error);
    }
}
