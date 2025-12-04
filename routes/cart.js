// // routes/cart.js
// const express = require("express");
// const mongoose = require("mongoose");
// const Cart = require("../models/cart");
// const Product = require("../models/products");
// const { auth } = require("../middleware/auth");

// const router = express.Router();
// const isId = (id) => mongoose.Types.ObjectId.isValid(id);

// // helper: ensure cart
// async function getOrCreateCart(userId) {
//   let cart = await Cart.findOne({ user: userId });
//   if (!cart) cart = await Cart.create({ user: userId, items: [] });
//   return cart;
// }

// // GET my cart
// router.get("/", auth, async (req, res, next) => {
//   try {
//     const cart = await getOrCreateCart(req.user._id);
//     return res.json({ cart, subtotal: cart.subtotal() });
//   } catch (e) {
//     next(e);
//   }
// });
// router.post("/items", auth, async (req, res, next) => {
//   try {
//     const {
//       productId,
//       optionId: optionIdRaw,
//       optionn,
//       quantity = 1,
//     } = req.body;

//     // normalize ids and qty
//     const optionId = optionn?._id ?? optionIdRaw;
//     const qty = Number(quantity);

//     if (!isId(productId))
//       return res.status(400).json({ error: "Invalid productId", productId });
//     if (!isId(optionId))
//       return res.status(400).json({ error: "Invalid optionId", optionId });
//     if (!Number.isFinite(qty) || qty <= 0)
//       return res.status(400).json({ error: "Quantity must be >= 1", qty });

//     // fetch product + option
//     const product = await Product.findById(productId).lean();
//     if (!product) return res.status(404).json({ error: "Product not found" });

//     const option = (product.options || []).find(
//       (o) => String(o._id) === String(optionId)
//     );
//     if (!option) return res.status(404).json({ error: "Option not found" });

//     // price selection: VIP > SALE > BASE
//     const isVip = (req.user?.roles || []).includes("vip");
//     const basePrice = Number(option.price);
//     const vipPrice = Number(option.vipPrice);
//     // try to read sale price from common shapes; ignore if NaN
//     const salePrice = [option.salePrice, option.sale?.price, option.sale?.value]
//       .map(Number)
//       .find((v) => Number.isFinite(v));

//     let unitPrice = basePrice;
//     let priceSource = "base";

//     if (isVip && Number.isFinite(vipPrice)) {
//       unitPrice = vipPrice;
//       priceSource = "vip";
//     } else if (isSaleActive?.(option) && Number.isFinite(salePrice)) {
//       unitPrice = salePrice;
//       priceSource = "sale";
//     }

//     if (!Number.isFinite(unitPrice) || unitPrice < 0)
//       return res.status(400).json({ error: "Invalid price on option", option });

//     // stock check for initial add
//     const stock = Number(option.quantity) || 0;
//     if (stock < qty)
//       return res
//         .status(400)
//         .json({ error: "Not enough stock", stock, requested: qty });

//     // get cart and merge
//     const cart = await getOrCreateCart(req.user._id);

//     const existing = cart.items.find(
//       (it) =>
//         String(it.product) === String(productId) &&
//         String(it.optionId) === String(optionId)
//     );

//     if (existing) {
//       const newQty = existing.quantity + qty;
//       if (stock < newQty)
//         return res
//           .status(400)
//           .json({ error: "Not enough stock", stock, requested: newQty });

//       // always re-sync price to current priority logic
//       existing.price = unitPrice;
//       existing.priceSource = priceSource;
//       existing.quantity = newQty;
//     } else {
//       cart.items.push({
//         product: product._id,
//         optionId,
//         name: product.name,
//         optionName: option.name,
//         img: option.img || product.img || "",
//         quantity: qty,
//         price: unitPrice,
//         priceSource,
//       });
//     }

//     await cart.save();
//     return res.status(201).json({ cart, subtotal: cart.subtotal() });
//   } catch (e) {
//     next(e);
//   }
// });

// function isSaleActive(opt) {
//   if (!opt?.sale?.price) return false;
//   const now = new Date();
//   if (opt.sale.start && new Date(opt.sale.start) > now) return false;
//   if (opt.sale.end && new Date(opt.sale.end) < now) return false;
//   return true;
// }

// function effectiveOptionPrice(user, option) {
//   const saleActive = isSaleActive(option);
//   const base = saleActive ? option.sale.price : option.price;
//   if ((user?.roles || []).includes("vip") && Number.isFinite(option.vipPrice))
//     return option.vipPrice;
//   if (Number.isFinite(base)) return base;
//   return NaN; // triggers "Option price is required"
// }

// // UPDATE qty
// router.patch("/items/:itemId", auth, async (req, res, next) => {
//   try {
//     const { itemId } = req.params;
//     const { quantity } = req.body;
//     if (!isId(itemId)) return res.status(400).json({ error: "Invalid itemId" });
//     if (quantity <= 0)
//       return res.status(400).json({ error: "Quantity must be >= 1" });

//     const cart = await getOrCreateCart(req.user._id);
//     const item = cart.items.id(itemId);
//     if (!item) return res.status(404).json({ error: "Item not found" });

//     // stock check
//     const product = await Product.findById(item.product).lean();
//     const option = (product?.options || []).find(
//       (o) => o._id?.toString() === item.optionId.toString()
//     );
//     if (!option || (option.quantity || 0) < quantity)
//       return res.status(400).json({ error: "Not enough stock" });

//     item.quantity = quantity;
//     await cart.save();
//     return res.json({ cart, subtotal: cart.subtotal() });
//   } catch (e) {
//     next(e);
//   }
// });

// // DELETE item  ✅ use $pull and try/catch
// router.delete("/items/:itemId", auth, async (req, res, next) => {
//   try {
//     const { itemId } = req.params;
//     if (!isId(itemId)) return res.status(400).json({ error: "Invalid itemId" });

//     const cart = await getOrCreateCart(req.user._id);

//     // remove via $pull to avoid subdoc remove() pitfalls
//     await Cart.updateOne(
//       { _id: cart._id },
//       { $pull: { items: { _id: new mongoose.Types.ObjectId(itemId) } } }
//     );

//     const fresh = await Cart.findById(cart._id);
//     return res.json({ cart: fresh, subtotal: fresh.subtotal() });
//   } catch (e) {
//     next(e);
//   }
// });

// // CLEAR
// // CLEAR
// router.delete("/", auth, async (req, res, next) => {
//   try {
//     const cart = await getOrCreateCart(req.user._id);
//     cart.items = [];
//     await cart.save();
//     return res.json({ cart, subtotal: cart.subtotal() }); // 👈 להחזיר cart + subtotal
//   } catch (e) {
//     next(e);
//   }
// });


// module.exports = router;



// routes/cart.js
// routes/cart.js
const express = require("express");
const mongoose = require("mongoose");
const Cart = require("../models/cart");
const Product = require("../models/products");
const { optionalAuth } = require("../middleware/optionalAuth");

const router = express.Router();
const isId = (id) => mongoose.Types.ObjectId.isValid(id);

/* ---------- Helpers ---------- */

function calcSubtotal(cart) {
  if (!cart || !Array.isArray(cart.items)) return 0;
  return cart.items.reduce(
    (sum, it) => sum + Number(it.price || 0) * Number(it.quantity || 0),
    0
  );
}

function isSaleActive(opt) {
  if (!opt?.sale?.price) return false;
  const now = new Date();
  if (opt.sale.start && new Date(opt.sale.start) > now) return false;
  if (opt.sale.end && new Date(opt.sale.end) < now) return false;
  return true;
}

function getGuestId(req) {
  return req.headers["x-guest-id"] || null;
}

// choose cart by user or guest
async function getOrCreateCart(user, guestId) {
  if (user) {
    let cart = await Cart.findOne({ user: user._id });
    if (!cart) cart = await Cart.create({ user: user._id, items: [] });
    return cart;
  }

  if (!guestId) throw new Error("Missing guest id");
  let cart = await Cart.findOne({ guestId });
  if (!cart) cart = await Cart.create({ guestId, items: [] });
  return cart;
}

/* ============================
 * GET cart (user or guest)
 * ============================
 */
router.get("/", optionalAuth, async (req, res, next) => {
  try {
    const user = req.user || null;
    const guestId = getGuestId(req);

    let cartDoc = null;
    if (user) {
      cartDoc = await Cart.findOne({ user: user._id }).lean();
    } else if (guestId) {
      cartDoc = await Cart.findOne({ guestId }).lean();
    }

    const safeCart = cartDoc || { items: [] };
    const subtotal = calcSubtotal(safeCart);
    return res.json({ cart: safeCart, subtotal });
  } catch (e) {
    next(e);
  }
});

/* ============================
 * ADD item to cart
 * ============================
 */
router.post("/items", optionalAuth, async (req, res, next) => {
  const t0 = Date.now();
  try {
    const user = req.user || null;
    const guestId = getGuestId(req) || null;
    console.log("DEBUG /cart/items", {
    authHeader: req.headers.authorization,
    userId: req.user ? req.user._id : null,
    guestId: req.headers["x-guest-id"],
  });
    const {
      productId,
      optionId: optionIdRaw,
      optionn,
      quantity = 1,
    } = req.body;

    const optionId = optionn?._id ?? optionIdRaw;
    const qty = Number(quantity);

    if (!isId(productId))
      return res.status(400).json({ error: "Invalid productId", productId });
    if (!isId(optionId))
      return res.status(400).json({ error: "Invalid optionId", optionId });
    if (!Number.isFinite(qty) || qty <= 0)
      return res.status(400).json({ error: "Quantity must be >= 1", qty });

    const [product, cartFound] = await Promise.all([
      Product.findById(productId)
        .select(
          "name img options._id options.name options.img options.price options.vipPrice options.quantity options.sale"
        )
        .lean(),
      user
        ? Cart.findOne({ user: user._id })
        : guestId
        ? Cart.findOne({ guestId })
        : null,
    ]);
    const t1 = Date.now();

    if (!product) return res.status(404).json({ error: "Product not found" });

    let cart = cartFound;
    if (!cart) {
      if (!user && !guestId)
        return res.status(400).json({ error: "Missing guest id" });

      cart = user
        ? new Cart({ user: user._id, items: [] })
        : new Cart({ guestId, items: [] });
    }

    const option = (product.options || []).find(
      (o) => String(o._id) === String(optionId)
    );
    if (!option) return res.status(404).json({ error: "Option not found" });

    const isVip = (user?.roles || []).includes("vip");
    const basePrice = Number(option.price);
    const vipPrice = Number(option.vipPrice);
    const salePrice = [option.salePrice, option.sale?.price, option.sale?.value]
      .map(Number)
      .find((v) => Number.isFinite(v));

    let unitPrice = basePrice;
    if (isVip && Number.isFinite(vipPrice)) {
      unitPrice = vipPrice;
    } else if (isSaleActive(option) && Number.isFinite(salePrice)) {
      unitPrice = salePrice;
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0)
      return res.status(400).json({ error: "Invalid price on option", option });

    const stock = Number(option.quantity) || 0;
    if (stock < qty)
      return res
        .status(400)
        .json({ error: "Not enough stock", stock, requested: qty });

    const existing = cart.items.find(
      (it) =>
        String(it.product) === String(productId) &&
        String(it.optionId) === String(optionId)
    );

    if (existing) {
      const newQty = existing.quantity + qty;
      if (stock < newQty)
        return res
          .status(400)
          .json({ error: "Not enough stock", stock, requested: newQty });

      existing.price = unitPrice;
      existing.quantity = newQty;
    } else {
      cart.items.push({
        product: product._id,
        optionId,
        name: product.name,
        optionName: option.name,
        img: option.img || product.img || "",
        quantity: qty,
        price: unitPrice,
      });
    }

    const t2 = Date.now();
    await cart.save();
    const t3 = Date.now();

    const subtotal = calcSubtotal(cart);

    console.log("[/cart/items DETAIL]", {
      total: t3 - t0,
      queryProductAndCart: t1 - t0,
      inMemoryMerge: t2 - t1,
      saveCart: t3 - t2,
    });

    return res.status(201).json({ cart, subtotal });
  } catch (e) {
    next(e);
  }
});

/* ============================
 * UPDATE qty
 * ============================
 */
router.patch("/items/:itemId", optionalAuth, async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;
    const qty = Number(quantity);

    if (!isId(itemId)) return res.status(400).json({ error: "Invalid itemId" });
    if (!Number.isFinite(qty) || qty <= 0)
      return res.status(400).json({ error: "Quantity must be >= 1" });

    const user = req.user || null;
    const guestId = getGuestId(req) || null;

    const cart = await getOrCreateCart(user, guestId);
    const item = cart.items.id(itemId);
    if (!item) return res.status(404).json({ error: "Item not found" });

    const product = await Product.findById(item.product).lean();
    const option = (product?.options || []).find(
      (o) => o._id?.toString() === item.optionId.toString()
    );
    if (!option || (Number(option.quantity) || 0) < qty)
      return res.status(400).json({ error: "Not enough stock" });

    item.quantity = qty;
    await cart.save();

    const subtotal = calcSubtotal(cart);
    return res.json({ cart, subtotal });
  } catch (e) {
    next(e);
  }
});

/* ============================
 * DELETE item
 * ============================
 */
router.delete("/items/:itemId", optionalAuth, async (req, res, next) => {
  try {
    const { itemId } = req.params;
    if (!isId(itemId)) return res.status(400).json({ error: "Invalid itemId" });

    const user = req.user || null;
    const guestId = getGuestId(req) || null;

    let cart = null;
    if (user) cart = await Cart.findOne({ user: user._id });
    else if (guestId) cart = await Cart.findOne({ guestId });

    if (!cart) {
      return res.json({ cart: { items: [] }, subtotal: 0 });
    }

    await Cart.updateOne(
      { _id: cart._id },
      { $pull: { items: { _id: new mongoose.Types.ObjectId(itemId) } } }
    );

    const fresh = await Cart.findById(cart._id).lean();
    const safeCart = fresh || { items: [] };
    const subtotal = calcSubtotal(safeCart);

    return res.json({ cart: safeCart, subtotal });
  } catch (e) {
    next(e);
  }
});

/* ============================
 * CLEAR cart
 * ============================
 */
router.delete("/", optionalAuth, async (req, res, next) => {
  try {
    const user = req.user || null;
    const guestId = getGuestId(req) || null;

    const cart = await getOrCreateCart(user, guestId);
    cart.items = [];
    await cart.save();

    return res.json({ cart, subtotal: 0 });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
