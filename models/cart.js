// const mongoose = require("mongoose");

// const CartItemSchema = new mongoose.Schema(
//   {
//     product: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "products",
//       required: true,
//     },
//     optionId: { type: mongoose.Schema.Types.ObjectId, required: true },
//     name: { type: String, required: true }, // product name snapshot
//     optionName: { type: String, required: true }, // option name snapshot
//     img: { type: String },
//     price: { type: Number, required: true, min: 0 }, // snapshot of unit price
//     quantity: { type: Number, required: true, min: 1 },
//   },
//   { _id: true }
// );

// const CartSchema = new mongoose.Schema(
//   {
//     user: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "users",
//       unique: true,
//       required: true,
//     },
//     items: { type: [CartItemSchema], default: [] },
//   },
//   { timestamps: true }
// );

// CartSchema.methods.subtotal = function () {
//   return this.items.reduce((s, it) => s + it.price * it.quantity, 0);
// };

// module.exports = mongoose.model("carts", CartSchema);

const mongoose = require("mongoose");

const CartItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "products",
      required: true,
    },
    optionId: { type: mongoose.Schema.Types.ObjectId, required: true },

    // snapshot fields
    name: { type: String, required: true },
    optionName: { type: String, required: true },
    img: { type: String },

    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: true }
);

const CartSchema = new mongoose.Schema(
  {
    // logged-in user cart
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: false,
    },

    // guest cart identifier (from x-guest-id)
    guestId: { type: String, required: false },

    items: { type: [CartItemSchema], default: [] },
  },
  { timestamps: true }
);

// indexes
CartSchema.index({ user: 1 });
CartSchema.index({ guestId: 1 });

CartSchema.methods.subtotal = function () {
  return this.items.reduce((s, it) => s + it.price * it.quantity, 0);
};

CartSchema.statics.leanSubtotal = function (cart) {
  if (!cart || !Array.isArray(cart.items)) return 0;
  return cart.items.reduce(
    (s, it) => s + Number(it.price || 0) * Number(it.quantity || 0),
    0
  );
};

module.exports = mongoose.model("carts", CartSchema);
