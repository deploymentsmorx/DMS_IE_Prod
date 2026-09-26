const express = require("express");
const multer = require("multer");
const path = require("path");
const router = express.Router();
const sourceService = require("../services/sourceService");
const sourceOtpService = require("../services/sourceOtpService");
const googleOAuth = require("../services/googleOAuthService");
const store = require("../services/relationalStore");

const localUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, cb) {
      const dir = path.join(store.ensureUploadsDir(), "local-browser");
      require("fs").mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(_req, file, cb) {
      const safe = (file.originalname || "file").replace(/[/\\]/g, "_");
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 500 },
});

router.get("/types", (_req, res) => {
  res.json({
    types: sourceService.listSourceTypes(),
    googleOAuth: {
      configured: googleOAuth.isConfigured(),
      redirectUri:
        process.env.GOOGLE_REDIRECT_URI ||
        `http://localhost:${process.env.PORT || 3001}/api/sources/google/callback`,
    },
  });
});

router.get("/", (_req, res) => {
  res.json({
    connections: sourceService.getConnections(),
    stats: sourceService.getSourceStats(),
  });
});

router.get("/google/auth-url", (_req, res) => {
  try {
    if (!googleOAuth.isConfigured()) {
      return res.status(400).json({
        error:
          "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env — create OAuth client at console.cloud.google.com",
      });
    }
    res.json({ url: googleOAuth.getAuthUrl() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/google/resend-otp", async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "sessionId is required" });
    const result = await googleOAuth.sendOtpForSession(sessionId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/send-otp", async (req, res) => {
  try {
    const { email, type } = req.body;
    const result = await sourceOtpService.sendOtpForSession({
      user: req.user,
      email,
      type,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/connect/google", async (req, res) => {
  try {
    const { sessionId, otp } = req.body;
    if (!sessionId || !otp) {
      return res.status(400).json({ error: "Google session and verification code are required" });
    }

    const session = googleOAuth.verifyOtpForSession(sessionId, otp);
    if (!session) {
      return res.status(401).json({ error: "Invalid or expired verification code" });
    }

    const mergedConfig = {
      otpEmail: session.email,
      googleEmail: session.email,
      oauthTokens: session.tokens,
    };

    const result = await sourceService.connect("google_drive", mergedConfig, "Google Drive", {
      verified: true,
    });
    googleOAuth.takeSession(sessionId);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/connect", async (req, res) => {
  try {
    const { type, config, label } = req.body;
    if (!type) return res.status(400).json({ error: "type is required" });
    if (type === "google_drive") {
      return res.status(400).json({ error: "Use Sign in with Google for Google Drive" });
    }
    if (type === "local_directory") {
      const mode = String(config?.mode || "").toLowerCase();
      if (mode === "system" || mode === "scan_all" || config?.scanAll === true) {
        const result = await sourceService.connectLocalSystemScan(
          { ...(config || {}), department: config?.department || "auto" },
          label || "Local System Data"
        );
        return res.status(201).json(result);
      }
      return res.status(400).json({
        error: "Choose Select specific folder, or Sync all local system data.",
      });
    }

    const mergedConfig = {
      ...(config || {}),
      authUsername: req.user?.username || config?.authUsername || "user",
    };

    const result = await sourceService.connect(type, mergedConfig, label, { verified: true });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/connect/local-folder", localUpload.array("files", 500), async (req, res) => {
  try {
    const config = {
      department: req.body.department || "auto",
      folderLabel: req.body.folderLabel || "",
    };
    const result = await sourceService.connectLocalFolderUpload(
      req.files || [],
      config,
      req.body.label || "Local Directory"
    );
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/:id/local-folder-sync", localUpload.array("files", 500), async (req, res) => {
  try {
    const result = await sourceService.syncLocalFolderUpload(req.params.id, req.files || []);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/disconnect-all", (_req, res) => {
  try {
    const result = sourceService.disconnectAll();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/sync", async (req, res) => {
  try {
    const result = await sourceService.syncConnection(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", (req, res) => {
  try {
    const ok = sourceService.disconnect(req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/sync-all", async (_req, res) => {
  try {
    const results = await sourceService.syncAll();
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
