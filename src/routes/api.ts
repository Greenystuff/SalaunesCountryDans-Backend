import { Router } from 'express';

const router = Router();

// Route de test pour l'API publique
router.get('/', (_req, res) => {
    res.json({
        success: true,
        message: 'API publique Salaunes Country Dans',
        version: '1.0.0',
        endpoints: {
            info: '/info',
            events: '/events',
            contact: '/contact',
        },
    });
});

// Route d'informations générales
router.get('/info', (_req, res) => {
    res.json({
        success: true,
        data: {
            name: 'Salaunes Country Dans',
            description: 'Association de danse country à Salaunes',
            location: 'Salaunes, France',
            founded: '2024',
            activities: ['Danse country', 'Cours de danse', 'Événements', 'Compétitions'],
        },
    });
});

// Route pour les événements (exemple)
router.get('/events', (_req, res) => {
    res.json({
        success: true,
        data: {
            events: [
                {
                    id: 1,
                    title: 'Cours de danse country',
                    date: '2024-01-15',
                    time: '19:00',
                    location: 'Salle des fêtes de Salaunes',
                    description: 'Cours débutant et intermédiaire',
                },
                {
                    id: 2,
                    title: 'Soirée country',
                    date: '2024-01-20',
                    time: '20:00',
                    location: 'Salle des fêtes de Salaunes',
                    description: 'Soirée dansante ouverte à tous',
                },
            ],
        },
    });
});

// Route de contact
router.get('/contact', (_req, res) => {
    res.json({
        success: true,
        data: {
            email: 'contact@salaunes-country-dans.fr',
            phone: '+33 6 XX XX XX XX',
            address: 'Salaunes, France',
            socialMedia: {
                facebook: 'https://facebook.com/salaunes-country-dans',
                instagram: 'https://instagram.com/salaunes-country-dans',
            },
        },
    });
});

// TODO: Ajouter ici les routes pour les données du site vitrine
// Exemples:
// router.get('/dances', danceController.getAllDances);
// router.get('/teachers', teacherController.getAllTeachers);
// router.get('/schedule', scheduleController.getSchedule);
// router.post('/contact-form', contactController.submitContact);

export default router;
