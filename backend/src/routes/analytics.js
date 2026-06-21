const express = require("express");
const { buildDashboard } = require("../services/analyticsService");

const router = express.Router();

router.get("/dashboard", async (_req, res) => {
  try {
    res.json(await buildDashboard());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
