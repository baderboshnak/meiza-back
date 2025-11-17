const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  img: String,
   imgId: String,
  desc: { type: String, default: "" },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "categories",
  },
  options: {
    type: [
      {
        name: String,
        price: Number,
        vipPrice: Number,
        isDefault: Boolean,
        quantity: Number,
        img: String,
         imgId: String,
        sale: {
          start: String,
          end: String,
          price: Number,
        },
      },
    ],
    default: [],
  },
});

module.exports = mongoose.model("products", productSchema);
