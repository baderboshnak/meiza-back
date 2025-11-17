const mongoose = require("mongoose");
require("dotenv").config();

async function createConnection() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB Atlas");
  } catch (ex) {
    console.error("❌ Connection failed:", ex);
    process.exit(1);
  }
}

module.exports = createConnection;
