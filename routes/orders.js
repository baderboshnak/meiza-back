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
    // Define the folder and file path
    const uploadDir = path.join(__dirname, "../uploads");

    // Check if the uploads directory exists, and if not, create it
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, `order_${order._id}.pdf`);

    // Create a new PDF document
    const doc = new PDFDocument();
    
    // Pipe the PDF to a writable stream
    doc.pipe(fs.createWriteStream(filePath));

    // Add content to the PDF
    doc.fontSize(16).text("Order Details", { underline: true });
    doc.text(`Order ID: ${order._id}`);
    doc.text(`Shipping Address: ${order.shipping.addressLine1}, ${order.shipping.city}`);

    // Add order items
    doc.text("\nItems:\n");
    order.items.forEach((item) => {
      doc.text(`${item.quantity} x ${item.name} - ${item.price}`);
    });

    // Add totals
    doc.text("\nTotals:");
    doc.text(`Subtotal: ${order.totals.subtotal}`);
    doc.text(`Shipping: ${order.totals.shipping}`);
    doc.text(`Grand Total: ${order.totals.grandTotal}`);

    // Finalize the PDF and return the file path
    doc.end();

    doc.on("finish", () => resolve(filePath)); // Resolve with file path once PDF is finished
    doc.on("error", reject); // Reject if there's an error
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

    // 6) Create PDF
    const pdfFilePath = await createPDF(order);

    // 7) Send emails (Debugging email sending)
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

      console.log("Sending customer email...");
      if (order.shipping.email) {
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
      console.error("[MAIL] Email send failed:", mailErr.message || mailErr);
    }

    // 8) Populate user for frontend (if any)
    const populated = await Order.findById(order._id)
      .populate("user", "username name")
      .lean();

    console.log("Checkout completed OK for order:", order._id);
    return res.status(201).json(populated);
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
