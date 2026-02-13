# Utiliser l'image Node.js officielle avec Alpine Linux pour une taille réduite
FROM node:20-alpine

# Installer FFmpeg pour le traitement vidéo
RUN apk add --no-cache \
    ffmpeg \
    && rm -rf /var/cache/apk/*

# Vérifier l'installation de FFmpeg
RUN ffmpeg -version && ffprobe -version

# Installer les dépendances pour html-pdf-node
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

# Variables d'environnement pour html-pdf-node
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

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

# Supprimer les devDependencies pour réduire la taille de l'image
RUN npm prune --production

# Créer le dossier logs s'il n'existe pas
RUN mkdir -p /app/logs

# Exposer le port
EXPOSE 3000

# Commande de démarrage
CMD ["npm", "start"]
