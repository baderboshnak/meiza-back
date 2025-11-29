// utils/email.js
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,          // your Gmail address
    pass: process.env.GMAIL_APP_PASSWORD, // App Password, not your real password
  },
});

/**
 * Send an email via Gmail
 * @param {string|string[]} to
 * @param {string} subject
 * @param {string} text
 * @param {string} [html]
 */
async function sendEmail(to, subject, text, html) {
  const mailOptions = {
    from: `"Meiza Heritage" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
  };

  const info = await transporter.sendMail(mailOptions);
  console.log("Email sent:", info.messageId);
  return info;
}

module.exports = { sendEmail };
