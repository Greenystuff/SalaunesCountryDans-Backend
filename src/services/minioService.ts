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

        // Créer le fichier robots.txt pour le sous-domaine (à la racine du domaine)
        await this.createRootRobotsTxt();

        // Forcer la mise à jour de la politique pour s'assurer que robots.txt est accessible
        await this.updateBucketPolicy();

        // Configurer l'accès anonyme pour le bucket (politique download de MinIO)
        await this.setAnonymousAccess();

        // Vérifier que le fichier robots.txt est accessible
        await this.verifyRobotsTxtAccess();

        // Tester l'URL publique du robots.txt
        await this.testRobotsTxtUrl();

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
     * Génère une URL publique directe (sans signature)
     */
    getPublicUrl(bucketName: string, fileName: string): string {
        const endpoint = process.env.MINIO_EXTERNAL_ENDPOINT || 'localhost:9000';
        // Utiliser HTTPS pour le domaine de production
        const protocol = endpoint.includes('salaunescountrydans.fr')
            ? 'https'
            : process.env.MINIO_USE_SSL === 'true'
            ? 'https'
            : 'http';
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
    async fileExists(fileName: string): Promise<boolean> {
        try {
            await this.client.statObject(this.bucketName, fileName);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Liste tous les fichiers dans le bucket
     */
    async listFiles(prefix?: string): Promise<string[]> {
        try {
            const files: string[] = [];
            const stream = this.client.listObjects(this.bucketName, prefix, true);

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

    /**
     * Crée le fichier robots.txt à la racine du domaine (Virtual Hosted-Style)
     */
    private async createRootRobotsTxt() {
        try {
            const robotsContent = `User-agent: *
Allow: /pdfs/
Disallow: /

# Sitemap pour les fichiers
Sitemap: https://salaunescountrydans.fr/sitemap.xml`;

            const buffer = Buffer.from(robotsContent, 'utf-8');

            // Créer un bucket spécial pour les fichiers racine
            const rootBucketName = 'files.salaunescountrydans.fr';

            try {
                const rootBucketExists = await this.client.bucketExists(rootBucketName);
                if (!rootBucketExists) {
                    await this.client.makeBucket(rootBucketName, 'us-east-1');
                    console.log(`✅ Bucket racine '${rootBucketName}' créé avec succès`);
                }

                // Configurer la politique publique pour le bucket racine
                const rootPolicy = {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Effect: 'Allow',
                            Principal: {
                                AWS: ['*'],
                            },
                            Action: ['s3:GetObject'],
                            Resource: [`arn:aws:s3:::${rootBucketName}/*`],
                        },
                    ],
                };

                await this.client.setBucketPolicy(rootBucketName, JSON.stringify(rootPolicy));
                console.log(
                    `✅ Politique publique configurée pour le bucket racine '${rootBucketName}'`
                );

                // Supprimer l'ancien fichier robots.txt s'il existe
                try {
                    await this.client.removeObject(rootBucketName, 'robots.txt');
                    console.log(`🗑️ Ancien fichier robots.txt supprimé du bucket racine`);
                } catch (error) {
                    console.log(`ℹ️ Aucun ancien fichier robots.txt à supprimer du bucket racine`);
                }

                // Créer le nouveau fichier robots.txt dans le bucket racine
                await this.client.putObject(rootBucketName, 'robots.txt', buffer, {
                    'Content-Type': 'text/plain',
                    'Cache-Control': 'public, max-age=3600',
                });
                console.log(`✅ Fichier robots.txt créé dans le bucket racine '${rootBucketName}'`);
            } catch (error) {
                console.error('❌ Erreur lors de la création du bucket racine:', error);
            }
        } catch (error) {
            console.error('❌ Erreur lors de la création du fichier robots.txt racine:', error);
        }
    }

    /**
     * Met à jour la politique du bucket pour s'assurer que robots.txt est accessible
     */
    private async updateBucketPolicy() {
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
            console.log(`✅ Politique du bucket mise à jour pour robots.txt`);
        } catch (error) {
            console.error('❌ Erreur lors de la mise à jour de la politique du bucket:', error);
        }
    }

    /**
     * Configure l'accès anonyme pour le bucket (politique download de MinIO)
     */
    private async setAnonymousAccess() {
        try {
            // Utiliser la politique download de MinIO qui permet l'accès public en lecture
            const downloadPolicy = {
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Principal: {
                            AWS: ['*'],
                        },
                        Action: ['s3:GetObject'],
                        Resource: [`arn:aws:s3:::${this.bucketName}/*`],
                    },
                ],
            };

            await this.client.setBucketPolicy(this.bucketName, JSON.stringify(downloadPolicy));
            console.log(
                `✅ Politique download (accès anonyme) configurée pour le bucket '${this.bucketName}'`
            );
        } catch (error) {
            console.error("❌ Erreur lors de la configuration de l'accès anonyme:", error);
        }
    }

    /**
     * Vérifie que le fichier robots.txt est accessible publiquement
     */
    private async verifyRobotsTxtAccess() {
        try {
            // Tenter d'accéder au fichier robots.txt
            const stats = await this.client.statObject(this.bucketName, 'robots.txt');
            console.log(`✅ Fichier robots.txt accessible - Taille: ${stats.size} bytes`);

            // Tenter de lire le contenu
            const stream = await this.client.getObject(this.bucketName, 'robots.txt');
            let content = '';
            stream.on('data', (chunk) => {
                content += chunk.toString();
            });

            stream.on('end', () => {
                console.log(`✅ Contenu du robots.txt vérifié (${content.length} caractères)`);
            });
        } catch (error) {
            console.error('❌ Erreur lors de la vérification du fichier robots.txt:', error);
        }
    }

    /**
     * Teste l'URL publique du fichier robots.txt
     */
    private async testRobotsTxtUrl() {
        try {
            // Tester l'URL racine (Virtual Hosted-Style)
            const rootUrl = 'https://files.salaunescountrydans.fr/robots.txt';
            console.log(`🔗 URL racine du robots.txt: ${rootUrl}`);

            // Tester l'accès via HTTP
            const response = await fetch(rootUrl);
            if (response.ok) {
                const content = await response.text();
                console.log(
                    `✅ Accès HTTP réussi à la racine - Contenu (${
                        content.length
                    } caractères): ${content.substring(0, 100)}...`
                );
            } else {
                console.log(
                    `❌ Accès HTTP échoué à la racine - Status: ${response.status} ${response.statusText}`
                );
            }

            // Tester aussi l'URL du bucket (pour comparaison)
            const bucketUrl = this.getPublicUrl(this.bucketName, 'robots.txt');
            console.log(`🔗 URL bucket du robots.txt: ${bucketUrl}`);
        } catch (error) {
            console.error("❌ Erreur lors du test de l'URL publique:", error);
        }
    }
}

export default new MinioService();
