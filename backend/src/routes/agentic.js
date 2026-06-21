const express = require("express");
const router = express.Router();
const { agenticSearch } = require("../services/agenticSearchService");

router.post("/search", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query?.trim()) return res.status(400).json({ error: "query is required" });
    const result = await agenticSearch(query.trim());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
