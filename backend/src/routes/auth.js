const express = require("express");
const authService = require("../services/authService");
const { extractToken, requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  const result = authService.login(username.trim(), password);
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
  if (!authService.isSuperAdmin(req.user)) {
    return res.status(403).json({ error: "Super Admin access required" });
  }
  res.json({ users: authService.getUsers() });
});

module.exports = router;
