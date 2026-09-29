import { Router } from 'express';
import Location from '../models/Location.js';
import User from '../models/User.js';
import { protect, superAdminOnly } from '../middleware/auth.js';

const router = Router();
const normalizeCode = value => value?.trim().toUpperCase().replace(/\s/g, '');
const isValidCode = code => /^[A-Z]{2,8}\d{2}$/.test(code);
router.get('/', protect, async (_req, res) => res.json(await Location.find({ isActive: true }).sort({ name: 1 })));
router.use(protect, superAdminOnly);
router.post('/', async (req, res) => {
  const code = normalizeCode(req.body.code);
  if (!req.body.name?.trim()) return res.status(400).json({ message: 'Location name is required.' });
  if (!isValidCode(code)) return res.status(400).json({ message: 'Use a unique location code such as HO01.' });
  try { res.status(201).json(await Location.create({ name: req.body.name.trim(), code })); }
  catch (error) { res.status(400).json({ message: error.code === 11000 ? 'That location name or code already exists.' : 'Could not create location.' }); }
});
router.patch('/:id', async (req, res) => {
  const name = req.body.name?.trim();
  const code = normalizeCode(req.body.code);
  if (!name) return res.status(400).json({ message: 'Location name is required.' });
  if (!isValidCode(code)) return res.status(400).json({ message: 'Use a unique location code such as HO01.' });
  const existing = await Location.findById(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Location not found.' });
  if (existing.name !== name) await User.updateMany({ location: existing.name }, { location: name });
  try { res.json(await Location.findByIdAndUpdate(req.params.id, { name, code }, { new: true })); }
  catch (error) { res.status(400).json({ message: error.code === 11000 ? 'That location name or code already exists.' : 'Could not update location.' }); }
});
router.delete('/:id', async (req, res) => {
  const location = await Location.findById(req.params.id);
  if (!location) return res.status(404).json({ message: 'Location not found.' });
  if (await User.exists({ location: location.name })) return res.status(409).json({ message: 'Move or disable users assigned to this location before deleting it.' });
  await location.deleteOne();
  res.status(204).end();
});
export default router;
