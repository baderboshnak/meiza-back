// server.js
require("dotenv").config();

const path = require("path");
const fs = require("fs-extra");
const express = require("express");
const cors = require("cors");

const createConnection = require("./connection/index");

// register models
require("./models/categories");
require("./models/products");

// routers
const productsRoute = require("./routes/products");
const categoriesRoute = require("./routes/categories");
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");
const cartRouter = require("./routes/cart");
const ordersRouter = require("./routes/orders");
const contactRoutes = require("./routes/contact");
const cloudinaryRoutes =require("./routes/cloudinary.js");
const { sendWhatsApp } = require("./utils/twilioWhatsapp");


// auth middleware
const { auth } = require("./middleware/auth");

// image storage root
const { IMAGES_ROOT } = require("./lib/imageFS");

// ensure image folder exists
fs.ensureDirSync(IMAGES_ROOT);

// connect db
createConnection();

// app
const app = express();

// core middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") || "*",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// static (optional public folder)
app.use(express.static("public"));

app.use(
  "/assets",
  express.static(path.join(process.cwd(), "public", "assets"), {
    immutable: true,
    maxAge: "30d",
  })
);

// allow cross-origin for images (defensive)
app.use((req, res, next) => {
  if (req.path.startsWith("/assets/")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  next();
});

// serve /assets => parent of products folder, e.g. /assets/**
const assetsBase = path.resolve(IMAGES_ROOT, "..");
app.use(
  "/assets",
  express.static(assetsBase, {
    maxAge: process.env.NODE_ENV === "production" ? "30d" : 0,
    immutable: process.env.NODE_ENV === "production",
    setHeaders: (res) => {
      if (process.env.NODE_ENV !== "production") {
        res.setHeader("Cache-Control", "no-store");
      }
    },
  })
);

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`[SERVER] ${req.method} ${req.originalUrl} = ${ms}ms`);
  });
  next();
});
// public routes
app.use("/products", productsRoute);
app.use("/categories", categoriesRoute);
app.use("/auth", authRouter);
app.use("/contact", contactRoutes);
app.use("/cloudinary", cloudinaryRoutes);
// health BEFORE any auth so it stays public
app.get("/health", (_req, res) => res.json({ ok: true }));

// protected routes ONLY
app.use("/users", auth, usersRouter);
app.use("/cart", auth, cartRouter);
app.use("/orders", auth, ordersRouter);

app.get("/webhook", (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token && mode === "subscribe" && token === verifyToken) {
    console.log("Webhook verified successfully.");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  console.log("Webhook event:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200); // Always respond fast
});



function normalizePhone(phone) {
  // simple Israel example: "050-1234567" -> "972501234567"
  const digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  if (digits.startsWith("972")) return digits;
  return digits;
}
app.post("/order-confirmation", async (req, res) => {
  try {
    // const { message } = req.body;
    // if ( !message) {
    //   return res.status(400).json({ error: "phone and message are required" });
    // }

    // const normalized = normalizePhone
    //   ? normalizePhone(phone)       // "050..." → "+97250..."
    //   : phone;                      // otherwise send E.164 directly

    const msg = await sendWhatsApp("+972543596761", "message");

    res.json({ success: true, sid: msg.sid });
  } catch (err) {
    console.error("[TWILIO] send error:", err.message);
    res.status(500).json({ error: "Failed to send WhatsApp message" });
  }
});



// 404
app.use((req, res) => res.status(404).json({ error: "Not found" }));

// error handler
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).send("Something went wrong");
});

// start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
