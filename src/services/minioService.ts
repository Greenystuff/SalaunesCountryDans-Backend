import { Client } from 'minio';
import axios from 'axios';
import { Readable } from 'stream';
import path from 'path';

class MinioService {
    private client: Client;
    private bucketName: string;

    constructor() {
        this.client = new Client({
            endPoint: process.env.MINIO_ENDPOINT || 'localhost',
            port: parseInt(process.env.MINIO_PORT || '9000'),
            useSSL: process.env.MINIO_USE_SSL === 'true',
            accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
            secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',
        });

        this.bucketName = process.env.MINIO_BUCKET_NAME || 'pdfs';
        this.initBucket();
    }

    private async initBucket() {
        try {
            const exists = await this.client.bucketExists(this.bucketName);
            if (!exists) {
                await this.client.makeBucket(this.bucketName, 'us-east-1');
                console.log(`✅ Bucket '${this.bucketName}' créé avec succès`);

                // Configurer la politique publique pour les PDFs et robots.txt
                const policy = {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Effect: 'Allow',
                            Principal: {
                                AWS: ['*'],
                            },
                            Action: ['s3:GetObject'],
                            Resource: [
                                `arn:aws:s3:::${this.bucketName}/*`,
                                `arn:aws:s3:::${this.bucketName}/robots.txt`,
                            ],
                        },
                    ],
                };

                await this.client.setBucketPolicy(this.bucketName, JSON.stringify(policy));
                console.log(`✅ Politique publique configurée pour le bucket '${this.bucketName}'`);
            } else {
                // Vérifier et mettre à jour la politique si le bucket existe déjà
                try {
                    const policy = {
                        Version: '2012-10-17',
                        Statement: [
                            {
                                Effect: 'Allow',
                                Principal: {
                                    AWS: ['*'],
                                },
                                Action: ['s3:GetObject'],
                                Resource: [
                                    `arn:aws:s3:::${this.bucketName}/*`,
                                    `arn:aws:s3:::${this.bucketName}/robots.txt`,
                                ],
                            },
                        ],
                    };

                    await this.client.setBucketPolicy(this.bucketName, JSON.stringify(policy));
                    console.log(
                        `✅ Politique publique mise à jour pour le bucket '${this.bucketName}'`
                    );
                } catch (policyError) {
                    console.log(`ℹ️ Politique déjà configurée pour le bucket '${this.bucketName}'`);
                }
            }
        } catch (error) {
            console.error("❌ Erreur lors de l'initialisation du bucket MinIO:", error);
        }

        // Créer le bucket gallery s'il n'existe pas
        try {
            const galleryBucketName = 'gallery';
            const galleryBucketExists = await this.client.bucketExists(galleryBucketName);
            if (!galleryBucketExists) {
                await this.client.makeBucket(galleryBucketName, 'us-east-1');
                console.log(`✅ Bucket '${galleryBucketName}' créé avec succès`);

                // Configurer la politique publique pour le bucket gallery
                const galleryPolicy = {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Effect: 'Allow',
                            Principal: { AWS: ['*'] },
                            Action: ['s3:GetObject'],
                            Resource: [`arn:aws:s3:::${galleryBucketName}/*`],
                        },
                    ],
                };

                await this.client.setBucketPolicy(galleryBucketName, JSON.stringify(galleryPolicy));
                console.log(
                    `✅ Politique publique configurée pour le bucket '${galleryBucketName}'`
                );
            }
        } catch (error) {
            console.error("❌ Erreur lors de l'initialisation du bucket gallery:", error);
        }

        // Créer le bucket documents s'il n'existe pas
        try {
            const documentsBucketName = 'documents';
            const documentsBucketExists = await this.client.bucketExists(documentsBucketName);
            if (!documentsBucketExists) {
                await this.client.makeBucket(documentsBucketName, 'us-east-1');
                console.log(`✅ Bucket '${documentsBucketName}' créé avec succès`);

                // Configurer la politique publique pour le bucket documents
                const documentsPolicy = {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Effect: 'Allow',
                            Principal: { AWS: ['*'] },
                            Action: ['s3:GetObject'],
                            Resource: [`arn:aws:s3:::${documentsBucketName}/*`],
                        },
                    ],
                };

                await this.client.setBucketPolicy(
                    documentsBucketName,
                    JSON.stringify(documentsPolicy)
                );
                console.log(
                    `✅ Politique publique configurée pour le bucket '${documentsBucketName}'`
                );
            }
        } catch (error) {
            console.error("❌ Erreur lors de l'initialisation du bucket documents:", error);
        }
    }

    /**
     * Télécharge un PDF depuis une URL et l'upload vers MinIO
     */
    async downloadAndUploadPdf(pdfUrl: string, danceName: string): Promise<string | null> {
        try {
            console.log(`📥 Téléchargement de: ${pdfUrl}`);

            // Télécharger le PDF
            const response = await axios.get(pdfUrl, {
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
            });

            if (response.status !== 200) {
                console.error(`❌ Erreur HTTP ${response.status} pour ${pdfUrl}`);
                return null;
            }

            // Générer un nom de fichier unique
            const fileName = this.generateFileName(danceName, pdfUrl);

            // Convertir le buffer en stream
            const stream = Readable.from(response.data);

            // Upload vers MinIO
            await this.client.putObject(this.bucketName, fileName, stream, response.data.length, {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `inline; filename="${fileName}"`,
            });

            console.log(`✅ PDF uploadé: ${fileName}`);
            return fileName;
        } catch (error) {
            console.error(`❌ Erreur lors du téléchargement/upload de ${pdfUrl}:`, error);
            return null;
        }
    }

    /**
     * Upload un fichier depuis un buffer vers MinIO
     */
    async uploadFile(
        bucketName: string,
        fileName: string,
        buffer: Buffer,
        contentType: string
    ): Promise<boolean> {
        try {
            // Convertir le buffer en stream
            const stream = Readable.from(buffer);

            // Upload vers MinIO
            await this.client.putObject(bucketName, fileName, stream, buffer.length, {
                'Content-Type': contentType,
                'Content-Disposition': `inline; filename="${fileName}"`,
            });

            console.log(`✅ Fichier uploadé: ${fileName}`);
            return true;
        } catch (error) {
            console.error(`❌ Erreur lors de l'upload de ${fileName}:`, error);
            return false;
        }
    }

    /**
     * Génère un nom de fichier unique pour le PDF
     */
    private generateFileName(danceName: string, originalUrl: string): string {
        // Nettoyer le nom de la danse
        const cleanName = danceName
            .replace(/[^a-zA-Z0-9\s-]/g, '') // Supprimer les caractères spéciaux
            .replace(/\s+/g, '-') // Remplacer les espaces par des tirets
            .toLowerCase()
            .trim();

        // Extraire l'extension du fichier original
        const urlPath = new URL(originalUrl).pathname;
        const originalFileName = path.basename(urlPath);
        const extension = path.extname(originalFileName) || '.pdf';

        // Ajouter un timestamp pour l'unicité
        const timestamp = Date.now();

        return `dances/${cleanName}-${timestamp}${extension}`;
    }

    /**
     * Génère le chemin pour un fichier vidéo original
     */
    getVideoOriginalPath(videoId: string, extension: string = '.mp4'): string {
        return `videos/originals/${videoId}${extension}`;
    }

    /**
     * Génère le chemin pour une thumbnail vidéo
     */
    getVideoThumbnailPath(videoId: string): string {
        return `videos/thumbnails/${videoId}-thumb.jpg`;
    }

    /**
     * Génère le chemin pour une vidéo transcodée
     */
    getVideoTranscodedPath(videoId: string, resolution: '480p' | '720p' | '1080p'): string {
        return `videos/transcoded/${videoId}-${resolution}.mp4`;
    }

    /**
     * Génère le chemin pour un manifest HLS
     */
    getVideoHlsManifestPath(videoId: string, resolution: '480p' | '720p' | '1080p'): string {
        return `videos/hls/${videoId}/${resolution}.m3u8`;
    }

    /**
     * Génère le chemin pour un master manifest HLS
     */
    getVideoHlsMasterManifestPath(videoId: string): string {
        return `videos/hls/${videoId}/master.m3u8`;
    }

    /**
     * Génère le chemin pour un segment HLS
     */
    getVideoHlsSegmentPath(
        videoId: string,
        resolution: '480p' | '720p' | '1080p',
        segmentIndex: number
    ): string {
        return `videos/hls/${videoId}/segments/${resolution}_${segmentIndex.toString().padStart(3, '0')}.ts`;
    }

    /**
     * Upload un fichier vidéo vers MinIO
     */
    async uploadVideoFile(
        fileName: string,
        buffer: Buffer,
        contentType: string = 'video/mp4'
    ): Promise<boolean> {
        return this.uploadFile('gallery', fileName, buffer, contentType);
    }

    /**
     * Obtient l'URL publique d'une vidéo
     */
    getVideoUrl(fileName: string): string {
        return this.getPublicUrl('gallery', fileName);
    }

    /**
     * Télécharge un fichier vidéo depuis MinIO vers un fichier temporaire local
     */
    async downloadVideoFile(fileName: string, destinationPath: string): Promise<boolean> {
        try {
            console.log(`📥 Téléchargement de ${fileName} depuis MinIO...`);

            await this.client.fGetObject('gallery', fileName, destinationPath);

            console.log(`✅ Vidéo téléchargée vers ${destinationPath}`);
            return true;
        } catch (error) {
            console.error(`❌ Erreur lors du téléchargement de ${fileName}:`, error);
            return false;
        }
    }

    /**
     * Supprime tous les fichiers vidéo associés à un ID
     */
    async deleteVideoFiles(videoId: string): Promise<boolean> {
        try {
            // Lister tous les fichiers du dossier vidéo
            const videoPrefix = `videos/`;
            const files = await this.listFiles('gallery', videoPrefix);

            // Filtrer les fichiers contenant l'ID vidéo
            const videoFiles = files.filter((file) => file.includes(videoId));

            // Supprimer chaque fichier
            const deletePromises = videoFiles.map((file) => this.deleteFile('gallery', file));
            const results = await Promise.all(deletePromises);

            // Vérifier que tous les fichiers ont été supprimés
            const allDeleted = results.every((result) => result === true);

            if (allDeleted) {
                console.log(`✅ Tous les fichiers vidéo supprimés pour ${videoId}`);
            } else {
                console.warn(`⚠️ Certains fichiers vidéo n'ont pas pu être supprimés pour ${videoId}`);
            }

            return allDeleted;
        } catch (error) {
            console.error(
                `❌ Erreur lors de la suppression des fichiers vidéo pour ${videoId}:`,
                error
            );
            return false;
        }
    }

    /**
     * Génère une URL publique directe (sans signature)
     */
    getPublicUrl(bucketName: string, fileName: string): string {
        // En mode développement, utiliser l'endpoint local
        if (process.env.NODE_ENV !== 'production') {
            const localEndpoint = process.env.MINIO_ENDPOINT || 'localhost';
            const localPort = process.env.MINIO_PORT || '9000';
            const protocol = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
            return `${protocol}://${localEndpoint}:${localPort}/${bucketName}/${fileName}`;
        }

        // En production, utiliser l'endpoint externe
        const endpoint = process.env.MINIO_EXTERNAL_ENDPOINT || 'localhost:9000';
        const protocol = endpoint.includes('salaunescountrydans.fr') ? 'https' : 'http';
        return `${protocol}://${endpoint}/${bucketName}/${fileName}`;
    }

    /**
     * Génère une URL de téléchargement temporaire
     */
    async getPresignedUrl(fileName: string, expiresIn: number = 3600): Promise<string> {
        try {
            return await this.client.presignedGetObject(this.bucketName, fileName, expiresIn);
        } catch (error) {
            console.error(`❌ Erreur lors de la génération de l'URL pour ${fileName}:`, error);
            throw error;
        }
    }

    /**
     * Supprime un fichier de MinIO
     */
    async deleteFile(bucketName: string, fileName: string): Promise<boolean> {
        try {
            await this.client.removeObject(bucketName, fileName);
            console.log(`✅ Fichier supprimé: ${fileName}`);
            return true;
        } catch (error) {
            console.error(`❌ Erreur lors de la suppression de ${fileName}:`, error);
            return false;
        }
    }

    /**
     * Vérifie si un fichier existe
     */
    async fileExists(bucketName: string, fileName: string): Promise<boolean> {
        try {
            await this.client.statObject(bucketName, fileName);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Liste tous les fichiers dans le bucket
     */
    async listFiles(bucketName: string, prefix?: string): Promise<string[]> {
        try {
            const files: string[] = [];
            const stream = this.client.listObjects(bucketName, prefix, true);

            return new Promise((resolve, reject) => {
                stream.on('data', (obj) => {
                    files.push(obj.name);
                });

                stream.on('end', () => {
                    resolve(files);
                });

                stream.on('error', (error) => {
                    reject(error);
                });
            });
        } catch (error) {
            console.error('❌ Erreur lors de la liste des fichiers:', error);
            return [];
        }
    }

    /**
     * Obtient les informations d'un fichier
     */
    async getFileInfo(fileName: string) {
        try {
            return await this.client.statObject(this.bucketName, fileName);
        } catch (error) {
            console.error(`❌ Erreur lors de la récupération des infos pour ${fileName}:`, error);
            return null;
        }
    }
}

export default new MinioService();
