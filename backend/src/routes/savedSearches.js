const express = require("express");
const router = express.Router();
const aux = require("../services/dmsAuxStore");

function userId(req) {
  return req.user?.username || req.user?.id || "user";
}

router.get("/", (req, res) => {
  res.json(aux.getSavedSearches(userId(req)));
});

router.post("/", (req, res) => {
  const { name, query, source, category, fileType } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: "Search query is required" });
  const entry = aux.addSavedSearch(userId(req), { name, query, source, category, fileType });
  res.status(201).json(entry);
});

router.delete("/:id", (req, res) => {
  const ok = aux.deleteSavedSearch(userId(req), req.params.id);
  if (!ok) return res.status(404).json({ error: "Saved search not found" });
  res.json({ success: true });
});

module.exports = router;
