import { Router } from 'express';
import Role from '../models/Role.js';
import User from '../models/User.js';
import { protect, superAdminOnly } from '../middleware/auth.js';

const router = Router();
router.use(protect, superAdminOnly);
router.get('/', async (_req, res) => res.json(await Role.find().sort({ isSystem: -1, name: 1 })));
router.post('/', async (req, res) => {
  const name = req.body.name?.trim();
  const key = name?.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (!name || !key) return res.status(400).json({ message: 'Role name is required.' });
  try { res.status(201).json(await Role.create({ name, key })); }
  catch (error) { res.status(400).json({ message: error.code === 11000 ? 'That role already exists.' : 'Could not create role.' }); }
});
router.delete('/:id', async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) return res.status(404).json({ message: 'Role not found.' });
  if (role.isSystem) return res.status(400).json({ message: 'System roles cannot be deleted.' });
  if (await User.exists({ role: role.key })) return res.status(409).json({ message: 'Move users in this role before deleting it.' });
  await role.deleteOne(); res.status(204).end();
});
export default router;
