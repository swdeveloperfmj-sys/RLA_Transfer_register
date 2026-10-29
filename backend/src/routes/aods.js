import { isHeadOffice as isHeadOfficeLocation } from "../config/headOffice.js";
import { Router } from "express";
import Aod from "../models/Aod.js";
import AodSequence from "../models/AodSequence.js";
import {
  protect,
  reportsAccess,
  requirePermission,
  superAdminOnly,
} from "../middleware/auth.js";
import { notifyLocationUsers } from "../services/notifications.js";
const router = Router();
const formatAodNumber = (value, prefix = "AOD-", padding = 5) =>
  `${prefix}${String(value).padStart(padding, "0")}`;
const sequenceNumber = (sequence, value) =>
  formatAodNumber(value, sequence?.prefix ?? "AOD-", sequence?.padding ?? 5);
const parseAodNumber = (number) => {
  const match = number.trim().match(/^(.*?)(\d+)$/);
  if (!match) return null;
  const value = Number(match[2]);
  if (!Number.isSafeInteger(value) || value < 1) return null;
  return { prefix: match[1], value, padding: match[2].length };
};
const allocateAodNumber = async () => {
  while (true) {
    const sequence = await AodSequence.findOneAndUpdate(
      { key: "aod" },
      { $inc: { value: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const number = sequenceNumber(sequence, sequence.value);
    if (!(await Aod.exists({ number }))) return number;
  }
};
router.use(protect);
router.get("/sequence", superAdminOnly, async (_req, res) => {
  const sequence = await AodSequence.findOne({ key: "aod" });
  const nextValue = (sequence?.value || 0) + 1;
  res.json({ currentValue: sequence?.value || 0, nextValue, nextNumber: sequenceNumber(sequence, nextValue) });
});
router.put("/sequence", superAdminOnly, async (req, res) => {
  const nextNumber = req.body.nextNumber?.trim();
  const parsedNumber = nextNumber && parseAodNumber(nextNumber);
  if (!parsedNumber)
    return res.status(400).json({ message: "Enter a full AOD number ending in a whole number greater than 0." });
  await AodSequence.findOneAndUpdate(
    { key: "aod" },
    { $set: { value: parsedNumber.value - 1, prefix: parsedNumber.prefix, padding: parsedNumber.padding } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  res.json({ currentValue: parsedNumber.value - 1, nextValue: parsedNumber.value, nextNumber: formatAodNumber(parsedNumber.value, parsedNumber.prefix, parsedNumber.padding) });
});
router.get("/", async (req, res) => {
  const query =
    req.user.role === "super_admin" || isHeadOfficeLocation(req.user.location)
      ? {}
      : { $or: [{ raisedBy: req.user._id }, { to: req.user.location }] };
  res.json(
    await Aod.find(query)
      .populate("raisedBy", "name email location")
      .sort({ createdAt: -1 }),
  );
});
router.get("/reports", reportsAccess("aodReports"), async (req, res) => {
  const { from, to, location, status, search } = req.query;
  const query = {};
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(`${from}T00:00:00.000Z`);
    if (to) query.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }
  if (location) query.from = location;
  if (status) query.status = status;
  if (search)
    query.$or = [
      { number: new RegExp(search, "i") },
      { customerName: new RegExp(search, "i") },
      { to: new RegExp(search, "i") },
    ];
  res.json(
    await Aod.find(query)
      .populate("raisedBy", "name email location")
      .sort({ createdAt: -1 }),
  );
});
router.post("/", requirePermission("aod"), async (req, res) => {
  const { customerName, from, to, items = [] } = req.body;
  if (!customerName?.trim() || !from?.trim() || !to?.trim() || !items.length)
    return res
      .status(400)
      .json({
        message: "Customer, From, To, and at least one item are required.",
      });
  if (items.length > 7)
    return res.status(400).json({ message: "An AOD can contain a maximum of 7 items." });
  const requestedNumber = req.body.number?.trim();
  if (requestedNumber && (await Aod.exists({ number: requestedNumber })))
    return res.status(409).json({ message: "This AOD number already exists." });
  const generatedNumber = requestedNumber || await allocateAodNumber();
  const aod = await Aod.create({
    ...req.body,
    number: generatedNumber,
    dispatchedBy: req.body.dispatchedBy?.trim() || req.user.name,
    raisedBy: req.user._id,
  });
  await notifyLocationUsers({
    location: aod.to,
    subject: "AOD destination request",
    message: `AOD ${aod.number} from ${aod.from} is waiting for your Accept or Cancel decision.`,
    aod: aod._id,
  });
  res.status(201).json(aod);
});
router.put("/:id", requirePermission("aod"), async (req, res) => {
  const { customerName, from, to, items = [] } = req.body;
  if (!customerName?.trim() || !from?.trim() || !to?.trim() || !items.length)
    return res
      .status(400)
      .json({
        message: "Customer, From, To, and at least one item are required.",
      });
  if (items.length > 7)
    return res.status(400).json({ message: "An AOD can contain a maximum of 7 items." });
  const aod = await Aod.findOne({ _id: req.params.id, raisedBy: req.user._id });
  if (!aod) return res.status(404).json({ message: "AOD not found." });
  const number = req.body.number?.trim() || aod.number;
  if (number !== aod.number && (await Aod.exists({ number })))
    return res.status(409).json({ message: "This AOD number already exists." });
  Object.assign(aod, {
    ...req.body,
    number,
    dispatchedBy: req.body.dispatchedBy?.trim() || req.user.name,
  });
  await aod.save();
  res.json(aod);
});
router.post("/:id/decision", requirePermission("aodRequests"), async (req, res) => {
  const { decision } = req.body;
  const aod = await Aod.findById(req.params.id);
  if (!aod) return res.status(404).json({ message: "AOD not found." });
  if (aod.to !== req.user.location || aod.status !== "awaiting_destination")
    return res
      .status(403)
      .json({
        message: "This AOD is not waiting for a decision from your location.",
      });
  if (!["accept", "cancel"].includes(decision))
    return res.status(400).json({ message: "Choose Accept or Cancel." });
  if (decision === "accept") {
    aod.status = "awaiting_transport";
    await aod.save();
    await notifyLocationUsers({
      location: aod.from,
      subject: "AOD transfer request",
      message: `AOD ${aod.number} was accepted by ${aod.to}. Please proceed to transfer.`,
      aod: aod._id,
    });
  } else {
    aod.status = "returning";
    await aod.save();
    await notifyLocationUsers({
      location: aod.from,
      subject: "AOD return requested",
      message: `AOD ${aod.number} was cancelled by ${aod.to}. Mark it returned when the items arrive.`,
      aod: aod._id,
    });
  }
  res.json(aod);
});
router.post("/:id/returned", requirePermission("aodReturns"), async (req, res) => {
  const aod = await Aod.findById(req.params.id);
  if (!aod) return res.status(404).json({ message: "AOD not found." });
  if (aod.from !== req.user.location || aod.status !== "returning")
    return res
      .status(403)
      .json({ message: "This AOD is not awaiting return at your location." });
  aod.status = "returned";
  await aod.save();
  await notifyLocationUsers({
    location: aod.to,
    subject: "AOD return completed",
    message: `Returned items for AOD ${aod.number} have been received by ${aod.from}.`,
    aod: aod._id,
  });
  res.json(aod);
});
export default router;
