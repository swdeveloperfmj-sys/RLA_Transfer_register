import mongoose from 'mongoose';
const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  location: { type: String, required: true },
  message: { type: String, required: true },
  transfer: { type: mongoose.Schema.Types.ObjectId, ref: 'Transfer' },
  read: { type: Boolean, default: false }
}, { timestamps: true });
notificationSchema.index({ user: 1, createdAt: -1 });
export default mongoose.model('Notification', notificationSchema);
