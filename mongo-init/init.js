// Script d'initialisation MongoDB
// Ce script s'exécute automatiquement lors du premier démarrage du conteneur MongoDB

print('🔄 Initialisation de la base de données MongoDB...');

// Créer la base de données
db = db.getSiblingDB('salaunes_country_dans');

// Créer un utilisateur pour la base de données (optionnel)
db.createUser({
    user: 'salaunes_user',
    pwd: 'salaunes_password',
    roles: [
        {
            role: 'readWrite',
            db: 'salaunes_country_dans',
        },
    ],
});

// Créer des collections initiales
db.createCollection('users');
db.createCollection('events');
db.createCollection('dances');
db.createCollection('teachers');

// Créer des index pour optimiser les performances
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ role: 1 });
db.users.createIndex({ isActive: 1 });

db.events.createIndex({ date: 1 });
db.events.createIndex({ isActive: 1 });

db.dances.createIndex({ name: 1 });
db.dances.createIndex({ category: 1 });

db.teachers.createIndex({ email: 1 }, { unique: true });
db.teachers.createIndex({ isActive: 1 });

print('✅ Base de données initialisée avec succès !');
print('📊 Base de données: salaunes_country_dans');
print('👤 Utilisateur créé: salaunes_user');
print('📁 Collections créées: users, events, dances, teachers');
