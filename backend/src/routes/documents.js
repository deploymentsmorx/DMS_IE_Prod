const express = require("express");
const router = express.Router();
const db = require("../services/dbService");
const store = require("../services/relationalStore");
const { searchDocuments, findSimilarDocuments } = require("../services/searchService");
const {
  filterAccessibleDocuments,
  filterAccessibleConnections,
  isDocumentAccessibleForUser,
  isConnectionAccessible,
  buildStats,
} = require("../services/sourceAccessService");
const { loadEnterpriseDocuments, mergeDocuments } = require("../services/libraryDocuments");

router.get("/", async (req, res) => {
  try {
    const { q, source, fileType, category, department, limit, lang } = req.query;
    const connections = filterAccessibleConnections(store.getConnectedSources(), req.user);
    const connectedDocs = connections.length
      ? filterAccessibleDocuments(await db.getAllDocuments(), req.user)
      : [];
    const all = mergeDocuments(connectedDocs, loadEnterpriseDocuments());
    if (!all.length && !connections.length) {
      return res.json({
        results: [],
        total: 0,
        query: q || "",
        requiresConnection: true,
        connectedSources: 0,
        detectedLang: "en",
        multilingual: false,
        storage: "memory",
      });
    }

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
      storage: "memory",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/stats", async (_req, res) => {
  try {
    const connections = filterAccessibleConnections(store.getConnectedSources(), req.user);
    const connectedDocs = connections.length
      ? filterAccessibleDocuments(await db.getAllDocuments(), req.user)
      : [];
    const docs = mergeDocuments(connectedDocs, loadEnterpriseDocuments());
    if (!docs.length && !connections.length) {
      return res.json({
        total: 0,
        bySource: {},
        byFileType: {},
        byCategory: {},
        byDepartment: {},
        requiresConnection: true,
        connectedSources: 0,
        storage: "memory",
      });
    }
    const stats = buildStats(docs, req.user);

    res.json({
      ...stats,
      requiresConnection: false,
      connectedSources: connections.length,
      storage: "memory",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/duplicates", async (req, res) => {
  try {
    const all = filterAccessibleDocuments(await db.getAllDocuments(), req.user);
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
    if (!doc || !isDocumentAccessibleForUser(doc, req.user)) return res.status(404).json({ error: "Not found" });
    const all = filterAccessibleDocuments(await db.getAllDocuments(), req.user);
    const similar = findSimilarDocuments(doc, all, Number(req.query.limit) || 5);
    res.json({ documentId: doc.id, title: doc.title, similar, total: similar.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const doc = await db.getDocumentById(req.params.id);
    if (!doc || !isDocumentAccessibleForUser(doc, req.user)) return res.status(404).json({ error: "Not found" });
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
    if (req.body.connectionId) {
      const connection = store.getConnectedSource(req.body.connectionId);
      if (!isConnectionAccessible(connection, req.user)) return res.status(404).json({ error: "Folder not found" });
    }
    const doc = await db.insertDocument(req.body);
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const existing = await db.getDocumentById(req.params.id);
    if (!existing || !isDocumentAccessibleForUser(existing, req.user)) return res.status(404).json({ error: "Not found" });
    if (req.body.connectionId && String(req.body.connectionId) !== String(existing.connectionId || "")) {
      const connection = store.getConnectedSource(req.body.connectionId);
      if (!isConnectionAccessible(connection, req.user)) return res.status(404).json({ error: "Folder not found" });
    }
    const doc = await db.updateDocument(req.params.id, req.body);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const existing = await db.getDocumentById(req.params.id);
    if (!existing || !isDocumentAccessibleForUser(existing, req.user)) return res.status(404).json({ error: "Not found" });
    const ok = await db.deleteDocument(req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
