import { Request, Response } from 'express';
import { Event, IEvent } from '../models/Event';

// Récupérer tous les événements
export const getAllEvents = async (req: Request, res: Response) => {
    try {
        const {
            page = 1,
            limit = 20,
            sortBy = 'start',
            sortOrder = 'asc',
            q,
            type,
            level,
            instructor,
        } = req.query;

        console.log('Paramètres reçus pour les événements:', {
            page,
            limit,
            sortBy,
            sortOrder,
            q,
            type,
            level,
            instructor,
        });

        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
        const sort: any = {};
        sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

        // Construire la requête avec les filtres
        let query: any = {};

        // Recherche par titre, description, instructor, location
        if (q) {
            query.$or = [
                { title: { $regex: q, $options: 'i' } },
                { description: { $regex: q, $options: 'i' } },
                { instructor: { $regex: q, $options: 'i' } },
                { location: { $regex: q, $options: 'i' } },
            ];
        }

        // Filtre par type
        if (type) {
            query.type = type;
        }

        // Filtre par niveau
        if (level) {
            query.level = level;
        }

        // Filtre par instructeur
        if (instructor) {
            query.instructor = { $regex: instructor, $options: 'i' };
        }

        console.log(
            'Requête MongoDB construite pour les événements:',
            JSON.stringify(query, null, 2)
        );

        const events = await Event.find(query)
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit as string));

        const total = await Event.countDocuments(query);

        res.json({
            success: true,
            data: events,
            pagination: {
                page: parseInt(page as string),
                limit: parseInt(limit as string),
                total,
                pages: Math.ceil(total / parseInt(limit as string)),
            },
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des événements:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des événements',
        });
    }
};

// Récupérer les événements à venir
export const getUpcomingEvents = async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;
        const events = await Event.findUpcoming(limit);
        res.json({
            success: true,
            data: events,
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des événements à venir:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des événements à venir',
        });
    }
};

// Récupérer les événements d'une date spécifique
export const getEventsByDate = async (req: Request, res: Response) => {
    try {
        const { date } = req.params;
        const targetDate = new Date(date);

        if (isNaN(targetDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Date invalide',
            });
        }

        const events = await Event.findByDate(targetDate);
        res.json({
            success: true,
            data: events,
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des événements par date:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des événements',
        });
    }
};

// Récupérer un événement par ID
export const getEventById = async (req: Request, res: Response) => {
    try {
        const event = await Event.findById(req.params.id);

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Événement non trouvé',
            });
        }

        res.json({
            success: true,
            data: event,
        });
    } catch (error) {
        console.error("❌ Erreur lors de la récupération de l'événement:", error);
        res.status(500).json({
            success: false,
            message: "Erreur lors de la récupération de l'événement",
        });
    }
};

// Créer un nouvel événement
export const createEvent = async (req: Request, res: Response) => {
    try {
        const eventData = req.body;

        // Validation des dates
        const start = new Date(eventData.start);
        const end = new Date(eventData.end);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Dates invalides',
            });
        }

        if (end <= start) {
            return res.status(400).json({
                success: false,
                message: 'La date de fin doit être postérieure à la date de début',
            });
        }

        // Validation de la date de fin de récurrence si fournie
        if (eventData.recurrenceEndDate) {
            const recurrenceEndDate = new Date(eventData.recurrenceEndDate);
            if (isNaN(recurrenceEndDate.getTime()) || recurrenceEndDate <= start) {
                return res.status(400).json({
                    success: false,
                    message:
                        'La date de fin de récurrence doit être postérieure à la date de début',
                });
            }
        }

        const event = new Event({
            ...eventData,
            start,
            end,
        });

        await event.save();

        res.status(201).json({
            success: true,
            data: event,
            message:
                event.recurrence !== 'Aucune'
                    ? 'Événement récurrent créé avec succès et occurrences générées'
                    : 'Événement créé avec succès',
        });
    } catch (error: any) {
        console.error("❌ Erreur lors de la création de l'événement:", error);

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map((err: any) => err.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', '),
            });
        }

        res.status(500).json({
            success: false,
            message: "Erreur lors de la création de l'événement",
        });
    }
};

// Mettre à jour un événement
export const updateEvent = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        console.log('🔍 Backend reçoit pour update:', {
            id,
            start: updateData.start,
            end: updateData.end,
            startType: typeof updateData.start,
            endType: typeof updateData.end,
        });

        // Validation des dates si elles sont fournies
        if (updateData.start || updateData.end) {
            const start = updateData.start ? new Date(updateData.start) : undefined;
            const end = updateData.end ? new Date(updateData.end) : undefined;

            if (start && isNaN(start.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Date de début invalide',
                });
            }

            if (end && isNaN(end.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Date de fin invalide',
                });
            }

            if (start && end && end <= start) {
                return res.status(400).json({
                    success: false,
                    message: 'La date de fin doit être postérieure à la date de début',
                });
            }
        }

        // Validation de la date de fin de récurrence si fournie
        if (updateData.recurrenceEndDate) {
            const recurrenceEndDate = new Date(updateData.recurrenceEndDate);
            const start = updateData.start ? new Date(updateData.start) : undefined;

            if (isNaN(recurrenceEndDate.getTime()) || (start && recurrenceEndDate <= start)) {
                return res.status(400).json({
                    success: false,
                    message:
                        'La date de fin de récurrence doit être postérieure à la date de début',
                });
            }
        }

        const event = await Event.findByIdAndUpdate(id, updateData, {
            new: true,
            runValidators: true,
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Événement non trouvé',
            });
        }

        res.json({
            success: true,
            data: event,
            message:
                event.recurrence !== 'Aucune'
                    ? 'Événement récurrent mis à jour avec succès et occurrences régénérées'
                    : 'Événement mis à jour avec succès',
        });
    } catch (error: any) {
        console.error("❌ Erreur lors de la mise à jour de l'événement:", error);

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map((err: any) => err.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', '),
            });
        }

        res.status(500).json({
            success: false,
            message: "Erreur lors de la mise à jour de l'événement",
        });
    }
};

// Supprimer un événement
export const deleteEvent = async (req: Request, res: Response) => {
    try {
        const event = await Event.findByIdAndDelete(req.params.id);
        const success = !!event;

        if (!success) {
            return res.status(404).json({
                success: false,
                message: 'Événement non trouvé',
            });
        }

        res.json({
            success: true,
            message: 'Événement supprimé avec succès',
        });
    } catch (error) {
        console.error("❌ Erreur lors de la suppression de l'événement:", error);
        res.status(500).json({
            success: false,
            message: "Erreur lors de la suppression de l'événement",
        });
    }
};

// Rechercher des événements avec filtres
export const searchEvents = async (req: Request, res: Response) => {
    try {
        const { q, type, level, instructor, location, startDate, endDate } = req.query;

        const filter: any = {};

        // Recherche textuelle
        if (q) {
            filter.$or = [
                { title: { $regex: q, $options: 'i' } },
                { description: { $regex: q, $options: 'i' } },
                { instructor: { $regex: q, $options: 'i' } },
                { location: { $regex: q, $options: 'i' } },
            ];
        }

        // Filtres spécifiques
        if (type) filter.type = type;
        if (level) filter.level = level;
        if (instructor) filter.instructor = { $regex: instructor, $options: 'i' };
        if (location) filter.location = { $regex: location, $options: 'i' };

        // Filtre par période
        if (startDate || endDate) {
            filter.start = {};
            if (startDate) filter.start.$gte = new Date(startDate as string);
            if (endDate) filter.start.$lte = new Date(endDate as string);
        }

        const events = await Event.find(filter).sort({ start: 1 });

        res.json({
            success: true,
            data: events,
        });
    } catch (error) {
        console.error('❌ Erreur lors de la recherche des événements:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la recherche des événements',
        });
    }
};

// Statistiques des événements
export const getEventStats = async (req: Request, res: Response) => {
    try {
        const totalEvents = await Event.countDocuments();

        const typeStats = await Event.aggregate([
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 },
                },
            },
        ]);

        const levelStats = await Event.aggregate([
            {
                $match: { level: { $exists: true, $ne: null } },
            },
            {
                $group: {
                    _id: '$level',
                    count: { $sum: 1 },
                },
            },
        ]);

        const instructorStats = await Event.aggregate([
            {
                $match: { instructor: { $exists: true, $ne: '' } },
            },
            {
                $group: {
                    _id: '$instructor',
                    count: { $sum: 1 },
                },
            },
            {
                $sort: { count: -1 },
            },
            {
                $limit: 10,
            },
        ]);

        const upcomingCount = await Event.countDocuments({
            end: { $gte: new Date() },
        });

        // Statistiques des événements récurrents
        const recurringStats = await Event.aggregate([
            {
                $match: { recurrence: { $ne: 'Aucune' } },
            },
            {
                $group: {
                    _id: '$recurrence',
                    count: { $sum: 1 },
                },
            },
        ]);

        res.json({
            success: true,
            data: {
                total: totalEvents,
                upcoming: upcomingCount,
                byType: typeStats,
                byLevel: levelStats,
                byInstructor: instructorStats,
                recurring: recurringStats,
            },
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des statistiques:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des statistiques',
        });
    }
};

// Récupérer les événements récurrents
export const getRecurringEvents = async (req: Request, res: Response) => {
    try {
        const events = await Event.find({
            recurrence: { $ne: 'Aucune' },
        }).sort({ start: 1 });

        res.json({
            success: true,
            data: events,
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des événements récurrents:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des événements récurrents',
        });
    }
};

// Récupérer les événements par type
export const getEventsByType = async (req: Request, res: Response) => {
    try {
        const { type } = req.params;
        const events = await Event.findByType(type);
        res.json({
            success: true,
            data: events,
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des événements par type:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des événements par type',
        });
    }
};
