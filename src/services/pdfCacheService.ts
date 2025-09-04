import htmlPdf from 'html-pdf-node';
import fs from 'fs';
import path from 'path';

export class PdfCacheService {
    private static instance: PdfCacheService;
    private inscriptionFormPdf: Buffer | null = null;
    private isGenerating = false;

    public static getInstance(): PdfCacheService {
        if (!PdfCacheService.instance) {
            PdfCacheService.instance = new PdfCacheService();
        }
        return PdfCacheService.instance;
    }

    /**
     * Génère et met en cache le PDF du formulaire d'inscription
     */
    public async generateInscriptionFormPdf(): Promise<void> {
        if (this.isGenerating) {
            console.log('📄 Génération PDF déjà en cours...');
            return;
        }

        this.isGenerating = true;
        console.log("📄 Génération du PDF d'inscription...");

        try {
            const templatePath = path.join(
                process.cwd(),
                process.env.NODE_ENV === 'production' ? 'dist' : 'src',
                'templates',
                'inscription-template.html'
            );

            if (!fs.existsSync(templatePath)) {
                throw new Error('Template HTML introuvable');
            }

            const htmlContent = fs.readFileSync(templatePath, 'utf-8');

            const pdfOptions = {
                format: 'A4' as const,
                margin: {
                    top: '5mm',
                    right: '12mm',
                    bottom: '5mm',
                    left: '12mm',
                },
                printBackground: true,
                displayHeaderFooter: false,
                preferCSSPageSize: true,
                omitBackground: false,
            };

            const htmlFile = { content: htmlContent };

            this.inscriptionFormPdf = await new Promise<Buffer>((resolve, reject) => {
                htmlPdf.generatePdf(htmlFile, pdfOptions, (err: Error | null, buffer: Buffer) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(buffer);
                    }
                });
            });

            console.log(
                `✅ PDF d'inscription généré et mis en cache (${this.inscriptionFormPdf.length} bytes)`
            );
        } catch (error) {
            console.error("❌ Erreur génération PDF d'inscription:", error);
            this.inscriptionFormPdf = null;
            throw error;
        } finally {
            this.isGenerating = false;
        }
    }

    /**
     * Retourne le PDF mis en cache
     */
    public getInscriptionFormPdf(): Buffer | null {
        return this.inscriptionFormPdf;
    }

    /**
     * Vérifie si le PDF est disponible en cache
     */
    public isInscriptionFormPdfCached(): boolean {
        return this.inscriptionFormPdf !== null;
    }

    /**
     * Force la régénération du PDF (utile si le template change)
     */
    public async regenerateInscriptionFormPdf(): Promise<void> {
        this.inscriptionFormPdf = null;
        await this.generateInscriptionFormPdf();
    }
}
