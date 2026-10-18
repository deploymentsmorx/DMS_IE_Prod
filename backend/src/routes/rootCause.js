const express = require("express");
const router = express.Router();
const { analyzeRootCause } = require("../services/rootCauseService");

router.post("/analyze", async (req, res) => {
  try {
    const { issue, defectId } = req.body;
    if (!issue && !defectId) {
      return res.status(400).json({ error: "issue or defectId is required" });
    }
    const result = await analyzeRootCause(issue, defectId, req.user);
    res.json(result);
  } catch (err) {
    res.status(err.message === "Defect not found" ? 404 : 500).json({ error: err.message });
  }
});

module.exports = router;
