// Convention du projet : les dates voyagent entre clients et API sous forme de
// chaînes "naïves" locales (YYYY-MM-DDTHH:mm:ss.000, sans Z ni offset).

// Fonction utilitaire pour parser les dates locales
export function parseLocalDate(dateString: string): Date {
    // Si c'est au format ISO sans Z, l'interpréter comme locale
    if (dateString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?$/)) {
        const [datePart, timePart] = dateString.split('T');
        const [year, month, day] = datePart.split('-').map(Number);
        const [time, ms] = timePart.split('.');
        const [hours, minutes, seconds] = time.split(':').map(Number);

        // Créer une date locale
        return new Date(year, month - 1, day, hours, minutes, seconds || 0);
    }
    // Fallback pour les autres formats
    return new Date(dateString);
}

// Formater une date en chaîne locale sans timezone (sans Z)
export function toNaiveLocalString(value: Date | string): string {
    const d = new Date(value);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
    ).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(
        2,
        '0'
    )}:${String(d.getSeconds()).padStart(2, '0')}.000`;
}

// Formater une exception d'événement pour la réponse (mêmes chaînes naïves que les événements)
export function formatExceptionForResponse(exception: any): any {
    const exObj = exception.toObject ? exception.toObject() : { ...exception };

    if (exObj.occurrenceDate) {
        exObj.occurrenceDate = toNaiveLocalString(exObj.occurrenceDate);
    }
    if (exObj.modifiedFields?.start) {
        exObj.modifiedFields.start = toNaiveLocalString(exObj.modifiedFields.start);
    }
    if (exObj.modifiedFields?.end) {
        exObj.modifiedFields.end = toNaiveLocalString(exObj.modifiedFields.end);
    }

    return exObj;
}
