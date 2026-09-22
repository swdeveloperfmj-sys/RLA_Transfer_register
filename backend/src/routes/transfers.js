import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import Transfer from '../models/Transfer.js';
import Notification from '../models/Notification.js';
import Location from '../models/Location.js';
import { protect } from '../middleware/auth.js';

const router = Router();
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (_req, file, callback) => callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => callback(null, ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype))
});
const notify = (location, message, transfer) => Notification.create({ location, message, transfer });
const isHeadOffice = location => location?.trim().toLowerCase() === 'head office';
router.use(protect);
router.get('/', async (req, res) => {
  const query = isHeadOffice(req.user.location) ? {} : { $or: [{ sourceLocation: req.user.location }, { destinationLocation: req.user.location }] };
  res.json(await Transfer.find(query).populate('requestedBy', 'name email').sort({ createdAt: -1 }));
});
router.get('/notifications', async (req, res) => res.json(await Notification.find({ location: req.user.location }).sort({ createdAt: -1 }).limit(30)));
router.post('/', async (req, res) => {
  const { destinationLocation, items, notes = '' } = req.body;
  if (!req.user.location || isHeadOffice(req.user.location)) return res.status(403).json({ message: 'Only non-Head Office location managers can create transport requests.' });
  if (!destinationLocation || isHeadOffice(destinationLocation) || destinationLocation === req.user.location) return res.status(400).json({ message: 'Select another non-Head Office destination location.' });
  if (!await Location.exists({ name: destinationLocation, isActive: true }) || !Array.isArray(items) || !items.length || items.some(item => !item.name || Number(item.quantity) < 1)) return res.status(400).json({ message: 'Add at least one valid item and destination.' });
  const transfer = await Transfer.create({ sourceLocation: req.user.location, destinationLocation, items, notes, requestedBy: req.user._id });
  await notify('Head Office', `New transport request from ${req.user.location} to ${destinationLocation}.`, transfer._id);
  res.status(201).json(transfer);
});
router.post('/:id/invoice', upload.single('invoice'), async (req, res) => {
  if (!isHeadOffice(req.user.location)) return res.status(403).json({ message: 'Only Head Office can upload invoices.' });
  const transfer = await Transfer.findById(req.params.id); if (!transfer) return res.status(404).json({ message: 'Transfer not found.' });
  if (!req.file) return res.status(400).json({ message: 'Attach an invoice document.' });
  if (!['awaiting_head_office', 'invoice_uploaded'].includes(transfer.status)) {
    await fs.unlink(req.file.path).catch(() => {});
    return res.status(409).json({ message: 'Invoice cannot be replaced after dispatch.' });
  }
  if (transfer.invoiceFile) {
    const oldFile = path.join(process.cwd(), 'uploads', path.basename(transfer.invoiceFile));
    await fs.unlink(oldFile).catch(() => {});
  }
  transfer.invoiceFile = `/uploads/${req.file.filename}`; transfer.invoiceOriginalName = req.file.originalname; transfer.invoiceUploadedAt = new Date(); transfer.status = 'invoice_uploaded'; await transfer.save();
  await notify(transfer.sourceLocation, `Invoice uploaded for transport to ${transfer.destinationLocation}. Review and confirm dispatch.`, transfer._id);
  res.json(transfer);
});
router.post('/:id/dispatch', async (req, res) => {
  const transfer = await Transfer.findById(req.params.id); if (!transfer) return res.status(404).json({ message: 'Transfer not found.' });
  if (transfer.sourceLocation !== req.user.location || transfer.status !== 'invoice_uploaded') return res.status(403).json({ message: 'This transport is not ready for dispatch from your location.' });
  transfer.status = 'awaiting_destination'; transfer.dispatchedAt = new Date(); await transfer.save();
  await notify(transfer.destinationLocation, `Incoming transport from ${transfer.sourceLocation} is on its way with invoice attached.`, transfer._id);
  res.json(transfer);
});
router.post('/:id/receive', async (req, res) => {
  const transfer = await Transfer.findById(req.params.id); if (!transfer) return res.status(404).json({ message: 'Transfer not found.' });
  if (transfer.destinationLocation !== req.user.location || transfer.status !== 'awaiting_destination') return res.status(403).json({ message: 'This transfer is not ready for receipt at your location.' });
  transfer.status = 'completed'; transfer.receivedAt = new Date(); await transfer.save();
  await notify(transfer.sourceLocation, `Transfer to ${transfer.destinationLocation} was received successfully.`, transfer._id);
  res.json(transfer);
});
export default router;
