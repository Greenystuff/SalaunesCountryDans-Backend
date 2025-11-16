import mongoose, { Document, Schema } from 'mongoose';

export interface IEventException extends Document {
  eventId: mongoose.Types.ObjectId;
  occurrenceDate: Date;
  modificationType: 'modified' | 'cancelled';
  modifiedFields?: {
    title?: string;
    description?: string;
    instructor?: string;
    location?: string;
    start?: Date;
    end?: Date;
    level?: string;
    maxParticipants?: number;
    price?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const EventExceptionSchema = new Schema<IEventException>(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
      index: true,
    },
    occurrenceDate: {
      type: Date,
      required: true,
      index: true,
    },
    modificationType: {
      type: String,
      enum: ['modified', 'cancelled'],
      required: true,
    },
    modifiedFields: {
      title: String,
      description: String,
      instructor: String,
      location: String,
      start: Date,
      end: Date,
      level: String,
      maxParticipants: Number,
      price: Number,
    },
  },
  { timestamps: true }
);

EventExceptionSchema.index({ eventId: 1, occurrenceDate: 1 }, { unique: true });

export default mongoose.model<IEventException>('EventException', EventExceptionSchema);
