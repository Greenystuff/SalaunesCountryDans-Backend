import mongoose from 'mongoose';

export const connectDB = async (): Promise<void> => {
    try {
        const mongoURI = process.env.MONGODB_URI;

        if (!mongoURI) {
            throw new Error("MONGODB_URI n'est pas définie dans les variables d'environnement");
        }

        const options = {
            maxPoolSize: 10, // Maintenir jusqu'à 10 connexions simultanées
            serverSelectionTimeoutMS: 5000, // Timeout de 5 secondes pour la sélection du serveur
            socketTimeoutMS: 45000, // Timeout de 45 secondes pour les opérations socket
            bufferCommands: false, // Désactiver le buffering des commandes
        };

        await mongoose.connect(mongoURI, options);

        console.log('✅ Connexion MongoDB établie avec succès');

        // Gestion des événements de connexion
        mongoose.connection.on('error', (err) => {
            console.error('❌ Erreur de connexion MongoDB:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️ Connexion MongoDB perdue');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('🔄 Connexion MongoDB rétablie');
        });

        // Gestion propre de la fermeture
        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            console.log("📴 Connexion MongoDB fermée suite à l'arrêt de l'application");
            process.exit(0);
        });
    } catch (error) {
        console.error('❌ Erreur lors de la connexion à MongoDB:', error);
        process.exit(1);
    }
};
