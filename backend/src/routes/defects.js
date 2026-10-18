const express = require("express");
const router = express.Router();
const store = require("../services/relationalStore");
const { filterAccessibleDocuments } = require("../services/sourceAccessService");

function visibleDefects(user) {
  const visibleIds = new Set(
    filterAccessibleDocuments(store.getDocuments(), user).map((doc) => String(doc.id))
  );
  return store.getDefects().filter(
    (defect) => !defect.documentId || visibleIds.has(String(defect.documentId))
  );
}

router.get("/", (req, res) => {
  res.json({ defects: visibleDefects(req.user) });
});

router.get("/analytics", (req, res) => {
  const visibleIds = new Set(
    filterAccessibleDocuments(store.getDocuments(), req.user).map((doc) => String(doc.id))
  );
  res.json(store.getDefectAnalytics(visibleIds));
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
