const express = require("express");
const router = express.Router();
const { connectFolder } = require("../services/folderService");
const store = require("../services/relationalStore");
const authService = require("../services/authService");
const { requireRole } = require("../middleware/auth");
const { filterAccessibleConnections } = require("../services/sourceAccessService");
const requireFolderAdmin = requireRole("admin", "superadmin");

router.get("/", (req, res) => {
  res.json({
    folders: filterAccessibleConnections(store.getConnectedFolders(), req.user),
    departments: store.DEPARTMENTS,
  });
});

router.get("/access-options", requireFolderAdmin, (req, res) => {
  const users = authService.getUsersForAdmin(req.user)
    .filter((user) => !["admin", "superadmin"].includes(user.role));
  res.json({
    roles: [...new Set(users.map((user) => user.role))].map((value) => ({ value, label: value.replace(/[_-]+/g, " ") })),
    users: users.map(({ id, username, displayName, role }) => ({ id, username, displayName, role })),
  });
});

router.post("/connect", requireFolderAdmin, async (req, res) => {
  try {
    const { path: folderPath, department } = req.body;
    if (!folderPath) return res.status(400).json({ error: "path is required" });
    const result = await connectFolder(folderPath, department);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch("/:id/access-control", requireFolderAdmin, (req, res) => {
  const folder = store.getConnectedFolders().find((item) => String(item.id) === String(req.params.id));
  if (!folder) return res.status(404).json({ error: "Connected folder not found" });
  const users = authService.getUsersForAdmin(req.user)
    .filter((user) => !["admin", "superadmin"].includes(user.role));
  const validRoles = new Set(users.map((user) => user.role));
  const validUsers = new Set(users.map((user) => String(user.id)));
  const requestedRoles = Array.isArray(req.body?.allowedRoles) ? req.body.allowedRoles : [];
  const requestedUsers = Array.isArray(req.body?.allowedUsers) ? req.body.allowedUsers : [];
  const accessControl = {
    locked: req.body?.locked === true,
    allowedRoles: [...new Set(requestedRoles.map((role) => authService.normalizeRole(role)))].filter((role) => validRoles.has(role)),
    allowedUsers: [...new Set(requestedUsers.map(String))].filter((id) => validUsers.has(id)),
  };
  const updated = store.updateConnectedFolder(folder.id, { accessControl });
  res.json({ success: true, accessControl: updated.accessControl });
});

module.exports = router;
