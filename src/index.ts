import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { connectDB } from './config/database';
import { initializeDatabase } from './config/init';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import websocketService from './services/websocketService';
import { PdfCacheService } from './services/pdfCacheService';
import { normalizeDatesOnStartup } from './services/dateNormalizationService';
import videoQueueService from './services/videoQueueService';

// Routes
import authRoutes from './routes/auth';
import danceRoutes from './routes/dances';
import galleryRoutes from './routes/gallery';
import eventsRoutes from './routes/events';
import membersRoutes from './routes/members';
import publicMembersRoutes from './routes/publicMembers';
import dashboardRoutes from './routes/dashboard';
import notificationsRoutes from './routes/notifications';
import internalRulesRoutes from './routes/internalRules';
import pdfRoutes from './routes/pdfRoutes';
import usersRoutes from './routes/users';
import paymentRoutes from './routes/paymentRoutes';

// Charger les variables d'environnement
dotenv.config();

const app = express();
const server = createServer(app);
const PORT = Number(process.env.PORT) || 3000;

// Initialiser express-ws très tôt, AVANT les middlewares
websocketService.initialize(app, server);

// Configuration CORS
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5173',
    ],
    credentials: true,
    optionsSuccessStatus: 200,
};

// Configuration Rate Limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000'), // limite chaque IP à 1000 requêtes par fenêtre (plus tolérant)
    message: {
        error: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Ignorer les requêtes réussies pour éviter de pénaliser les utilisateurs légitimes
    skipSuccessfulRequests: true,
    // Ignorer les requêtes d'erreur 4xx (sauf 429) pour éviter de pénaliser les erreurs client
    skipFailedRequests: true,
});

// Middleware de sécurité et de performance
app.use(helmet());
app.use(compression());
app.use(cors(corsOptions));
app.use(limiter);

// Middleware de parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Route robots.txt pour éviter les erreurs 401 de Google (AVANT toutes les autres routes)
app.get('/robots.txt', (req, res) => {
    const robotsContent = `User-agent: *
Disallow: /

# API non destinée à l'indexation
# Sitemap principal: https://salaunescountrydans.fr/sitemap.xml`;

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(robotsContent);
});

// Routes
app.use('/admin', authRoutes);
app.use('/admin/notifications', notificationsRoutes);
app.use('/admin/users', usersRoutes);
app.use('/dances', danceRoutes);
app.use('/gallery', galleryRoutes);
app.use('/events', eventsRoutes);
app.use('/members', membersRoutes);
app.use('/public/members', publicMembersRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/internal-rules', internalRulesRoutes);
app.use('/generate-pdf', pdfRoutes);
app.use('/', paymentRoutes);

// Route de santé
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
    });
});

// Route racine
app.get('/', (req, res) => {
    res.json({
        message: "Bienvenue sur l'API Salaunes Country Dans",
        version: '1.0.0',
        endpoints: {
            dances: '/dances',
            gallery: '/gallery',
            courses: '/courses',
            members: '/members',
            internalRules: '/internal-rules',
            health: '/health',
        },
    });
});

// Middleware de gestion d'erreurs
app.use(notFound);
app.use(errorHandler);

// Démarrage du serveur
const startServer = async () => {
    try {
        // Connexion à la base de données
        await connectDB();

        // Initialisation de la base de données
        await initializeDatabase();

        // Normalisation automatique des dates des danses
        await normalizeDatesOnStartup();

        // Migration automatique des médias existants (ajouter mediaType si manquant)
        console.log('🔄 Vérification et migration des médias existants...');
        try {
            const Gallery = (await import('./models/Gallery')).default;
            const result = await Gallery.updateMany(
                { mediaType: { $exists: false } },
                { $set: { mediaType: 'image' } }
            );
            if (result.modifiedCount > 0) {
                console.log(`✅ ${result.modifiedCount} images existantes migrées avec mediaType='image'`);
            } else {
                console.log('✅ Tous les médias ont déjà le champ mediaType');
            }
        } catch (error) {
            console.error('❌ Erreur lors de la migration des médias:', error);
        }

        // Initialisation du cache PDF
        console.log('📄 Initialisation du cache PDF...');
        const pdfCache = PdfCacheService.getInstance();
        await pdfCache.generateInscriptionFormPdf();

        // Initialisation du service de queue vidéo
        console.log('🎬 Initialisation du service de traitement vidéo...');
        // Le service est déjà initialisé lors de l'import, on log juste pour confirmer
        console.log('✅ Service de queue vidéo prêt');

        server.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Serveur HTTP démarré sur 0.0.0.0:${PORT}`);
            console.log(`⚡ WebSocket service initialisé avec express-ws`);
            console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🔒 Admin: http://localhost:${PORT}/admin`);
            console.log(`💃 Danses: http://localhost:${PORT}/dances`);
            console.log(`🖼️ Galerie: http://localhost:${PORT}/gallery`);
            console.log(`👥 Membres: http://localhost:${PORT}/members`);
            console.log(`📋 Règlement: http://localhost:${PORT}/internal-rules`);
            console.log(
                `📄 PDF Inscription: http://localhost:${PORT}/generate-pdf/inscription-form`
            );
            console.log(`💚 Health: http://localhost:${PORT}/health`);
            console.log(`🔌 WebSocket: ws://localhost:${PORT}/ws`);
            console.log(`🐳 Accessible depuis l'hôte sur toutes les interfaces`);
        });
    } catch (error) {
        console.error('❌ Erreur lors du démarrage du serveur:', error);
        process.exit(1);
    }
};

startServer();

// Gestion de l'arrêt propre du serveur
process.on('SIGTERM', async () => {
    console.log('⚠️ SIGTERM reçu, arrêt propre du serveur...');
    await videoQueueService.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('⚠️ SIGINT reçu, arrêt propre du serveur...');
    await videoQueueService.close();
    process.exit(0);
});

export default app;
