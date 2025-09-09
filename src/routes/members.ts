import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
    getAllMembers,
    getMemberById,
    createMember,
    updateMember,
    deleteMember,
    searchMembers,
    getMemberStats,
    enrollMemberInEvent,
    unenrollMemberFromEvent,
    getMembersByCity,
    getMembersByAgeRange,
    getMembersWithImageRights,
    getMembersEnrolledInEvent,
} from '../controllers/memberController';
import chequesRouter from './cheques';

const router = express.Router();

// Routes publiques (pour les statistiques générales)
router.get('/stats', getMemberStats);

// Routes protégées (nécessitent une authentification)
router.use(authenticateToken);

// Routes CRUD principales
router.get('/', getAllMembers);
router.get('/search', searchMembers);
router.get('/:id', getMemberById);
router.post('/', createMember);
router.put('/:id', updateMember);
router.delete('/:id', deleteMember);

// Routes pour l'inscription aux événements
router.post('/:memberId/events/:eventId/enroll', enrollMemberInEvent);
router.delete('/:memberId/events/:eventId/enroll', unenrollMemberFromEvent);

// Routes pour les chèques
router.use('/:memberId/checks', chequesRouter);

// Routes de filtrage spécialisées
router.get('/city/:city', getMembersByCity);
router.get('/age/:minAge/:maxAge', getMembersByAgeRange);
router.get('/image-rights/with', getMembersWithImageRights);
router.get('/events/:eventId/members', getMembersEnrolledInEvent);

export default router;
