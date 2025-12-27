import Dance from '../models/Dance';

/**
 * Parse une date française en date ISO
 * Ex: "10 juin 2025" -> { isoDate: "2025-06-10", isValid: true }
 *
 * Note: Cette fonction est dupliquée depuis danceController.ts
 * pour éviter les dépendances circulaires. Dans le futur, on pourrait
 * la déplacer dans un module utilitaire partagé.
 */
const parseFrenchDate = (dateStr: string): { isoDate: string; isValid: boolean } => {
    const months: { [key: string]: number } = {
        janvier: 1,
        février: 2,
        fevrier: 2, // Variante sans accent
        mars: 3,
        avril: 4,
        mai: 5,
        juin: 6,
        juillet: 7,
        août: 8,
        aout: 8, // Variante sans accent
        septembre: 9,
        octobre: 10,
        novembre: 11,
        décembre: 12,
        decembre: 12, // Variante sans accent
    };

    // Regex amélioré pour capturer les caractères accentués
    const match = dateStr.match(/(\d{1,2})\s+([\wàâäéèêëïîôùûüÿæœç]+)\s+(\d{4})/i);
    if (match) {
        const [, day, monthName, year] = match;
        const month = months[monthName.toLowerCase()];
        if (month) {
            const isoDate = `${year}-${month.toString().padStart(2, '0')}-${day.padStart(2, '0')}`;

            // Valider que la date est réelle (pas de 30 février, etc.)
            const dateObj = new Date(isoDate);
            if (!isNaN(dateObj.getTime())) {
                return { isoDate, isValid: true };
            }
        }
    }

    // Si on ne peut pas parser, retourner avec indicateur d'échec
    return { isoDate: dateStr, isValid: false };
};

/**
 * Normalise toutes les dates des danses au démarrage du serveur
 *
 * Cette fonction s'exécute automatiquement au démarrage pour :
 * 1. Trouver toutes les danses avec des dates non-ISO (format français)
 * 2. Les convertir au format ISO (YYYY-MM-DD) pour permettre le tri correct
 * 3. Préserver le format français dans le champ dateDisplay
 *
 * @returns Promise<void>
 */
export async function normalizeDatesOnStartup(): Promise<void> {
    try {
        console.log('🔄 Normalisation des dates au démarrage...');

        // Regex pour identifier les dates ISO valides (YYYY-MM-DD)
        const isoRegex = /^\d{4}-\d{2}-\d{2}$/;

        // Récupérer toutes les danses
        const allDances = await Dance.find({});

        let normalized = 0;
        let alreadyCorrect = 0;
        let failed = 0;

        for (const dance of allDances) {
            // Vérifier si la date est déjà au format ISO
            if (!isoRegex.test(dance.date)) {
                // Tenter de parser la date française
                const { isoDate, isValid } = parseFrenchDate(dance.date);

                if (isValid) {
                    const originalDate = dance.date;

                    // Mettre à jour la date au format ISO
                    dance.date = isoDate;

                    // Préserver la date française pour l'affichage si elle n'existe pas déjà
                    if (!dance.dateDisplay) {
                        dance.dateDisplay = originalDate;
                    }

                    // Sauvegarder les modifications
                    await dance.save();
                    normalized++;

                    console.log(`  ✅ "${dance.name}": ${originalDate} → ${isoDate}`);
                } else {
                    failed++;
                    console.error(`  ❌ Échec pour "${dance.name}": ${dance.date}`);
                }
            } else {
                alreadyCorrect++;
            }
        }

        // Afficher le résumé
        console.log(`✅ Normalisation terminée:`);
        console.log(`   - Normalisées: ${normalized}`);
        console.log(`   - Déjà correctes: ${alreadyCorrect}`);
        console.log(`   - Échecs: ${failed}`);
        console.log(`   - Total: ${allDances.length}`);

        // Si des échecs ont été détectés, les signaler
        if (failed > 0) {
            console.warn(
                `⚠️ ${failed} danse(s) n'ont pas pu être normalisées. Vérifiez les logs ci-dessus.`
            );
        }
    } catch (error) {
        console.error('❌ Erreur lors de la normalisation des dates:', error);
        // Ne pas bloquer le démarrage du serveur en cas d'erreur
        // L'application peut fonctionner même si la normalisation échoue
    }
}
