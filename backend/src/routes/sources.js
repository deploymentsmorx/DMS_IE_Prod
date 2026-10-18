const express = require("express");
const multer = require("multer");
const router = express.Router();
const sourceService = require("../services/sourceService");
const sourceOtpService = require("../services/sourceOtpService");
const googleOAuth = require("../services/googleOAuthService");
const store = require("../services/relationalStore");
const authService = require("../services/authService");
const { requireRole } = require("../middleware/auth");
const requireFolderAdmin = requireRole("admin", "superadmin");

function roleLabel(role) {
  return String(role || "user")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cleanAccessControl(body = {}, actor) {
  const allUsers = authService.getUsersForAdmin(actor)
    .filter((user) => !["admin", "superadmin"].includes(user.role));
  const validRoles = new Set(allUsers.map((user) => user.role));
  const usersById = new Map(allUsers.map((user) => [String(user.id), user]));
  const allowedRoles = Array.isArray(body.allowedRoles)
    ? [...new Set(body.allowedRoles.map((role) => authService.normalizeRole(role)).filter((role) => validRoles.has(role)))]
    : [];
  const allowedUsers = Array.isArray(body.allowedUsers)
    ? [...new Set(body.allowedUsers.map((id) => String(id)))].filter((id) => usersById.has(id))
    : [];
  return { locked: body.locked === true, allowedRoles, allowedUsers };
}

const localUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
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

router.get("/", (req, res) => {
  res.json({
    connections: sourceService.getConnections(req.user),
    stats: sourceService.getSourceStats(req.user),
  });
});

router.get("/access-options", requireFolderAdmin, (req, res) => {
  const users = authService.getUsersForAdmin(req.user)
    .filter((user) => !["admin", "superadmin"].includes(user.role));
  const roles = [...new Set(users.map((user) => user.role))]
    .map((value) => ({ value, label: roleLabel(value) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  res.json({
    roles,
    users: users.map(({ id, username, displayName, role }) => ({
      id,
      username,
      displayName,
      role,
    })),
  });
});

router.patch("/:id/access-control", requireFolderAdmin, (req, res) => {
  const connection = store.getConnectedSource(req.params.id);
  if (!connection) return res.status(404).json({ error: "Connected folder not found" });
  const accessControl = cleanAccessControl(req.body || {}, req.user);
  const updated = store.updateConnectedSource(connection.id, { accessControl });
  res.json({ success: true, accessControl: updated.accessControl });
});

router.get("/google/auth-url", requireFolderAdmin, (_req, res) => {
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

router.post("/google/resend-otp", requireFolderAdmin, async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "sessionId is required" });
    const result = await googleOAuth.sendOtpForSession(sessionId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/send-otp", requireFolderAdmin, async (req, res) => {
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

router.post("/connect/google", requireFolderAdmin, async (req, res) => {
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

router.post("/connect", requireFolderAdmin, async (req, res) => {
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

router.post("/connect/local-folder", requireFolderAdmin, localUpload.array("files", 20), async (req, res) => {
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

router.post("/:id/local-folder-sync", requireFolderAdmin, localUpload.array("files", 20), async (req, res) => {
  try {
    const result = await sourceService.syncLocalFolderUpload(req.params.id, req.files || []);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/disconnect-all", requireFolderAdmin, (_req, res) => {
  try {
    const result = sourceService.disconnectAll();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/sync", requireFolderAdmin, async (req, res) => {
  try {
    const result = await sourceService.syncConnection(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", requireFolderAdmin, (req, res) => {
  try {
    const ok = sourceService.disconnect(req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/sync-all", requireFolderAdmin, async (_req, res) => {
  try {
    const results = await sourceService.syncAll();
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
