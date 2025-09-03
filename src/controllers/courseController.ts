import { Request, Response } from 'express';
import { Course, ICourse } from '../models/Course';

// Récupérer tous les cours
export const getAllCourses = async (req: Request, res: Response) => {
    try {
        const {
            page = 1,
            limit = 20,
            sortBy = 'start',
            sortOrder = 'asc',
            q,
            level,
            teacher,
        } = req.query;

        console.log('Paramètres reçus pour les cours:', {
            page,
            limit,
            sortBy,
            sortOrder,
            q,
            level,
            teacher,
        });

        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
        const sort: any = {};
        sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

        // Construire la requête avec les filtres
        let query: any = {};

        // Recherche par titre, description, teacher, location
        if (q) {
            query.$or = [
                { title: { $regex: q, $options: 'i' } },
                { description: { $regex: q, $options: 'i' } },
                { teacher: { $regex: q, $options: 'i' } },
                { location: { $regex: q, $options: 'i' } },
            ];
        }

        // Filtre par niveau
        if (level) {
            query.level = level;
        }

        // Filtre par animateur
        if (teacher) {
            query.teacher = { $regex: teacher, $options: 'i' };
        }

        console.log('Requête MongoDB construite pour les cours:', JSON.stringify(query, null, 2));

        const courses = await Course.find(query)
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit as string));

        const total = await Course.countDocuments(query);

        res.json({
            success: true,
            data: courses,
            pagination: {
                page: parseInt(page as string),
                limit: parseInt(limit as string),
                total,
                pages: Math.ceil(total / parseInt(limit as string)),
            },
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des cours:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des cours',
        });
    }
};

// Récupérer les cours à venir
export const getUpcomingCourses = async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20;
        const courses = await Course.findUpcoming(limit);
        res.json({
            success: true,
            data: courses,
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des cours à venir:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des cours à venir',
        });
    }
};

// Récupérer les cours d'une date spécifique
export const getCoursesByDate = async (req: Request, res: Response) => {
    try {
        const { date } = req.params;
        const targetDate = new Date(date);

        if (isNaN(targetDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Date invalide',
            });
        }

        const courses = await Course.findByDate(targetDate);
        res.json({
            success: true,
            data: courses,
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des cours par date:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des cours',
        });
    }
};

// Récupérer un cours par ID
export const getCourseById = async (req: Request, res: Response) => {
    try {
        const course = await Course.findById(req.params.id);

        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Cours non trouvé',
            });
        }

        res.json({
            success: true,
            data: course,
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération du cours:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération du cours',
        });
    }
};

// Créer un nouveau cours
export const createCourse = async (req: Request, res: Response) => {
    try {
        const courseData = req.body;

        // Validation des dates
        const start = new Date(courseData.start);
        const end = new Date(courseData.end);

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
        if (courseData.recurrenceEndDate) {
            const recurrenceEndDate = new Date(courseData.recurrenceEndDate);
            if (isNaN(recurrenceEndDate.getTime()) || recurrenceEndDate <= start) {
                return res.status(400).json({
                    success: false,
                    message:
                        'La date de fin de récurrence doit être postérieure à la date de début',
                });
            }
        }

        const course = new Course({
            ...courseData,
            start,
            end,
        });

        await course.save();

        res.status(201).json({
            success: true,
            data: course,
            message:
                course.recurrence !== 'Aucune'
                    ? 'Cours récurrent créé avec succès et occurrences générées'
                    : 'Cours créé avec succès',
        });
    } catch (error: any) {
        console.error('❌ Erreur lors de la création du cours:', error);

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map((err: any) => err.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', '),
            });
        }

        res.status(500).json({
            success: false,
            message: 'Erreur lors de la création du cours',
        });
    }
};

// Mettre à jour un cours
export const updateCourse = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

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

        const course = await Course.findByIdAndUpdate(id, updateData, {
            new: true,
            runValidators: true,
        });

        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Cours non trouvé',
            });
        }

        res.json({
            success: true,
            data: course,
            message:
                course.recurrence !== 'Aucune'
                    ? 'Cours récurrent mis à jour avec succès et occurrences régénérées'
                    : 'Cours mis à jour avec succès',
        });
    } catch (error: any) {
        console.error('❌ Erreur lors de la mise à jour du cours:', error);

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map((err: any) => err.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', '),
            });
        }

        res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise à jour du cours',
        });
    }
};

// Supprimer un cours
export const deleteCourse = async (req: Request, res: Response) => {
    try {
        const course = await Course.findByIdAndDelete(req.params.id);
        const success = !!course;

        if (!success) {
            return res.status(404).json({
                success: false,
                message: 'Cours non trouvé',
            });
        }

        res.json({
            success: true,
            message: 'Cours supprimé avec succès',
        });
    } catch (error) {
        console.error('❌ Erreur lors de la suppression du cours:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la suppression du cours',
        });
    }
};

// Rechercher des cours avec filtres
export const searchCourses = async (req: Request, res: Response) => {
    try {
        const { q, level, teacher, location, startDate, endDate } = req.query;

        const filter: any = {};

        // Recherche textuelle
        if (q) {
            filter.$or = [
                { title: { $regex: q, $options: 'i' } },
                { description: { $regex: q, $options: 'i' } },
                { teacher: { $regex: q, $options: 'i' } },
                { location: { $regex: q, $options: 'i' } },
            ];
        }

        // Filtres spécifiques
        if (level) filter.level = level;
        if (teacher) filter.teacher = { $regex: teacher, $options: 'i' };
        if (location) filter.location = { $regex: location, $options: 'i' };

        // Filtre par période
        if (startDate || endDate) {
            filter.start = {};
            if (startDate) filter.start.$gte = new Date(startDate as string);
            if (endDate) filter.start.$lte = new Date(endDate as string);
        }

        const courses = await Course.find(filter).sort({ start: 1 });

        res.json({
            success: true,
            data: courses,
        });
    } catch (error) {
        console.error('❌ Erreur lors de la recherche des cours:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la recherche des cours',
        });
    }
};

// Statistiques des cours
export const getCourseStats = async (req: Request, res: Response) => {
    try {
        const totalCourses = await Course.countDocuments();

        const levelStats = await Course.aggregate([
            {
                $group: {
                    _id: '$level',
                    count: { $sum: 1 },
                },
            },
        ]);

        const teacherStats = await Course.aggregate([
            {
                $match: { teacher: { $exists: true, $ne: '' } },
            },
            {
                $group: {
                    _id: '$teacher',
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

        const upcomingCount = await Course.countDocuments({
            end: { $gte: new Date() },
        });

        // Statistiques des cours récurrents
        const recurringStats = await Course.aggregate([
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
                total: totalCourses,
                upcoming: upcomingCount,
                byLevel: levelStats,
                byTeacher: teacherStats,
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

// Récupérer les cours récurrents
export const getRecurringCourses = async (req: Request, res: Response) => {
    try {
        const courses = await Course.find({
            recurrence: { $ne: 'Aucune' },
        }).sort({ start: 1 });

        res.json({
            success: true,
            data: courses,
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des cours récurrents:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des cours récurrents',
        });
    }
};
