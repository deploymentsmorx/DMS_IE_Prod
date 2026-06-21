const { searchDocuments } = require("./searchService");

let openai = null;

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openai) {
    const OpenAI = require("openai");
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

function buildContext(docs) {
  return docs
    .map(
      (d, i) =>
        `[${i + 1}] Title: ${d.title}
   Type: ${(d.fileType || "").toUpperCase()} | Category: ${d.category || "n/a"} | Source: ${d.source}
   Match: ${d.matchPercent}%
   URL: ${d.url}
   Tags: ${(d.tags || []).join(", ")}
   Description: ${d.description}
   Content excerpt: ${(d.content || d.description || "").slice(0, 300)}`
    )
    .join("\n\n");
}

async function chatWithDocuments(message, allDocuments, history = []) {
  const matched = searchDocuments(allDocuments, { q: message, limit: 8 });

  const systemPrompt = `You are an intelligent document assistant for an engineering and business organization.
You help users find and understand documents stored across Google Drive, OneDrive, and NeonDB.

Document types include: PDFs, CAD drawings (DWG), inspection reports, Excel sheets, OCR-extracted text,
invoices, bills, finance reports, HR policies, and logistics documents.

When answering:
- Reference specific document titles from the provided context
- Mention match relevance when useful
- Include direct guidance on which document to open for the user's need
- If no documents match, suggest better search terms or categories
- Be concise (2-4 sentences) then summarize top matches
- Never invent documents not in the context`;

  const contextBlock = buildContext(matched);

  const client = getOpenAI();
  if (!client) {
    return {
      reply: fallbackReply(message, matched),
      references: formatReferences(matched),
      model: "fallback",
    };
  }

  try {
    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "system",
        content: `Relevant documents for this query:\n\n${contextBlock || "(No matching documents found)"}`,
      },
      ...history.slice(-6).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
      { role: "user", content: message },
    ];

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      messages,
      max_tokens: 800,
      temperature: 0.3,
    });

    const reply =
      response.choices[0]?.message?.content ||
      fallbackReply(message, matched);

    return {
      reply,
      references: formatReferences(matched),
      model: process.env.OPENAI_MODEL || "gpt-4o",
    };
  } catch (err) {
    console.error("OpenAI error:", err.message);
    return {
      reply: fallbackReply(message, matched),
      references: formatReferences(matched),
      model: "fallback",
      error: err.message,
    };
  }
}

function fallbackReply(message, matched) {
  if (matched.length === 0) {
    return `I couldn't find documents matching "${message}". Try keywords like finance, invoice, inspection, CAD, HR, or logistics — or add new documents via the Add Document button.`;
  }
  const top = matched[0];
  return `I found ${matched.length} document${matched.length > 1 ? "s" : ""} related to your query. The best match is **${top.title}** (${top.matchPercent}% match). See the reference cards below to open them directly.`;
}

function formatReferences(docs) {
  return docs.slice(0, 6).map((d) => ({
    id: d.id,
    title: d.title,
    description: d.description,
    url: d.url,
    source: d.source,
    fileType: d.fileType,
    category: d.category,
    matchPercent: d.matchPercent,
    tags: d.tags,
  }));
}

module.exports = { chatWithDocuments };
