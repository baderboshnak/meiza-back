// utils/email.js
const { Resend } = require("resend");

// Better: use env var in Render
const resend = new Resend(
  process.env.RESEND_API_KEY || "re_FCVimFQg_BFS6h7vHN4VpL2grPSDXANes"
);

// -------- BASE TEMPLATE (LTR / RTL) --------
function baseTemplate({ title, intro, content, footer, rtl = false }) {
  const dir = rtl ? "rtl" : "ltr";
  const align = rtl ? "right" : "left";
  const textAlignStyle = rtl
    ? "direction:rtl;text-align:right;"
    : "direction:ltr;text-align:left;";

  return `
  <div dir="${dir}" style="background-color:#f5f5f5;padding:24px 0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;${textAlignStyle}">
    <table width="100%" cellspacing="0" cellpadding="0" style="${textAlignStyle}">
      <tr>
        <td align="center">
          <table width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,0.06);${textAlignStyle}">
            <tr>
              <td style="background:linear-gradient(135deg,#1a1a1a,#B58B3B);padding:20px 24px;color:#fff;${textAlignStyle}">
                <h1 style="margin:0;font-size:22px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase; text-align:${align};">
                  MEIZA HERITAGE
                </h1>
                <p style="margin:4px 0 0;font-size:13px;opacity:0.9;text-align:${align};">${title}</p>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 24px 8px;${textAlignStyle}">
                <p style="margin:0 0 16px;font-size:15px;color:#111111;line-height:1.6;text-align:${align};">
                  ${intro}
                </p>
                ${content}
              </td>
            </tr>

            <tr>
              <td style="padding:16px 24px 20px;${textAlignStyle}">
                <p style="margin:0 0 8px;font-size:12px;color:#555555;line-height:1.5;text-align:${align};">
                  ${footer || "For any questions, reply to this email and we will be happy to help."}
                </p>
                <p style="margin:0;font-size:11px;color:#9b9b9b;text-align:${align};">
                  © ${new Date().getFullYear()} Meiza Heritage. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
  `;
}

// ---------- ORDER TEMPLATES ----------

function buildOrderAdminEmail(order) {
  const itemsRows = (order.items || [])
    .map(
      (it) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;">
          <div style="font-size:14px;font-weight:600;color:#111;">${it.name}</div>
          ${
            it.optionName
              ? `<div style="font-size:12px;color:#777;">${it.optionName}</div>`
              : ""
          }
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;font-size:13px;color:#555;" align="center">
          ${it.quantity}
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;font-size:13px;color:#555;" align="right">
          ₪${(it.price ?? 0).toLocaleString("he-IL")}
        </td>
      </tr>
    `
    )
    .join("");

  const subtotal = order.totals?.subtotal ?? 0;
  const shipping = order.totals?.shipping ?? 0;
  const grandTotal = order.totals?.grandTotal ?? 0;

  const content = `
    <div style="font-size:14px;color:#222;margin-bottom:18px;">
      <strong>Order ID:</strong> ${order._id}<br/>
      <strong>Customer:</strong> ${order.shipping?.fullName || "-"}<br/>
      <strong>Phone:</strong> ${order.shipping?.phone || "-"}<br/>
      <strong>City:</strong> ${order.shipping?.city || "-"}<br/>
      <strong>Street:</strong> ${order.shipping?.addressLine1 || "-"}
    </div>

    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:16px;">
      <thead>
        <tr>
          <th align="left" style="padding:8px 0;border-bottom:2px solid #111;font-size:13px;color:#111;">Item</th>
          <th align="center" style="padding:8px 0;border-bottom:2px solid #111;font-size:13px;color:#111;">Qty</th>
          <th align="right" style="padding:8px 0;border-bottom:2px solid #111;font-size:13px;color:#111;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <div style="font-size:14px;color:#111;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span>Subtotal:</span>
        <span>₪${subtotal.toLocaleString("he-IL")}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span>Shipping:</span>
        <span>₪${shipping.toLocaleString("he-IL")}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:8px;font-weight:700;">
        <span>Total:</span>
        <span>₪${grandTotal.toLocaleString("he-IL")}</span>
      </div>
      <div style="margin-top:4px;font-size:13px;color:#555;">
        Payment method: ${order.payment?.method || "-"}
      </div>
    </div>
  `;

  const html = baseTemplate({
    title: "New order received",
    intro: "A new order has been placed on the Meiza Heritage website.",
    content,
    footer: "Please prepare this order and contact the customer if needed.",
    rtl: false,
  });

  const text = `
New order created.

Order ID: ${order._id}
Customer: ${order.shipping?.fullName || "-"}
Phone: ${order.shipping?.phone || "-"}
City: ${order.shipping?.city || "-"}
Street: ${order.shipping?.addressLine1 || "-"}

Total: ${grandTotal}₪
Payment: ${order.payment?.method}
  `.trim();

  return {
    subject: `New Order #${order._id} - Meiza Heritage`,
    text,
    html,
  };
}

function buildOrderCustomerEmail(order) {
  const grandTotal = order.totals?.grandTotal ?? 0;

  const content = `
    <div style="font-size:14px;color:#111;line-height:1.7;direction:rtl;text-align:right;">
      <p style="margin:0 0 8px;">
        תודה רבה שקניתם ב-<strong>MEIZA HERITAGE</strong> 💛
      </p>

      <p style="margin:0 0 8px;">
        ההזמנה <span dir="ltr">#${order._id}</span> נקלטה בהצלחה.
      </p>

      <p style="margin:0 0 8px;">
        <strong>סכום כולל:</strong>
        ₪${grandTotal.toLocaleString("he-IL")}
      </p>

      <p style="margin:0 0 8px;">
        <strong>עיר:</strong>
        ${order.shipping?.city || "-"}
      </p>

      <p style="margin:0 0 8px;">
        <strong>רחוב:</strong>
        ${order.shipping?.addressLine1 || "-"}
      </p>

      <p style="margin:16px 0 0;font-size:13px;color:#555;">
        נעדכן אתכם בוואטסאפ / אימייל כאשר ההזמנה תצא לדרך.
      </p>
    </div>
  `;

  const html = baseTemplate({
    title: "אישור הזמנה",
    intro: `היי ${order.shipping?.fullName || ""}, ההזמנה שלך התקבלה!`,
    content,
    footer: "אם יש לכם שאלות, אפשר לענות למייל הזה ונחזור אליכם בהקדם.",
    rtl: true, // חשוב: מצב ימין-לשמאל
  });

  const text = `
תודה שקניתם ב-MEIZA HERITAGE!
הזמנה #${order._id} התקבלה בהצלחה.
סכום כולל: ${grandTotal}₪
עיר: ${order.shipping?.city || "-"}
רחוב: ${order.shipping?.addressLine1 || "-"}
  `.trim();

  return {
    subject: `הזמנה #${order._id} נקלטה - MEIZA HERITAGE`,
    text,
    html,
  };
}


// ---------- CONTACT TEMPLATE (ADMIN) ----------

function buildContactAdminEmail({ name, email, message }) {
  const safeMsg = (message || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const content = `
    <div style="font-size:14px;color:#111;margin-bottom:16px;">
      <strong>Name:</strong> ${name || "-"}<br/>
      <strong>Email:</strong> ${email || "-"}
    </div>

    <div style="font-size:14px;color:#222;">
      <strong>Message:</strong>
      <div style="margin-top:8px;padding:12px;border-radius:8px;background:#fafafa;border:1px solid #eee;white-space:pre-wrap;">
        ${safeMsg}
      </div>
    </div>
  `;

  const html = baseTemplate({
    title: "New contact form message",
    intro: "You received a new message from the Meiza Heritage website.",
    content,
    footer: "Reply directly to the customer's email address above.",
    rtl: false,
  });

  const text = `
New contact message from website:

Name: ${name}
Email: ${email}

Message:
${message}
  `.trim();

  return {
    subject: `New contact from ${name || "visitor"}`,
    text,
    html,
  };
}

// ---------- GENERIC SENDER ----------

async function sendEmail(to, subject, text, html) {
  const from =
    process.env.EMAIL_FROM || "Meiza Heritage <no-reply@meiza.online>";

  const payload = {
    from,
    to,
    subject,
    text,
    html:
      html ||
      `<pre style="font-family: sans-serif; white-space: pre-wrap;">${text}</pre>`,
  };

  try {
    const result = await resend.emails.send(payload);
    if (result.error) {
      console.error("[MAIL] Resend API error:", result.error);
      throw new Error(result.error.message || "Resend email failed");
    }
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

module.exports = {
  sendEmail,
  buildOrderAdminEmail,
  buildOrderCustomerEmail,
  buildContactAdminEmail,
};
