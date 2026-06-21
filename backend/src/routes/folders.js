const express = require("express");
const router = express.Router();
const { connectFolder } = require("../services/folderService");
const store = require("../services/relationalStore");

router.get("/", (_req, res) => {
  res.json({ folders: store.getConnectedFolders(), departments: store.DEPARTMENTS });
});

router.post("/connect", async (req, res) => {
  try {
    const { path: folderPath, department } = req.body;
    if (!folderPath) return res.status(400).json({ error: "path is required" });
    const result = await connectFolder(folderPath, department);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
