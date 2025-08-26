# Utiliser l'image Node.js officielle avec Alpine Linux pour une taille réduite
FROM node:18-alpine

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer toutes les dépendances (y compris devDependencies pour la compilation)
RUN npm ci

# Copier le code source
COPY . .

# Compiler TypeScript
RUN npm run build:dev

# Supprimer les devDependencies pour réduire la taille de l'image
RUN npm prune --production

# Exposer le port
EXPOSE 3000

# Commande de démarrage
CMD ["npm", "start"]
