// routes/categories.js
const express = require("express");
const path = require("path");
const fs = require("fs-extra");
const mongoose = require("mongoose");
const multer = require("multer");

const Category = require("../models/categories");
const Product = require("../models/products");
const { IMAGES_ROOT } = require("../lib/imageFS");

const router = express.Router();
const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Multer: keep file in memory, we decide path after we know category _id
const upload = multer({ storage: multer.memoryStorage() });

/** helper: write the uploaded buffer to categories/<id>/main.<ext> and return relative path */
async function saveCategoryImageFromBuffer(id, file) {
  if (!file) return null;
  const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
  const dir = path.join(IMAGES_ROOT, "categories", String(id));
  await fs.ensureDir(dir);
  const rel = path.posix.join("categories", String(id), `main${ext}`);
  const abs = path.join(IMAGES_ROOT, rel);
  await fs.writeFile(abs, file.buffer);
  return rel; // stored relative to /assets
}

/* ========== CREATE ========== */
/* Supports:
   1) JSON {name}
   2) multipart/form-data with fields:
      - name (text)
      - image (file)  <-- IMPORTANT
*/
router.post("/addCategory", upload.single("image"), async (req, res) => {
  try {
    const name = (req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Name is required" });

    // create first without img
    const cat = await Category.create({ name });

    // if file provided, save and update img
    if (req.file) {
      const rel = await saveCategoryImageFromBuffer(cat._id, req.file);
      cat.img = rel ? `/assets/${rel}` : undefined;
      await cat.save();
    }

    res.status(201).json(cat);
  } catch (err) {
    console.error("POST /categories/addCategory failed:", err);
    res.status(400).json({ error: err.message });
  }
});

/* ========== LIST ========== */
router.get("/", async (_req, res) => {
  try {
    const cats = await Category.find().sort({ name: 1 }).lean();
    res.json(cats);
  } catch (err) {
    console.error("GET /categories failed:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ========== GET ONE ========== */
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const cat = await Category.findById(id).lean();
    if (!cat) return res.status(404).json({ error: "Not found" });
    res.json(cat);
  } catch (err) {
    console.error("GET /categories/:id failed:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ========== REPLACE (PUT) ========== */
/* JSON only: { name?, img? }.
   Note: if you want to change the image file, use POST /:id/image.
*/
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const patch = {};
    if (typeof req.body.name === "string") patch.name = req.body.name.trim();
    // allow setting img to a string path (advanced), but usually replaced by /:id/image
    if (typeof req.body.img === "string") patch.img = req.body.img.trim();

    const cat = await Category.findByIdAndUpdate(id, patch, {
      new: true,
      runValidators: true,
    });
    if (!cat) return res.status(404).json({ error: "Not found" });
    res.json(cat);
  } catch (err) {
    console.error("PUT /categories/:id failed:", err);
    res.status(400).json({ error: err.message });
  }
});

/* ========== REPLACE IMAGE ========== */
/* multipart/form-data: field name MUST be "image" */
router.post("/:id/image", upload.single("image"), async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json({ error: "Invalid id" });
  if (!req.file)
    return res.status(400).json({ error: "No file 'image' provided" });
  try {
    // ensure category exists
    const cat = await Category.findById(id);
    if (!cat) return res.status(404).json({ error: "Not found" });

    const rel = await saveCategoryImageFromBuffer(id, req.file);
    cat.img = rel ? `/assets/${rel}` : undefined;
    await cat.save();

    res.json({ ok: true, img: cat.img, id: cat._id });
  } catch (err) {
    console.error("POST /categories/:id/image failed:", err);
    res.status(400).json({ error: err.message });
  }
});

/* ========== DELETE (guard) ========== */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  if (!isObjectId(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const inUse = await Product.countDocuments({ category: id });
    if (inUse > 0) {
      return res.status(409).json({
        error: "Category in use by products",
        products_count: inUse,
      });
    }
    const del = await Category.findByIdAndDelete(id);
    if (!del) return res.status(404).json({ error: "Not found" });

    // cleanup images folder
    const dir = path.join(IMAGES_ROOT, "categories", String(id));
    try {
      await fs.remove(dir);
    } catch (e) {
      console.warn("Failed to remove category folder:", dir, e?.message);
    }

    res.json({ deleted: true, id });
  } catch (err) {
    console.error("DELETE /categories/:id failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
