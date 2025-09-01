import express from 'express';
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
} from '../controllers/courseController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Routes publiques (pour le frontend)
router.get('/', getAllCourses);
router.get('/upcoming', getUpcomingCourses);
router.get('/date/:date', getCoursesByDate);
router.get('/search', searchCourses);
router.get('/stats', getCourseStats);

// Routes protégées (admin uniquement)
router.get('/:id', authenticateToken, getCourseById);
router.post('/', authenticateToken, createCourse);
router.put('/:id', authenticateToken, updateCourse);
router.delete('/:id', authenticateToken, deleteCourse);

export default router;
