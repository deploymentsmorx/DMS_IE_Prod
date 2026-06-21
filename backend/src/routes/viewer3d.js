const express = require("express");
const router = express.Router();
const { get3DViewerData } = require("../services/viewer3dService");

router.get("/:docId", (req, res) => {
  try {
    const data = get3DViewerData(req.params.docId);
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

module.exports = router;
