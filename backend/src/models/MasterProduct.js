import mongoose from "mongoose";

const masterProductSchema = new mongoose.Schema({
  productCode: { type: String, required: true, trim: true },
  codeKey: { type: String, required: true, unique: true, index: true },
  productName: { type: String, required: true, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

export default mongoose.model("MasterProduct", masterProductSchema);
