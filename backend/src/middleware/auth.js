import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Authentication required.' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) return res.status(401).json({ message: 'Account is unavailable.' });
    req.user = user;
    next();
  } catch { res.status(401).json({ message: 'Your session has expired. Please sign in again.' }); }
};

export const superAdminOnly = (req, res, next) => req.user.role === 'super_admin'
  ? next() : res.status(403).json({ message: 'Super admin access required.' });
