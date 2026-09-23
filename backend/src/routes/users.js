import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, randomInt } from 'crypto';
import User from '../models/User.js';
import Location from '../models/Location.js';
import Role from '../models/Role.js';
import VerificationCode from '../models/VerificationCode.js';
import { protect, superAdminOnly } from '../middleware/auth.js';
import { sendNotificationEmail } from '../services/notifications.js';
import { normalizeSriLankanNumber, sendTextwareSms } from '../services/sms.js';

const router = Router();
router.use(protect, superAdminOnly);
router.get('/', async (_req, res) => res.json(await User.find().select('-password').sort({ createdAt: -1 })));
const hashCode = code => createHash('sha256').update(code).digest('hex');
const emailTarget = value => value?.trim().toLowerCase();
const createCode = async ({ requestedBy, channel, target }) => {
  const code = String(randomInt(100000, 1000000));
  await VerificationCode.deleteMany({ requestedBy, channel, target });
  await VerificationCode.create({ requestedBy, channel, target, codeHash: hashCode(code), expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
  return code;
};
router.post('/verification/email/send', async (req, res) => {
  const target = emailTarget(req.body.email);
  if (!target || !/^\S+@\S+\.\S+$/.test(target)) return res.status(400).json({ message: 'Enter a valid work email.' });
  if (await User.exists({ email: target })) return res.status(409).json({ message: 'That email is already in use.' });
  const code = await createCode({ requestedBy: req.user._id, channel: 'email', target });
  try { await sendNotificationEmail({ recipient: { name: 'there', email: target }, subject: 'RLA email verification code', message: `Your RLA verification code is ${code}. It expires in 10 minutes.` }); }
  catch (error) { return res.status(502).json({ message: 'Could not send the verification email. Check SMTP settings and try again.' }); }
  res.json({ message: 'Verification code sent to the work email.' });
});
router.post('/verification/mobile/send', async (req, res) => {
  const target = normalizeSriLankanNumber(req.body.mobileNumber);
  if (target.length < 9) return res.status(400).json({ message: 'Enter a valid mobile number.' });
  const code = await createCode({ requestedBy: req.user._id, channel: 'mobile', target });
  try {
    const result = await sendTextwareSms({ mobileNumber: target, message: `RLA Transfer verification code: ${code}. Expires in 10 minutes.` });
    if (result.skipped) return res.status(503).json({ message: 'SMS verification is not configured.' });
  } catch (error) { return res.status(502).json({ message: 'Could not send the verification SMS. Check Textware settings and try again.' }); }
  res.json({ message: 'Verification code sent to the mobile number.' });
});
router.post('/verification/:channel/confirm', async (req, res) => {
  const { channel } = req.params;
  if (!['email', 'mobile'].includes(channel)) return res.status(400).json({ message: 'Invalid verification channel.' });
  const target = channel === 'email' ? emailTarget(req.body.email) : normalizeSriLankanNumber(req.body.mobileNumber);
  const code = String(req.body.code || '').trim();
  const verification = await VerificationCode.findOne({ requestedBy: req.user._id, channel, target }).sort({ createdAt: -1 });
  if (!verification || verification.expiresAt < new Date()) return res.status(400).json({ message: 'Code expired. Send a new code and try again.' });
  if (verification.attempts >= 5) return res.status(429).json({ message: 'Too many attempts. Send a new code and try again.' });
  if (verification.codeHash !== hashCode(code)) { verification.attempts += 1; await verification.save(); return res.status(400).json({ message: 'Incorrect verification code.' }); }
  verification.verifiedAt = new Date(); await verification.save();
  res.json({ message: `${channel === 'email' ? 'Email' : 'Mobile number'} verified.` });
});
router.post('/', async (req, res) => {
  const { name, email, password, location = '', mobileNumber = '', role = 'manager' } = req.body;
  const normalizedEmail = emailTarget(email); const normalizedMobile = mobileNumber ? normalizeSriLankanNumber(mobileNumber) : '';
  if (!name || !normalizedEmail || !password || password.length < 8 || !location) return res.status(400).json({ message: 'Name, email, one location, and an 8-character password are required.' });
  if (!await Location.exists({ name: location, isActive: true })) return res.status(400).json({ message: 'Select a valid active location.' });
  if (!await Role.exists({ key: role })) return res.status(400).json({ message: 'Select a valid role.' });
  if (!await VerificationCode.exists({ requestedBy: req.user._id, channel: 'email', target: normalizedEmail, verifiedAt: { $exists: true }, expiresAt: { $gt: new Date() } })) return res.status(400).json({ message: 'Verify the work email before creating this user.' });
  if (normalizedMobile && !await VerificationCode.exists({ requestedBy: req.user._id, channel: 'mobile', target: normalizedMobile, verifiedAt: { $exists: true }, expiresAt: { $gt: new Date() } })) return res.status(400).json({ message: 'Verify the mobile number before creating this user.' });
  try {
    const user = await User.create({ name, email: normalizedEmail, password: await bcrypt.hash(password, 12), location, mobileNumber: normalizedMobile, role, emailVerified: true, mobileVerified: Boolean(normalizedMobile) });
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
