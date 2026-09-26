const express = require("express");
const path = require("path");
const fs = require("fs");
const store = require("../services/relationalStore");
const authService = require("../services/authService");
const { extractToken } = require("../middleware/auth");

const router = express.Router();

function authorizeFileRequest(req, res) {
  const headerToken = extractToken(req);
  const queryToken = req.query.token;
  const user = authService.validateToken(headerToken || queryToken);
  if (!user) {
    res.status(401).json({ error: "Authentication required. Please sign in." });
    return null;
  }
  return user;
}

router.get("/:department/:filename", (req, res) => {
  if (!authorizeFileRequest(req, res)) return;

  const department = decodeURIComponent(req.params.department);
  const filename = decodeURIComponent(req.params.filename);

  if (department === "local") {
    let localPath = "";
    try {
      localPath = Buffer.from(filename, "base64url").toString("utf8");
    } catch {
      return res.status(400).json({ error: "Invalid local file reference" });
    }
    if (!localPath || !fs.existsSync(localPath)) {
      return res.status(404).json({ error: "File not found on this PC" });
    }
    return res.sendFile(path.resolve(localPath));
  }

  const filePath = path.join(store.UPLOADS_DIR, department, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.sendFile(path.resolve(filePath));
});

module.exports = router;
