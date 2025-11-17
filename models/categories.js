const mongoose = require("mongoose");

const CategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    img: { type: String, trim: true },
  },
  { timestamps: true }
);

CategorySchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model("categories", CategorySchema);
