import { Router } from 'express';
import { PdfController } from '../controllers/pdfController';

const router = Router();

// Route pour télécharger le PDF du formulaire d'inscription (depuis cache)
router.get('/inscription-form', PdfController.generateInscriptionForm);

// Route admin pour forcer la régénération du cache PDF
router.post('/inscription-form/regenerate', PdfController.regenerateInscriptionForm);

export default router;
