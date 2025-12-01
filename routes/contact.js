const express = require("express");
const router = express.Router();
const {
  sendEmail,
  buildContactAdminEmail,
} = require("../utils/email");
// 1) Correct import for Resend
const { Resend } = require("resend");

// 2) Use env var for security (set in Render dashboard)
const resend = new Resend('re_FCVimFQg_BFS6h7vHN4VpL2grPSDXANes');
router.post("/", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const mail = buildContactAdminEmail({ name, email, message });

    await sendEmail(
      process.env.ADMIN_EMAIL || "luxurytech30@gmail.com",
      mail.subject,
      mail.text,
      mail.html
    );

    res.json({ success: true, message: "Message sent successfully" });
  } catch (err) {
    console.error("[CONTACT] error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

module.exports = router;