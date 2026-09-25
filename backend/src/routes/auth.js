import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomInt } from 'crypto';
import User from '../models/User.js';
import VerificationCode from '../models/VerificationCode.js';
import { protect } from '../middleware/auth.js';
import { sendNotificationEmail } from '../services/notifications.js';

const router = Router();
const publicUser = user => ({ id: user._id, name: user.name, email: user.email, role: user.role, location: user.location, mobileNumber: user.mobileNumber });
const tokenFor = id => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '5d' });
const hashCode = code => createHash('sha256').update(code).digest('hex');

const sendSuperAdminOtp = async user => {
  const code = String(randomInt(100000, 1000000));
  await VerificationCode.deleteMany({ requestedBy: user._id, channel: 'email', target: user.email });
  await VerificationCode.create({ requestedBy: user._id, channel: 'email', target: user.email, codeHash: hashCode(code), expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
  await sendNotificationEmail({ recipient: user, subject: 'RLA Super Admin login code', message: `Your RLA Super Admin login verification code is ${code}. It expires in 10 minutes.` });
};

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email?.toLowerCase() }).select('+password');
  if (!user || !user.isActive || !(await bcrypt.compare(password || '', user.password))) return res.status(401).json({ message: 'Invalid email or password.' });
  if (user.role === 'super_admin') {
    try { await sendSuperAdminOtp(user); }
    catch (error) { return res.status(502).json({ message: 'Could not send the login verification email. Check SMTP settings and try again.' }); }
    return res.json({ requiresOtp: true, email: user.email });
  }
  res.json({ token: tokenFor(user._id), user: publicUser(user) });
});
router.post('/verify-super-admin', async (req, res) => {
  const email = req.body.email?.trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  const user = await User.findOne({ email, role: 'super_admin', isActive: true });
  if (!user) return res.status(401).json({ message: 'Invalid verification request.' });
  const verification = await VerificationCode.findOne({ requestedBy: user._id, channel: 'email', target: user.email }).sort({ createdAt: -1 });
  if (!verification || verification.expiresAt < new Date()) return res.status(400).json({ message: 'Code expired. Sign in again to receive a new code.' });
  if (verification.attempts >= 5) return res.status(429).json({ message: 'Too many attempts. Sign in again to receive a new code.' });
  if (verification.codeHash !== hashCode(code)) { verification.attempts += 1; await verification.save(); return res.status(400).json({ message: 'Incorrect verification code.' }); }
  await VerificationCode.deleteMany({ requestedBy: user._id, channel: 'email', target: user.email });
  res.json({ token: tokenFor(user._id), user: publicUser(user) });
});
router.get('/me', protect, (req, res) => res.json({ user: publicUser(req.user) }));
export default router;
