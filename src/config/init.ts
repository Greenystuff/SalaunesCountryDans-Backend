import { User } from '../models/User';
import danceSyncService from '../services/danceSyncService';

export const initializeDatabase = async (): Promise<void> => {
    try {
        console.log('🔄 Initialisation de la base de données...');

        // Créer l'utilisateur admin par défaut
        await (User as any).createDefaultAdmin();

        // Synchroniser les danses
        await danceSyncService.run();

        console.log('✅ Initialisation terminée');
    } catch (error) {
        console.error("❌ Erreur lors de l'initialisation:", error);
    }
};
