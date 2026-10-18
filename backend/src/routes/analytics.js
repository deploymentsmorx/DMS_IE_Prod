const express = require("express");
const { buildDashboard } = require("../services/analyticsService");

const router = express.Router();

router.get("/dashboard", async (req, res) => {
  try {
    res.json(await buildDashboard(req.user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
