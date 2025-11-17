const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/users");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();
const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// all routes here: require auth + admin
router.use(auth, requireRole("admin"));

// Create user (admin)
router.post("/newUser", async (req, res) => {
  try {
    const user = await User.create(req.body);
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      roles: user.roles,
      isActive: user.isActive,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// List
router.get("/", async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get by id
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json({ error: "Invalid id" });
  const user = await User.findById(id).select("-password").lean();
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json(user);
});

// Update (PUT)
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json({ error: "Invalid id" });
  // if password provided, it must be re-hashed => use save path
  const body = req.body;
  if (body.password != null) {
    const u = await User.findById(id);
    if (!u) return res.status(404).json({ error: "Not found" });
    Object.assign(u, body);
    await u.save();
    const out = u.toObject();
    delete out.password;
    return res.json(out);
  }
  const updated = await User.findByIdAndUpdate(id, body, {
    new: true,
    runValidators: true,
  }).select("-password");
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

// Partial (PATCH)
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json({ error: "Invalid id" });
  const body = req.body;
  if (body.password != null) {
    const u = await User.findById(id);
    if (!u) return res.status(404).json({ error: "Not found" });
    Object.assign(u, body);
    await u.save();
    const out = u.toObject();
    delete out.password;
    return res.json(out);
  }
  const updated = await User.findByIdAndUpdate(
    id,
    { $set: body },
    { new: true, runValidators: true }
  ).select("-password");
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

// Delete
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json({ error: "Invalid id" });
  const del = await User.findByIdAndDelete(id);
  if (!del) return res.status(404).json({ error: "Not found" });
  res.json({ deleted: true, id });
});

module.exports = router;
