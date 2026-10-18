const express = require("express");
const router = express.Router();
const db = require("../services/dbService");
const { requireRole } = require("../middleware/auth");
const requireFolderAdmin = requireRole("admin", "superadmin");

router.post("/", requireFolderAdmin, async (_req, res) => {
  try {
    const synced = [];

    if (process.env.GOOGLE_DRIVE_FOLDER_ID && process.env.GOOGLE_SERVICE_ACCOUNT_PATH) {
      try {
        const { syncGoogleDrive } = require("../services/sync/googleDrive");
        const docs = await syncGoogleDrive(process.env.GOOGLE_DRIVE_FOLDER_ID);
        const saved = await db.upsertMany(docs);
        synced.push({ source: "google_drive", count: saved.length });
      } catch (err) {
        synced.push({ source: "google_drive", error: err.message });
      }
    }

    if (process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID) {
      try {
        const userEmail = process.env.ONEDRIVE_USER_EMAIL || process.env.SMTP_USER;
        if (userEmail) {
          const { syncOneDriveGraph } = require("../services/sync/oneDrive");
          const docs = await syncOneDriveGraph(userEmail);
          const saved = await db.upsertMany(docs);
          synced.push({ source: "onedrive", count: saved.length });
        } else {
          synced.push({ source: "onedrive", message: "Set ONEDRIVE_USER_EMAIL in .env for Graph sync" });
        }
      } catch (err) {
        synced.push({ source: "onedrive", error: err.message });
      }
    }

    if (synced.length === 0) {
      return res.json({
        success: true,
        message:
          "No cloud credentials configured. Add documents manually or set GOOGLE_DRIVE_FOLDER_ID / AZURE_* in .env",
        synced: [],
      });
    }

    res.json({ success: true, synced });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
