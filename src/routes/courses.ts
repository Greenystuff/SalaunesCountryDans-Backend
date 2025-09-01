import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
    getAllCourses,
    getUpcomingCourses,
    getCoursesByDate,
    getCourseById,
    createCourse,
    updateCourse,
    deleteCourse,
    searchCourses,
    getCourseStats,
    getRecurringCourses,
} from '../controllers/courseController';

const router = express.Router();

// Routes publiques
router.get('/', getAllCourses);
router.get('/upcoming', getUpcomingCourses);
router.get('/date/:date', getCoursesByDate);
router.get('/search', searchCourses);
router.get('/stats', getCourseStats);
router.get('/recurring', getRecurringCourses);

// Routes protégées (nécessitent une authentification)
router.use(authenticateToken);

router.get('/:id', getCourseById);
router.post('/', createCourse);
router.put('/:id', updateCourse);
router.delete('/:id', deleteCourse);

export default router;
