const express = require("express");
const router = express.Router();
const db = require("../services/dbService");
const { chatWithDocuments } = require("../services/chatService");
const { filterAccessibleDocuments } = require("../services/sourceAccessService");

router.post("/", async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const store = require("../services/relationalStore");
    if (!store.getConnectedSources().length) {
      return res.json({
        reply: "Connect a data source first (sidebar → Connect a source). Documents are only searchable after you connect Google Drive, Local folder, or another source.",
        references: [],
        model: null,
        hasOpenAI: !!process.env.OPENAI_API_KEY,
        requiresConnection: true,
      });
    }

    const allDocs = filterAccessibleDocuments(await db.getAllDocuments());
    const result = await chatWithDocuments(message.trim(), allDocs, history || []);

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
