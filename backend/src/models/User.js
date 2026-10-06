import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  mobileNumber: { type: String, trim: true, default: '' },
  emailVerified: { type: Boolean, default: false },
  mobileVerified: { type: Boolean, default: false },
  role: { type: String, default: 'manager', lowercase: true, trim: true },
  location: { type: String, trim: true, default: '' },
  permissions: { type: [String], default: undefined },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model('User', userSchema);
