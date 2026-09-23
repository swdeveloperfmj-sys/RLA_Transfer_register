import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import Transfer from '../models/Transfer.js';
import Notification from '../models/Notification.js';
import Location from '../models/Location.js';
import { protect } from '../middleware/auth.js';
import { notifyLocationUsers } from '../services/notifications.js';

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
const isHeadOffice = location => location?.trim().toLowerCase() === 'head office';
router.use(protect);
router.get('/', async (req, res) => {
  const query = isHeadOffice(req.user.location) ? {} : { $or: [{ sourceLocation: req.user.location }, { destinationLocation: req.user.location }] };
  res.json(await Transfer.find(query).populate('requestedBy', 'name email').sort({ createdAt: -1 }));
});
router.get('/notifications', async (req, res) => {
  const visibleSince = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const notifications = await Notification.find({
    createdAt: { $gte: visibleSince },
    $or: [{ user: req.user._id }, { user: { $exists: false }, location: req.user.location }]
  }).populate('transfer', 'sourceLocation destinationLocation status items invoiceFile createdAt').sort({ createdAt: -1 }).limit(30);
  res.json(notifications);
});
router.patch('/notifications/:id/read', async (req, res) => {
  const notification = await Notification.findOneAndUpdate({ _id: req.params.id, $or: [{ user: req.user._id }, { user: { $exists: false }, location: req.user.location }] }, { read: true }, { new: true });
  if (!notification) return res.status(404).json({ message: 'Notification not found.' });
  res.json(notification);
});
router.post('/', async (req, res) => {
  const { destinationLocation, items, notes = '' } = req.body;
  const idempotencyKey = req.get('Idempotency-Key');
  if (!req.user.location || isHeadOffice(req.user.location)) return res.status(403).json({ message: 'Only non-Head Office location managers can create transport requests.' });
  if (!destinationLocation || isHeadOffice(destinationLocation) || destinationLocation === req.user.location) return res.status(400).json({ message: 'Select another non-Head Office destination location.' });
  if (!await Location.exists({ name: destinationLocation, isActive: true }) || !Array.isArray(items) || !items.length || items.some(item => !item.name || Number(item.quantity) < 1)) return res.status(400).json({ message: 'Add at least one valid item and destination.' });
  if (idempotencyKey) {
    const existing = await Transfer.findOne({ requestedBy: req.user._id, idempotencyKey });
    if (existing) return res.status(200).json(existing);
  }
  let transfer;
  try {
    transfer = await Transfer.create({ sourceLocation: req.user.location, destinationLocation, items, notes, requestedBy: req.user._id, idempotencyKey });
  } catch (error) {
    if (error.code === 11000 && idempotencyKey) {
      return res.status(200).json(await Transfer.findOne({ requestedBy: req.user._id, idempotencyKey }));
    }
    throw error;
  }
  await notifyLocationUsers({ location: 'Head Office', subject: 'New transport request', message: `New transport request from ${req.user.location} to ${destinationLocation}.`, transfer: transfer._id });
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
  await notifyLocationUsers({ location: transfer.sourceLocation, subject: 'Invoice ready for dispatch', message: `Invoice uploaded for transport to ${transfer.destinationLocation}. Review and confirm dispatch.`, transfer: transfer._id });
  res.json(transfer);
});
router.post('/:id/dispatch', async (req, res) => {
  const transfer = await Transfer.findById(req.params.id); if (!transfer) return res.status(404).json({ message: 'Transfer not found.' });
  if (transfer.sourceLocation !== req.user.location || transfer.status !== 'invoice_uploaded') return res.status(403).json({ message: 'This transport is not ready for dispatch from your location.' });
  transfer.status = 'awaiting_destination'; transfer.dispatchedAt = new Date(); await transfer.save();
  await notifyLocationUsers({ location: transfer.destinationLocation, subject: 'Incoming transport dispatched', message: `Incoming transport from ${transfer.sourceLocation} is on its way with invoice attached.`, transfer: transfer._id });
  res.json(transfer);
});
router.post('/:id/receive', async (req, res) => {
  const transfer = await Transfer.findById(req.params.id); if (!transfer) return res.status(404).json({ message: 'Transfer not found.' });
  if (transfer.destinationLocation !== req.user.location || transfer.status !== 'awaiting_destination') return res.status(403).json({ message: 'This transfer is not ready for receipt at your location.' });
  transfer.status = 'completed'; transfer.receivedAt = new Date(); await transfer.save();
  await notifyLocationUsers({ location: transfer.sourceLocation, subject: 'Transfer received successfully', message: `Transfer to ${transfer.destinationLocation} was received successfully.`, transfer: transfer._id });
  res.json(transfer);
});
export default router;
