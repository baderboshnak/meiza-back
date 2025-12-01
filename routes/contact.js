const express = require("express");
const nodemailer = require("nodemailer");
const router = express.Router();
const { Resend } = require("resend");
const resend = new Resend('re_FCVimFQg_BFS6h7vHN4VpL2grPSDXANes');

router.post("/", async (req, res) => {
  try {
    const { name, email, message } = req.body;
resend.emails.send({
  from: 'onboarding@resend.dev',
  to: 'luxurytech30@gmail.com',
  subject: 'Hello World',
  html: '<p>Congrats on sending your <strong>first email</strong>!</p>'
});
    // if (!name || !email || !message)
    //   return res.status(400).json({ error: "All fields are required" });

    // // Gmail SMTP configuration
    // const transporter = nodemailer.createTransport({
    //   service: "gmail",
    //   auth: {
    //     user: process.env.SMTP_USER, // your Gmail
    //     pass: process.env.SMTP_PASS, // Gmail App Password
    //   },
    // });

    // // Email content
    // const mailOptions = {
    //   from: `"Meiza Heritage Contact" <${process.env.SMTP_USER}>`,
    //   to: "helalali358@gmail.com", // your destination inbox
    //   subject: `📩 New message from ${name}`,
    //   text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
    // };

    // // Send email
    // await transporter.sendMail(mailOptions);
    res.json({ success: true, message: "Email sent successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send email" });
  }
});

module.exports = router;
