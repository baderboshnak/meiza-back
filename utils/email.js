// utils/email.js
const { Resend } = require("resend");

const resend = new Resend('re_FCVimFQg_BFS6h7vHN4VpL2grPSDXANes');

/**
 * Simple email helper using Resend.
 * @param {string|string[]} to - Recipient email(s)
 * @param {string} subject - Subject line
 * @param {string} text - Plain text body
 * @param {string} [html] - Optional HTML body (if not given, generated from text)
 */
async function sendEmail(to, subject, text, html) {
  

  const from =
    process.env.EMAIL_FROM || "Meiza Heritage <onboarding@resend.dev>";

  const payload = {
    from,
    to,
    subject,
    text,
    html: html || `<pre style="font-family: sans-serif; white-space: pre-wrap;">${text}</pre>`,
  };

  try {
    const result = await resend.emails.send(payload);
    console.log("[MAIL] Resend response:", result);
    return result;
  } catch (err) {
    console.error(
      "[MAIL] Resend error:",
      err?.response?.data || err.message || err
    );
    throw err;
  }
}

module.exports = { sendEmail };
