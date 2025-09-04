import { Request, Response } from 'express';
import { PdfCacheService } from '../services/pdfCacheService';

export class PdfController {
    /**
     * Retourne le PDF du formulaire d'inscription depuis le cache
     */
    static async generateInscriptionForm(req: Request, res: Response): Promise<void> {
        try {
            const pdfCache = PdfCacheService.getInstance();
            const pdfBuffer = pdfCache.getInscriptionFormPdf();

            if (!pdfBuffer) {
                // Fallback : générer le PDF si pas en cache (ne devrait pas arriver)
                console.warn('⚠️ PDF non trouvé en cache, génération...');
                await pdfCache.generateInscriptionFormPdf();
                const retryBuffer = pdfCache.getInscriptionFormPdf();

                if (!retryBuffer) {
                    res.status(500).json({ error: 'Impossible de générer le PDF' });
                    return;
                }

                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader(
                    'Content-Disposition',
                    'attachment; filename="formulaire-inscription-salaunes-country-dans.pdf"'
                );
                res.setHeader('Content-Length', retryBuffer.length);
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); // Pas de cache
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                res.send(retryBuffer);
                return;
            }

            // Servir le PDF depuis le cache (cas normal)
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                'attachment; filename="formulaire-inscription-salaunes-country-dans.pdf"'
            );
            res.setHeader('Content-Length', pdfBuffer.length);
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); // Pas de cache
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');

            res.send(pdfBuffer);
        } catch (error) {
            console.error('Erreur service PDF:', error);
            res.status(500).json({
                error: 'Erreur lors de la génération du PDF',
                details: error instanceof Error ? error.message : 'Erreur inconnue',
            });
        }
    }

    /**
     * Force la régénération du PDF en cache (endpoint admin optionnel)
     */
    static async regenerateInscriptionForm(req: Request, res: Response): Promise<void> {
        try {
            const pdfCache = PdfCacheService.getInstance();
            await pdfCache.regenerateInscriptionFormPdf();

            res.json({
                success: true,
                message: 'PDF régénéré avec succès',
            });
        } catch (error) {
            console.error('Erreur régénération PDF:', error);
            res.status(500).json({
                error: 'Erreur lors de la régénération du PDF',
                details: error instanceof Error ? error.message : 'Erreur inconnue',
            });
        }
    }
}
