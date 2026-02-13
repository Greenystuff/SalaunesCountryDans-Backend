import ffmpeg from 'fluent-ffmpeg';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import minioService from './minioService';

// Types pour les métadonnées vidéo
export interface VideoMetadata {
    duration: number; // en secondes
    width: number;
    height: number;
    codec: string;
    bitrate: number; // en kbps
    frameRate: number;
    fileSize: number;
    mimeType: string;
}

// Types pour les informations de thumbnail
export interface ThumbnailInfo {
    fileName: string;
    width: number;
    height: number;
    fileSize: number;
    minioPath: string;
}

// Types pour les informations de variante
export interface VariantInfo {
    resolution: '480p' | '720p' | '1080p';
    fileName: string;
    width: number;
    height: number;
    fileSize: number;
    bitrate: number;
    hlsManifest?: string;
    hlsSegments?: string[];
}

// Configuration des résolutions
const RESOLUTION_CONFIG = {
    '480p': { width: 854, height: 480, bitrate: 1000 },
    '720p': { width: 1280, height: 720, bitrate: 2500 },
    '1080p': { width: 1920, height: 1080, bitrate: 5000 },
};

class VideoProcessingService {
    private tempDir: string;

    constructor() {
        this.tempDir = path.join(process.cwd(), 'temp-processing');
        this.ensureTempDir();

        // Configurer les chemins FFmpeg si spécifiés dans l'environnement
        if (process.env.FFMPEG_PATH) {
            ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
        }
        if (process.env.FFPROBE_PATH) {
            ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);
        }
    }

    /**
     * Assure que le répertoire temporaire existe
     */
    private async ensureTempDir(): Promise<void> {
        try {
            await fs.ensureDir(this.tempDir);
        } catch (error) {
            console.error('❌ Erreur lors de la création du répertoire temporaire:', error);
        }
    }

    /**
     * Extrait les métadonnées d'une vidéo avec FFprobe
     */
    async extractMetadata(filePath: string): Promise<VideoMetadata> {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(filePath, (err, metadata) => {
                if (err) {
                    console.error('❌ Erreur lors de l\'extraction des métadonnées:', err);
                    reject(err);
                    return;
                }

                try {
                    // Trouver le stream vidéo
                    const videoStream = metadata.streams.find((s) => s.codec_type === 'video');

                    if (!videoStream) {
                        throw new Error('Aucun stream vidéo trouvé dans le fichier');
                    }

                    // Extraire les informations
                    const duration = metadata.format.duration || 0;
                    let width = videoStream.width || 0;
                    let height = videoStream.height || 0;
                    const codec = videoStream.codec_name || 'unknown';
                    const bitrate = Math.round((metadata.format.bit_rate || 0) / 1000); // Convertir en kbps

                    // Détecter la rotation vidéo et ajuster les dimensions si nécessaire
                    let rotation = 0;

                    // Chercher la rotation dans les tags (iOS/Android)
                    if (videoStream.tags && videoStream.tags.rotate) {
                        rotation = parseInt(videoStream.tags.rotate);
                    }
                    // Chercher dans side_data (displaymatrix)
                    else if (videoStream.side_data_list && Array.isArray(videoStream.side_data_list)) {
                        const displayMatrix = videoStream.side_data_list.find(
                            (data: any) => data.side_data_type === 'Display Matrix' && data.rotation !== undefined
                        );
                        if (displayMatrix) {
                            rotation = Math.abs(Math.round(displayMatrix.rotation));
                        }
                    }

                    // Si rotation de ±90° ou ±270°, swapper width et height
                    // FFmpeg applique automatiquement la rotation, donc on retourne les dimensions "visuelles"
                    if (rotation === 90 || rotation === 270) {
                        console.log(`🔄 Rotation détectée (${rotation}°), swap des dimensions: ${width}x${height} → ${height}x${width}`);
                        [width, height] = [height, width]; // Swap
                    }

                    // Calculer le frame rate
                    let frameRate = 30; // Valeur par défaut
                    if (videoStream.r_frame_rate) {
                        const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
                        if (den && den !== 0) {
                            frameRate = Math.round(num / den);
                        }
                    }

                    // Obtenir la taille du fichier
                    const fileSize = metadata.format.size || 0;

                    // Obtenir le MIME type
                    const mimeType = this.getMimeTypeFromFormat(metadata.format.format_name || '');

                    const result: VideoMetadata = {
                        duration,
                        width,
                        height,
                        codec,
                        bitrate,
                        frameRate,
                        fileSize,
                        mimeType,
                    };

                    console.log('✅ Métadonnées extraites:', result);
                    resolve(result);
                } catch (parseError) {
                    console.error('❌ Erreur lors du parsing des métadonnées:', parseError);
                    reject(parseError);
                }
            });
        });
    }

    /**
     * Détermine le MIME type à partir du format FFmpeg
     */
    private getMimeTypeFromFormat(format: string): string {
        const formatMap: { [key: string]: string } = {
            'mov,mp4,m4a,3gp,3g2,mj2': 'video/mp4',
            mp4: 'video/mp4',
            webm: 'video/webm',
            avi: 'video/x-msvideo',
            quicktime: 'video/quicktime',
        };

        for (const [key, mimeType] of Object.entries(formatMap)) {
            if (format.includes(key)) {
                return mimeType;
            }
        }

        return 'video/mp4'; // Par défaut
    }

    /**
     * Génère une thumbnail à partir d'une vidéo
     * Prend une frame à 10% de la durée de la vidéo
     * Conserve le ratio d'aspect original de la vidéo
     */
    async generateThumbnail(
        filePath: string,
        duration: number,
        videoId: string,
        videoWidth?: number,
        videoHeight?: number
    ): Promise<ThumbnailInfo> {
        // Déclarer tempOutputDir avant le try pour qu'il soit accessible dans le catch
        const tempOutputDir = path.join(this.tempDir, `thumb-${videoId}`);

        return new Promise(async (resolve, reject) => {
            try {
                // Calculer le timestamp (10% de la durée ou 1s minimum)
                const timestamp = Math.max(1, Math.floor(duration * 0.1));

                // Créer un répertoire temporaire pour la thumbnail
                await fs.ensureDir(tempOutputDir);

                const thumbnailFileName = `${videoId}-thumb.jpg`;
                const tempThumbnailPath = path.join(tempOutputDir, thumbnailFileName);

                // Déterminer la taille de la thumbnail en conservant le ratio d'aspect
                let thumbnailSize: string;
                let expectedWidth: number;
                let expectedHeight: number;

                if (videoWidth && videoHeight) {
                    const isPortrait = videoHeight > videoWidth;

                    if (isPortrait) {
                        // Pour les vidéos portrait, limiter la hauteur à 720px et calculer la largeur
                        expectedHeight = 720;
                        expectedWidth = Math.round((videoWidth / videoHeight) * 720);
                        thumbnailSize = '?x720'; // Hauteur fixe, largeur auto
                        console.log(`📸 Vidéo portrait détectée: ${videoWidth}x${videoHeight} → thumbnail: ${expectedWidth}x${expectedHeight}`);
                    } else {
                        // Pour les vidéos paysage, limiter la largeur à 1280px et calculer la hauteur
                        expectedWidth = 1280;
                        expectedHeight = Math.round((videoHeight / videoWidth) * 1280);
                        thumbnailSize = '1280x?'; // Largeur fixe, hauteur auto
                        console.log(`📸 Vidéo paysage détectée: ${videoWidth}x${videoHeight} → thumbnail: ${expectedWidth}x${expectedHeight}`);
                    }
                } else {
                    // Fallback: utiliser 1280x? (ratio conservé, largeur max 1280px)
                    thumbnailSize = '1280x?';
                    expectedWidth = 1280;
                    expectedHeight = 720; // Estimation, sera corrigée après génération
                    console.log('⚠️ Dimensions vidéo non fournies, utilisation du fallback 1280x?');
                }

                console.log(`📸 Génération de la thumbnail à ${timestamp}s avec taille: ${thumbnailSize}...`);

                ffmpeg(filePath)
                    .screenshots({
                        timestamps: [timestamp],
                        filename: thumbnailFileName,
                        folder: tempOutputDir,
                        size: thumbnailSize,
                    })
                    .on('end', async () => {
                        try {
                            console.log('✅ Thumbnail générée avec succès');

                            // Lire le fichier thumbnail
                            const thumbnailBuffer = await fs.readFile(tempThumbnailPath);
                            const fileSize = thumbnailBuffer.length;

                            // Obtenir les vraies dimensions de la thumbnail générée
                            const thumbnailMetadata = await this.extractMetadata(tempThumbnailPath);
                            const actualWidth = thumbnailMetadata.width || expectedWidth;
                            const actualHeight = thumbnailMetadata.height || expectedHeight;

                            console.log(`✅ Dimensions réelles de la thumbnail: ${actualWidth}x${actualHeight}`);

                            // Upload vers MinIO
                            const minioPath = minioService.getVideoThumbnailPath(videoId);
                            const uploadSuccess = await minioService.uploadFile(
                                'gallery',
                                minioPath,
                                thumbnailBuffer,
                                'image/jpeg'
                            );

                            if (!uploadSuccess) {
                                throw new Error('Échec de l\'upload de la thumbnail vers MinIO');
                            }

                            // Nettoyer le fichier temporaire
                            await fs.remove(tempOutputDir);

                            const result: ThumbnailInfo = {
                                fileName: thumbnailFileName,
                                width: actualWidth,
                                height: actualHeight,
                                fileSize,
                                minioPath,
                            };

                            resolve(result);
                        } catch (uploadError) {
                            console.error('❌ Erreur lors de l\'upload de la thumbnail:', uploadError);
                            reject(uploadError);
                        }
                    })
                    .on('error', (err) => {
                        console.error('❌ Erreur lors de la génération de la thumbnail:', err);
                        fs.remove(tempOutputDir).catch(console.error);
                        reject(err);
                    });
            } catch (error) {
                console.error('❌ Erreur lors de la préparation de la thumbnail:', error);
                // Garantir le nettoyage même en cas d'erreur de préparation
                fs.remove(tempOutputDir).catch(console.error);
                reject(error);
            }
        });
    }

    /**
     * Transcode une vidéo vers une résolution spécifique avec HLS
     */
    async transcodeToResolution(
        inputPath: string,
        resolution: '480p' | '720p' | '1080p',
        videoId: string,
        onProgress?: (progress: number) => void
    ): Promise<VariantInfo> {
        // Déclarer config et outputDir avant le try pour qu'ils soient accessibles dans le catch
        const config = RESOLUTION_CONFIG[resolution];
        const outputDir = path.join(this.tempDir, `transcode-${videoId}-${resolution}`);

        return new Promise(async (resolve, reject) => {
            try {
                await fs.ensureDir(outputDir);

                const segmentDir = path.join(outputDir, 'segments');
                await fs.ensureDir(segmentDir);

                const playlistName = `playlist.m3u8`;
                const playlistPath = path.join(outputDir, playlistName);
                const segmentPattern = path.join(segmentDir, 'segment_%03d.ts');

                console.log(`🎬 Début du transcoding ${resolution}...`);

                // Appeler FFmpeg directement avec spawn pour éviter les problèmes de validation de format
                const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
                const args = [
                    '-i', inputPath,
                    '-c:v', 'libx264',
                    '-preset', 'medium',
                    '-b:v', `${config.bitrate}k`,
                    // Préserver le ratio d'aspect avec dimensions PAIRES (requis par libx264)
                    // -2 force automatiquement un nombre pair pour la largeur
                    // On retire force_original_aspect_ratio qui cause des conflits avec -2
                    '-vf', `scale=-2:'min(${config.height},ih)'`,
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-hls_time', process.env.HLS_SEGMENT_DURATION || '6',
                    '-hls_list_size', '0',
                    '-hls_segment_filename', segmentPattern,
                    '-f', 'hls',
                    playlistPath
                ];

                const ffmpegProcess = spawn(ffmpegPath, args);

                let stderrOutput = '';

                ffmpegProcess.stderr?.on('data', (data) => {
                    const output = data.toString();
                    stderrOutput += output;

                    // Parser la progression depuis stderr de FFmpeg
                    const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);
                    if (timeMatch && onProgress) {
                        // Estimer le pourcentage (approximatif)
                        const hours = parseInt(timeMatch[1]);
                        const minutes = parseInt(timeMatch[2]);
                        const seconds = parseFloat(timeMatch[3]);
                        const currentTime = hours * 3600 + minutes * 60 + seconds;
                        // Approximation basique - améliorer si nécessaire
                        const progress = Math.min(99, Math.round((currentTime / 10) * 100));
                        onProgress(progress);
                    }
                });

                ffmpegProcess.on('close', async (code) => {
                    if (code === 0) {
                        try {
                            console.log(`✅ Transcoding ${resolution} terminé`);

                            // Upload de la playlist (avec correction des chemins de segments)
                            let playlistContent = await fs.readFile(playlistPath, 'utf-8');

                            // Corriger les chemins des segments dans le manifest
                            // Remplacer "segment_000.ts" par "segments/480p_000.ts"
                            playlistContent = playlistContent.replace(
                                /segment_(\d+)\.ts/g,
                                `segments/${resolution}_$1.ts`
                            );

                            const playlistBuffer = Buffer.from(playlistContent, 'utf-8');
                            const hlsManifestPath = minioService.getVideoHlsManifestPath(
                                videoId,
                                resolution
                            );
                            await minioService.uploadFile(
                                'gallery',
                                hlsManifestPath,
                                playlistBuffer,
                                'application/vnd.apple.mpegurl'
                            );

                            // Upload des segments
                            const segmentFiles = await fs.readdir(segmentDir);
                            const hlsSegments: string[] = [];

                            for (let i = 0; i < segmentFiles.length; i++) {
                                const segmentFile = segmentFiles[i];
                                const segmentPath = path.join(segmentDir, segmentFile);
                                const segmentBuffer = await fs.readFile(segmentPath);

                                const segmentMinioPath = minioService.getVideoHlsSegmentPath(
                                    videoId,
                                    resolution,
                                    i
                                );

                                await minioService.uploadFile(
                                    'gallery',
                                    segmentMinioPath,
                                    segmentBuffer,
                                    'video/MP2T'
                                );

                                hlsSegments.push(segmentMinioPath);
                            }

                            // Calculer la taille totale
                            let totalSize = playlistBuffer.length;
                            for (const segmentFile of segmentFiles) {
                                const segmentPath = path.join(segmentDir, segmentFile);
                                const stats = await fs.stat(segmentPath);
                                totalSize += stats.size;
                            }

                            // Nettoyer les fichiers temporaires
                            await fs.remove(outputDir);

                            const result: VariantInfo = {
                                resolution,
                                fileName: `${videoId}-${resolution}.mp4`,
                                width: config.width,
                                height: config.height,
                                fileSize: totalSize,
                                bitrate: config.bitrate,
                                hlsManifest: hlsManifestPath,
                                hlsSegments,
                            };

                            resolve(result);
                        } catch (uploadError) {
                            console.error(
                                `❌ Erreur lors de l'upload du transcoding ${resolution}:`,
                                uploadError
                            );
                            reject(uploadError);
                        }
                    } else {
                        console.error(`❌ Erreur lors du transcoding ${resolution}: FFmpeg exit code ${code}`);
                        console.error('FFmpeg stderr:', stderrOutput);
                        fs.remove(outputDir).catch(console.error);
                        reject(new Error(`FFmpeg exited with code ${code}`));
                    }
                });

                ffmpegProcess.on('error', (err) => {
                    console.error(`❌ Erreur lors du lancement de FFmpeg ${resolution}:`, err);
                    fs.remove(outputDir).catch(console.error);
                    reject(err);
                });
            } catch (error) {
                console.error(`❌ Erreur lors de la préparation du transcoding ${resolution}:`, error);
                // Garantir le nettoyage même en cas d'erreur de préparation
                fs.remove(outputDir).catch(console.error);
                reject(error);
            }
        });
    }

    /**
     * Nettoie les fichiers temporaires pour un videoId
     */
    async cleanup(videoId: string): Promise<void> {
        try {
            const patterns = [
                `thumb-${videoId}`,
                `transcode-${videoId}-480p`,
                `transcode-${videoId}-720p`,
                `transcode-${videoId}-1080p`,
            ];

            for (const pattern of patterns) {
                const dirPath = path.join(this.tempDir, pattern);
                if (await fs.pathExists(dirPath)) {
                    await fs.remove(dirPath);
                    console.log(`🧹 Nettoyé: ${dirPath}`);
                }
            }
        } catch (error) {
            console.error(`❌ Erreur lors du cleanup pour ${videoId}:`, error);
        }
    }

    /**
     * Génère un master manifest HLS pour la lecture adaptative
     */
    async generateMasterManifest(
        videoId: string,
        variants: Array<{ resolution: '480p' | '720p' | '1080p'; bandwidth: number }>
    ): Promise<string> {
        try {
            // Construire le contenu du master manifest
            let manifestContent = '#EXTM3U\n#EXT-X-VERSION:3\n\n';

            for (const variant of variants) {
                const config = RESOLUTION_CONFIG[variant.resolution];
                const variantUrl = minioService.getVideoUrl(
                    minioService.getVideoHlsManifestPath(videoId, variant.resolution)
                );

                manifestContent += `#EXT-X-STREAM-INF:BANDWIDTH=${config.bitrate * 1000},RESOLUTION=${config.width}x${config.height}\n`;
                manifestContent += `${variantUrl}\n\n`;
            }

            // Upload du master manifest
            const masterManifestPath = minioService.getVideoHlsMasterManifestPath(videoId);
            const manifestBuffer = Buffer.from(manifestContent, 'utf-8');

            await minioService.uploadFile(
                'gallery',
                masterManifestPath,
                manifestBuffer,
                'application/vnd.apple.mpegurl'
            );

            console.log(`✅ Master manifest généré: ${masterManifestPath}`);
            return masterManifestPath;
        } catch (error) {
            console.error('❌ Erreur lors de la génération du master manifest:', error);
            throw error;
        }
    }
}

export default new VideoProcessingService();
