const express = require("express");
const authService = require("../services/authService");
const { extractToken, requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/login", (req, res) => {
  const body = req.body || {};
  const username = String(body.username || body.email || "").trim();
  const password = body.password;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  const result = authService.login(username, password, {
    deviceId: body.deviceId || body.device_id,
    hostName: body.hostName || body.host_name || body.hostname,
    licenseKey: body.licenseKey || body.license_key,
  });
  if (!result.ok) return res.status(401).json({ error: result.error });
  res.json({
    token: result.token,
    user: result.user,
    expiresAt: result.expiresAt,
  });
});

router.post("/logout", (req, res) => {
  authService.logout(extractToken(req));
  res.json({ success: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.get("/users", requireAuth, (req, res) => {
  if (!authService.isAdmin(req.user)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  res.json({ users: authService.getUsersForAdmin(req.user) });
});

router.post("/users", requireAuth, (req, res) => {
  if (!authService.isAdmin(req.user)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  const { username, displayName, role, password } = req.body || {};
  const result = authService.createUser({ username, displayName, role, password }, req.user);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.status(201).json({
    user: result.user,
    temporaryPassword: result.temporaryPassword,
    message: `Login created. Share username "${result.user.username}" and temporary password with the user.`,
  });
});

router.delete("/users/:id", requireAuth, (req, res) => {
  if (!authService.isAdmin(req.user)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  const result = authService.deleteUser(req.params.id, req.user);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ success: true });
});

module.exports = router;
