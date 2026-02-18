// routes/orders.js
const express = require("express");
const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const he = require("he");
const os = require("os");
const crypto = require("crypto");

const Cart = require("../models/cart");
const Order = require("../models/order");
const Product = require("../models/products");
const { auth, requireRole } = require("../middleware/auth");
const { optionalAuth } = require("../middleware/optionalAuth");
const { sendWhatsAppMessage } = require("../utils/whatsapp");
const {
  sendEmail,
  buildOrderAdminEmail,
  buildOrderCustomerEmail,
} = require("../utils/email");

const router = express.Router();

// ===== BiDi/RTL support (safe require) =====
let bidi = null;
try {
  const UnicodeBidirectional = require("unicode-bidirectional/dist/unicode.bidirectional");
  const { resolve, reorder, mirror } = UnicodeBidirectional;
  bidi = { resolve, reorder, mirror };
} catch (e) {
  console.warn(
    "[PDF] unicode-bidirectional not installed or import failed. RTL will be weaker.",
    e?.message || e
  );
}

const RTL_RE = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

const toCodepoints = (str) => Array.from(str, (ch) => ch.codePointAt(0));
const fromCodepoints = (cps) => cps.map((cp) => String.fromCodePoint(cp)).join("");

/**
 * Convert logical RTL text into visual order for PDFKit (LTR renderer).
 * Only applies when RTL chars exist AND bidi lib is available.
 */
function bidiVisual(str) {
  if (!str) return str;
  const s = String(str).normalize("NFC");
  if (!RTL_RE.test(s)) return s;
  if (!bidi) return s;

  const lines = s.split(/\r?\n/);
  return lines
    .map((line) => {
      if (!RTL_RE.test(line)) return line;

      const cps = toCodepoints(line);
      // paragraph direction LTR (0) to match PDFKit layout behavior
      const levels = bidi.resolve(cps, 0);
      const mirrored = bidi.mirror(cps, levels);
      const visual = bidi.reorder(mirrored, levels);
      return fromCodepoints(visual);
    })
    .join("\n");
}

const clean = (v) => {
  if (v === undefined || v === null) return "-";
  try {
    return he.decode(String(v)).normalize("NFC");
  } catch {
    return String(v);
  }
};

const fmt = (v) => {
  const s = clean(v);
  return RTL_RE.test(s) ? bidiVisual(s) : s;
};

// =============================
// Cloudinary -> JPG + downloader
// =============================
function cloudinaryToJpg(url, { w = 200, h = 200, q = "auto", crop = "fill" } = {}) {
  if (!url || typeof url !== "string") return null;
  if (!/^https?:\/\//i.test(url)) return null;
  if (!url.includes("res.cloudinary.com")) return url; // not cloudinary: keep url

  const parts = url.split("/upload/");
  if (parts.length !== 2) return url;

  // Force JPG + resize (PDFKit-friendly; avoids WebP issues)
  // Example:
  // .../upload/v123/...webp  -> .../upload/f_jpg,q_auto,w_200,h_200,c_fill/v123/...webp
  const transform = `f_jpg,q_${q},w_${w},h_${h},c_${crop}`;
  return `${parts[0]}/upload/${transform}/${parts[1]}`;
}

let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    fetchFn = require("node-fetch"); // only used if Node < 18
  } catch {
    // ignore
  }
}

async function downloadImageToTemp(url, timeoutMs = 8000) {
  if (!url || typeof url !== "string") return null;
  if (!/^https?:\/\//i.test(url)) return null;
  if (!fetchFn) throw new Error("fetch is not available. Use Node 18+ or install node-fetch.");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) return null;

    const ct = (res.headers?.get?.("content-type") || "").toLowerCase();
    if (!ct.startsWith("image/")) return null;

    // node-fetch vs native fetch compatibility
    const buf = Buffer.from(await (res.arrayBuffer ? res.arrayBuffer() : res.buffer()));

    const ext =
      ct.includes("png") ? "png" :
      ct.includes("jpeg") || ct.includes("jpg") ? "jpg" :
      "img";

    const name = `order-img-${crypto.randomBytes(8).toString("hex")}.${ext}`;
    const tmpPath = path.join(os.tmpdir(), name);
    await fs.promises.writeFile(tmpPath, buf);
    return tmpPath;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function safeUnlink(p) {
  if (!p) return;
  fs.promises.unlink(p).catch(() => {});
}

// ===== PDF creator =====
// Function to create PDF (Hebrew + Arabic fixed + Cloudinary Images)
const createPDF = (order) => {
  return new Promise(async (resolve, reject) => {
    let settled = false;
    const imgCache = new Map(); // url -> tmpPath

    const safeResolve = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const safeReject = (e) => {
      if (settled) return;
      settled = true;
      reject(e);
    };

    const cleanupTempImages = async () => {
      const paths = Array.from(imgCache.values());
      await Promise.all(paths.map((p) => fs.promises.unlink(p).catch(() => {})));
      imgCache.clear();
    };

    let doc = null;
    let stream = null;
    let filePath = null;

    try {
      const uploadDir = path.join(__dirname, "../uploads");
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

      filePath = path.join(uploadDir, `order_${order._id}.pdf`);
      stream = fs.createWriteStream(filePath);

      stream.on("finish", async () => {
        try {
          await cleanupTempImages();
        } catch {}
        safeResolve(filePath);
      });

      stream.on("error", async (err) => {
        try {
          await cleanupTempImages();
        } catch {}
        safeReject(err);
      });

      doc = new PDFDocument({ margin: 50, size: "A4" });
      doc.pipe(stream);
      doc.fillColor("black");

      // ---- load Arabic reshaper (safe) ----
      let ArabicShaper = null;
      try {
        const reshaper = require("arabic-persian-reshaper");
        ArabicShaper = reshaper.ArabicShaper;
      } catch (e) {
        console.warn("[PDF] arabic-persian-reshaper missing -> Arabic will be unshaped");
      }

      const cleanLocal = (v) => {
        if (v === undefined || v === null) return "-";
        try {
          return he.decode(String(v)).normalize("NFC");
        } catch {
          return String(v);
        }
      };

      const hasHebrew = (s) => /[\u0590-\u05FF]/.test(String(s || ""));
      const hasArabic = (s) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(
        String(s || "")
      );
      const hasRTL = (s) => hasHebrew(s) || hasArabic(s);

      const findFirstExisting = (arr) => arr.find((p) => fs.existsSync(p)) || null;

      // ✅ register BOTH fonts (no font fallback in PDFKit)
      const hebFontPath = findFirstExisting([
        path.join(__dirname, "../assets/fonts/Noto_Sans_Hebrew/static/NotoSansHebrew-Regular.ttf"),
        path.join(__dirname, "../assets/fonts/Noto_Sans_Hebrew/static/NotoSansHebrew-Medium.ttf"),
      ]);

      const arFontPath = findFirstExisting([
        path.join(__dirname, "../assets/fonts/Noto_Sans_Arabic/static/NotoSansArabic-Regular.ttf"),
        path.join(__dirname, "../assets/fonts/Noto_Sans_Arabic/static/NotoSansArabic-Medium.ttf"),
      ]);

      if (!hebFontPath) console.warn("[PDF] Missing Hebrew font (NotoSansHebrew-Regular.ttf)");
      if (!arFontPath) console.warn("[PDF] Missing Arabic font (NotoSansArabic-Regular.ttf)");

      if (hebFontPath) doc.registerFont("HebFont", hebFontPath);
      if (arFontPath) doc.registerFont("ArFont", arFontPath);

      let currentFont = null;
      const setFont = (name) => {
        if (!name) return;
        if (currentFont !== name) {
          doc.font(name);
          currentFont = name;
        }
      };

      // default font
      if (hebFontPath) setFont("HebFont");
      else doc.font("Helvetica");

      const MIRROR = {
        "(": ")",
        ")": "(",
        "[": "]",
        "]": "[",
        "{": "}",
        "}": "{",
        "<": ">",
        ">": "<",
      };

      const isLTRToken = (t) => /^[A-Za-z0-9][A-Za-z0-9\-_.\/]*$/.test(t);

      // ✅ IMPORTANT: group Arabic/Hebrew runs (don’t split into single letters)
      const tokenize = (s) =>
        String(s).match(
          /(\s+|[A-Za-z0-9][A-Za-z0-9\-_.\/]*|[\u0590-\u05FF]+|[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+|.)/g
        ) || [];

      const classify = (raw) => {
        if (/^\s+$/.test(raw)) return { kind: "space", raw };
        if (isLTRToken(raw)) return { kind: "ltr", raw };
        if (hasArabic(raw)) return { kind: "arabic", raw };
        if (hasHebrew(raw)) return { kind: "hebrew", raw };
        return { kind: "punct", raw };
      };

      const prepToken = (tok) => {
        if (tok.kind === "arabic") {
          const shaped = ArabicShaper ? ArabicShaper.convertArabic(tok.raw) : tok.raw;
          return { ...tok, text: shaped, font: arFontPath ? "ArFont" : hebFontPath ? "HebFont" : null };
        }
        return { ...tok, text: tok.raw, font: hebFontPath ? "HebFont" : null };
      };

      const tokenWidth = (pt) => {
        const prev = currentFont;
        if (pt.font) setFont(pt.font);
        const w = doc.widthOfString(pt.text);
        if (prev) setFont(prev);
        return w;
      };

      const wrapTokens = (prepTokens, width) => {
        const lines = [];
        let line = [];
        let w = 0;

        for (const pt of prepTokens) {
          const tw = tokenWidth(pt);

          if (tw > width && pt.text.length > 1) {
            if (line.length) {
              lines.push(line);
              line = [];
              w = 0;
            }
            for (const ch of Array.from(pt.text)) {
              const one = { ...pt, text: ch };
              const cw = tokenWidth(one);
              if (w + cw > width && line.length) {
                lines.push(line);
                line = [];
                w = 0;
              }
              line.push(one);
              w += cw;
            }
            continue;
          }

          if (w + tw > width && line.length) {
            lines.push(line);
            line = [];
            w = 0;
            if (pt.kind === "space") continue;
          }

          line.push(pt);
          w += tw;
        }

        if (line.length) lines.push(line);
        return lines;
      };

      // Draw RTL text inside a box (x,y,width)
      const drawRTLBox = (text, x, y, width) => {
        const raw = String(text || "");
        const paragraphs = raw.split(/\r?\n/);
        const lineH = doc.currentLineHeight(true);
        let yy = y;

        const trimLine = (lineTokens) => {
          let start = 0;
          let end = lineTokens.length - 1;
          while (start <= end && lineTokens[start].kind === "space") start++;
          while (end >= start && lineTokens[end].kind === "space") end--;
          return { start, end };
        };

        for (const p of paragraphs) {
          const pts = tokenize(p).map(classify).map(prepToken);
          const lines = wrapTokens(pts, width);

          for (const lineTokens of lines) {
            const { start, end } = trimLine(lineTokens);
            if (start > end) {
              yy += lineH;
              continue;
            }

            let usedW = 0;
            for (let i = start; i <= end; i++) usedW += tokenWidth(lineTokens[i]);
            if (usedW > width) usedW = width;

            let cursorX = x + usedW;

            for (let i = start; i <= end; i++) {
              const pt = lineTokens[i];

              if (pt.kind === "space") {
                cursorX -= tokenWidth(pt);
                continue;
              }

              if (pt.font) setFont(pt.font);

              if (pt.kind === "ltr") {
                const tw = tokenWidth(pt);
                cursorX -= tw;
                doc.text(pt.text, cursorX, yy, { lineBreak: false });
              } else {
                for (const ch of Array.from(pt.text)) {
                  const drawCh = MIRROR[ch] || ch;
                  const one = { ...pt, text: drawCh };
                  const cw = tokenWidth(one);
                  cursorX -= cw;
                  doc.text(drawCh, cursorX, yy, { lineBreak: false });
                }
              }
            }

            yy += lineH;
          }
        }

        return yy - y;
      };

      const leftX = doc.page.margins.left;
      const maxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      const drawLabelValue = (label, value) => {
        const y = doc.y;
        const labelText = `${label}:`;
        const v = cleanLocal(value);

        if (hebFontPath) setFont("HebFont");
        doc.text(labelText, leftX, y, { lineBreak: false });

        const gap = 6;
        const labelW = doc.widthOfString(labelText);
        const boxX = leftX + labelW + gap;
        const boxW = maxWidth - labelW - gap;

        if (hasRTL(v)) {
          const h = drawRTLBox(v, boxX, y, boxW);
          doc.y = y + h;
          doc.moveDown(0.5);
        } else {
          doc.text(v, boxX, y, { width: boxW });
          doc.moveDown(0.5);
        }
      };

      // Title
      doc.fontSize(18).text("Order Details", leftX, doc.y, { width: maxWidth, underline: true });
      doc.moveDown(0.8);

      doc.fontSize(11).text(`Order ID: ${cleanLocal(order._id)}`, leftX, doc.y, { width: maxWidth });
      doc.moveDown(0.6);

      // Customer info
      doc.fontSize(11);
      if (order.shipping) {
        drawLabelValue("Name", order.shipping.fullName);
        drawLabelValue("Phone", order.shipping.phone);
        drawLabelValue("Email", order.shipping.email);
        drawLabelValue("City", order.shipping.city);
        drawLabelValue("Address", order.shipping.addressLine1);
        if (order.shipping.addressLine2) drawLabelValue("Notes", order.shipping.addressLine2);
      }

      doc.moveDown(0.6);
      doc.fontSize(13).text("Items:", leftX, doc.y, { width: maxWidth, underline: true });
      doc.moveDown(0.4);

      // ===== TABLE COLUMNS (WITH IMAGE) =====
      const colImgW = 60;
      const colItemW = Math.floor(maxWidth * 0.46);
      const colQtyW = Math.floor(maxWidth * 0.12);
      const colPriceW = Math.floor(maxWidth * 0.16);
      const colTotalW = maxWidth - (colImgW + colItemW + colQtyW + colPriceW);

      const drawHeader = () => {
        const y = doc.y;
        doc.fontSize(10);
        if (hebFontPath) setFont("HebFont");

        doc.text("Image", leftX, y, { width: colImgW });
        doc.text("Item", leftX + colImgW, y, { width: colItemW });
        doc.text("Qty", leftX + colImgW + colItemW, y, { width: colQtyW, align: "center" });
        doc.text("Price", leftX + colImgW + colItemW + colQtyW, y, {
          width: colPriceW,
          align: "right",
        });
        doc.text("Total", leftX + colImgW + colItemW + colQtyW + colPriceW, y, {
          width: colTotalW,
          align: "right",
        });

        doc.moveDown(0.3);
        doc.moveTo(leftX, doc.y).lineTo(leftX + maxWidth, doc.y).stroke();
        doc.moveDown(0.2);
      };

      const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 20;
      const ensureSpace = (needed) => {
        if (doc.y + needed > bottomLimit()) {
          doc.addPage();
          if (hebFontPath) setFont("HebFont");
          drawHeader();
          doc.moveDown(0.2);
        }
      };

      drawHeader();
      doc.fontSize(10);

      // ===== ITEMS LOOP (async-friendly) =====
      for (const item of order.items || []) {
        let nameRaw = cleanLocal(item.name || (item.product && item.product.name) || "Unknown");
        let optRaw = item.optionName ? cleanLocal(item.optionName) : "";
        if (optRaw && nameRaw.includes(optRaw)) optRaw = "";

        const fullRaw = optRaw ? `${nameRaw} (${optRaw})` : nameRaw;

        const qty = String(item.quantity || 0);
        const price = String(item.price || 0);
        const total = String((item.quantity || 0) * (item.price || 0));

        // --- compute height first ---
        let itemHeight;
        if (hasRTL(fullRaw)) {
          const pts = tokenize(fullRaw).map(classify).map(prepToken);
          const lines = wrapTokens(pts, colItemW);
          itemHeight = lines.length * doc.currentLineHeight(true);
        } else {
          if (hebFontPath) setFont("HebFont");
          itemHeight = doc.heightOfString(fullRaw, { width: colItemW });
        }

        const imgBoxSize = 44;
        const rowHeight = Math.max(itemHeight, imgBoxSize, doc.currentLineHeight(true)) + 6;

        // ✅ IMPORTANT FIX: ensure space BEFORE freezing rowY
        ensureSpace(rowHeight);

        // ✅ rowY must be taken AFTER ensureSpace (because addPage changes doc.y)
        const rowY = doc.y;

        // ---- IMAGE (Cloudinary URL -> forced JPG) ----
        const rawImgUrl = item.img || null;
        const imgUrl = cloudinaryToJpg(rawImgUrl, { w: 220, h: 220, crop: "fill" });

        let tmpImg = null;
        try {
          if (imgUrl) {
            tmpImg = imgCache.get(imgUrl);
            if (!tmpImg || !fs.existsSync(tmpImg)) {
              tmpImg = await downloadImageToTemp(imgUrl);
              if (tmpImg) imgCache.set(imgUrl, tmpImg);
            }
          }

          const imgX = leftX + 6;
          const imgY = rowY + 2;

          if (tmpImg && fs.existsSync(tmpImg)) {
            doc.image(tmpImg, imgX, imgY, { fit: [imgBoxSize, imgBoxSize] });
          } else {
            doc.rect(imgX, imgY, imgBoxSize, imgBoxSize).strokeOpacity(0.2).stroke().strokeOpacity(1);
          }
        } catch {
          // ignore image failures, continue rendering row
        }

        // ---- TEXT (shift right by image column) ----
        const itemX = leftX + colImgW;

        if (hasRTL(fullRaw)) drawRTLBox(fullRaw, itemX, rowY, colItemW);
        else doc.text(fullRaw, itemX, rowY, { width: colItemW, lineBreak: false });

        if (hebFontPath) setFont("HebFont");
        doc.text(qty, itemX + colItemW, rowY, { width: colQtyW, align: "center", lineBreak: false });
        doc.text(`${price}₪`, itemX + colItemW + colQtyW, rowY, {
          width: colPriceW,
          align: "right",
          lineBreak: false,
        });
        doc.text(`${total}₪`, itemX + colItemW + colQtyW + colPriceW, rowY, {
          width: colTotalW,
          align: "right",
          lineBreak: false,
        });

        // advance cursor
        doc.y = rowY + rowHeight;
      }

      doc.moveTo(leftX, doc.y).lineTo(leftX + maxWidth, doc.y).stroke();
      doc.moveDown(1.0);

      // Summary
      doc.fontSize(12).text("Summary:", leftX, doc.y, { width: maxWidth, underline: true });
      doc.moveDown(0.6);
      doc.fontSize(11).text(`Subtotal: ${cleanLocal(order.totals?.subtotal)}₪`, leftX, doc.y, { width: maxWidth });
      doc.moveDown(0.4);
      doc.text(`Shipping: ${cleanLocal(order.totals?.shipping)}₪`, leftX, doc.y, { width: maxWidth });
      doc.moveDown(0.4);
      doc.fontSize(12).text(`Grand Total: ${cleanLocal(order.totals?.grandTotal)}₪`, leftX, doc.y, {
        width: maxWidth,
        underline: true,
      });
      doc.moveDown(0.8);

      const pm = order.payment?.method || "Unknown";
      const pmText = pm === "cc" ? "Credit Card" : pm === "cod" ? "Cash on Delivery" : pm;
      doc.fontSize(11).text(`Payment method: ${pmText}`, leftX, doc.y, { width: maxWidth });

      doc.end();
    } catch (err) {
      console.error("[PDF] Error creating PDF:", err);
      try {
        await cleanupTempImages();
      } catch {}
      try {
        if (doc) doc.end();
      } catch {}
      safeReject(err);
    }
  });
};


/**
 * CHECKOUT
 * - Logged-in user: uses cart with { user: req.user._id }
 * - Guest: uses cart with { guestId: req.headers['x-guest-id'] }
 */
router.post("/checkout", optionalAuth, async (req, res) => {
  const { shipping = {}, shippingPrice = 0, paymentMethod = "cod" } = req.body;

  const userId = req.user ? req.user._id : null;
  const guestId = req.headers["x-guest-id"] || null;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let cartQuery = null;
    if (userId) cartQuery = { user: userId };
    else if (guestId) cartQuery = { guestId };
    else throw new Error("Missing user or guest id for checkout");

    const cart = await Cart.findOne(cartQuery).session(session);
    if (!cart || cart.items.length === 0) throw new Error("Cart is empty");

    // 1) Validate stock
    for (const it of cart.items) {
      const prod = await Product.findById(it.product).session(session);
      if (!prod) throw new Error(`Product not found: ${it.product}`);
      const opt = prod.options.id(it.optionId);
      if (!opt) throw new Error(`Option not found: ${it.optionId}`);
      if ((opt.quantity || 0) < it.quantity)
        throw new Error(`Insufficient stock for ${it.name} / ${it.optionName}`);
    }

    // 2) Decrement stock
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

    // 3) Create order
    const orderDoc = {
      items: cart.items.map((i) => ({
        product: i.product,
        optionId: i.optionId,
        name: i.name,
        optionName: i.optionName,
        img: i.img, // ✅ your Cloudinary URL
        price: i.price,
        quantity: i.quantity,
      })),
      totals: { subtotal, shipping: shippingPrice || 0, grandTotal },
      payment: { method: paymentMethod },
      shipping,
    };

    if (userId) orderDoc.user = userId;

    const created = await Order.create([orderDoc], { session });
    const order = created[0];

    // 4) Clear cart
    cart.items = [];
    await cart.save({ session });

    // 5) Commit
    await session.commitTransaction();
    session.endSession();

    // respond immediately
    const populated = await Order.findById(order._id)
      .populate("user", "username name")
      .lean();

    res.status(201).json(populated);

    // background notifications
    (async () => {
      try {
        const pdfFilePath = await createPDF(order);

        try {
          if (process.env.ADMIN_EMAIL) {
            const adminMail = buildOrderAdminEmail(order);
            await sendEmail(
              process.env.ADMIN_EMAIL,
              adminMail.subject,
              adminMail.text,
              adminMail.html,
              pdfFilePath
            );
          }

          if (order.shipping?.email) {
            const custMail = buildOrderCustomerEmail(order);
            await sendEmail(
              order.shipping.email,
              custMail.subject,
              custMail.text,
              custMail.html,
              pdfFilePath
            );
          }
        } catch (mailErr) {
          console.error("[BACKGROUND][MAIL] Email send failed:", mailErr?.message || mailErr);
        }

        // WhatsApp etc. here if needed
        // await sendWhatsAppMessage(...)
      } catch (bgErr) {
        console.error("[BACKGROUND] createPDF/notifications failed:", bgErr?.message || bgErr);
      }
    })();

    return;
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    return res.status(400).json({ error: e.message });
  }
});

// My orders
router.get("/my", auth, async (req, res) => {
  const orders = await Order.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .populate("user", "username name")
    .lean();
  res.json(orders);
});

// Get one order (owner or admin)
router.get("/:id", auth, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ error: "Invalid id" });

  const ord = await Order.findById(id).populate("user", "username name").lean();
  if (!ord) return res.status(404).json({ error: "Not found" });

  const ownerId = ord.user && (ord.user._id || ord.user);
  const isOwner = String(ownerId) === String(req.user._id);
  const isAdmin = (req.user.roles || []).includes("admin");
  if (!isOwner && !isAdmin) return res.status(403).json({ error: "Forbidden" });

  res.json(ord);
});

// Admin: list all orders
router.get("/", auth, requireRole("admin"), async (_req, res) => {
  const orders = await Order.find()
    .sort({ createdAt: -1 })
    .populate("user", "username")
    .lean();
  res.json(orders);
});

// Admin: update status
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
