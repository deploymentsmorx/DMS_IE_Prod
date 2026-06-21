const { AI_SEARCH_EXAMPLES, CHAT_EXAMPLES } = require("../config/aiExamples");

function uniqueStrings(items, limit = 12) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const v = String(item || "").trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

function buildSuggestions(query, { documents = [], savedSearches = [], scope = "all" } = {}) {
  const q = String(query || "").trim().toLowerCase();
  const suggestions = [];

  const docTitles = documents.map((d) => d.title || d.name).filter(Boolean);
  const docTags = documents.flatMap((d) => d.tags || []);
  const docProjects = documents.map((d) => d.metadata?.projectName || d.metadata?.project).filter(Boolean);
  const docVendors = documents.map((d) => d.metadata?.vendor).filter(Boolean);

  const pools = {
    search: [...AI_SEARCH_EXAMPLES, ...savedSearches.map((s) => s.query || s.name)],
    chat: CHAT_EXAMPLES,
    all: [...AI_SEARCH_EXAMPLES, ...CHAT_EXAMPLES, ...docTitles, ...docTags, ...docProjects, ...docVendors],
    edit: [...docTitles, ...docTags, "Updated scope", "Revised budget", "Corrected vendor name", "Added approval note"],
  };

  const pool = pools[scope] || pools.all;

  if (!q) {
    return uniqueStrings(pool, 8).map((text) => ({ text, type: "example" }));
  }

  for (const item of pool) {
    if (String(item).toLowerCase().includes(q)) {
      suggestions.push({ text: item, type: "example" });
    }
  }

  for (const title of docTitles) {
    if (title.toLowerCase().includes(q)) suggestions.push({ text: title, type: "document" });
  }

  for (const tag of docTags) {
    if (tag.toLowerCase().includes(q)) suggestions.push({ text: tag, type: "tag" });
  }

  for (const project of docProjects) {
    if (project.toLowerCase().includes(q)) suggestions.push({ text: `Project ${project}`, type: "project" });
  }

  return uniqueStrings(suggestions.map((s) => s.text), 10).map((text) => {
    const match = suggestions.find((s) => s.text === text);
    return match || { text, type: "text" };
  });
}

module.exports = { buildSuggestions };
