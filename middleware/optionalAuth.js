const jwt = require("jsonwebtoken");
const User = require("../models/users");

async function optionalAuth(req, _res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).lean();

    req.user = user || null;
    next();
  } catch {
    req.user = null;
    next();
  }
}

module.exports = { optionalAuth };
