import { Router } from "express";
import MasterProduct from "../models/MasterProduct.js";
import { protect, superAdminOnly } from "../middleware/auth.js";

const router = Router();
router.use(protect);

const cleanText = (value) => String(value ?? "").trim();
const codeKey = (value) => cleanText(value).toUpperCase();
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

router.get("/lookup/:code", async (req, res) => {
  const key = codeKey(req.params.code);
  if (!key) return res.status(400).json({ message: "Enter a product code." });
  const product = await MasterProduct.findOne({ codeKey: key }).select("productCode productName");
  if (!product) return res.status(404).json({ message: "Product code was not found in Master Products." });
  res.json(product);
});

router.use(superAdminOnly);

router.get("/", async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(10, Number.parseInt(req.query.limit, 10) || 50));
  const search = cleanText(req.query.search);
  const query = search ? {
    $or: [
      { productCode: new RegExp(escapeRegex(search), "i") },
      { productName: new RegExp(escapeRegex(search), "i") },
    ],
  } : {};
  const [products, total] = await Promise.all([
    MasterProduct.find(query).sort({ productCode: 1 }).skip((page - 1) * limit).limit(limit),
    MasterProduct.countDocuments(query),
  ]);
  res.json({ products, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.post("/import", async (req, res) => {
  if (!Array.isArray(req.body.products) || !req.body.products.length)
    return res.status(400).json({ message: "Upload at least one valid product." });
  if (req.body.products.length > 500)
    return res.status(400).json({ message: "Import a maximum of 500 products per batch." });

  const unique = new Map();
  let invalid = 0;
  for (const row of req.body.products) {
    const productCode = cleanText(row.productCode);
    const productName = cleanText(row.productName);
    const key = codeKey(productCode);
    if (!key || !productName) { invalid += 1; continue; }
    if (!unique.has(key)) unique.set(key, { productCode, productName, codeKey: key });
  }
  if (!unique.size) return res.status(400).json({ message: "No valid ProductCode and ProductName rows were found." });

  const operations = [...unique.values()].map((product) => ({
    updateOne: {
      filter: { codeKey: product.codeKey },
      update: {
        $setOnInsert: { codeKey: product.codeKey, createdBy: req.user._id },
        $set: { productCode: product.productCode, productName: product.productName },
      },
      upsert: true,
    },
  }));
  const result = await MasterProduct.bulkWrite(operations, { ordered: false });
  res.json({
    received: req.body.products.length,
    unique: unique.size,
    invalid,
    added: result.upsertedCount || 0,
    updated: result.modifiedCount || 0,
    existing: (result.matchedCount || 0) - (result.modifiedCount || 0),
  });
});

export default router;
