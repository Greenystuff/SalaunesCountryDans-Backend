import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import fs from 'fs-extra';
import videoProcessingService from './videoProcessingService';
import minioService from './minioService';
import Gallery from '../models/Gallery';
import websocketService from './websocketService';

// Interface pour les données du job
export interface VideoJobData {
    videoId: string;
    tempFilePath: string;
    originalFileName: string;
}

// Interface pour le résultat du job
export interface VideoJobResult {
    videoId: string;
    status: 'completed' | 'failed' | 'partial';
    metadata?: any;
    thumbnail?: any;
    variants?: any[];
    error?: string;
}

class VideoQueueService {
    private queue: Queue<VideoJobData, VideoJobResult>;
    private worker: Worker<VideoJobData, VideoJobResult>;
    private queueEvents: QueueEvents;
    private connection: IORedis;

    constructor() {
        // Configurer la connexion Redis
        this.connection = new IORedis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || undefined,
            maxRetriesPerRequest: null, // Requis pour BullMQ
            retryStrategy: (times: number) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
        });

        // Créer la queue
        this.queue = new Queue<VideoJobData, VideoJobResult>('video-processing', {
            connection: this.connection,
            defaultJobOptions: {
                attempts: parseInt(process.env.VIDEO_QUEUE_MAX_ATTEMPTS || '3'),
                backoff: {
                    type: 'exponential',
                    delay: 5000,
                },
                removeOnComplete: {
                    age: 24 * 3600, // 24 heures
                    count: 100,
                },
                removeOnFail: {
                    age: 7 * 24 * 3600, // 7 jours
                },
            },
        });

        // Créer le worker
        const concurrency = parseInt(process.env.VIDEO_QUEUE_CONCURRENCY || '2');
        this.worker = new Worker<VideoJobData, VideoJobResult>(
            'video-processing',
            async (job: Job<VideoJobData, VideoJobResult>) => {
                return this.processVideoJob(job);
            },
            {
                connection: this.connection.duplicate(),
                concurrency,
                lockDuration: 300000, // 5 minutes
            }
        );

        // Créer les événements de la queue
        this.queueEvents = new QueueEvents('video-processing', {
            connection: this.connection.duplicate(),
        });

        // Enregistrer les listeners d'événements
        this.setupEventListeners();

        console.log(`✅ VideoQueueService initialisé (concurrence: ${concurrency})`);
    }

    /**
     * Configure les listeners d'événements pour la queue
     */
    private setupEventListeners(): void {
        // Worker events
        this.worker.on('completed', async (job: Job<VideoJobData, VideoJobResult>) => {
            console.log(`✅ Job ${job.id} (vidéo ${job.data.videoId}) terminé avec succès`);

            try {
                // Mettre à jour le document Gallery
                const updatedVideo = await Gallery.findByIdAndUpdate(
                    job.data.videoId,
                    {
                        processingStatus: 'completed',
                        processingProgress: 100,
                        processingCompletedAt: new Date(),
                    },
                    { new: true }
                );

                // Notifier via WebSocket
                if (updatedVideo) {
                    websocketService.notifyVideoProcessing(job.data.videoId, {
                        status: 'completed',
                        progress: 100,
                        variants: updatedVideo.variants,
                    });
                }

                // Nettoyer les fichiers temporaires
                await fs.remove(job.data.tempFilePath).catch(console.error);
                await videoProcessingService.cleanup(job.data.videoId);
            } catch (error) {
                console.error(`❌ Erreur lors de la finalisation du job ${job.id}:`, error);
            }
        });

        this.worker.on('failed', async (job: Job<VideoJobData, VideoJobResult> | undefined, err: Error) => {
            if (!job) {
                console.error('❌ Job échoué sans données:', err);
                return;
            }

            console.error(`❌ Job ${job.id} (vidéo ${job.data.videoId}) échoué:`, err.message);

            try {
                // Déterminer si c'est le dernier essai
                const maxAttempts = parseInt(process.env.VIDEO_QUEUE_MAX_ATTEMPTS || '3');
                const isLastAttempt = (job.attemptsMade || 0) >= maxAttempts;

                if (isLastAttempt) {
                    // Mettre à jour le statut comme échoué définitivement
                    await Gallery.findByIdAndUpdate(job.data.videoId, {
                        processingStatus: 'failed',
                        processingError: err.message,
                        processingCompletedAt: new Date(),
                    });

                    // Notifier via WebSocket
                    websocketService.notifyVideoProcessing(job.data.videoId, {
                        status: 'failed',
                        error: err.message,
                    });

                    console.error(`❌ Vidéo ${job.data.videoId} marquée comme échouée après ${maxAttempts} tentatives`);
                }

                // Nettoyer les fichiers temporaires
                await fs.remove(job.data.tempFilePath).catch(console.error);
                await videoProcessingService.cleanup(job.data.videoId);
            } catch (updateError) {
                console.error(`❌ Erreur lors de la mise à jour du statut d'échec:`, updateError);
            }
        });

        this.worker.on('progress', async (job: Job<VideoJobData, VideoJobResult>, progress: number | object) => {
            const progressValue = typeof progress === 'number' ? progress : 0;
            console.log(`⏳ Job ${job.id} (vidéo ${job.data.videoId}): ${progressValue}%`);

            try {
                // Mettre à jour la progression dans MongoDB
                await Gallery.findByIdAndUpdate(job.data.videoId, {
                    processingProgress: Math.round(progressValue),
                });

                // Notifier via WebSocket (throttle pour éviter trop de messages)
                const roundedProgress = Math.round(progressValue);
                if (roundedProgress % 5 === 0 || roundedProgress === 100) {
                    websocketService.notifyVideoProcessing(job.data.videoId, {
                        status: 'processing',
                        progress: roundedProgress,
                    });
                }
            } catch (error) {
                console.error(`❌ Erreur lors de la mise à jour de la progression:`, error);
            }
        });

        this.worker.on('error', (err: Error) => {
            console.error('❌ Erreur du worker:', err);
        });

        // Queue events
        this.queueEvents.on('waiting', ({ jobId }: { jobId: string }) => {
            console.log(`⏳ Job ${jobId} en attente...`);
        });

        this.queueEvents.on('active', ({ jobId }: { jobId: string }) => {
            console.log(`🎬 Job ${jobId} démarré`);
        });
    }

    /**
     * Traite un job de vidéo
     */
    private async processVideoJob(job: Job<VideoJobData, VideoJobResult>): Promise<VideoJobResult> {
        const { videoId, tempFilePath } = job.data;

        console.log(`🎬 Début du traitement de la vidéo ${videoId}`);

        try {
            // Mettre à jour le statut initial
            await Gallery.findByIdAndUpdate(videoId, {
                processingStatus: 'processing',
                processingStartedAt: new Date(),
                processingProgress: 0,
            });

            // 1. Extraire les métadonnées (0% → 5%)
            await job.updateProgress(5);
            console.log(`📊 Extraction des métadonnées...`);
            const metadata = await videoProcessingService.extractMetadata(tempFilePath);

            // Mettre à jour les métadonnées de base dans MongoDB
            await Gallery.findByIdAndUpdate(videoId, {
                width: metadata.width,
                height: metadata.height,
                duration: metadata.duration,
                fileSize: metadata.fileSize,
                mimeType: metadata.mimeType,
            });

            // 2. Upload de la vidéo originale vers MinIO (5% → 15%)
            await job.updateProgress(10);
            console.log(`📤 Upload de la vidéo originale...`);
            const originalBuffer = await fs.readFile(tempFilePath);
            const originalPath = minioService.getVideoOriginalPath(videoId);
            await minioService.uploadFile('gallery', originalPath, originalBuffer, metadata.mimeType);

            await Gallery.findByIdAndUpdate(videoId, {
                videoFile: originalPath,
            });

            // 3. Générer la thumbnail (15% → 25%)
            await job.updateProgress(20);
            console.log(`📸 Génération de la thumbnail...`);
            const thumbnail = await videoProcessingService.generateThumbnail(
                tempFilePath,
                metadata.duration,
                videoId,
                metadata.width,
                metadata.height
            );

            await Gallery.findByIdAndUpdate(videoId, {
                thumbnailFile: thumbnail.minioPath,
            });

            // 4. Transcoder en 3 résolutions (25% → 90%)
            // Filtrer les résolutions pour ne transcoder que celles <= résolution originale
            // Pour vidéos portrait ET landscape, on compare avec la plus petite dimension
            const allResolutions: Array<'480p' | '720p' | '1080p'> = ['480p', '720p', '1080p'];
            const resolutionHeights = { '480p': 480, '720p': 720, '1080p': 1080 };
            const smallestDimension = Math.min(metadata.width, metadata.height);
            const resolutions = allResolutions.filter(
                (res) => resolutionHeights[res] <= smallestDimension
            );

            // Si aucune résolution n'est inférieure ou égale, transcoder au moins en 480p
            if (resolutions.length === 0) {
                resolutions.push('480p');
            }

            console.log(
                `📐 Résolution originale: ${metadata.width}x${metadata.height}, transcodage vers: ${resolutions.join(', ')}`
            );

            const variants: any[] = [];
            const failedVariants: string[] = [];

            for (let i = 0; i < resolutions.length; i++) {
                const resolution = resolutions[i];
                const baseProgress = 25 + i * 20; // 25%, 45%, 65%

                try {
                    console.log(`🎬 Transcoding ${resolution}...`);

                    const variant = await videoProcessingService.transcodeToResolution(
                        tempFilePath,
                        resolution,
                        videoId,
                        (variantProgress) => {
                            // Calculer la progression totale (chaque résolution = ~20%)
                            const totalProgress = baseProgress + Math.round(variantProgress * 0.2);
                            job.updateProgress(totalProgress);
                        }
                    );

                    variants.push({
                        resolution: variant.resolution,
                        fileName: variant.fileName,
                        width: variant.width,
                        height: variant.height,
                        fileSize: variant.fileSize,
                        bitrate: variant.bitrate,
                        hlsManifest: variant.hlsManifest,
                        hlsSegments: variant.hlsSegments,
                        status: 'completed',
                    });

                    console.log(`✅ Transcoding ${resolution} terminé`);
                } catch (error) {
                    console.error(`❌ Échec du transcoding ${resolution}:`, error);
                    failedVariants.push(resolution);

                    variants.push({
                        resolution,
                        fileName: '',
                        width: 0,
                        height: 0,
                        fileSize: 0,
                        bitrate: 0,
                        status: 'failed',
                        processingError: error instanceof Error ? error.message : 'Unknown error',
                    });
                }
            }

            // 5. Générer le master manifest HLS (90% → 95%)
            await job.updateProgress(90);
            const successfulVariants = variants.filter((v) => v.status === 'completed');

            if (successfulVariants.length > 0) {
                console.log(`📝 Génération du master manifest...`);
                try {
                    await videoProcessingService.generateMasterManifest(
                        videoId,
                        successfulVariants.map((v) => ({
                            resolution: v.resolution,
                            bandwidth: v.bitrate * 1000,
                        }))
                    );
                } catch (error) {
                    console.error('❌ Erreur lors de la génération du master manifest:', error);
                }
            }

            // 6. Finaliser (95% → 100%)
            await job.updateProgress(100);

            // Déterminer le statut final
            let finalStatus: 'completed' | 'partial' | 'failed' = 'completed';
            if (failedVariants.length === resolutions.length) {
                finalStatus = 'failed';
            } else if (failedVariants.length > 0) {
                finalStatus = 'partial';
            }

            // Mettre à jour le document Gallery avec les variantes
            await Gallery.findByIdAndUpdate(videoId, {
                variants,
                processingStatus: finalStatus,
                processingProgress: 100,
                processingError:
                    failedVariants.length > 0
                        ? `Échec du transcoding pour: ${failedVariants.join(', ')}`
                        : undefined,
            });

            console.log(`✅ Traitement de la vidéo ${videoId} terminé (statut: ${finalStatus})`);

            return {
                videoId,
                status: finalStatus,
                metadata,
                thumbnail,
                variants,
            };
        } catch (error) {
            console.error(`❌ Erreur lors du traitement de la vidéo ${videoId}:`, error);

            // Mettre à jour le statut d'erreur
            await Gallery.findByIdAndUpdate(videoId, {
                processingStatus: 'failed',
                processingError: error instanceof Error ? error.message : 'Unknown error',
            });

            throw error;
        }
    }

    /**
     * Ajoute un job de traitement vidéo à la queue
     */
    async addToQueue(videoId: string, tempFilePath: string, originalFileName: string): Promise<Job<VideoJobData, VideoJobResult>> {
        try {
            const job = await this.queue.add(
                'process-video',
                {
                    videoId,
                    tempFilePath,
                    originalFileName,
                },
                {
                    jobId: `video-${videoId}`,
                }
            );

            console.log(`✅ Job ${job.id} ajouté à la queue pour la vidéo ${videoId}`);
            return job;
        } catch (error) {
            console.error(`❌ Erreur lors de l'ajout du job à la queue:`, error);
            throw error;
        }
    }

    /**
     * Récupère le statut d'un job
     */
    async getJobStatus(videoId: string): Promise<any> {
        try {
            const job = await this.queue.getJob(`video-${videoId}`);
            if (!job) {
                return null;
            }

            const state = await job.getState();
            const progress = job.progress;

            return {
                id: job.id,
                state,
                progress,
                attemptsMade: job.attemptsMade,
                processedOn: job.processedOn,
                finishedOn: job.finishedOn,
                failedReason: job.failedReason,
            };
        } catch (error) {
            console.error(`❌ Erreur lors de la récupération du statut du job:`, error);
            return null;
        }
    }

    /**
     * Réessaie un job échoué
     */
    async retryJob(videoId: string, tempFilePath: string, originalFileName: string): Promise<Job<VideoJobData, VideoJobResult> | null> {
        try {
            // Supprimer l'ancien job s'il existe
            const oldJob = await this.queue.getJob(`video-${videoId}`);
            if (oldJob) {
                await oldJob.remove();
            }

            // Réinitialiser le statut dans MongoDB
            await Gallery.findByIdAndUpdate(videoId, {
                processingStatus: 'pending',
                processingProgress: 0,
                processingError: undefined,
                processingStartedAt: undefined,
                processingCompletedAt: undefined,
            });

            // Créer un nouveau job
            return await this.addToQueue(videoId, tempFilePath, originalFileName);
        } catch (error) {
            console.error(`❌ Erreur lors du retry du job:`, error);
            return null;
        }
    }

    /**
     * Ferme proprement les connexions
     */
    async close(): Promise<void> {
        await this.worker.close();
        await this.queue.close();
        await this.queueEvents.close();
        await this.connection.quit();
        console.log('✅ VideoQueueService fermé proprement');
    }
}

export default new VideoQueueService();
