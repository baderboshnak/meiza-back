const express = require("express");
const mongoose = require("mongoose");
const Cart = require("../models/cart");
const Order = require("../models/order");
const Product = require("../models/products");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();

// CHECKOUT: create order from cart and decrement stock atomically
router.post("/checkout", auth, async (req, res) => {
  const { shipping = {}, shippingPrice = 0, paymentMethod = "cod" } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const cart = await Cart.findOne({ user: req.user._id }).session(session);
    if (!cart || cart.items.length === 0) throw new Error("Cart is empty");

    // validate stock for all items
    for (const it of cart.items) {
      const prod = await Product.findById(it.product).session(session);
      if (!prod) throw new Error(`Product not found: ${it.product}`);
      const opt = prod.options.id(it.optionId);
      if (!opt) throw new Error(`Option not found: ${it.optionId}`);
      if ((opt.quantity || 0) < it.quantity)
        throw new Error(`Insufficient stock for ${it.name} / ${it.optionName}`);
    }

    // decrement stock
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
          shipping,
        },
      ],
      { session }
    );

    // clear cart
    cart.items = [];
    await cart.save({ session });

    await session.commitTransaction();
    session.endSession();

    // populated response: username + name only
    const populated = await Order.findById(created[0]._id)
      .populate("user", "username name")
      .lean();

    res.status(201).json(populated);
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ error: e.message });
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
