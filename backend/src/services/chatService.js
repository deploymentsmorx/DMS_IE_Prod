const STOP_WORDS = new Set([
  "a", "an", "the", "any", "are", "is", "was", "were", "be", "been", "being",
  "there", "here", "in", "on", "of", "to", "for", "and", "or", "with", "from",
  "what", "which", "who", "how", "when", "where", "why", "all", "file", "files",
  "document", "documents", "docuemnts", "doc", "docs", "source", "sources", "data",
  "related", "about", "please", "can", "you", "your", "me", "my", "this", "that",
  "those", "these", "have", "has", "had", "do", "does", "did", "not", "no", "yes",
  "tp", "up", "it", "its", "into", "also", "just", "there", "dms",
]);

function meaningfulTerms(message) {
  return String(message || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

function documentText(doc) {
  return [
    doc.title,
    doc.description,
    doc.content,
    doc.ocrText,
    (doc.tags || []).join(" "),
    doc.category,
    doc.department,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function termAppears(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function documentsThatContainQuestion(message, allDocuments) {
  const terms = meaningfulTerms(message);
  if (!terms.length) return [];

  return allDocuments
    .map((doc) => {
      const text = documentText(doc);
      const matchedTerms = terms.filter((term) => termAppears(text, term));
      return {
        ...doc,
        matchedTerms,
        matchPercent: Math.round((matchedTerms.length / terms.length) * 100),
      };
    })
    .filter((doc) => doc.matchedTerms.length > 0)
    .sort((a, b) => b.matchPercent - a.matchPercent || b.matchedTerms.length - a.matchedTerms.length)
    .slice(0, 6);
}

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
   File text: ${(d.content || d.ocrText || d.description || "").slice(0, 8000)}`
    )
    .join("\n\n");
}

function titleMatchesClue(message, doc) {
  const question = String(message || "").toLowerCase();
  const titleWords = meaningfulTerms(doc.title).filter((word) => word.length >= 4);
  return titleWords.some((word) => question.includes(word));
}

function scopeDocuments(allDocuments, ids) {
  const wanted = new Set((ids || []).map(String));
  return allDocuments
    .filter((doc) => wanted.has(String(doc.id)))
    .map((doc) => ({ ...doc, matchPercent: 100, scoped: true }));
}

function chooseChatDocuments(message, allDocuments, documentIds, followUpIds) {
  if (documentIds?.length) return scopeDocuments(allDocuments, documentIds);

  const titled = allDocuments.filter((doc) => titleMatchesClue(message, doc));
  if (titled.length) {
    return titled.map((doc) => ({ ...doc, matchPercent: 100, scoped: true }));
  }

  if (followUpIds?.length) {
    const kept = scopeDocuments(allDocuments, followUpIds);
    if (kept.length) return kept;
  }

  return documentsThatContainQuestion(message, allDocuments);
}

function toPlainText(text) {
  return String(text || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^[\t ]*[-*•]\s+/gm, "• ")
    .trim();
}

async function chatWithDocuments(message, allDocuments, history = [], documentIds = [], followUpIds = []) {
  const matched = chooseChatDocuments(message, allDocuments, documentIds, followUpIds);
  const scoped = matched.some((doc) => doc.scoped);

  const systemPrompt = `You answer only from the file text listed in this request.
The user may select one file or several. Use only those files.
Later questions in the same chat are follow-ups about those same files unless the user names a different file.
If a selected file does not contain the answer, say that this file does not contain that information.
If no file is listed, say that no document in the DMS matches.
Do not mention a file from earlier messages unless its title is in the list below.
Do not invent titles or facts.
Name the file you used. Keep the reply to a few sentences.

FORMAT RULES (mandatory):
- Plain text only.
- If you list items, start each line with "• " (dot bullet). Never use "-" or "*" as bullets.
- Never use markdown: no **, __, *, # headings, backticks, or tables.`;

  const contextBlock = buildContext(matched);

  const client = getOpenAI();
  if (!client) {
    return {
      reply: toPlainText(fallbackReply(message, matched)),
      references: formatReferences(matched),
      model: "fallback",
    };
  }

  try {
    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "system",
        content: matched.length
          ? `${scoped ? "Answer only from these selected files" : "Documents that contain the question words"}:\n\n${contextBlock}`
          : "No document in the DMS contains the topic of this question.",
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

    const reply = toPlainText(
      response.choices[0]?.message?.content || fallbackReply(message, matched)
    );

    return {
      reply,
      references: formatReferences(matched),
      model: process.env.OPENAI_MODEL || "gpt-4o",
    };
  } catch (err) {
    console.error("OpenAI error:", err.message);
    return {
      reply: toPlainText(fallbackReply(message, matched)),
      references: formatReferences(matched),
      model: "fallback",
      error: err.message,
    };
  }
}

function fallbackReply(message, matched) {
  if (matched.length === 0) {
    return `No document in the DMS contains that topic. The files here do not include the words from "${message}".`;
  }
  if (matched.some((doc) => doc.scoped)) {
    const names = matched.map((doc) => doc.title).join(", ");
    const excerpt = (matched[0].content || matched[0].ocrText || matched[0].description || "").slice(0, 400);
    return `Answering only from ${names}. ${excerpt ? excerpt : "These files have no stored text to quote."}`;
  }
  const top = matched[0];
  return `I found ${matched.length} document${matched.length > 1 ? "s" : ""} related to your query. The best match is ${top.title} (${top.matchPercent}% match). See the reference cards below to open them directly.`;
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
    scoped: Boolean(d.scoped),
    tags: d.tags,
  }));
}

module.exports = { chatWithDocuments };
