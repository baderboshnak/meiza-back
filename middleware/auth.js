// middleware/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/users");

const SECRET = process.env.JWT_SECRET;

const auth = async (req, res, next) => {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const decoded = jwt.verify(token, SECRET);
    const id = decoded?.sub; // token created with { sub }
    if (!id) return res.status(401).json({ error: "Invalid token" });

    req.user = await User.findById(id).lean();
    if (!req.user || req.user.isActive === false)
      return res.status(401).json({ error: "Invalid user" });

    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

const requireRole =
  (...allowed) =>
  (req, res, next) => {
    const roles = req.user?.roles || [];
    const ok = roles.some((r) => allowed.includes(r));
    if (!ok) return res.status(403).json({ error: "Forbidden" });
    next();
  };

module.exports = { auth, requireRole };
