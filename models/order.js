const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "products",
      required: true,
    },
    optionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    optionName: { type: String, required: true },
    img: { type: String },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
      index: true,
    },
    items: { type: [OrderItemSchema], required: true },
    totals: {
      subtotal: { type: Number, required: true, min: 0 },
      shipping: { type: Number, required: true, min: 0, default: 0 },
      grandTotal: { type: Number, required: true, min: 0 },
    },
    status: {
      type: String,
      enum: ["pending", "paid", "shipped", "completed", "canceled"],
      default: "pending",
      index: true,
    },
    payment: {
      method: { type: String, enum: ["cod", "card", "paypal"], default: "cod" },
      transactionId: { type: String },
    },
    shipping: {
      fullName: String,
      phone: String,
      addressLine1: String,
      addressLine2: String,
      city: String,
      postalCode: String,
      country: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("orders", OrderSchema);
