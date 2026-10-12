import mongoose from 'mongoose';
export default mongoose.model('AodSequence', new mongoose.Schema({
  key: { type: String, unique: true },
  // `value` remains the numeric counter so allocation stays atomic.
  value: { type: Number, default: 0 },
  prefix: { type: String, default: 'AOD-' },
  padding: { type: Number, default: 5 },
}));
