import { Request, Response } from 'express';
import { Member } from '../models/Member';
import { Event } from '../models/Event';
import Payment, { IPayment } from '../models/Payment';
import Dance from '../models/Dance';
import Gallery from '../models/Gallery';

// Statistiques générales du dashboard
export const getDashboardStats = async (req: Request, res: Response) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfYear = new Date(now.getFullYear(), 0, 1);

        // Statistiques des membres
        const totalMembers = await Member.countDocuments();
        const preInscrits = await Member.countDocuments({ status: 'pré-inscrit' });
        const inscrits = await Member.countDocuments({ status: 'inscrit' });
        const actifs = await Member.countDocuments({ status: 'actif' });
        const inactifs = await Member.countDocuments({ status: 'inactif' });

        // Nouveaux membres ce mois
        const newMembersThisMonth = await Member.countDocuments({
            createdAt: { $gte: startOfMonth },
        });

        // Membres avec droit à l'image
        const membersWithImageRights = await Member.countDocuments({ imageRights: true });

        // Statistiques des événements
        const totalEvents = await Event.countDocuments();
        const upcomingEvents = await Event.countDocuments({
            start: { $gte: now },
        });

        // Événements de cette semaine
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        const eventsThisWeek = await Event.countDocuments({
            start: { $gte: startOfWeek, $lte: endOfWeek },
        });

        // Statistiques financières (paiements)
        const totalPayments = await Payment.countDocuments();
        const paymentsByMethod = await Payment.aggregate([
            { $group: { _id: '$paymentMethod', count: { $sum: 1 } } },
        ]);

        // Montant total des paiements
        const totalAmount = await Payment.aggregate([
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);

        // Statistiques des danses
        const totalDances = await Dance.countDocuments();
        const dancesWithVideos = await Dance.countDocuments({
            $or: [{ youtubeLink1: { $ne: '' } }, { youtubeLink2: { $ne: '' } }],
        });
        const dancesWithPdf = await Dance.countDocuments({
            $or: [{ pdfLink: { $ne: '' } }, { pdfFile: { $exists: true, $ne: null } }],
        });

        // Statistiques de la galerie
        const totalImages = await Gallery.countDocuments();
        const activeImages = await Gallery.countDocuments({ isActive: true });

        // Top 5 des villes avec le plus de membres
        const topCities = await Member.aggregate([
            { $group: { _id: '$city', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 },
        ]);

        // Répartition par niveau des événements
        const eventLevels = await Event.aggregate([
            { $match: { level: { $exists: true, $ne: null } } },
            { $group: { _id: '$level', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]);

        // Répartition par niveau des danses
        const danceLevels = await Dance.aggregate([
            { $group: { _id: '$level', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]);

        // Évolution des inscriptions sur les 6 derniers mois
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(now.getMonth() - 6);

        const monthlyRegistrations = await Member.aggregate([
            { $match: { createdAt: { $gte: sixMonthsAgo } } },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } },
        ]);

        // Prochains événements (limités à 5) - avec gestion de la récurrence
        const allEvents = await Event.find({}).select(
            'title type level start end instructor location recurrence'
        );
        const nextEvents = [];

        for (const event of allEvents) {
            if (event.recurrence === 'Aucune') {
                // Événement ponctuel : l'ajouter s'il est à venir
                if (new Date(event.end) >= now) {
                    nextEvents.push({
                        title: event.title,
                        type: event.type,
                        level: event.level,
                        start: event.start,
                        end: event.end,
                        instructor: event.instructor,
                        location: event.location,
                    });
                }
            } else {
                // Événement récurrent : calculer la prochaine occurrence
                const eventStart = new Date(event.start);
                const eventEnd = new Date(event.end);
                const duration = eventEnd.getTime() - eventStart.getTime();

                // Calculer la prochaine occurrence
                let nextOccurrence = new Date(eventStart);
                const today = new Date();

                // Trouver la prochaine occurrence à partir d'aujourd'hui
                while (nextOccurrence < today) {
                    switch (event.recurrence) {
                        case 'Hebdomadaire':
                            nextOccurrence.setDate(nextOccurrence.getDate() + 7);
                            break;
                        case 'Toutes les 2 semaines':
                            nextOccurrence.setDate(nextOccurrence.getDate() + 14);
                            break;
                        case 'Mensuelle':
                            nextOccurrence.setMonth(nextOccurrence.getMonth() + 1);
                            break;
                    }
                }

                // Si la prochaine occurrence est dans le futur, ajouter l'événement
                if (nextOccurrence >= today) {
                    nextEvents.push({
                        title: event.title,
                        type: event.type,
                        level: event.level,
                        start: nextOccurrence,
                        end: new Date(nextOccurrence.getTime() + duration),
                        instructor: event.instructor,
                        location: event.location,
                    });
                }
            }
        }

        // Trier par date de début et limiter à 5
        nextEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
        const limitedNextEvents = nextEvents.slice(0, 5);

        // Derniers membres inscrits (limités à 5)
        const recentMembers = await Member.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select('firstName lastName status createdAt');

        res.json({
            success: true,
            data: {
                // Statistiques générales
                overview: {
                    totalMembers,
                    totalEvents,
                    totalDances,
                    totalImages,
                    totalPayments,
                },

                // Statistiques des membres
                members: {
                    total: totalMembers,
                    byStatus: {
                        preInscrits,
                        inscrits,
                        actifs,
                        inactifs,
                    },
                    newThisMonth: newMembersThisMonth,
                    withImageRights: membersWithImageRights,
                    topCities: topCities.map((city) => ({
                        name: city._id,
                        count: city.count,
                    })),
                },

                // Statistiques des événements
                events: {
                    total: totalEvents,
                    upcoming: upcomingEvents,
                    thisWeek: eventsThisWeek,
                    byLevel: eventLevels.map((level) => ({
                        level: level._id,
                        count: level.count,
                    })),
                },

                // Statistiques financières
                finances: {
                    totalPayments,
                    byMethod: paymentsByMethod,
                    totalAmount: totalAmount[0]?.total || 0,
                },

                // Statistiques des danses
                dances: {
                    total: totalDances,
                    withVideos: dancesWithVideos,
                    withPdf: dancesWithPdf,
                    byLevel: danceLevels.map((level) => ({
                        level: level._id,
                        count: level.count,
                    })),
                },

                // Statistiques de la galerie
                gallery: {
                    total: totalImages,
                    active: activeImages,
                },

                // Évolution temporelle
                evolution: {
                    monthlyRegistrations: monthlyRegistrations.map((item) => ({
                        month: `${item._id.year}-${item._id.month.toString().padStart(2, '0')}`,
                        count: item.count,
                    })),
                },

                // Données récentes
                recent: {
                    nextEvents: limitedNextEvents,
                    recentMembers: recentMembers.map((member) => ({
                        name: `${member.firstName} ${member.lastName}`,
                        status: member.status,
                        createdAt: member.createdAt,
                    })),
                },
            },
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des statistiques:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des statistiques du dashboard',
        });
    }
};
