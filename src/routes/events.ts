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
    getEventsForSelection,
    getEventEnrollmentCount,
} from '../controllers/eventController';
import {
    createException,
    getExceptions,
    updateException,
    deleteException,
} from '../controllers/eventExceptionController';

const router = express.Router();

// Routes publiques
router.get('/', getAllEvents);
router.get('/upcoming', getUpcomingEvents);
router.get('/for-selection', getEventsForSelection);
router.get('/date/:date', getEventsByDate);
router.get('/search', searchEvents);
router.get('/stats', getEventStats);
router.get('/recurring', getRecurringEvents);
router.get('/type/:type', getEventsByType);

// Routes protégées (nécessitent une authentification)
router.use(authenticateToken);

router.get('/:id', getEventById);
router.get('/:id/enrollment-count', getEventEnrollmentCount);
router.post('/', createEvent);
router.put('/:id', updateEvent);
router.delete('/:id', deleteEvent);

// Routes pour les exceptions d'événements récurrents
router.post('/:eventId/exceptions', createException);
router.get('/:eventId/exceptions', getExceptions);
router.put('/:eventId/exceptions/:exceptionId', updateException);
router.delete('/:eventId/exceptions/:exceptionId', deleteException);

export default router;
