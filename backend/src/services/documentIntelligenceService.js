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

function extractMetadataHeuristic(name = "", content = "") {
  const text = `${name}\n${content || ""}`;
  const lower = text.toLowerCase();

  const dateMatch = text.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/i);
  const amountMatch = text.match(/(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d+)?/i);
  const projectMatch = text.match(/(?:project|site)\s+[A-Za-z0-9][A-Za-z0-9\s\-]{1,40}/i);
  const vendorMatch = text.match(/(?:vendor|supplier|company|client)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\s&.\-]{2,40})/i);

  let documentType = "Document";
  if (/invoice|bill|receipt/i.test(text)) documentType = "Invoice";
  else if (/contract|agreement/i.test(text)) documentType = "Contract";
  else if (/inspection|report/i.test(text)) documentType = "Inspection Report";
  else if (/drawing|dwg|cad/i.test(text)) documentType = "Drawing";
  else if (/policy|sop|handbook/i.test(text)) documentType = "Policy";
  else if (/proposal|specification/i.test(text)) documentType = "Technical Specification";

  let department = "General";
  if (/finance|invoice|budget|payment/i.test(lower)) department = "Finance";
  else if (/hr|employee|onboarding/i.test(lower)) department = "HR";
  else if (/engineering|drawing|inspection|site/i.test(lower)) department = "Engineering";

  return {
    documentType,
    projectName: projectMatch ? projectMatch[0].replace(/^(project|site)\s+/i, "").trim() : null,
    vendor: vendorMatch ? vendorMatch[1].trim() : null,
    date: dateMatch ? dateMatch[0] : null,
    amount: amountMatch ? amountMatch[0] : null,
    department,
    status: "draft",
    version: "1.0",
    extractedAt: new Date().toISOString(),
  };
}

async function extractMetadata(name, content) {
  const heuristic = extractMetadataHeuristic(name, content);
  const client = getOpenAI();
  if (!client) return { ...heuristic, source: "heuristic" };

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Extract document metadata as JSON with keys: documentType, projectName, vendor, date, department, status, summary. Use null when unknown.",
        },
        { role: "user", content: `Filename: ${name}\n\n${String(content || "").slice(0, 6000)}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 400,
    });
    const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
    return { ...heuristic, ...parsed, source: "ai" };
  } catch {
    return { ...heuristic, source: "heuristic" };
  }
}

async function summarizeDocument(name, content, task = "summarize") {
  const text = String(content || "").slice(0, 12000);
  const client = getOpenAI();
  if (!client) {
    return {
      summary: text.slice(0, 500) + (text.length > 500 ? "…" : ""),
      keyPoints: text.split(/\n+/).filter(Boolean).slice(0, 5),
      risks: [],
      model: "fallback",
    };
  }

  const prompts = {
    summarize: "Summarize this document in 3-5 bullet points.",
    keypoints: "List the key points of this document.",
    risks: "List risks, issues, or action items mentioned in this document.",
  };

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: `${prompts[task] || prompts.summarize} Return JSON: {"summary":"","keyPoints":[],"risks":[]}` },
        { role: "user", content: `Document: ${name}\n\n${text}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 700,
    });
    const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
    return { ...parsed, model: process.env.OPENAI_MODEL || "gpt-4o-mini" };
  } catch (err) {
    return {
      summary: text.slice(0, 400),
      keyPoints: [],
      risks: [],
      model: "fallback",
      error: err.message,
    };
  }
}

async function aiSearch(query, documents) {
  const matched = searchDocuments(documents, { q: query, limit: 12 });
  const client = getOpenAI();
  if (!client) {
    return {
      query,
      answer: matched.length
        ? `Found ${matched.length} matching document(s). Top match: ${matched[0].title}.`
        : `No documents matched "${query}". Connect a source or upload files first.`,
      results: matched,
      model: "keyword",
    };
  }

  const context = matched
    .slice(0, 8)
    .map((d, i) => `[${i + 1}] ${d.title} (${d.matchPercent}% match) — ${(d.content || d.description || "").slice(0, 200)}`)
    .join("\n");

  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an enterprise document search assistant. Answer using only the provided document context." },
        { role: "user", content: `Query: ${query}\n\nDocuments:\n${context || "(none)"}` },
      ],
      temperature: 0.2,
      max_tokens: 500,
    });
    return {
      query,
      answer: response.choices[0]?.message?.content || "",
      results: matched,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    };
  } catch {
    return {
      query,
      answer: matched.length ? `Found ${matched.length} document(s) for your query.` : `No matches for "${query}".`,
      results: matched,
      model: "keyword",
    };
  }
}

module.exports = {
  extractMetadata,
  extractMetadataHeuristic,
  summarizeDocument,
  aiSearch,
};
