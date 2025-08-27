import fs from 'fs-extra';
import path from 'path';
import Dance from '../models/Dance';
import minioService from './minioService';

interface DanceData {
    name: string;
    level: string;
    style: string;
    date: string;
    youtubeLink1?: string;
    youtubeLink2?: string;
    pdfLink?: string;
}

class DanceSyncService {
    private dancesData: DanceData[] = [];

    /**
     * Parse une date française en date ISO
     * Ex: "10 juin 2025" -> "2025-06-10"
     */
    private parseFrenchDate(dateStr: string): string {
        const months: { [key: string]: number } = {
            janvier: 1,
            février: 2,
            mars: 3,
            avril: 4,
            mai: 5,
            juin: 6,
            juillet: 7,
            août: 8,
            septembre: 9,
            octobre: 10,
            novembre: 11,
            décembre: 12,
        };

        // Regex pour capturer "jour mois année"
        const match = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
        if (match) {
            const [, day, monthName, year] = match;
            const month = months[monthName.toLowerCase()];
            if (month) {
                return `${year}-${month.toString().padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
        }

        // Si on ne peut pas parser, retourner la date originale
        return dateStr;
    }

    async loadDancesData() {
        try {
            // Essayer plusieurs chemins possibles
            const possiblePaths = [
                path.join(__dirname, '../scripts/all_dances.json'),
                path.join(__dirname, '../../src/scripts/all_dances.json'),
                path.join(process.cwd(), 'src/scripts/all_dances.json'),
                path.join(process.cwd(), 'scripts/all_dances.json'),
            ];

            let dataPath = null;
            for (const testPath of possiblePaths) {
                try {
                    await fs.access(testPath);
                    dataPath = testPath;
                    break;
                } catch (error) {
                    // Continuer avec le chemin suivant
                }
            }

            if (!dataPath) {
                throw new Error(
                    `Fichier all_dances.json non trouvé. Chemins testés: ${possiblePaths.join(
                        ', '
                    )}`
                );
            }

            const data = await fs.readJson(dataPath);
            this.dancesData = data.dances || data;
            console.log(
                `📊 ${this.dancesData.length} danses chargées depuis le fichier JSON (${dataPath})`
            );
        } catch (error) {
            console.error('❌ Erreur lors du chargement des données:', error);
            return false;
        }
        return true;
    }

    async syncDances() {
        console.log('🔄 Début de la synchronisation des danses...');

        let createdCount = 0;
        let updatedCount = 0;
        let pdfDownloadCount = 0;

        for (const danceData of this.dancesData) {
            try {
                // Vérifier si la danse existe déjà
                let dance = await Dance.findOne({ name: danceData.name });

                if (!dance) {
                    // Créer une nouvelle danse
                    const newDance = new Dance({
                        name: danceData.name,
                        level: danceData.level as 'Débutant' | 'Novice' | 'Intermédiaire',
                        style: danceData.style as 'Catalan' | 'Country',
                        date: this.parseFrenchDate(danceData.date), // Date ISO pour le tri
                        dateDisplay: danceData.date, // Date française pour l'affichage
                        youtubeLink1: danceData.youtubeLink1 || '',
                        youtubeLink2: danceData.youtubeLink2 || '',
                        pdfLink: danceData.pdfLink || '',
                    });

                    // Télécharger le PDF si nécessaire
                    if (
                        danceData.pdfLink &&
                        danceData.pdfLink.startsWith('https://countrydancemartignas.fr/')
                    ) {
                        console.log(`   📥 Téléchargement du PDF pour: ${danceData.name}`);
                        const pdfFileName = await minioService.downloadAndUploadPdf(
                            danceData.pdfLink,
                            danceData.name
                        );

                        if (pdfFileName) {
                            newDance.pdfFile = pdfFileName;
                            pdfDownloadCount++;
                            console.log(`   ✅ PDF téléchargé: ${pdfFileName}`);
                        }
                    }

                    await newDance.save();
                    createdCount++;
                    console.log(`   ✅ Danse créée: ${danceData.name}`);
                } else {
                    // Vérifier si le PDF doit être téléchargé
                    if (
                        danceData.pdfLink &&
                        danceData.pdfLink.startsWith('https://countrydancemartignas.fr/') &&
                        !dance.pdfFile
                    ) {
                        console.log(`   📥 Téléchargement du PDF manquant pour: ${danceData.name}`);
                        const pdfFileName = await minioService.downloadAndUploadPdf(
                            danceData.pdfLink,
                            danceData.name
                        );

                        if (pdfFileName) {
                            dance.pdfFile = pdfFileName;
                            await dance.save();
                            pdfDownloadCount++;
                            updatedCount++;
                            console.log(
                                `   ✅ PDF téléchargé et danse mise à jour: ${pdfFileName}`
                            );
                        }
                    }
                }
            } catch (error) {
                console.error(`   ❌ Erreur pour ${danceData.name}:`, error);
            }
        }

        console.log('\n📊 Résumé de la synchronisation:');
        console.log(`   ✅ Danses créées: ${createdCount}`);
        console.log(`   🔄 Danses mises à jour: ${updatedCount}`);
        console.log(`   📄 PDFs téléchargés: ${pdfDownloadCount}`);
        console.log('🎉 Synchronisation terminée !');
    }

    async run() {
        const loaded = await this.loadDancesData();
        if (loaded) {
            await this.syncDances();
        }
    }
}

export default new DanceSyncService();
