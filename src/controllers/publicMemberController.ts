import { Request, Response } from 'express';
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

// Inscription publique d'un nouveau membre
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

        // Si une photo a été fournie, l'optimiser puis l'uploader vers MinIO.
        // La photo est optionnelle : en cas d'échec, la pré-inscription reste valide.
        if (req.file) {
            try {
                const optimized = await sharp(req.file.buffer)
                    .rotate() // respecte l'orientation EXIF
                    .resize(512, 512, { fit: 'cover', position: 'centre' })
                    .webp({ quality: 82 }) // supprime les métadonnées (dont GPS) par défaut
                    .toBuffer();

                const fileName = `member-photos/${member._id}-${uuidv4()}.webp`;
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

        // Notifier tous les managers de la nouvelle pré-inscription
        try {
            await notifyManagersOfNewPreRegistration(member);
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
 * Notifier tous les managers d'une nouvelle pré-inscription
 */
async function notifyManagersOfNewPreRegistration(member: any) {
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
