import mongoose from 'mongoose';

const transferSchema = new mongoose.Schema({
  sourceLocation: { type: String, required: true },
  destinationLocation: { type: String, required: true },
  items: [{ name: { type: String, required: true }, quantity: { type: Number, required: true, min: 1 }, notes: String }],
  notes: String,
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  idempotencyKey: { type: String, trim: true, sparse: true },
  invoiceFile: String,
  invoiceOriginalName: String,
  status: { type: String, enum: ['awaiting_head_office', 'invoice_uploaded', 'awaiting_destination', 'completed'], default: 'awaiting_head_office' },
  invoiceUploadedAt: Date, dispatchedAt: Date, receivedAt: Date
}, { timestamps: true });
transferSchema.index({ requestedBy: 1, idempotencyKey: 1 }, { unique: true, sparse: true });
export default mongoose.model('Transfer', transferSchema);
