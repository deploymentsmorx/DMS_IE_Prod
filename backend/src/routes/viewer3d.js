const express = require("express");
const router = express.Router();
const { get3DViewerData } = require("../services/viewer3dService");
const db = require("../services/dbService");
const { isDocumentAccessibleForUser } = require("../services/sourceAccessService");

router.get("/:docId", async (req, res) => {
  try {
    const doc = await db.getDocumentById(req.params.docId);
    if (!doc || !isDocumentAccessibleForUser(doc, req.user)) {
      return res.status(404).json({ error: "Document not found" });
    }
    const data = get3DViewerData(req.params.docId);
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

module.exports = router;
