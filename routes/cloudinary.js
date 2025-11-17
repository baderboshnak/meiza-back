// backend/routes/cloudinary.js
const express = require("express");
const { cloudinary } = require("../middleware/cloudinary");

const router = express.Router();

router.post("/sign", (req, res) => {
  const { folder } = req.body || {};
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = { timestamp, ...(folder ? { folder } : {}) };

  const signature = cloudinary.utils.api_sign_request(
    toSign,
    process.env.CLOUDINARY_API_SECRET
  );

  res.json({
    timestamp,
    signature,
    apiKey: process.env.CLOUDINARY_API_KEY,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  });
});

// NEW: delete a Cloudinary asset by public_id (for unsaved option images)
router.post("/destroy", async (req, res) => {
  try {
    const { publicId } = req.body || {};
    if (!publicId) return res.status(400).json({ error: "publicId required" });
    await cloudinary.uploader.destroy(publicId, {
      invalidate: true,
      resource_type: "image",
      type: "upload",
    });
    res.json({ deleted: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
