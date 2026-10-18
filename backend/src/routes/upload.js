const express = require("express");
const multer = require("multer");
const path = require("path");
const sourceService = require("../services/sourceService");
const store = require("../services/relationalStore");
const { SUPPORTED_EXT } = require("../services/folderService");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (SUPPORTED_EXT.has(ext)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${ext}`));
  },
});

router.post("/", upload.array("files", 20), async (req, res) => {
  try {
    const department = req.body.department || "other";
    const result = await sourceService.connectLocalFolderUpload(
      req.files || [],
      { department, folderLabel: "Browser upload" },
      "Browser upload"
    );
    const connectionId = result.connection.id;
    const imported = store.getDocuments().filter(
      (doc) => String(doc.connectionId || "") === String(connectionId)
    );

    res.status(201).json({
      success: true,
      imported: result.sync.imported,
      connection: result.connection,
      documents: imported,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
