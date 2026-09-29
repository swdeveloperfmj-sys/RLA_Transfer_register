import mongoose from 'mongoose';
const aodSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true }, customerName: { type: String, required: true }, customerAddress: String, customerVat: String,
  from: { type: String, required: true }, to: { type: String, required: true }, dispatchedBy: { type: String, required: true }, vehicleNumber: String,
  items: [{ code: String, description: String, packaging: String, quantity: Number }], approvedBy: String, collectedBy: String,
  status: { type: String, enum: ['awaiting_destination', 'awaiting_transport', 'transport_requested', 'returning', 'returned'], default: 'awaiting_destination' },
  raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
export default mongoose.model('Aod', aodSchema);
