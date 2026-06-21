const express = require("express");
const router = express.Router();
const { compareDrawings } = require("../services/drawingCompareService");

router.post("/", (req, res) => {
  try {
    const { docIdA, docIdB } = req.body;
    if (!docIdA || !docIdB) {
      return res.status(400).json({ error: "docIdA and docIdB are required" });
    }
    const result = compareDrawings(docIdA, docIdB);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
