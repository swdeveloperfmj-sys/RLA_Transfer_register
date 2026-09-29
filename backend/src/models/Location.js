import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  code: { type: String, required: true, trim: true, uppercase: true, unique: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model('Location', locationSchema);
