import express from 'express';
import {
    getAllGalleryImages,
    getAllMediaItems,
    getGalleryImageById,
    uploadImage,
    createGalleryEntry,
    updateGalleryImage,
    deleteGalleryImage,
    uploadMiddleware,
    uploadVideo,
    getVideoStatus,
    retryVideoTranscoding,
} from '../controllers/galleryController';
import { authenticateToken } from '../middleware/auth';
import { videoUpload } from '../middleware/videoUpload';

const router = express.Router();

// Routes publiques (pour le frontend vitrine)
router.get('/', getAllMediaItems); // Mise à jour pour supporter images + vidéos

// Routes vidéo publiques - DOIT être avant /:id pour éviter conflit
router.get('/:id/status', getVideoStatus); // Statut du transcoding

router.get('/:id', getGalleryImageById);

// Routes protégées (pour le BackOffice)
// Images
router.post('/upload', authenticateToken, uploadMiddleware, uploadImage);

// Vidéos
router.post(
    '/upload-video',
    authenticateToken,
    videoUpload.single('video'),
    // cleanupTempFiles retiré : le worker BullMQ gère le cleanup après transcoding
    uploadVideo
);
router.post('/:id/retry', authenticateToken, retryVideoTranscoding);

// Communes
router.post('/', authenticateToken, createGalleryEntry);
router.put('/:id', authenticateToken, updateGalleryImage);
router.delete('/:id', authenticateToken, deleteGalleryImage);

export default router;
