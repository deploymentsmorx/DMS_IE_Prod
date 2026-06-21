const express = require("express");
const router = express.Router();
const store = require("../services/relationalStore");

router.get("/", (_req, res) => {
  res.json({ defects: store.getDefects() });
});

router.get("/analytics", (_req, res) => {
  res.json(store.getDefectAnalytics());
});

router.post("/", (req, res) => {
  try {
    const { title, severity, documentId, project, location, description } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });
    const defect = store.addDefect({
      title,
      severity: severity || "medium",
      documentId,
      project,
      location,
      description,
      detectedAt: new Date().toISOString().slice(0, 10),
    });
    res.status(201).json(defect);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
