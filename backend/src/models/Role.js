import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, unique: true, trim: true },
  isSystem: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model('Role', roleSchema);
