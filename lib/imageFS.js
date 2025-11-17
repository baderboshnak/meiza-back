// lib/imageFS.js
const path = require("path");
const fs = require("fs-extra");
const multer = require("multer");

const IMAGES_ROOT =
  process.env.PRODUCT_IMAGES_DIR ||
  path.join(process.cwd(), "public", "assets", "products");

fs.ensureDirSync(IMAGES_ROOT);

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp"].includes(
      file.mimetype
    );
    cb(ok ? null : new Error("Unsupported image type"), ok);
  },
});

async function deleteByPublicUrl(publicUrl) {
  const abs = publicToAbs(publicUrl);
  if (!abs) return false;
  if (await fs.pathExists(abs)) {
    await fs.remove(abs);
    return true;
  }
  return false;
}
const safeSeg = (s) =>
  String(s)
    .trim()
    .replace(/[\/\\?%*:|"<>]/g, "-")
    .slice(0, 160);

function productDir(productName) {
  return path.join(IMAGES_ROOT, safeSeg(productName));
}

function toPublic(absPath) {
  const relFromRoot = path.relative(IMAGES_ROOT, absPath).replace(/\\/g, "/");
  return `/assets/products/${relFromRoot}`;
}

// inverse of toPublic
function publicToAbs(publicUrl) {
  // expect like: /assets/products/<product>/<file>
  const prefix = "/assets/products/";
  if (!publicUrl || !publicUrl.startsWith(prefix)) return null;
  const rel = publicUrl.slice(prefix.length);
  return path.join(IMAGES_ROOT, rel);
}

async function saveMain(productName, file) {
  if (!file) return null;
  const dir = productDir(productName);
  await fs.ensureDir(dir);
  const ext =
    file.mimetype === "image/png"
      ? ".png"
      : file.mimetype === "image/webp"
      ? ".webp"
      : ".jpg";
  const abs = path.join(dir, `main${ext}`);
  await fs.writeFile(abs, file.buffer);
  return toPublic(abs);
}

async function saveOption(productName, optionName, file) {
  if (!file) return null;
  const dir = productDir(productName);
  await fs.ensureDir(dir);
  const ext =
    file.mimetype === "image/png"
      ? ".png"
      : file.mimetype === "image/webp"
      ? ".webp"
      : ".jpg";
  const base = `${safeSeg(optionName)}${ext}`;
  const abs = path.join(dir, base);
  await fs.writeFile(abs, file.buffer);
  return toPublic(abs);
}

async function deleteProductFolder(productName) {
  const dir = productDir(productName);
  if (await fs.pathExists(dir)) {
    await fs.remove(dir);
    return true;
  }
  return false;
}

async function deleteOption(productName, optionName) {
  const dir = productDir(productName);
  const base = safeSeg(optionName).toLowerCase();
  if (!(await fs.pathExists(dir))) return false;

  const files = await fs.readdir(dir);
  for (const f of files) {
    const stem = f.replace(/\.[^.]+$/, "").toLowerCase();
    if (stem === base) {
      await fs.remove(path.join(dir, f));
      return true;
    }
  }
  return false;
}

// Robust rename that prefers the exact current URL if provided
async function renameOption(productName, oldName, newName, currentImgUrl) {
  const dir = productDir(productName);
  await fs.ensureDir(dir);

  // 1) If we have the current URL, move that exact file
  if (currentImgUrl) {
    const fromAbs = publicToAbs(currentImgUrl);
    if (fromAbs && (await fs.pathExists(fromAbs))) {
      const ext = path.extname(fromAbs); // keep exact ext and casing
      const toAbs = path.join(dir, `${safeSeg(newName)}${ext}`);
      await fs.move(fromAbs, toAbs, { overwrite: true });
      return toPublic(toAbs);
    }
  }

  // 2) Fallback: scan directory by oldName (case-insensitive, any ext)
  const oldBase = safeSeg(oldName).toLowerCase();
  const files = await fs.readdir(dir);
  for (const f of files) {
    const stem = f.replace(/\.[^.]+$/, "").toLowerCase();
    if (stem === oldBase) {
      const ext = path.extname(f);
      const toAbs = path.join(dir, `${safeSeg(newName)}${ext}`);
      await fs.move(path.join(dir, f), toAbs, { overwrite: true });
      return toPublic(toAbs);
    }
  }

  return null;
}

// lib/imageFS.js  (add below existing code)
const CATEGORIES_ROOT =
  process.env.CATEGORY_IMAGES_DIR ||
  path.join(process.cwd(), "public", "assets", "categories");
fs.ensureDirSync(CATEGORIES_ROOT);

function categoryDir(categoryName) {
  return path.join(CATEGORIES_ROOT, safeSeg(categoryName));
}

async function saveCategoryImage(categoryName, file) {
  if (!file) return null;
  const dir = categoryDir(categoryName);
  await fs.ensureDir(dir);
  const ext =
    file.mimetype === "image/png"
      ? ".png"
      : file.mimetype === "image/webp"
      ? ".webp"
      : ".jpg";
  const abs = path.join(dir, `main${ext}`);
  await fs.writeFile(abs, file.buffer);
  return toPublic(abs); // => /assets/categories/<name>/main.ext
}

async function deleteCategoryFolder(categoryName) {
  const dir = categoryDir(categoryName);
  if (await fs.pathExists(dir)) {
    await fs.remove(dir);
    return true;
  }
  return false;
}

async function renameCategoryFolder(oldName, newName) {
  const from = categoryDir(oldName);
  const to = categoryDir(newName);
  if (!(await fs.pathExists(from))) return 0;
  await fs.ensureDir(path.dirname(to));
  await fs.move(from, to, { overwrite: true });
  return 1;
}

module.exports = {
  IMAGES_ROOT,
  upload,
  saveMain,
  saveOption,
  deleteProductFolder,
  deleteOption,
  renameProductFolder: async (oldName, newName) => {
    const from = productDir(oldName);
    const to = productDir(newName);
    if (!(await fs.pathExists(from))) return 0;
    await fs.ensureDir(path.dirname(to));
    await fs.move(from, to, { overwrite: true });
    return 1;
  },
  productDir,
  toPublic,
  publicToAbs,
  renameOption,
  deleteByPublicUrl,
  CATEGORIES_ROOT,
  categoryDir,
  saveCategoryImage,
  deleteCategoryFolder,
  renameCategoryFolder,
};
