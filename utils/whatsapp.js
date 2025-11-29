// utils/whatsapp.js
const axios = require("axios");

function normalizePhone(phone) {
  // simple Israel example: "050-1234567" -> "972501234567"
  const digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  if (digits.startsWith("972")) return digits;
  return digits;
}

async function sendWhatsAppMessage(rawPhone, text) {
  const phone = normalizePhone(rawPhone);
  console.log("[WA] sendWhatsAppMessage called", { rawPhone, phone, text });

  const instanceId = process.env.GREENAPI_INSTANCE_ID;
  const token = process.env.GREENAPI_TOKEN;

  if (!instanceId || !token) {
    console.error("[WA] GREENAPI_INSTANCE_ID or GREENAPI_TOKEN missing");
    throw new Error("WhatsApp credentials not configured");
  }

  const url = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;

  try {
    const payload = {
      chatId: `${phone}@c.us`,
      message: text,
    };
    console.log("[WA] Request payload:", payload);

    const res = await axios.post(url, payload, { timeout: 10000 });
    console.log("[WA] Provider response:", res.status, res.data);
    return res.data;
  } catch (err) {
    console.error(
      "[WA] Provider error:",
      err.response?.status,
      err.response?.data || err.message
    );
    throw err;
  }
}

module.exports = { sendWhatsAppMessage };
