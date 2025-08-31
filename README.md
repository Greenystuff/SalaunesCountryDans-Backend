# Salaunes Country Dans - Backend

Backend Express TypeScript pour l'association Salaunes Country Dans avec authentification JWT et base de données MongoDB.

## 🚀 Fonctionnalités

-   **API REST** avec Express et TypeScript
-   **Authentification JWT** pour l'administration
-   **Base de données MongoDB** avec Mongoose
-   **Docker** pour le déploiement
-   **Sécurité** : Helmet, CORS, Rate Limiting
-   **Routes séparées** : `/api` (public) et `/admin` (protégé)
-   **Gestion d'erreurs** centralisée
-   **Validation** des données
-   **Logging** structuré

## 📋 Prérequis

-   Node.js 18+
-   Docker et Docker Compose
-   MongoDB (via Docker)

## 🛠️ Installation

### 1. Cloner le projet

```bash
git clone <repository-url>
cd Backend
```

### 2. Installation des dépendances

```bash
npm install
```

### 3. Configuration des variables d'environnement

```bash
cp env.example .env
```

Éditez le fichier `.env` avec vos configurations :

```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://admin:password123@localhost:27017/salaunes_country_dans?authSource=admin
JWT_SECRET=votre_secret_jwt_tres_securise_ici
JWT_EXPIRES_IN=24h
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
```

## 🐳 Démarrage avec Docker

### Démarrage complet (Backend + MongoDB + Mongo Express)

```bash
docker-compose up -d
```

### Services disponibles

-   **Backend API** : http://localhost:3000
-   **MongoDB** : localhost:27017
-   **Mongo Express** : http://localhost:8081 (admin/admin)

### Arrêt des services

```bash
docker-compose down
```

## 🚀 Démarrage en développement

### 1. Démarrer MongoDB

```bash
docker-compose up mongodb -d
```

### 2. Démarrer le serveur de développement

```bash
npm run dev
```

Le serveur sera accessible sur http://localhost:3000

## 📚 API Endpoints

### Routes publiques (`/api`)

-   `GET /api` - Informations sur l'API
-   `GET /api/info` - Informations sur l'association
-   `GET /api/events` - Liste des événements
-   `GET /api/contact` - Informations de contact

### Routes d'administration (`/admin`)

-   `POST /admin/login` - Connexion admin
-   `POST /admin/logout` - Déconnexion
-   `GET /admin/profile` - Profil utilisateur (authentifié)
-   `POST /admin/refresh-token` - Rafraîchir le token
-   `POST /admin/change-password` - Changer le mot de passe
-   `GET /admin/dashboard` - Dashboard admin (rôle admin requis)

## 🔐 Authentification

### Connexion admin

```bash
curl -X POST http://localhost:3000/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@salaunes-country-dans.fr",
    "password": "Admin123!"
  }'
```

### Utilisation du token

```bash
curl -X GET http://localhost:3000/admin/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 👤 Utilisateur par défaut

Un utilisateur admin est créé automatiquement :

-   **Email** : admin@salaunes-country-dans.fr
-   **Mot de passe** : Admin123!
-   **Rôle** : admin

⚠️ **Important** : Changez le mot de passe par défaut en production !

## 🧪 Tests

```bash
# Lancer les tests
npm test

# Tests avec couverture
npm run test:coverage
```

## 📦 Build pour production

```bash
# Compiler TypeScript
npm run build

# Démarrer en production
npm start
```

## 🔧 Scripts disponibles

-   `npm run dev` - Démarrage en mode développement
-   `npm run build` - Compilation TypeScript
-   `npm start` - Démarrage en production
-   `npm test` - Lancement des tests
-   `npm run lint` - Vérification du code
-   `npm run lint:fix` - Correction automatique du code

## 📁 Structure du projet

```
src/
├── config/          # Configuration (DB, init)
├── controllers/     # Contrôleurs
├── middleware/      # Middlewares (auth, error handling)
├── models/          # Modèles Mongoose
├── routes/          # Routes API
└── index.ts         # Point d'entrée
```

## 🔒 Sécurité

-   **Helmet** : Headers de sécurité
-   **CORS** : Configuration des origines autorisées
-   **Rate Limiting** : Protection contre les attaques par déni de service
-   **JWT** : Authentification sécurisée
-   **Validation** : Validation des données d'entrée
-   **Hachage** : Mots de passe hachés avec bcrypt

## 🐛 Débogage

### Logs

Les logs sont affichés dans la console en développement et dans le dossier `logs/` en production.

### Variables d'environnement

-   `NODE_ENV` : environnement (development/production)
-   `PORT` : port du serveur
-   `MONGODB_URI` : URI de connexion MongoDB
-   `JWT_SECRET` : secret pour signer les tokens JWT
-   `JWT_EXPIRES_IN` : durée de validité des tokens

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add some AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 📞 Support

Pour toute question ou problème, contactez l'équipe de développement.
