import mongoose from 'mongoose';

const transferSchema = new mongoose.Schema({
  sourceLocation: { type: String, required: true },
  sourceLocationCode: { type: String, required: true },
  referenceNumber: { type: String, required: true, unique: true },
  destinationLocation: { type: String, required: true },
  items: [{
    itemCode: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    notes: String,
    reviewStatus: { type: String, enum: ['pending', 'approved', 'held'], default: 'pending' },
    holdRemark: { type: String, trim: true, default: '' },
    reviewedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  notes: String,
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  aod: { type: mongoose.Schema.Types.ObjectId, ref: 'Aod' },
  idempotencyKey: { type: String, trim: true, sparse: true },
  invoiceFile: String,
  invoiceStorageKey: String,
  invoiceOriginalName: String,
  status: { type: String, enum: ['awaiting_head_office', 'invoice_uploaded', 'awaiting_destination', 'completed', 'closed'], default: 'awaiting_head_office' },
  invoiceUploadedAt: Date, dispatchedAt: Date, receivedAt: Date
}, { timestamps: true });
transferSchema.index({ requestedBy: 1, idempotencyKey: 1 }, { unique: true, sparse: true });
export default mongoose.model('Transfer', transferSchema);
