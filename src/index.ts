import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import { connectDB } from './config/database';
import { initializeDatabase } from './config/init';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';

// Routes
import authRoutes from './routes/auth';
import danceRoutes from './routes/dances';
import galleryRoutes from './routes/gallery';
import coursesRoutes from './routes/courses';
import membersRoutes from './routes/members';
import publicMembersRoutes from './routes/publicMembers';

// Charger les variables d'environnement
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

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
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // limite chaque IP à 100 requêtes par fenêtre
    message: {
        error: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.',
    },
    standardHeaders: true,
    legacyHeaders: false,
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

// Routes
app.use('/admin', authRoutes);
app.use('/dances', danceRoutes);
app.use('/gallery', galleryRoutes);
app.use('/courses', coursesRoutes);
app.use('/members', membersRoutes);
app.use('/public/members', publicMembersRoutes);

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

        app.listen(PORT, () => {
            console.log(`🚀 Serveur démarré sur le port ${PORT}`);
            console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🔒 Admin: http://localhost:${PORT}/admin`);
            console.log(`💃 Danses: http://localhost:${PORT}/dances`);
            console.log(`🖼️ Galerie: http://localhost:${PORT}/gallery`);
            console.log(`👥 Membres: http://localhost:${PORT}/members`);
            console.log(`💚 Health: http://localhost:${PORT}/health`);
        });
    } catch (error) {
        console.error('❌ Erreur lors du démarrage du serveur:', error);
        process.exit(1);
    }
};

startServer();

export default app;
