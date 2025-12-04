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

    // your token uses "sub" as the user id
    const userId = decoded.id || decoded.sub || decoded._id;

    if (!userId) {
      req.user = null;
      return next();
    }

    const user = await User.findById(userId).lean();
    req.user = user || null;
    return next();
  } catch (err) {
    console.error("optionalAuth error:", err.message);
    req.user = null;
    return next();
  }
}

module.exports = { optionalAuth };
