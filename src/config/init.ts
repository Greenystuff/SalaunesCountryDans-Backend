import { User } from '../models/User';

export const initializeDatabase = async (): Promise<void> => {
    try {
        console.log('🔄 Initialisation de la base de données...');

        // Créer l'utilisateur admin par défaut
        await (User as any).createDefaultAdmin();

        console.log('✅ Initialisation terminée');
    } catch (error) {
        console.error("❌ Erreur lors de l'initialisation:", error);
    }
};
