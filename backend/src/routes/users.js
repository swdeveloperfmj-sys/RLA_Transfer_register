import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Location from '../models/Location.js';
import Role from '../models/Role.js';
import { protect, superAdminOnly } from '../middleware/auth.js';

const router = Router();
router.use(protect, superAdminOnly);
router.get('/', async (_req, res) => res.json(await User.find().select('-password').sort({ createdAt: -1 })));
router.post('/', async (req, res) => {
  const { name, email, password, location = '', mobileNumber = '', role = 'manager' } = req.body;
  if (!name || !email || !password || password.length < 8 || !location) return res.status(400).json({ message: 'Name, email, one location, and an 8-character password are required.' });
  if (!await Location.exists({ name: location, isActive: true })) return res.status(400).json({ message: 'Select a valid active location.' });
  if (!await Role.exists({ key: role })) return res.status(400).json({ message: 'Select a valid role.' });
  try {
    const user = await User.create({ name, email, password: await bcrypt.hash(password, 12), location, mobileNumber, role });
    const { password: _password, ...safeUser } = user.toObject();
    res.status(201).json(safeUser);
  } catch (error) { res.status(400).json({ message: error.code === 11000 ? 'That email is already in use.' : 'Could not create user.' }); }
});
router.patch('/:id/status', async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isActive: Boolean(req.body.isActive) }, { new: true });
  if (!user) return res.status(404).json({ message: 'User not found.' });
  res.json(user);
});
router.patch('/:id', async (req, res) => {
  const { name, email, mobileNumber = '', location, role, password } = req.body;
  const user = await User.findById(req.params.id).select('+password');
  if (!user) return res.status(404).json({ message: 'User not found.' });
  if (!name || !email || !role || !location) return res.status(400).json({ message: 'Name, email, role, and one assigned location are required.' });
  if (!await Location.exists({ name: location, isActive: true })) return res.status(400).json({ message: 'Select a valid active location.' });
  if (!await Role.exists({ key: role })) return res.status(400).json({ message: 'Select a valid role.' });
  if (password && password.length < 8) return res.status(400).json({ message: 'New password must have at least 8 characters.' });
  const update = { name, email: email.toLowerCase(), mobileNumber, location, role };
  if (password) update.password = await bcrypt.hash(password, 12);
  try { const updated = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).select('-password'); res.json(updated); }
  catch (error) { res.status(400).json({ message: error.code === 11000 ? 'That email is already in use.' : 'Could not update user.' }); }
});
router.delete('/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found.' });
  if (user._id.equals(req.user._id)) return res.status(400).json({ message: 'You cannot delete your own account.' });
  await user.deleteOne();
  res.status(204).end();
});
export default router;
