import mongoose from 'mongoose';

const locationSequenceSchema = new mongoose.Schema({
  locationCode: { type: String, required: true, unique: true },
  value: { type: Number, required: true, default: 0 }
});

export default mongoose.model('LocationSequence', locationSequenceSchema);
