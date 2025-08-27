import express from 'express';
import {
    getAllGalleryImages,
    getGalleryImageById,
    uploadImage,
    createGalleryEntry,
    updateGalleryImage,
    deleteGalleryImage,
    uploadMiddleware,
} from '../controllers/galleryController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Routes publiques (pour le frontend vitrine)
router.get('/', getAllGalleryImages);
router.get('/:id', getGalleryImageById);

// Routes protégées (pour le BackOffice)
router.post('/upload', authenticateToken, uploadMiddleware, uploadImage);
router.post('/', authenticateToken, createGalleryEntry);
router.put('/:id', authenticateToken, updateGalleryImage);
router.delete('/:id', authenticateToken, deleteGalleryImage);

export default router;
