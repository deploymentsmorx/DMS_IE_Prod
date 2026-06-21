const express = require("express");
const router = express.Router();
const db = require("../services/dbService");
const store = require("../services/relationalStore");
const aux = require("../services/dmsAuxStore");
const { buildSuggestions } = require("../services/suggestService");
const { extractMetadata, summarizeDocument, aiSearch } = require("../services/documentIntelligenceService");
const { buildInsights } = require("../services/insightsService");
const { filterAccessibleDocuments } = require("../services/sourceAccessService");
const { AI_SEARCH_EXAMPLES, CHAT_EXAMPLES, ROLES } = require("../config/aiExamples");
const path = require("path");
const versionStore = require(path.join(__dirname, "../../backend/lib/store"));

router.get("/capabilities", (_req, res) => {
  res.json({
    aiSearch: true,
    documentSummary: true,
    metadataExtraction: true,
    versionControl: true,
    approvalWorkflow: true,
    ocrSearch: true,
    smartChat: true,
    aiInsights: true,
    roleBasedAccess: true,
    exportFormats: ["pdf", "docx", "xlsx", "txt"],
    roles: ROLES,
    capabilities: [
      "Search connected documents instantly",
      "AI-powered document summaries",
      "OCR-based content search",
      "Smart approvals and workflows",
      "Version tracking and audit logs",
      "Export to PDF, Word, Excel",
    ],
    examples: {
      search: AI_SEARCH_EXAMPLES,
      chat: CHAT_EXAMPLES,
    },
  });
});

router.get("/suggest", async (req, res) => {
  try {
    const { q = "", scope = "all" } = req.query;
    const connections = store.getConnectedSources();
    const searchDocs = connections.length ? filterAccessibleDocuments(await db.getAllDocuments()) : [];
    const saved = aux.load?.()?.savedSearches || [];
    const versionDocs = versionStore.getDocuments().map((d) => ({
      title: d.name,
      tags: d.tags,
      metadata: d.metadata,
    }));

    const suggestions = buildSuggestions(q, {
      documents: [...searchDocs, ...versionDocs],
      savedSearches: saved,
      scope,
    });

    res.json({ query: q, scope, suggestions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/search", async (req, res) => {
  try {
    const { q } = req.body;
    if (!q) return res.status(400).json({ error: "q is required" });
    const connections = store.getConnectedSources();
    const docs = connections.length ? filterAccessibleDocuments(await db.getAllDocuments()) : [];
    const result = await aiSearch(q, docs);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/summary", async (req, res) => {
  try {
    const { name, content, task = "summarize", documentId } = req.body;
    let docName = name;
    let docContent = content;

    if (documentId && !docContent) {
      const doc = versionStore.getDocument(documentId);
      if (doc) {
        docName = doc.name;
        docContent = doc.versions.at(-1)?.content || "";
      }
    }

    if (!docContent) return res.status(400).json({ error: "content or documentId is required" });
    const result = await summarizeDocument(docName, docContent, task);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/metadata", async (req, res) => {
  try {
    const { name, content, documentId, persist } = req.body;
    let docName = name;
    let docContent = content;

    if (documentId && !docContent) {
      const doc = versionStore.getDocument(documentId);
      if (doc) {
        docName = doc.name;
        docContent = doc.versions.at(-1)?.content || "";
      }
    }

    if (!docName) return res.status(400).json({ error: "name or documentId is required" });
    const metadata = await extractMetadata(docName, docContent || "");

    if (persist && documentId) {
      versionStore.updateMetadata(documentId, { metadata }, req.user?.username || req.user?.id);
    }

    res.json({ metadata });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/insights", async (req, res) => {
  try {
    const connections = store.getConnectedSources();
    const searchDocs = connections.length ? filterAccessibleDocuments(await db.getAllDocuments()) : [];
    res.json(buildInsights(searchDocs, req.user || {}));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
