import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import Transfer from '../models/Transfer.js';
import Aod from '../models/Aod.js';
import Notification from '../models/Notification.js';
import Location from '../models/Location.js';
import LocationSequence from '../models/LocationSequence.js';
import { protect, superAdminOnly } from '../middleware/auth.js';
import { notifyLocationUsers } from '../services/notifications.js';
import { deleteInvoiceFromR2, r2Configured, uploadInvoiceToR2 } from '../services/r2.js';
import PushSubscription from '../models/PushSubscription.js';
import { vapidPublicKey } from '../services/push.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  // Vercel Functions accept a maximum 4.5 MB request body for server uploads.
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => callback(null, ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype))
});
const isHeadOffice = location => location?.trim().toLowerCase() === 'head office';
router.use(protect);
router.get('/push/public-key', (_req, res) => res.json({ publicKey: vapidPublicKey() }));
router.post('/push/subscribe', async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ message: 'A valid push subscription is required.' });
  await PushSubscription.findOneAndUpdate({ endpoint }, { user: req.user._id, endpoint, keys }, { upsert: true, new: true, setDefaultsOnInsert: true });
  res.status(201).json({ message: 'Phone notifications enabled.' });
});
router.get('/', async (req, res) => {
  const query = isHeadOffice(req.user.location) ? {} : { $or: [{ sourceLocation: req.user.location }, { destinationLocation: req.user.location }] };
  res.json(await Transfer.find(query).populate('requestedBy', 'name email').populate('aod', 'number').sort({ createdAt: -1 }));
});
router.get('/notifications', async (req, res) => {
  const visibleSince = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const notifications = await Notification.find({
    createdAt: { $gte: visibleSince },
    $or: [{ user: req.user._id }, { user: { $exists: false }, location: req.user.location }]
  }).populate('transfer', 'sourceLocation destinationLocation status items invoiceFile createdAt').populate('aod', 'number customerName from to status documentFile createdAt').sort({ createdAt: -1 }).limit(30);
  res.json(notifications);
});
router.patch('/notifications/:id/read', async (req, res) => {
  const notification = await Notification.findOneAndUpdate({ _id: req.params.id, $or: [{ user: req.user._id }, { user: { $exists: false }, location: req.user.location }] }, { read: true }, { new: true });
  if (!notification) return res.status(404).json({ message: 'Notification not found.' });
  res.json(notification);
});
router.get('/reports/held-items', superAdminOnly, async (req, res) => {
  const { from, to, location } = req.query;
  const dateFilter = {};
  if (from) dateFilter.$gte = new Date(`${from}T00:00:00.000Z`);
  if (to) dateFilter.$lte = new Date(`${to}T23:59:59.999Z`);
  const query = { 'items.reviewStatus': 'held' };
  if (location) query.sourceLocation = location;
  if (Object.keys(dateFilter).length) query['items.reviewedAt'] = dateFilter;
  const transfers = await Transfer.find(query)
    .populate('requestedBy', 'name email location')
    .populate('items.reviewedBy', 'name email location')
    .sort({ 'items.reviewedAt': -1 });
  const heldItems = transfers.flatMap(transfer => transfer.items
    .filter(item => item.reviewStatus === 'held' && (!dateFilter.$gte || item.reviewedAt >= dateFilter.$gte) && (!dateFilter.$lte || item.reviewedAt <= dateFilter.$lte))
    .map(item => ({
      transferId: transfer._id,
      itemCode: item.itemCode,
      quantity: item.quantity,
      holdRemark: item.holdRemark,
      heldAt: item.reviewedAt,
      sourceLocation: transfer.sourceLocation,
      destinationLocation: transfer.destinationLocation,
      requestedBy: transfer.requestedBy,
      heldBy: item.reviewedBy
    })));
  res.json(heldItems.sort((a, b) => new Date(b.heldAt) - new Date(a.heldAt)));
});
router.get('/reports/transactions', superAdminOnly, async (req, res) => {
  const { from, to, location } = req.query;
  const query = {};
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(`${from}T00:00:00.000Z`);
    if (to) query.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }
  if (location) query.sourceLocation = location;
  const transfers = await Transfer.find(query).sort({ createdAt: -1 });
  res.json(transfers.map(transfer => ({
    id: transfer._id,
    referenceNumber: transfer.referenceNumber || String(transfer._id),
    createdAt: transfer.createdAt,
    sourceLocation: transfer.sourceLocation,
    destinationLocation: transfer.destinationLocation,
    sentItems: transfer.items.map(item => ({ itemCode: item.itemCode, quantity: item.quantity })),
    heldItems: transfer.items.filter(item => item.reviewStatus === 'held').map(item => ({ itemCode: item.itemCode, quantity: item.quantity, remark: item.holdRemark })),
    status: transfer.status
  })));
});
router.post('/', async (req, res) => {
  const { destinationLocation, items, notes = '', aodId } = req.body;
  const idempotencyKey = req.get('Idempotency-Key');
  if (!req.user.location) return res.status(403).json({ message: 'Your account needs an assigned location before you can create transport requests.' });
  if (!destinationLocation || destinationLocation === req.user.location) return res.status(400).json({ message: 'Select another destination location.' });
  if (!await Location.exists({ name: destinationLocation, isActive: true }) || !Array.isArray(items) || !items.length || items.some(item => !item.itemCode || Number(item.quantity) < 1)) return res.status(400).json({ message: 'Add at least one valid item code and destination.' });
  if (idempotencyKey) {
    const existing = await Transfer.findOne({ requestedBy: req.user._id, idempotencyKey });
    if (existing) return res.status(200).json(existing);
  }
  let transfer;
  try {
    const source = await Location.findOne({ name: req.user.location, isActive: true });
    if (!source?.code) return res.status(400).json({ message: 'Your location needs a code before you can create transport requests.' });
    const sequence = await LocationSequence.findOneAndUpdate({ locationCode: source.code }, { $inc: { value: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    const referenceNumber = `${source.code}-${String(sequence.value).padStart(5, '0')}`;
    let aod;
    if (aodId) { aod = await Aod.findById(aodId); if (!aod || aod.status !== 'awaiting_transport') return res.status(409).json({ message: 'This AOD is not available for transport processing.' }); if (aod.from !== req.user.location) return res.status(403).json({ message: 'Only the AOD source location can create its transport request.' }); if (aod.to !== destinationLocation) return res.status(400).json({ message: 'The transport destination must match the AOD destination.' }); }
    transfer = await Transfer.create({ sourceLocation: req.user.location, sourceLocationCode: source.code, referenceNumber, destinationLocation, items, notes, aod: aod?._id, requestedBy: req.user._id, idempotencyKey });
    if (aod) { aod.status = 'transport_requested'; await aod.save(); }
  } catch (error) {
    if (error.code === 11000 && idempotencyKey) {
      return res.status(200).json(await Transfer.findOne({ requestedBy: req.user._id, idempotencyKey }));
    }
    throw error;
  }
  await notifyLocationUsers({ location: 'Head Office', subject: 'New transport request', message: `New transport request from ${req.user.location} to ${destinationLocation}.`, transfer: transfer._id });
  res.status(201).json(transfer);
});
router.patch('/:id/items/:index/review', async (req, res) => {
  if (!isHeadOffice(req.user.location)) return res.status(403).json({ message: 'Only Head Office can review transport items.' });
  const itemIndex = Number(req.params.index);
  const { reviewStatus, holdRemark = '' } = req.body;
  if (!Number.isInteger(itemIndex) || itemIndex < 0 || !['approved', 'held'].includes(reviewStatus)) return res.status(400).json({ message: 'Choose a valid item review decision.' });
  if (reviewStatus === 'held' && !holdRemark.trim()) return res.status(400).json({ message: 'Add a remark before holding an item.' });
  const transfer = await Transfer.findById(req.params.id); if (!transfer) return res.status(404).json({ message: 'Transfer not found.' });
  if (!['awaiting_head_office', 'invoice_uploaded'].includes(transfer.status) || !transfer.items[itemIndex]) return res.status(409).json({ message: 'This item is not available for review.' });
  const item = transfer.items[itemIndex];
  item.reviewStatus = reviewStatus;
  item.holdRemark = reviewStatus === 'held' ? holdRemark.trim() : '';
  item.reviewedAt = new Date();
  item.reviewedBy = req.user._id;
  if (transfer.items.every(entry => entry.reviewStatus === 'held')) transfer.status = 'closed';
  await transfer.save();
  if (reviewStatus === 'held') {
    await notifyLocationUsers({ location: transfer.sourceLocation, subject: 'Transport item placed on hold', message: `${item.itemCode} in the transport request to ${transfer.destinationLocation} is on hold. Remark: ${item.holdRemark}`, transfer: transfer._id });
  }
  res.json(transfer);
});
router.post('/:id/items/hold', async (req, res) => {
  if (!isHeadOffice(req.user.location)) return res.status(403).json({ message: 'Only Head Office can hold transport items.' });
  const { itemIndexes, holdRemark = '' } = req.body;
  if (!Array.isArray(itemIndexes) || !itemIndexes.length || !holdRemark.trim()) return res.status(400).json({ message: 'Select at least one item and add a hold remark.' });
  const uniqueIndexes = [...new Set(itemIndexes.map(Number))];
  const transfer = await Transfer.findById(req.params.id); if (!transfer) return res.status(404).json({ message: 'Transfer not found.' });
  if (!['awaiting_head_office', 'invoice_uploaded'].includes(transfer.status) || transfer.items.some(item => item.reviewStatus === 'held')) return res.status(409).json({ message: 'Items have already been placed on hold for this request.' });
  if (uniqueIndexes.some(index => !Number.isInteger(index) || index < 0 || !transfer.items[index])) return res.status(400).json({ message: 'One or more selected items are invalid.' });
  const heldAt = new Date();
  uniqueIndexes.forEach(index => {
    transfer.items[index].reviewStatus = 'held';
    transfer.items[index].holdRemark = holdRemark.trim();
    transfer.items[index].reviewedAt = heldAt;
    transfer.items[index].reviewedBy = req.user._id;
  });
  if (transfer.items.every(item => item.reviewStatus === 'held')) transfer.status = 'closed';
  await transfer.save();
  const itemCodes = uniqueIndexes.map(index => transfer.items[index].itemCode).join(', ');
  await notifyLocationUsers({ location: transfer.sourceLocation, subject: 'Transport items placed on hold', message: `${itemCodes} in the transport request to ${transfer.destinationLocation} are on hold. Remark: ${holdRemark.trim()}`, transfer: transfer._id });
  res.json(transfer);
});
router.post('/:id/invoice', upload.single('invoice'), async (req, res) => {
  if (!isHeadOffice(req.user.location)) return res.status(403).json({ message: 'Only Head Office can upload invoices.' });
  const transfer = await Transfer.findById(req.params.id); if (!transfer) return res.status(404).json({ message: 'Transfer not found.' });
  if (!req.file) return res.status(400).json({ message: 'Attach an invoice document.' });
  if (!['awaiting_head_office', 'invoice_uploaded'].includes(transfer.status)) {
    return res.status(409).json({ message: 'Invoice cannot be replaced after dispatch.' });
  }
  if (!r2Configured()) return res.status(503).json({ message: 'Invoice storage is not configured. Add the Cloudflare R2 environment variables before uploading.' });
  const safeName = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageKey = `invoices/${transfer._id}/${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`;
  const invoiceUrl = await uploadInvoiceToR2({ key: storageKey, body: req.file.buffer, contentType: req.file.mimetype });
  const oldStorageKey = transfer.invoiceStorageKey;
  transfer.invoiceFile = invoiceUrl; transfer.invoiceStorageKey = storageKey; transfer.invoiceOriginalName = req.file.originalname; transfer.invoiceUploadedAt = new Date(); transfer.status = 'invoice_uploaded'; await transfer.save();
  if (oldStorageKey) await deleteInvoiceFromR2(oldStorageKey).catch(error => console.error('Could not remove replaced R2 invoice:', error.message));
  await notifyLocationUsers({ location: transfer.sourceLocation, subject: 'TOG uploaded for dispatch', message: `TOG uploaded for transport to ${transfer.destinationLocation}. Review and confirm dispatch.`, transfer: transfer._id });
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
