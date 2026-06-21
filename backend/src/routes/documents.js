const express = require("express");
const router = express.Router();
const db = require("../services/dbService");
const store = require("../services/relationalStore");
const { searchDocuments, findSimilarDocuments } = require("../services/searchService");
const { filterAccessibleDocuments, buildStats } = require("../services/sourceAccessService");

router.get("/", async (req, res) => {
  try {
    const { q, source, fileType, category, department, limit, lang } = req.query;
    const connections = store.getConnectedSources();
    if (!connections.length) {
      return res.json({
        results: [],
        total: 0,
        query: q || "",
        requiresConnection: true,
        connectedSources: 0,
        detectedLang: "en",
        multilingual: false,
        storage: db.isUsingNeon() ? "neondb" : "memory",
      });
    }

    const all = filterAccessibleDocuments(await db.getAllDocuments());
    const results = searchDocuments(all, {
      q,
      source,
      fileType,
      category,
      department,
      limit: limit ? Number(limit) : 50,
      lang,
    });
    const meta = results.searchMeta || {};
    delete results.searchMeta;

    res.json({
      results,
      total: results.length,
      query: q || "",
      requiresConnection: false,
      connectedSources: connections.length,
      detectedLang: meta.detectedLang || "en",
      multilingual: meta.multilingual || false,
      storage: db.isUsingNeon() ? "neondb" : "memory",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/stats", async (_req, res) => {
  try {
    const connections = store.getConnectedSources();
    if (!connections.length) {
      return res.json({
        total: 0,
        bySource: {},
        byFileType: {},
        byCategory: {},
        byDepartment: {},
        requiresConnection: true,
        connectedSources: 0,
        storage: db.isUsingNeon() ? "neondb" : "memory",
      });
    }
    const docs = await db.getAllDocuments();
    const stats = buildStats(docs);

    res.json({
      ...stats,
      requiresConnection: false,
      connectedSources: connections.length,
      storage: db.isUsingNeon() ? "neondb" : "memory",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/duplicates", async (_req, res) => {
  try {
    const all = filterAccessibleDocuments(await db.getAllDocuments());
    const groups = [];
    const seen = new Set();

    for (let i = 0; i < all.length; i++) {
      if (seen.has(all[i].id)) continue;
      const similar = findSimilarDocuments(all[i], all, 10).filter((d) => d.similarity >= 70);
      if (similar.length) {
        groups.push({
          primary: { id: all[i].id, title: all[i].title },
          duplicates: similar.map((d) => ({ id: d.id, title: d.title, similarity: d.similarity, source: d.source })),
        });
        seen.add(all[i].id);
        similar.forEach((d) => seen.add(d.id));
      }
    }

    res.json({ groups, total: groups.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id/similar", async (req, res) => {
  try {
    const doc = await db.getDocumentById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    const all = filterAccessibleDocuments(await db.getAllDocuments());
    const similar = findSimilarDocuments(doc, all, Number(req.query.limit) || 5);
    res.json({ documentId: doc.id, title: doc.title, similar, total: similar.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const doc = await db.getDocumentById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { title, url } = req.body;
    if (!title || !url) {
      return res.status(400).json({ error: "title and url are required" });
    }
    const doc = await db.insertDocument(req.body);
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const doc = await db.updateDocument(req.params.id, req.body);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const ok = await db.deleteDocument(req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
