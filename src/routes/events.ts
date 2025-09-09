import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
    getAllEvents,
    getUpcomingEvents,
    getEventsByDate,
    getEventById,
    createEvent,
    updateEvent,
    deleteEvent,
    searchEvents,
    getEventStats,
    getRecurringEvents,
    getEventsByType,
} from '../controllers/eventController';

const router = express.Router();

// Routes publiques
router.get('/', getAllEvents);
router.get('/upcoming', getUpcomingEvents);
router.get('/date/:date', getEventsByDate);
router.get('/search', searchEvents);
router.get('/stats', getEventStats);
router.get('/recurring', getRecurringEvents);
router.get('/type/:type', getEventsByType);

// Routes protégées (nécessitent une authentification)
router.use(authenticateToken);

router.get('/:id', getEventById);
router.post('/', createEvent);
router.put('/:id', updateEvent);
router.delete('/:id', deleteEvent);

export default router;
