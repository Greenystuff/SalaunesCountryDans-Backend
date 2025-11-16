import { Request, Response } from 'express';
import EventException from '../models/EventException';
import { Event } from '../models/Event';

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

    const exception = await EventException.create({
      eventId,
      occurrenceDate: new Date(occurrenceDate),
      modificationType,
      modifiedFields,
    });

    res.status(201).json({ success: true, data: exception });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getExceptions = async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const exceptions = await EventException.find({ eventId });
    res.json({ success: true, data: exceptions });
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
      { modificationType, modifiedFields },
      { new: true, runValidators: true }
    );

    if (!exception) {
      return res.status(404).json({ success: false, message: 'Exception introuvable' });
    }

    res.json({ success: true, data: exception });
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
