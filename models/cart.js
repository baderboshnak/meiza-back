const mongoose = require("mongoose");

const CartItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "products",
      required: true,
    },
    optionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true }, // product name snapshot
    optionName: { type: String, required: true }, // option name snapshot
    img: { type: String },
    price: { type: Number, required: true, min: 0 }, // snapshot of unit price
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: true }
);

const CartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      unique: true,
      required: true,
    },
    items: { type: [CartItemSchema], default: [] },
  },
  { timestamps: true }
);

CartSchema.methods.subtotal = function () {
  return this.items.reduce((s, it) => s + it.price * it.quantity, 0);
};

module.exports = mongoose.model("carts", CartSchema);
