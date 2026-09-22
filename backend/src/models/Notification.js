import mongoose from 'mongoose';
const notificationSchema = new mongoose.Schema({ location: { type: String, required: true }, message: { type: String, required: true }, transfer: { type: mongoose.Schema.Types.ObjectId, ref: 'Transfer' }, read: { type: Boolean, default: false } }, { timestamps: true });
export default mongoose.model('Notification', notificationSchema);
