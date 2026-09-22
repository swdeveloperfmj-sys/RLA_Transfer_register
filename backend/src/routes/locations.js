import { Router } from 'express';
import Location from '../models/Location.js';
import User from '../models/User.js';
import { protect, superAdminOnly } from '../middleware/auth.js';

const router = Router();
router.get('/', protect, async (_req, res) => res.json(await Location.find({ isActive: true }).sort({ name: 1 })));
router.use(protect, superAdminOnly);
router.post('/', async (req, res) => {
  if (!req.body.name?.trim()) return res.status(400).json({ message: 'Location name is required.' });
  try { res.status(201).json(await Location.create({ name: req.body.name.trim() })); }
  catch (error) { res.status(400).json({ message: error.code === 11000 ? 'That location already exists.' : 'Could not create location.' }); }
});
router.patch('/:id', async (req, res) => {
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ message: 'Location name is required.' });
  const existing = await Location.findById(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Location not found.' });
  if (existing.name !== name) await User.updateMany({ location: existing.name }, { location: name });
  try { res.json(await Location.findByIdAndUpdate(req.params.id, { name }, { new: true })); }
  catch (error) { res.status(400).json({ message: error.code === 11000 ? 'That location already exists.' : 'Could not update location.' }); }
});
router.delete('/:id', async (req, res) => {
  const location = await Location.findById(req.params.id);
  if (!location) return res.status(404).json({ message: 'Location not found.' });
  if (await User.exists({ location: location.name })) return res.status(409).json({ message: 'Move or disable users assigned to this location before deleting it.' });
  await location.deleteOne();
  res.status(204).end();
});
export default router;
