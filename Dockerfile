# Utiliser l'image Node.js officielle avec Alpine Linux pour une taille réduite
FROM node:20-alpine

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer toutes les dépendances (y compris devDependencies pour la compilation)
RUN npm ci

# Copier le code source
COPY . .

# Compiler TypeScript
RUN npm run build

# Copier le fichier JSON dans le dossier dist
RUN cp src/scripts/all_dances.json dist/scripts/ || true

# Supprimer les devDependencies pour réduire la taille de l'image
RUN npm prune --production

# Créer le dossier logs s'il n'existe pas
RUN mkdir -p /app/logs

# Exposer le port
EXPOSE 3000

# Commande de démarrage
CMD ["npm", "start"]
