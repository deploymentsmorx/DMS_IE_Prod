const express = require("express");
const router = express.Router();
const aux = require("../services/dmsAuxStore");

function userId(req) {
  return req.user?.username || req.user?.id || "user";
}

router.get("/", (req, res) => {
  const notes = aux.getNotifications(userId(req));
  res.json({
    notifications: notes,
    unread: notes.filter((n) => !n.read).length,
  });
});

router.post("/:id/read", (req, res) => {
  const ok = aux.markNotificationRead(userId(req), req.params.id);
  if (!ok) return res.status(404).json({ error: "Notification not found" });
  res.json({ success: true });
});

router.post("/read-all", (req, res) => {
  aux.markAllNotificationsRead(userId(req));
  res.json({ success: true });
});

module.exports = router;
