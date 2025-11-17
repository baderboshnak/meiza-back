const express = require("express");
const mongoose = require("mongoose");
const Product = require("../models/products");
const { cloudinary } = require("../middleware/cloudinary");

const router = express.Router();
const isObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// helpers
const numOrUndef = (v) => {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Derive Cloudinary public_id from secure_url (handles transformations + version) */
function publicIdFromUrl(url) {
  try {
    if (!url) return null;
    const i = url.indexOf("/upload/");
    if (i === -1) return null;
    const tail = url.slice(i + "/upload/".length).split("?")[0];
    const segs = tail.split("/").filter(Boolean);
    const vIdx = segs.findIndex((s) => /^v\d+$/.test(s));
    const afterVersion = vIdx >= 0 ? segs.slice(vIdx + 1) : segs;
    const transLike = (s) =>
      s.includes(",") ||
      /^(a_|ar_|b_|c_|dpr_|e_|fl_|g_|h_|q_|r_|t_|u_|w_|x_|y_|z_)/.test(s);
    let startIdx = 0;
    while (startIdx < afterVersion.length && transLike(afterVersion[startIdx])) startIdx++;
    const path = afterVersion.slice(startIdx).join("/");
    if (!path) return null;
    return path.replace(/\.[^/.]+$/, "");
  } catch {
    return null;
  }
}

function collectImgIdsFromProductDoc(p) {
  const ids = [];
  if (p?.imgId) ids.push(p.imgId);
  else {
    const pid = publicIdFromUrl(p?.img);
    if (pid) ids.push(pid);
  }
  for (const o of p?.options || []) {
    if (o?.imgId) ids.push(o.imgId);
    else {
      const pid = publicIdFromUrl(o?.img);
      if (pid) ids.push(pid);
    }
  }
  return ids.filter(Boolean);
}

function collectImgIdsFromPayload(body) {
  const ids = [];
  if (body?.imgId) ids.push(body.imgId);
  else {
    const pid = publicIdFromUrl(body?.img);
    if (pid) ids.push(pid);
  }
  for (const o of body?.options || []) {
    if (o?.imgId) ids.push(o.imgId);
    else {
      const pid = publicIdFromUrl(o?.img);
      if (pid) ids.push(pid);
    }
  }
  return ids.filter(Boolean);
}

function normalizeOptions(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((o) => {
    const sale = o?.sale || {};
    return {
      ...(o._id ? { _id: o._id } : {}),
      name: String(o.name || "").trim(),
      price: Number(o.price ?? 0),
      vipPrice: numOrUndef(o.vipPrice), // <-- keep vipPrice on update
      quantity: Number(o.quantity ?? 0),
      img: o.img || "",
      imgId: o.imgId || "",
      isDefault: !!o.isDefault,
      sale: {
        start: sale.start || "",
        end: sale.end || "",
        ...(sale.price === "" || sale.price == null
          ? {}
          : { price: Number(sale.price) }),
      },
    };
  });
}

/** Create product */
router.post("/addNewProduct", async (req, res) => {
  try {
    if (typeof req.body.options === "string") {
      req.body.options = JSON.parse(req.body.options);
    }
    const doc = await Product.create({
      name: String(req.body.name || "").trim(),
      desc: req.body.desc || "",
      img: req.body.img || "",
      imgId: req.body.imgId || "",
      ...(req.body.category ? { category: req.body.category } : {}),
      options: normalizeOptions(req.body.options),
    });
    const populated = await doc.populate("category");
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** List products */
router.get("/", async (_req, res) => {
  try {
    const rows = await Product.find().populate("category").lean();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Get single product */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ error: "Invalid id" });
    const row = await Product.findById(id).populate("category").lean();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Update product (cleans up removed option images) */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ error: "Invalid id" });

    if (req.body.category === "") delete req.body.category;
    if (typeof req.body.options === "string") {
      req.body.options = JSON.parse(req.body.options);
    }

    const existing = await Product.findById(id);
    if (!existing) return res.status(404).json({ error: "Not found" });

    // compute Cloudinary deletions
    const oldIds = new Set(collectImgIdsFromProductDoc(existing));
    const newIds = new Set(collectImgIdsFromPayload(req.body));
    const toDelete = [...oldIds].filter((pid) => !newIds.has(pid));
    if (toDelete.length) {
      await Promise.all(
        toDelete.map((pid) =>
          cloudinary.uploader
            .destroy(pid, { invalidate: true, resource_type: "image", type: "upload" })
            .catch((e) => console.error("Cloudinary destroy failed:", pid, e?.message))
        )
      );
    }

    const updated = await Product.findByIdAndUpdate(
      id,
      {
        name: String(req.body.name || "").trim(),
        desc: req.body.desc || "",
        img: req.body.img || "",
        imgId: req.body.imgId || "",
        ...(req.body.category ? { category: req.body.category } : {}),
        options: normalizeOptions(req.body.options),
      },
      { new: true, runValidators: true }
    ).populate("category");

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** Delete product + Cloudinary assets */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ error: "Invalid id" });

    const p = await Product.findById(id).lean();
    if (!p) return res.status(404).json({ error: "Not found" });

    const ids = [];
    if (p.imgId) ids.push(p.imgId);
    else {
      const pid = publicIdFromUrl(p.img);
      if (pid) ids.push(pid);
    }
    if (Array.isArray(p.options)) {
      for (const o of p.options) {
        if (o?.imgId) ids.push(o.imgId);
        else {
          const pid = publicIdFromUrl(o?.img);
          if (pid) ids.push(pid);
        }
      }
    }

    await Promise.all(
      ids.map((pid) =>
        cloudinary.uploader
          .destroy(pid, { invalidate: true, resource_type: "image", type: "upload" })
          .catch(() => null)
      )
    );

    await Product.deleteOne({ _id: id });
    res.json({ deleted: true, assetsAttempted: ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Delete one option image by option _id */
router.delete("/:id/option-image/:optId", async (req, res) => {
  try {
    const { id, optId } = req.params;
    if (!isObjectId(id) || !isObjectId(optId)) {
      return res.status(400).json({ error: "Invalid id" });
    }
    const p = await Product.findById(id);
    if (!p) return res.status(404).json({ error: "Not found" });

    const opt = (p.options || []).find((o) => String(o._id) === String(optId));
    if (!opt) return res.json({ deleted: false });

    const pid = opt.imgId || publicIdFromUrl(opt.img || "");
    if (pid) {
      await cloudinary.uploader
        .destroy(pid, { invalidate: true, resource_type: "image", type: "upload" })
        .catch(() => null);
    }

    await Product.updateOne(
      { _id: id, "options._id": optId },
      { $set: { "options.$.img": "", "options.$.imgId": "" } }
    );

    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
