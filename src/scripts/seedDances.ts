import mongoose from 'mongoose';
import fs from 'fs-extra';
import path from 'path';
import Dance from '../models/Dance';
import minioService from '../services/minioService';

interface DanceData {
    name: string;
    level: string;
    style: string;
    date: string;
    youtubeLink1: string;
    youtubeLink2: string;
    pdfLink: string;
}

class DanceSeeder {
    private dancesData: DanceData[] = [];

    async connect() {
        try {
            const mongoUri =
                process.env.MONGODB_URI || 'mongodb://localhost:27017/salaunes_country_dans';
            await mongoose.connect(mongoUri);
            console.log('✅ Connecté à MongoDB');
        } catch (error) {
            console.error('❌ Erreur de connexion MongoDB:', error);
            process.exit(1);
        }
    }

    async loadData() {
        try {
            // Charger les données depuis le fichier JSON
            const dataPath = path.join(__dirname, './all_dances.json');
            const data = await fs.readJson(dataPath);
            this.dancesData = data;
            console.log(`📊 ${this.dancesData.length} danses chargées depuis le fichier JSON`);
        } catch (error) {
            console.error('❌ Erreur lors du chargement des données:', error);
            process.exit(1);
        }
    }

    async clearDatabase() {
        try {
            await Dance.deleteMany({});
            console.log('🗑️ Base de données vidée');
        } catch (error) {
            console.error('❌ Erreur lors du vidage de la base:', error);
        }
    }

    async seedDances() {
        console.log('🌱 Début du seeding des danses...');

        let successCount = 0;
        let errorCount = 0;
        let pdfDownloadCount = 0;

        for (let i = 0; i < this.dancesData.length; i++) {
            const danceData = this.dancesData[i];

            try {
                console.log(
                    `📝 [${i + 1}/${this.dancesData.length}] Traitement de: ${danceData.name}`
                );

                // Vérifier si la danse existe déjà
                const existingDance = await Dance.findOne({ name: danceData.name });
                if (existingDance) {
                    console.log(`   ⚠️ Danse déjà existante: ${danceData.name}`);
                    continue;
                }

                // Préparer les données de la danse
                const danceDoc: any = {
                    name: danceData.name,
                    level: danceData.level as 'Débutant' | 'Intermédiaire' | 'Novice',
                    style: danceData.style as 'Catalan' | 'Country',
                    date: danceData.date,
                    youtubeLink1: danceData.youtubeLink1,
                    youtubeLink2: danceData.youtubeLink2,
                    pdfLink: danceData.pdfLink,
                    originalPdfUrl: danceData.pdfLink || null,
                    scrapedAt: new Date(),
                };

                // Télécharger le PDF si disponible
                if (danceData.pdfLink) {
                    console.log(`   📥 Téléchargement du PDF pour: ${danceData.name}`);
                    const pdfFileName = await minioService.downloadAndUploadPdf(
                        danceData.pdfLink,
                        danceData.name
                    );

                    if (pdfFileName) {
                        danceDoc.pdfFile = pdfFileName;
                        pdfDownloadCount++;
                        console.log(`   ✅ PDF téléchargé: ${pdfFileName}`);
                    } else {
                        console.log(`   ❌ Échec du téléchargement du PDF pour: ${danceData.name}`);
                    }
                }

                // Créer la danse dans la base de données
                const dance = new Dance(danceDoc);
                await dance.save();

                successCount++;
                console.log(`   ✅ Danse créée: ${danceData.name}`);

                // Pause pour éviter de surcharger les serveurs
                await this.delay(1000);
            } catch (error) {
                errorCount++;
                console.error(`   ❌ Erreur pour ${danceData.name}:`, error);
            }
        }

        console.log('\n📊 Résumé du seeding:');
        console.log(`   ✅ Danses créées: ${successCount}`);
        console.log(`   📄 PDFs téléchargés: ${pdfDownloadCount}`);
        console.log(`   ❌ Erreurs: ${errorCount}`);
    }

    async generateStats() {
        console.log('\n📈 Statistiques de la base de données:');

        const totalDances = await Dance.countDocuments();
        const dancesWithPdf = await Dance.countDocuments({ pdfFile: { $exists: true, $ne: null } });
        const dancesWithYoutube = await Dance.countDocuments({
            $or: [{ youtubeLink1: { $ne: '' } }, { youtubeLink2: { $ne: '' } }],
        });

        const levelStats = await Dance.aggregate([
            { $group: { _id: '$level', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]);

        const styleStats = await Dance.aggregate([
            { $group: { _id: '$style', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]);

        console.log(`   Total danses: ${totalDances}`);
        console.log(`   Avec PDF: ${dancesWithPdf}`);
        console.log(`   Avec YouTube: ${dancesWithYoutube}`);

        console.log('\n   Niveaux:');
        levelStats.forEach((stat) => {
            console.log(`     ${stat._id}: ${stat.count}`);
        });

        console.log('\n   Styles:');
        styleStats.forEach((stat) => {
            console.log(`     ${stat._id}: ${stat.count}`);
        });
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async run() {
        try {
            await this.connect();
            await this.loadData();
            await this.clearDatabase();
            await this.seedDances();
            await this.generateStats();

            console.log('\n🎉 Seeding terminé avec succès !');
            process.exit(0);
        } catch (error) {
            console.error('❌ Erreur fatale lors du seeding:', error);
            process.exit(1);
        }
    }
}

// Exécution du script
if (require.main === module) {
    const seeder = new DanceSeeder();
    seeder.run();
}

export default DanceSeeder;
