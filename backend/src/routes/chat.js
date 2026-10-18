const express = require("express");
const router = express.Router();
const db = require("../services/dbService");
const { chatWithDocuments } = require("../services/chatService");
const { filterAccessibleDocuments } = require("../services/sourceAccessService");
const { loadEnterpriseDocuments, mergeDocuments } = require("../services/libraryDocuments");

router.post("/", async (req, res) => {
  try {
    const { message, history, documentIds, followUpIds } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const store = require("../services/relationalStore");
    const connections = store.getConnectedSources();
    const connectedDocs = connections.length
      ? filterAccessibleDocuments(await db.getAllDocuments(), req.user)
      : [];
    const allDocs = mergeDocuments(connectedDocs, loadEnterpriseDocuments());
    if (!allDocs.length) {
      return res.json({
        reply: "There are no documents to chat with yet. Connect a source or add a file, then ask again.",
        references: [],
        model: null,
        hasOpenAI: !!process.env.OPENAI_API_KEY,
        requiresConnection: true,
      });
    }
    const result = await chatWithDocuments(
      message.trim(),
      allDocs,
      history || [],
      documentIds || [],
      followUpIds || []
    );

    res.json({
      reply: result.reply,
      references: result.references,
      model: result.model,
      hasOpenAI: !!process.env.OPENAI_API_KEY,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
