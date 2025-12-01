const express = require("express");
const router = express.Router();

// 1) Correct import for Resend
const { Resend } = require("resend");

// 2) Use env var for security (set in Render dashboard)
const resend = new Resend('re_FCVimFQg_BFS6h7vHN4VpL2grPSDXANes');
router.post("/", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    // Basic validation (optional but recommended)
    if (!name || !email || !message) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // 3) IMPORTANT: await the send call
    const result = await resend.emails.send({
      from: "Meiza Heritage <onboarding@resend.dev>", // or your verified domain
      to: "luxurytech30@gmail.com",                   // your email
      subject: `New message from ${name}`,
      html: `
        <h2>New contact message</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
      `,
    });

    console.log("Resend response:", result);
    res.json({ success: true, message: "Email sent successfully" });
  } catch (err) {
    console.error("Resend error:", err?.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to send email" });
  }
});

module.exports = router;
