const express = require("express");
const router = express.Router();
const store = require("../services/relationalStore");
const db = require("../services/dbService");

router.get("/:docId", async (req, res) => {
  try {
    const doc = await db.getDocumentById(req.params.docId);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    const revisions = store.getRevisions(req.params.docId);
    res.json({ document: doc, revisions, currentRevision: doc.revision });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
