import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';

const router = Router();
const publicUser = user => ({ id: user._id, name: user.name, email: user.email, role: user.role, location: user.location, mobileNumber: user.mobileNumber });
const tokenFor = id => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '8h' });

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email?.toLowerCase() }).select('+password');
  if (!user || !user.isActive || !(await bcrypt.compare(password || '', user.password))) return res.status(401).json({ message: 'Invalid email or password.' });
  res.json({ token: tokenFor(user._id), user: publicUser(user) });
});
router.get('/me', protect, (req, res) => res.json({ user: publicUser(req.user) }));
export default router;
