import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
    createPayment,
    getMemberPayments,
    updatePayment,
    deletePayment,
    getMemberPaymentStats,
} from '../controllers/paymentController';

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Routes pour les paiements d'un membre
router.post('/members/:memberId/payments', createPayment);
router.get('/members/:memberId/payments', getMemberPayments);
router.get('/members/:memberId/payments/stats', getMemberPaymentStats);

// Routes pour un paiement spécifique
router.put('/payments/:id', updatePayment);
router.delete('/payments/:id', deletePayment);

export default router;
