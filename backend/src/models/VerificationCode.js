import mongoose from 'mongoose';

const verificationCodeSchema = new mongoose.Schema({
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  channel: { type: String, enum: ['email', 'mobile'], required: true },
  target: { type: String, required: true, trim: true },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  verifiedAt: Date
}, { timestamps: true });
verificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
verificationCodeSchema.index({ requestedBy: 1, channel: 1, target: 1 });
export default mongoose.model('VerificationCode', verificationCodeSchema);
