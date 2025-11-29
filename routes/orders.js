const express = require("express");
const mongoose = require("mongoose");
const Cart = require("../models/cart");
const Order = require("../models/order");
const Product = require("../models/products");
const { auth, requireRole } = require("../middleware/auth");
const { sendWhatsAppMessage } = require("../utils/whatsapp");
const router = express.Router();

router.post("/checkout", auth, async (req, res) => {
  const { shipping = {}, shippingPrice = 0, paymentMethod = "cod" } = req.body;

  console.log("=== /orders/checkout called ===");
  console.log("User:", req.user && req.user._id);
  console.log("Body.shipping:", shipping);
  console.log("Body.shippingPrice:", shippingPrice);
  console.log("Body.paymentMethod:", paymentMethod);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const cart = await Cart.findOne({ user: req.user._id }).session(session);
    console.log("Cart found:", !!cart, "items:", cart?.items?.length);
    if (!cart || cart.items.length === 0) throw new Error("Cart is empty");

    // 1) validate stock
    for (const it of cart.items) {
      const prod = await Product.findById(it.product).session(session);
      if (!prod) throw new Error(`Product not found: ${it.product}`);
      const opt = prod.options.id(it.optionId);
      if (!opt) throw new Error(`Option not found: ${it.optionId}`);
      if ((opt.quantity || 0) < it.quantity)
        throw new Error(
          `Insufficient stock for ${it.name} / ${it.optionName}`
        );
    }

    // 2) decrement stock
    for (const it of cart.items) {
      const upd = await Product.updateOne(
        { _id: it.product, "options._id": it.optionId },
        { $inc: { "options.$.quantity": -it.quantity } },
        { session }
      );
      if (upd.modifiedCount !== 1) throw new Error("Stock update failed");
    }

    const subtotal = cart.items.reduce(
      (s, i) => s + i.price * i.quantity,
      0
    );
    const grandTotal = subtotal + (shippingPrice || 0);

    console.log("Calculated totals:", { subtotal, shippingPrice, grandTotal });

    // 3) create order
    const created = await Order.create(
      [
        {
          user: req.user._id,
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
          shipping, // { fullName, phone, city, addressLine1, addressLine2, ... }
        },
      ],
      { session }
    );

    const order = created[0];
    console.log("Order created:", order._id);

    // 4) clear cart
    cart.items = [];
    await cart.save({ session });
    console.log("Cart cleared for user:", req.user._id);

    // 5) commit transaction
    await session.commitTransaction();
    session.endSession();
    console.log("Transaction committed for order:", order._id);

    // 6) send WhatsApp messages
    try {
      console.log("ADMIN_PHONE env:", process.env.ADMIN_PHONE);
      console.log("Order shipping phone:", order.shipping?.phone);

      const adminMsg = `
🛍️ *New Order Created*
Order ID: ${order._id}

Customer: ${order.shipping.fullName || "-"}
Phone: ${order.shipping.phone || "-"}
City: ${order.shipping.city || "-"}
Street: ${order.shipping.addressLine1 || "-"}

Total: ${order.totals.grandTotal}₪
Payment: ${order.payment.method}
      `.trim();

      if (process.env.ADMIN_PHONE) {
        console.log("[WA] Sending to admin...");
        await sendWhatsAppMessage(process.env.ADMIN_PHONE, adminMsg);
        console.log("[WA] Admin message sent");
      } else {
        console.warn("[WA] ADMIN_PHONE is not set in env");
      }

      if (order.shipping.phone) {
        const customerMsg = `💛 תודה שקניתם ב-MEIZA HERITAGE!
הזמנה #${order._id} התקבלה בהצלחה.
סכום כולל: ${order.totals.grandTotal}₪`;

        console.log("[WA] Sending to customer:", order.shipping.phone);
        await sendWhatsAppMessage(order.shipping.phone, customerMsg);
        console.log("[WA] Customer message sent");
      } else {
        console.warn("[WA] No shipping.phone on order, skipping customer WA");
      }
    } catch (waErr) {
      console.error(
        "[WA] WhatsApp send failed:",
        waErr?.response?.data || waErr.message || waErr
      );
    }

    // 7) populate user for frontend
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

  const ord = await Order.findById(id)
    .populate("user", "username name")
    .lean();
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
