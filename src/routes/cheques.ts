import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
    listMemberCheques,
    createMemberCheque,
    updateMemberCheque,
    deleteMemberCheque,
    updateChequeStatus,
} from '../controllers/chequeController';

const router = express.Router({ mergeParams: true });

// Toutes ces routes nécessitent une authentification admin
router.use(authenticateToken);

router.get('/', listMemberCheques);
router.post('/', createMemberCheque);
router.put('/:checkId', updateMemberCheque);
router.delete('/:checkId', deleteMemberCheque);
router.patch('/:checkId/status', updateChequeStatus);

export default router;
