import { isHeadOffice as isHeadOfficeLocation } from "../config/headOffice.js";
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

export const hasPermission = (user, permission) => user.role === 'super_admin'
  || (Array.isArray(user.permissions) ? user.permissions.includes(permission) : true);

export const requirePermission = permission => (req, res, next) => hasPermission(req.user, permission)
  ? next()
  : res.status(403).json({ message: 'Your account does not have permission for this function.' });

export const requireAnyPermission = permissions => (req, res, next) => permissions.some(permission => hasPermission(req.user, permission))
  ? next()
  : res.status(403).json({ message: 'Your account does not have permission for this function.' });

export const reportsAccess = permission => (req, res, next) => {
  const isHeadOfficeManager = req.user.role === 'manager' && isHeadOfficeLocation(req.user.location);
  const explicitlyAllowed = Array.isArray(req.user.permissions) && req.user.permissions.includes(permission);
  const legacyHeadOfficeAccess = !Array.isArray(req.user.permissions) && isHeadOfficeManager;
  return req.user.role === 'super_admin' || explicitlyAllowed || legacyHeadOfficeAccess
    ? next()
    : res.status(403).json({ message: 'Your account does not have permission for this report.' });
};
