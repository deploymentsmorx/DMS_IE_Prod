const express = require("express");
const router = express.Router();
const { compareDrawings } = require("../services/drawingCompareService");
const db = require("../services/dbService");
const { isDocumentAccessibleForUser } = require("../services/sourceAccessService");

router.post("/", async (req, res) => {
  try {
    const { docIdA, docIdB } = req.body;
    if (!docIdA || !docIdB) {
      return res.status(400).json({ error: "docIdA and docIdB are required" });
    }
    const [docA, docB] = await Promise.all([
      db.getDocumentById(docIdA),
      db.getDocumentById(docIdB),
    ]);
    if (
      !docA ||
      !docB ||
      !isDocumentAccessibleForUser(docA, req.user) ||
      !isDocumentAccessibleForUser(docB, req.user)
    ) return res.status(404).json({ error: "One or both documents not found" });
    const result = compareDrawings(docIdA, docIdB);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
