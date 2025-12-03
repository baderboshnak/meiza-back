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

    // snapshot fields (fast reads, no populate needed)
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

/* ======================================================
 * 🔥 MAIN SPEED BOOSTERS — ADD THESE INDEXES
 * ====================================================== */

// Fast lookup of cart by user (MOST IMPORTANT)
CartSchema.index({ user: 1 });

// Useful when updating items or deleting by itemId
CartSchema.index({ "items.product": 1 });
CartSchema.index({ "items.optionId": 1 });

/* ======================================================
 * Methods
 * ====================================================== */

// For Mongoose documents
CartSchema.methods.subtotal = function () {
  return this.items.reduce((s, it) => s + it.price * it.quantity, 0);
};

// For plain objects (.lean() results)
CartSchema.statics.leanSubtotal = function (cart) {
  if (!cart || !Array.isArray(cart.items)) return 0;
  return cart.items.reduce(
    (s, it) => s + Number(it.price || 0) * Number(it.quantity || 0),
    0
  );
};

module.exports = mongoose.model("carts", CartSchema);
