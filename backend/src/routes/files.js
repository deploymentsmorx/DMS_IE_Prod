const path = require("path");
const fs = require("fs");
const express = require("express");
const db = require("../services/dbService");
const store = require("../services/relationalStore");
const authService = require("../services/authService");
const { extractToken } = require("../middleware/auth");
const { isDocumentAccessibleForUser } = require("../services/sourceAccessService");

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

router.get("/:department/:filename", async (req, res) => {
  const user = authorizeFileRequest(req, res);
  if (!user) return;

  let department;
  let filename;
  try {
    department = decodeURIComponent(req.params.department);
    filename = decodeURIComponent(req.params.filename);
  } catch {
    return res.status(400).json({ error: "Invalid file reference" });
  }

  if (department === "memory") {
    const doc = await db.getDocumentById(filename);
    const file = store.getTransientFile(filename);
    if (!doc || !file || !isDocumentAccessibleForUser(doc, user)) {
      return res.status(404).json({ error: "File not found" });
    }
    res.type(file.mimeType);
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
    return res.send(file.buffer);
  }

  if (department !== "local") {
    return res.status(404).json({ error: "Persistent server uploads are disabled" });
  }

  let filePath;
  try {
    filePath = path.resolve(Buffer.from(filename, "base64url").toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid local file reference" });
  }

  const docs = await db.getAllDocuments();
  const normalizedTarget = process.platform === "win32" ? filePath.toLowerCase() : filePath;
  const matches = docs.filter((doc) => {
    if (!doc.filePath) return false;
    const normalizedDocPath = path.resolve(doc.filePath);
    return (process.platform === "win32" ? normalizedDocPath.toLowerCase() : normalizedDocPath) === normalizedTarget;
  });
  if (!matches.length || !matches.some((doc) => isDocumentAccessibleForUser(doc, user))) {
    return res.status(404).json({ error: "File not found" });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found on this PC" });
  }
  return res.sendFile(filePath);
});

module.exports = router;
