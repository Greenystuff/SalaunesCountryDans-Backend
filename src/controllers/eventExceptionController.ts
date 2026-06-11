import { Request, Response } from 'express';
import EventException from '../models/EventException';
import { Event } from '../models/Event';
import { parseLocalDate, formatExceptionForResponse } from '../utils/eventDates';

// Les dates de modifiedFields arrivent en chaînes naïves locales : parsing explicite
// pour ne pas dépendre du fuseau du serveur lors du cast Mongoose
function parseModifiedFields(modifiedFields: any): any {
  if (!modifiedFields) return modifiedFields;
  const fields = { ...modifiedFields };
  if (fields.start) fields.start = parseLocalDate(fields.start);
  if (fields.end) fields.end = parseLocalDate(fields.end);
  return fields;
}

export const createException = async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const { occurrenceDate, modificationType, modifiedFields } = req.body;

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Événement introuvable' });
    }

    if (event.recurrence === 'Aucune') {
      return res.status(400).json({
        success: false,
        message: 'Impossible de créer une exception pour un événement non récurrent'
      });
    }

    // occurrenceDate identifie le JOUR de l'occurrence dans la série, pas un instant :
    // normalisé à minuit local pour que deux modifications du même jour ciblent la même exception
    const day = parseLocalDate(occurrenceDate);
    day.setHours(0, 0, 0, 0);

    // Upsert : l'index unique {eventId, occurrenceDate} interdit deux exceptions
    // pour la même occurrence — rééditer doit mettre à jour, pas échouer
    const exception = await EventException.findOneAndUpdate(
      { eventId, occurrenceDate: day },
      { modificationType, modifiedFields: parseModifiedFields(modifiedFields) },
      { new: true, upsert: true, runValidators: true }
    );

    res.status(201).json({ success: true, data: formatExceptionForResponse(exception) });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getExceptions = async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const exceptions = await EventException.find({ eventId });
    res.json({ success: true, data: exceptions.map(formatExceptionForResponse) });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateException = async (req: Request, res: Response) => {
  try {
    const { exceptionId } = req.params;
    const { modificationType, modifiedFields } = req.body;

    const exception = await EventException.findByIdAndUpdate(
      exceptionId,
      { modificationType, modifiedFields: parseModifiedFields(modifiedFields) },
      { new: true, runValidators: true }
    );

    if (!exception) {
      return res.status(404).json({ success: false, message: 'Exception introuvable' });
    }

    res.json({ success: true, data: formatExceptionForResponse(exception) });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteException = async (req: Request, res: Response) => {
  try {
    const { exceptionId } = req.params;
    const exception = await EventException.findByIdAndDelete(exceptionId);

    if (!exception) {
      return res.status(404).json({ success: false, message: 'Exception introuvable' });
    }

    res.json({ success: true, message: 'Exception supprimée' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
