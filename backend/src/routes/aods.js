import { Router } from 'express';
import Aod from '../models/Aod.js'; import AodSequence from '../models/AodSequence.js'; import { protect } from '../middleware/auth.js';
const router = Router(); router.use(protect);
router.post('/', async (req, res) => { const { customerName, from, to, items = [] } = req.body; if (!customerName?.trim() || !from?.trim() || !to?.trim() || !items.length) return res.status(400).json({ message: 'Customer, From, To, and at least one item are required.' }); const sequence = await AodSequence.findOneAndUpdate({ key: 'aod' }, { $inc: { value: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true }); const aod = await Aod.create({ ...req.body, number: `AOD-${String(sequence.value).padStart(5, '0')}`, dispatchedBy: req.body.dispatchedBy?.trim() || req.user.name, raisedBy: req.user._id }); res.status(201).json(aod); });
export default router;
