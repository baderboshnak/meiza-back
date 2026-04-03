const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

// change this if your auth middleware is different
// const { requireAdmin } = require("../middleware/auth");

router.post("/fix-missing-option-ids", async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection("products"); // meiz.products => collection name is products

    const query = {
      options: {
        $elemMatch: {
          _id: { $exists: false },
        },
      },
    };

    const docs = await collection.find(query).toArray();

    let matchedDocs = docs.length;
    let updatedDocs = 0;
    let fixedOptions = 0;

    for (const doc of docs) {
      if (!Array.isArray(doc.options)) continue;

      let changed = false;

      const newOptions = doc.options.map((opt) => {
        if (
          opt &&
          typeof opt === "object" &&
          !Array.isArray(opt) &&
          !opt._id
        ) {
          changed = true;
          fixedOptions += 1;
          return {
            ...opt,
            _id: new mongoose.Types.ObjectId(),
          };
        }
        return opt;
      });

      if (changed) {
        await collection.updateOne(
          { _id: doc._id },
          { $set: { options: newOptions } }
        );
        updatedDocs += 1;
      }
    }

    return res.json({
      ok: true,
      matchedDocs,
      updatedDocs,
      fixedOptions,
    });
  } catch (error) {
    console.error("fix-missing-option-ids error:", error);
    return res.status(500).json({
      ok: false,
      message: error.message,
    });
  }
});

module.exports = router;