// models/users.js
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true }, // plaintext by choice
    roles: {
      type: [String],
      enum: ["admin", "customer", "vip"],
      default: ["customer"],
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("users", UserSchema);
