import mongoose from 'mongoose';
export default mongoose.model('AodSequence', new mongoose.Schema({ key: { type: String, unique: true }, value: { type: Number, default: 0 } }));
