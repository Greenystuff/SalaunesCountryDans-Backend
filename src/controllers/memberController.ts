import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Member, IMember } from '../models/Member';
import { Course } from '../models/Course';

// Récupérer tous les membres
export const getAllMembers = async (req: Request, res: Response) => {
    try {
        const {
            page = 1,
            limit = 20,
            sortBy = 'lastName',
            sortOrder = 'asc',
            q,
            city,
            imageRights,
            status,
        } = req.query;

        console.log('Paramètres reçus:', {
            page,
            limit,
            sortBy,
            sortOrder,
            q,
            city,
            imageRights,
            status,
        });

        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
        const sort: any = {};
        sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

        // Construire la requête avec les filtres
        let query: any = {};

        // Recherche par nom/prénom/email
        if (q) {
            query.$or = [
                { firstName: { $regex: q, $options: 'i' } },
                { lastName: { $regex: q, $options: 'i' } },
                { email: { $regex: q, $options: 'i' } },
            ];
        }

        // Filtre par ville
        if (city) {
            query.city = { $regex: city, $options: 'i' };
        }

        // Filtre par droit à l'image
        if (imageRights !== undefined && imageRights !== '') {
            query.imageRights = imageRights === 'true';
        }

        // Filtre par statut
        if (status) {
            query.status = status;
        }

        console.log('Requête MongoDB construite:', JSON.stringify(query, null, 2));

        const members = await Member.find(query)
            .populate('enrolledCourses', 'title level start end teacher location')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit as string));

        const total = await Member.countDocuments(query);

        res.json({
            success: true,
            data: members,
            pagination: {
                page: parseInt(page as string),
                limit: parseInt(limit as string),
                total,
                pages: Math.ceil(total / parseInt(limit as string)),
            },
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des membres:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des membres',
        });
    }
};

// Récupérer un membre par ID
export const getMemberById = async (req: Request, res: Response) => {
    try {
        const member = await Member.findById(req.params.id).populate(
            'enrolledCourses',
            'title level start end teacher location'
        );

        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Membre non trouvé',
            });
        }

        res.json({
            success: true,
            data: member,
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération du membre:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération du membre',
        });
    }
};

// Créer un nouveau membre
export const createMember = async (req: Request, res: Response) => {
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

        // Vérifier que les cours existent si fournis
        if (memberData.enrolledCourses && memberData.enrolledCourses.length > 0) {
            const courses = await Course.find({ _id: { $in: memberData.enrolledCourses } });
            if (courses.length !== memberData.enrolledCourses.length) {
                return res.status(400).json({
                    success: false,
                    message: "Certains cours spécifiés n'existent pas",
                });
            }
        }

        const member = new Member(memberData);
        await member.save();

        const populatedMember = await Member.findById(member._id).populate(
            'enrolledCourses',
            'title level start'
        );

        res.status(201).json({
            success: true,
            data: populatedMember,
            message: 'Membre créé avec succès',
        });
    } catch (error: any) {
        console.error('❌ Erreur lors de la création du membre:', error);

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
            message: 'Erreur lors de la création du membre',
        });
    }
};

// Mettre à jour un membre
export const updateMember = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Vérifier si l'email existe déjà (sauf pour le membre actuel)
        if (updateData.email) {
            const existingMember = await Member.findOne({
                email: updateData.email,
                _id: { $ne: id },
            });
            if (existingMember) {
                return res.status(400).json({
                    success: false,
                    message: 'Un membre avec cet email existe déjà',
                });
            }
        }

        // Vérifier que les cours existent si fournis
        if (updateData.enrolledCourses && updateData.enrolledCourses.length > 0) {
            const courses = await Course.find({ _id: { $in: updateData.enrolledCourses } });
            if (courses.length !== updateData.enrolledCourses.length) {
                return res.status(400).json({
                    success: false,
                    message: "Certains cours spécifiés n'existent pas",
                });
            }
        }

        const member = await Member.findByIdAndUpdate(id, updateData, {
            new: true,
            runValidators: true,
        }).populate('enrolledCourses', 'title level start');

        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Membre non trouvé',
            });
        }

        res.json({
            success: true,
            data: member,
            message: 'Membre mis à jour avec succès',
        });
    } catch (error: any) {
        console.error('❌ Erreur lors de la mise à jour du membre:', error);

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
            message: 'Erreur lors de la mise à jour du membre',
        });
    }
};

// Supprimer un membre
export const deleteMember = async (req: Request, res: Response) => {
    try {
        const member = await Member.findByIdAndDelete(req.params.id);

        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Membre non trouvé',
            });
        }

        res.json({
            success: true,
            message: 'Membre supprimé avec succès',
        });
    } catch (error) {
        console.error('❌ Erreur lors de la suppression du membre:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la suppression du membre',
        });
    }
};

// Rechercher des membres
export const searchMembers = async (req: Request, res: Response) => {
    try {
        const { q, city, ageMin, ageMax, imageRights, courseId } = req.query;

        let query: any = {};

        // Recherche par nom/prénom/email
        if (q) {
            query.$or = [
                { firstName: { $regex: q, $options: 'i' } },
                { lastName: { $regex: q, $options: 'i' } },
                { email: { $regex: q, $options: 'i' } },
            ];
        }

        // Filtre par ville
        if (city) {
            query.city = { $regex: city, $options: 'i' };
        }

        // Filtre par tranche d'âge
        if (ageMin || ageMax) {
            const today = new Date();
            const minAge = parseInt(ageMin as string) || 0;
            const maxAge = parseInt(ageMax as string) || 120;

            const maxBirthDate = new Date(
                today.getFullYear() - minAge,
                today.getMonth(),
                today.getDate()
            );
            const minBirthDate = new Date(
                today.getFullYear() - maxAge,
                today.getMonth(),
                today.getDate()
            );

            query.birthDate = { $gte: minBirthDate, $lte: maxBirthDate };
        }

        // Filtre par droit à l'image
        if (imageRights !== undefined) {
            query.imageRights = imageRights === 'true';
        }

        // Filtre par cours
        if (courseId) {
            query.enrolledCourses = courseId;
        }

        const members = await Member.find(query)
            .populate('enrolledCourses', 'title level start')
            .sort({ lastName: 1, firstName: 1 });

        res.json({
            success: true,
            data: members,
        });
    } catch (error) {
        console.error('❌ Erreur lors de la recherche des membres:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la recherche des membres',
        });
    }
};

// Récupérer les statistiques des membres
export const getMemberStats = async (req: Request, res: Response) => {
    try {
        const totalMembers = await Member.countDocuments();
        const membersWithImageRights = await Member.countDocuments({ imageRights: true });
        const membersByCity = await Member.aggregate([
            { $group: { _id: '$city', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
        ]);

        // Calculer la répartition par âge
        const ageDistribution = await Member.aggregate([
            {
                $addFields: {
                    age: {
                        $floor: {
                            $divide: [
                                { $subtract: [new Date(), '$birthDate'] },
                                365 * 24 * 60 * 60 * 1000,
                            ],
                        },
                    },
                },
            },
            {
                $group: {
                    _id: {
                        $switch: {
                            branches: [
                                { case: { $lt: ['$age', 18] }, then: '0-17' },
                                { case: { $lt: ['$age', 25] }, then: '18-24' },
                                { case: { $lt: ['$age', 35] }, then: '25-34' },
                                { case: { $lt: ['$age', 50] }, then: '35-49' },
                                { case: { $lt: ['$age', 65] }, then: '50-64' },
                            ],
                            default: '65+',
                        },
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        res.json({
            success: true,
            data: {
                totalMembers,
                membersWithImageRights,
                membersByCity,
                ageDistribution,
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

// Inscrire un membre à un cours
export const enrollMemberInCourse = async (req: Request, res: Response) => {
    try {
        const { memberId, courseId } = req.params;

        const member = await Member.findById(memberId);
        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Membre non trouvé',
            });
        }

        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Cours non trouvé',
            });
        }

        await member.enrollInCourse(new mongoose.Types.ObjectId(courseId));

        const updatedMember = await Member.findById(memberId).populate(
            'enrolledCourses',
            'title level start'
        );

        res.json({
            success: true,
            data: updatedMember,
            message: 'Membre inscrit au cours avec succès',
        });
    } catch (error) {
        console.error("❌ Erreur lors de l'inscription au cours:", error);
        res.status(500).json({
            success: false,
            message: "Erreur lors de l'inscription au cours",
        });
    }
};

// Désinscrire un membre d'un cours
export const unenrollMemberFromCourse = async (req: Request, res: Response) => {
    try {
        const { memberId, courseId } = req.params;

        const member = await Member.findById(memberId);
        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Membre non trouvé',
            });
        }

        await member.unenrollFromCourse(new mongoose.Types.ObjectId(courseId));

        const updatedMember = await Member.findById(memberId).populate(
            'enrolledCourses',
            'title level start'
        );

        res.json({
            success: true,
            data: updatedMember,
            message: 'Membre désinscrit du cours avec succès',
        });
    } catch (error) {
        console.error('❌ Erreur lors de la désinscription du cours:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la désinscription du cours',
        });
    }
};

// Ajouter un chèque déposé
export const addCheckDeposit = async (req: Request, res: Response) => {
    try {
        const { memberId } = req.params;
        const { amount, depositDate } = req.body;

        const member = await Member.findById(memberId);
        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Membre non trouvé',
            });
        }

        await member.addCheckDeposit(amount, new Date(depositDate));

        res.json({
            success: true,
            message: 'Chèque ajouté avec succès',
        });
    } catch (error) {
        console.error("❌ Erreur lors de l'ajout du chèque:", error);
        res.status(500).json({
            success: false,
            message: "Erreur lors de l'ajout du chèque",
        });
    }
};

// Récupérer les membres par ville
export const getMembersByCity = async (req: Request, res: Response) => {
    try {
        const { city } = req.params;
        const members = await Member.findByCity(city);
        const populatedMembers = await Member.populate(members, {
            path: 'enrolledCourses',
            select: 'title level start',
        });

        res.json({
            success: true,
            data: members,
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des membres par ville:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des membres par ville',
        });
    }
};

// Récupérer les membres par tranche d'âge
export const getMembersByAgeRange = async (req: Request, res: Response) => {
    try {
        const { minAge, maxAge } = req.params;
        const members = await Member.findByAgeRange(parseInt(minAge), parseInt(maxAge));
        const populatedMembers = await Member.populate(members, {
            path: 'enrolledCourses',
            select: 'title level start',
        });

        res.json({
            success: true,
            data: populatedMembers,
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des membres par âge:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des membres par âge',
        });
    }
};

// Récupérer les membres avec droit à l'image
export const getMembersWithImageRights = async (req: Request, res: Response) => {
    try {
        const members = await Member.findWithImageRights();
        const populatedMembers = await Member.populate(members, {
            path: 'enrolledCourses',
            select: 'title level start',
        });

        res.json({
            success: true,
            data: populatedMembers,
        });
    } catch (error) {
        console.error("❌ Erreur lors de la récupération des membres avec droit à l'image:", error);
        res.status(500).json({
            success: false,
            message: "Erreur lors de la récupération des membres avec droit à l'image",
        });
    }
};

// Récupérer les membres inscrits à un cours
export const getMembersEnrolledInCourse = async (req: Request, res: Response) => {
    try {
        const { courseId } = req.params;
        const members = await Member.findEnrolledInCourse(new mongoose.Types.ObjectId(courseId));
        const populatedMembers = await Member.populate(members, {
            path: 'enrolledCourses',
            select: 'title level start',
        });

        res.json({
            success: true,
            data: populatedMembers,
        });
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des membres du cours:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des membres du cours',
        });
    }
};
