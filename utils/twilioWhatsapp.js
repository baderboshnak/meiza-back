// utils/twilioWhatsapp.js
const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
  const rawFrom = process.env.TWILIO_WHATSAPP_FROM;
const from = rawFrom ? `whatsapp:${rawFrom}` : null;

if (!accountSid || !authToken || !from) {
  console.warn("[TWILIO] Missing env vars, WhatsApp sending disabled");
}

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

/**
 * Send WhatsApp message via Twilio
 * @param {string} toE164 - phone in E.164, e.g. "+972501234567"
 * @param {string} body  - message text
 */
async function sendWhatsApp(toE164, body) {
  if (!client) throw new Error("Twilio client not configured");

  const to = `whatsapp:${toE164}`;
    console.log("from:",from," to:",to)
  const msg = await client.messages.create({
    from,
    to,
    body,
  });

  console.log("[TWILIO] WhatsApp sent:", msg.sid);
  return msg;
}

module.exports = { sendWhatsApp };
