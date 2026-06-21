const express = require("express");
const multer = require("multer");
const path = require("path");
const store = require("../services/relationalStore");
const { ingestFile } = require("../services/folderService");

const router = express.Router();

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const dept = req.body.department || "other";
    const dir = path.join(store.ensureUploadsDir(), dept);
    require("fs").mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const { SUPPORTED_EXT } = require("../services/folderService");
    if (SUPPORTED_EXT.has(ext)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${ext}`));
  },
});

router.post("/", upload.array("files", 20), async (req, res) => {
  try {
    const department = req.body.department || "other";
    const imported = [];

    for (const file of req.files || []) {
      const doc = await ingestFile(file.path, {
        department,
        source: "upload",
        folderPath: "upload",
      });
      imported.push(doc);
    }

    res.status(201).json({
      success: true,
      imported: imported.length,
      documents: imported,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
