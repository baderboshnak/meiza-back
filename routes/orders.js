// const express = require("express");
// const mongoose = require("mongoose");
// const Cart = require("../models/cart");
// const Order = require("../models/order");
// const Product = require("../models/products");
// const { auth, requireRole } = require("../middleware/auth");
// const { sendWhatsAppMessage } = require("../utils/whatsapp");
// const {
//   sendEmail,
//   buildOrderAdminEmail,
//   buildOrderCustomerEmail,
// } = require("../utils/email");
// const router = express.Router();

// router.post("/checkout", auth, async (req, res) => {
//   const { shipping = {}, shippingPrice = 0, paymentMethod = "cod" } = req.body;

//   console.log("=== /orders/checkout called ===");
//   console.log("User:", req.user && req.user._id);
//   console.log("Body.shipping:", shipping);
//   console.log("Body.shippingPrice:", shippingPrice);
//   console.log("Body.paymentMethod:", paymentMethod);

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const cart = await Cart.findOne({ user: req.user._id }).session(session);
//     console.log("Cart found:", !!cart, "items:", cart?.items?.length);
//     if (!cart || cart.items.length === 0) throw new Error("Cart is empty");

//     // 1) validate stock
//     for (const it of cart.items) {
//       const prod = await Product.findById(it.product).session(session);
//       if (!prod) throw new Error(`Product not found: ${it.product}`);
//       const opt = prod.options.id(it.optionId);
//       if (!opt) throw new Error(`Option not found: ${it.optionId}`);
//       if ((opt.quantity || 0) < it.quantity)
//         throw new Error(
//           `Insufficient stock for ${it.name} / ${it.optionName}`
//         );
//     }

//     // 2) decrement stock
//     for (const it of cart.items) {
//       const upd = await Product.updateOne(
//         { _id: it.product, "options._id": it.optionId },
//         { $inc: { "options.$.quantity": -it.quantity } },
//         { session }
//       );
//       if (upd.modifiedCount !== 1) throw new Error("Stock update failed");
//     }

//     const subtotal = cart.items.reduce(
//       (s, i) => s + i.price * i.quantity,
//       0
//     );
//     const grandTotal = subtotal + (shippingPrice || 0);

//     console.log("Calculated totals:", { subtotal, shippingPrice, grandTotal });

//     // 3) create order
//     const created = await Order.create(
//       [
//         {
//           user: req.user._id,
//           items: cart.items.map((i) => ({
//             product: i.product,
//             optionId: i.optionId,
//             name: i.name,
//             optionName: i.optionName,
//             img: i.img,
//             price: i.price,
//             quantity: i.quantity,
//           })),
//           totals: { subtotal, shipping: shippingPrice || 0, grandTotal },
//           payment: { method: paymentMethod },
//           shipping, // { fullName, phone, city, addressLine1, addressLine2, ... }
//         },
//       ],
//       { session }
//     );

//     const order = created[0];
//     console.log("Order created:", order._id);

//     // 4) clear cart
//     cart.items = [];
//     await cart.save({ session });
//     console.log("Cart cleared for user:", req.user._id);

//     // 5) commit transaction
//     await session.commitTransaction();
//     session.endSession();
//     console.log("Transaction committed for order:", order._id);

//     // 6) send WhatsApp messages
// //     try {
// //       console.log("ADMIN_PHONE env:", process.env.ADMIN_PHONE);
// //       console.log("Order shipping phone:", order.shipping?.phone);

// //       const adminMsg = `
// // 🛍️ *New Order Created*
// // Order ID: ${order._id}

// // Customer: ${order.shipping.fullName || "-"}
// // Phone: ${order.shipping.phone || "-"}
// // City: ${order.shipping.city || "-"}
// // Street: ${order.shipping.addressLine1 || "-"}

// // Total: ${order.totals.grandTotal}₪
// // Payment: ${order.payment.method}
// //       `.trim();

// //       if (process.env.ADMIN_PHONE) {
// //         console.log("[WA] Sending to admin...");
// //         await sendWhatsAppMessage(process.env.ADMIN_PHONE, adminMsg);
// //         console.log("[WA] Admin message sent");
// //       } else {
// //         console.warn("[WA] ADMIN_PHONE is not set in env");
// //       }

// //       if (order.shipping.phone) {
// //         const customerMsg = `💛 תודה שקניתם ב-MEIZA HERITAGE!
// // הזמנה #${order._id} התקבלה בהצלחה.
// // סכום כולל: ${order.totals.grandTotal}₪`;

// //         console.log("[WA] Sending to customer:", order.shipping.phone);
// //         await sendWhatsAppMessage(order.shipping.phone, customerMsg);
// //         console.log("[WA] Customer message sent");
// //       } else {
// //         console.warn("[WA] No shipping.phone on order, skipping customer WA");
// //       }
// //     } catch (waErr) {
// //       console.error(
// //         "[WA] WhatsApp send failed:",
// //         waErr?.response?.data || waErr.message || waErr
// //       );
// //     }

//   try {
//   console.log("EMAIL_FROM env:", process.env.EMAIL_FROM);
//   console.log("ADMIN_EMAIL env:", process.env.ADMIN_EMAIL);
//   console.log("Order shipping email:", order.shipping?.email);

//   // -------- Admin email --------
//   if (process.env.ADMIN_EMAIL) {
//     const adminMail = buildOrderAdminEmail(order);

//     console.log("[MAIL] Sending admin order email...");
//     await sendEmail(
//       process.env.ADMIN_EMAIL,
//       adminMail.subject,
//       adminMail.text,
//       adminMail.html
//     );
//     console.log("[MAIL] Admin email sent");
//   } else {
//     console.warn("[MAIL] ADMIN_EMAIL is not set in env");
//   }

//   // -------- Customer email --------
//   if (order.shipping.email) {
//     const custMail = buildOrderCustomerEmail(order);

//     console.log("[MAIL] Sending customer order email to:", order.shipping.email);
//     await sendEmail(
//       order.shipping.email,
//       custMail.subject,
//       custMail.text,
//       custMail.html
//     );
//     console.log("[MAIL] Customer email sent");
//   } else {
//     console.warn("[MAIL] No shipping.email on order, skipping customer email");
//   }
// } catch (mailErr) {
//   console.error("[MAIL] Email send failed:", mailErr.message || mailErr);
// }

//     // 7) populate user for frontend
//     const populated = await Order.findById(order._id)
//       .populate("user", "username name")
//       .lean();

//     console.log("Checkout completed OK for order:", order._id);
//     return res.status(201).json(populated);
//   } catch (e) {
//     await session.abortTransaction();
//     session.endSession();
//     console.error("Checkout error:", e);
//     return res.status(400).json({ error: e.message });
//   }
// });

// // My orders (populated user)
// router.get("/my", auth, async (req, res) => {
//   const orders = await Order.find({ user: req.user._id })
//     .sort({ createdAt: -1 })
//     .populate("user", "username name")
//     .lean();
//   res.json(orders);
// });

// // Get one order (owner or admin), populated
// router.get("/:id", auth, async (req, res) => {
//   const { id } = req.params;
//   if (!mongoose.Types.ObjectId.isValid(id))
//     return res.status(400).json({ error: "Invalid id" });

//   const ord = await Order.findById(id)
//     .populate("user", "username name")
//     .lean();
//   if (!ord) return res.status(404).json({ error: "Not found" });

//   const ownerId = ord.user && (ord.user._id || ord.user);
//   const isOwner = String(ownerId) === String(req.user._id);
//   const isAdmin = (req.user.roles || []).includes("admin");
//   if (!isOwner && !isAdmin) return res.status(403).json({ error: "Forbidden" });

//   res.json(ord);
// });

// // Admin: list all orders, populated
// router.get("/", auth, requireRole("admin"), async (_req, res) => {
//   const orders = await Order.find()
//     .sort({ createdAt: -1 })
//     .populate("user", "username")
//     .lean();
//   res.json(orders);
// });

// // Admin: update status, populated response
// router.patch("/:id/status", auth, requireRole("admin"), async (req, res) => {
//   const { id } = req.params;
//   const { status } = req.body;
//   if (!mongoose.Types.ObjectId.isValid(id))
//     return res.status(400).json({ error: "Invalid id" });
//   const ord = await Order.findByIdAndUpdate(
//     id,
//     { $set: { status } },
//     { new: true, runValidators: true }
//   )
//     .populate("user", "username")
//     .lean();
//   if (!ord) return res.status(404).json({ error: "Not found" });
//   res.json(ord);
// });

// module.exports = router;

const express = require("express");
const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const he = require("he"); // <-- decode HTML entities / entities
const iconv = require("iconv-lite"); // <-- new
const Cart = require("../models/cart");
const Order = require("../models/order");
const Product = require("../models/products");
const { auth, requireRole } = require("../middleware/auth");
const { optionalAuth } = require("../middleware/optionalAuth"); // 👈 added
const { sendWhatsAppMessage } = require("../utils/whatsapp");
const {
  sendEmail,
  buildOrderAdminEmail,
  buildOrderCustomerEmail,
} = require("../utils/email");

const router = express.Router();


// Function to create PDF
const createPDF = (order) => {
  return new Promise((resolve, reject) => {
    const uploadDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filePath = path.join(uploadDir, `order_${order._id}.pdf`);
    const doc = new PDFDocument();

    // prefer a Hebrew-capable font if present
    const fonts = [
      path.join(__dirname, "../assets/fonts/NotoSansHebrew-VariableFont_wdth,wght.ttf"),
      path.join(__dirname, "../assets/fonts/NotoSansHebrew-Regular.ttf"),
      path.join(__dirname, "../assets/fonts/DejaVuSans.ttf"),
    ];
    const fontPath = fonts.find((p) => fs.existsSync(p));
    if (fontPath) {
      console.log("[PDF] Using font:", fontPath);
      doc.registerFont("Main", fontPath);
      doc.font("Main");
    } else {
      console.warn("[PDF] No Hebrew font found in assets/fonts. Text may render incorrectly.");
      doc.font("Helvetica");
    }

    // helper to decode + normalize text
    const clean = (v) => {
      if (v === undefined || v === null) return "-";
      try {
        // strings are already UTF-8 in DB, just decode HTML entities and normalize
        let s = he.decode(String(v));
        return s.normalize("NFC");
      } catch (err) {
        return String(v);
      }
    };

    // create writable stream and listen to its events
    const stream = fs.createWriteStream(filePath);
    stream.on("finish", () => resolve(filePath));
    stream.on("error", (err) => reject(err));

    doc.pipe(stream);

    doc.fontSize(18).text("Order Details", { underline: true });
    doc.moveDown();

    doc.fontSize(12).text(`Order ID: ${clean(order._id)}`);

    // Shipping / customer details (cleaned)
    if (order.shipping) {
      doc.moveDown(0.2);
      doc.text(`Name: ${clean(order.shipping.fullName)}`);
      doc.text(`Phone: ${clean(order.shipping.phone)}`);
      doc.text(`Email: ${clean(order.shipping.email)}`);
      doc.text(`City: ${clean(order.shipping.city)}`);
       doc.text(`Address: ${clean(order.shipping.addressLine1)}`);
      doc.text(`notes: ${clean(order.shipping.addressLine2)}`);
    //   const addr = [order.shipping.addressLine1, order.shipping.addressLine2]
    //     .filter(Boolean)
    //     .map(clean)
    //     .join(" ");
    //   if (addr) doc.text(`Address: ${addr}`);
     }

    doc.moveDown();
    doc.text("Items:");
    doc.moveDown(0.2);

    // Items: decode names/options
    (order.items || []).forEach((item) => {
      const itemName = clean(item.name || (item.product && item.product.name) || "Unnamed");
      const opt = item.optionName ? ` (${clean(item.optionName)})` : "";
      const line = `${clean(item.quantity)} x ${itemName}${opt} - ${clean(item.price)}₪`;
      doc.text(line);
    });

    doc.moveDown();
    doc.text("Totals:");
    doc.text(`Subtotal: ${clean(order.totals?.subtotal)}`);
    doc.text(`Shipping: ${clean(order.totals?.shipping)}`);
    doc.text(`Grand Total: ${clean(order.totals?.grandTotal)}`);

    // Payment method
    doc.moveDown();
    doc.text("Payment Method:");
    const paymentMethod = order.payment?.method || "Unknown";
    const paymentText = paymentMethod === "cc" ? "Credit Card" : paymentMethod === "cod" ? "Cash on Delivery" : paymentMethod;
    doc.text(`${clean(paymentText)}`);

    doc.end();
  });
}

/**
 * CHECKOUT
 * - Logged-in user: uses cart with { user: req.user._id }
 * - Guest: uses cart with { guestId: req.headers['x-guest-id'] }
 */
router.post("/checkout", optionalAuth, async (req, res) => {
  const { shipping = {}, shippingPrice = 0, paymentMethod = "cod" } = req.body;

  const userId = req.user ? req.user._id : null;
  const guestId = req.headers["x-guest-id"] || null;

  console.log("=== /orders/checkout called ===");
  console.log("User:", userId || null);
  console.log("GuestId:", guestId || null);
  console.log("Body.shipping:", shipping);
  console.log("Body.shippingPrice:", shippingPrice);
  console.log("Body.paymentMethod:", paymentMethod);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Decide which cart to use
    let cartQuery = null;
    if (userId) cartQuery = { user: userId };
    else if (guestId) cartQuery = { guestId };
    else throw new Error("Missing user or guest id for checkout");

    const cart = await Cart.findOne(cartQuery).session(session);
    console.log("Cart found:", !!cart, "items:", cart?.items?.length);
    if (!cart || cart.items.length === 0) throw new Error("Cart is empty");

    // 1) Validate stock
    for (const it of cart.items) {
      const prod = await Product.findById(it.product).session(session);
      if (!prod) throw new Error(`Product not found: ${it.product}`);
      const opt = prod.options.id(it.optionId);
      if (!opt) throw new Error(`Option not found: ${it.optionId}`);
      if ((opt.quantity || 0) < it.quantity)
        throw new Error(`Insufficient stock for ${it.name} / ${it.optionName}`);
    }

    // 2) Decrement stock
    for (const it of cart.items) {
      const upd = await Product.updateOne(
        { _id: it.product, "options._id": it.optionId },
        { $inc: { "options.$.quantity": -it.quantity } },
        { session }
      );
      if (upd.modifiedCount !== 1) throw new Error("Stock update failed");
    }

    const subtotal = cart.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const grandTotal = subtotal + (shippingPrice || 0);

    console.log("Calculated totals:", { subtotal, shippingPrice, grandTotal });

    // 3) Create order
    const orderDoc = {
      items: cart.items.map((i) => ({
        product: i.product,
        optionId: i.optionId,
        name: i.name,
        optionName: i.optionName,
        img: i.img,
        price: i.price,
        quantity: i.quantity,
      })),
      totals: { subtotal, shipping: shippingPrice || 0, grandTotal },
      payment: { method: paymentMethod },
      shipping, // { fullName, phone, city, addressLine1, addressLine2, email, ... }
    };

    if (userId) {
      orderDoc.user = userId;
    }

    const created = await Order.create([orderDoc], { session });
    const order = created[0];
    console.log("Order created:", order._id);

    // 4) Clear cart
    cart.items = [];
    await cart.save({ session });
    console.log("Cart cleared for", userId ? `user: ${userId}` : `guest: ${guestId}`);

    // 5) Commit transaction
    await session.commitTransaction();
    session.endSession();
    console.log("Transaction committed for order:", order._id);

    // respond to client immediately with populated order
    const populated = await Order.findById(order._id)
      .populate("user", "username name")
      .lean();

    res.status(201).json(populated);
    console.log("Response sent to client for order:", order._id);

    // continue notification work in background (do NOT await)
    (async () => {
      try {
        const pdfFilePath = await createPDF(order);

        // emails
        try {
          console.log("Sending admin email...");
          if (process.env.ADMIN_EMAIL) {
            const adminMail = buildOrderAdminEmail(order);
            await sendEmail(
              process.env.ADMIN_EMAIL,
              adminMail.subject,
              adminMail.text,
              adminMail.html,
              pdfFilePath
            );
            console.log("[MAIL] Admin email sent");
          } else {
            console.warn("[MAIL] ADMIN_EMAIL is not set in env");
          }

          if (order.shipping.email) {
            console.log("Sending customer email...");
            const custMail = buildOrderCustomerEmail(order);
            await sendEmail(
              order.shipping.email,
              custMail.subject,
              custMail.text,
              custMail.html,
              pdfFilePath
            );
            console.log("[MAIL] Customer email sent");
          } else {
            console.warn("[MAIL] No shipping.email on order, skipping customer email");
          }
        } catch (mailErr) {
          console.error("[BACKGROUND][MAIL] Email send failed:", mailErr?.message || mailErr);
        }

        // any other background notifications (WhatsApp etc.) can be placed here
      } catch (bgErr) {
        console.error("[BACKGROUND] createPDF/notifications failed for order", order._id, bgErr);
      }
    })();

    return; // handler already responded
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    console.error("Checkout error:", e);
    return res.status(400).json({ error: e.message });
  }
});


// My orders (populated user)
router.get("/my", auth, async (req, res) => {
  const orders = await Order.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .populate("user", "username name")
    .lean();
  res.json(orders);
});

// Get one order (owner or admin), populated
router.get("/:id", auth, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ error: "Invalid id" });

  const ord = await Order.findById(id).populate("user", "username name").lean();
  if (!ord) return res.status(404).json({ error: "Not found" });

  const ownerId = ord.user && (ord.user._id || ord.user);
  const isOwner = String(ownerId) === String(req.user._id);
  const isAdmin = (req.user.roles || []).includes("admin");
  if (!isOwner && !isAdmin) return res.status(403).json({ error: "Forbidden" });

  res.json(ord);
});

// Admin: list all orders, populated
router.get("/", auth, requireRole("admin"), async (_req, res) => {
  const orders = await Order.find()
    .sort({ createdAt: -1 })
    .populate("user", "username")
    .lean();
  res.json(orders);
});

// Admin: update status, populated response
router.patch("/:id/status", auth, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ error: "Invalid id" });
  const ord = await Order.findByIdAndUpdate(
    id,
    { $set: { status } },
    { new: true, runValidators: true }
  )
    .populate("user", "username")
    .lean();
  if (!ord) return res.status(404).json({ error: "Not found" });
  res.json(ord);
});

module.exports = router;
