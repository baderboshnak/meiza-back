// routes/auth.js
const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/users");
const { auth } = require("../middleware/auth");

const router = express.Router();

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error("JWT_SECRET missing");

const sign = (user) =>
  jwt.sign({ sub: String(user._id), roles: user.roles || [] }, SECRET, {
    expiresIn: "7d",
  });

// POST /auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, username, password } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "name required" });
    if (!username?.trim())
      return res.status(400).json({ error: "username required" });
    if (!password?.trim())
      return res.status(400).json({ error: "password required" });

    const user = await User.create({
      name: name.trim(),
      username: username.trim(),
      password, // plaintext per your choice
      // roles omitted -> default ["customer"]
    });

    const token = sign(user);
    res.status(201).json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        roles: user.roles,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.username)
      return res.status(409).json({ error: "username already exists" });
    console.error("Register error:", err);
    res.status(400).json({ error: err.message });
  }
});

// POST /auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: username?.trim() });
    if (!user || user.password !== password)
      return res.status(401).json({ error: "Invalid credentials" });

    const token = sign(user);
    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        roles: user.roles,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(400).json({ error: err.message });
  }
});

// GET /auth/me  (protected)
router.get("/me", auth, async (req, res) => {
  const u = req.user;
  res.json({
    user: {
      _id: u._id,
      name: u.name,
      username: u.username,
      roles: u.roles,
      isActive: u.isActive,
    },
  });
});

router.put("/me", auth, async (req, res) => {
  try {
    const allowed = ["name", "username", "password"];
    const updates = {};
    for (const k of allowed) if (req.body[k] != null) updates[k] = req.body[k];

    const u = await User.findById(req.user._id);
    if (!u) return res.status(404).json({ error: "Not found" });

    Object.assign(u, updates);
    await u.save();

    const out = u.toObject();
    delete out.password;
    res.json({ user: out });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
