const { expandQueryTerms, detectLanguage } = require("./multilingualSearchService");

const WEIGHTS = {
  titleExact: 35,
  titlePartial: 15,
  tagExact: 12,
  tagPartial: 8,
  category: 10,
  description: 6,
  content: 5,
  fileType: 5,
  source: 3,
};

const MAX_RAW_SCORE = 100;

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
    .filter((w) => w.length > 0);
}

function buildSearchableText(doc) {
  const meta = doc.metadata || {};
  return [
    doc.title,
    doc.description,
    doc.content,
    doc.ocrText,
    (doc.tags || []).join(" "),
    doc.category,
    doc.department,
    doc.fileType,
    doc.source,
    meta.documentType,
    meta.projectName,
    meta.vendor,
    meta.department,
    meta.status,
    JSON.stringify(meta),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreWord(doc, word) {
  let score = 0;
  const title = (doc.title || "").toLowerCase();
  const desc = (doc.description || "").toLowerCase();
  const content = (doc.content || "").toLowerCase();
  const category = (doc.category || "").toLowerCase();
  const tags = (doc.tags || []).map((t) => t.toLowerCase());
  const fileType = (doc.fileType || "").toLowerCase();
  const source = (doc.source || "").toLowerCase();
  const needle = String(word || "").toLowerCase();

  if (!needle) return 0;

  if (title === needle) score += WEIGHTS.titleExact;
  else if (title.includes(needle)) score += WEIGHTS.titlePartial;

  if (tags.some((t) => t === needle)) score += WEIGHTS.tagExact;
  else if (tags.some((t) => t.includes(needle))) score += WEIGHTS.tagPartial;

  if (category === needle || category.includes(needle)) score += WEIGHTS.category;
  if (desc.includes(needle)) score += WEIGHTS.description;
  if (content.includes(needle)) score += WEIGHTS.content;
  if (fileType === needle) score += WEIGHTS.fileType;
  if (source.includes(needle)) score += WEIGHTS.source;

  return score;
}

function scoreDocument(doc, query, lang) {
  if (!query || !query.trim()) {
    return { rawScore: 0, matchPercent: 0, matchedTerms: [], detectedLang: lang || "en" };
  }

  const expansion = expandQueryTerms(query, lang);
  const words = expansion.terms.length ? expansion.terms : tokenize(query);
  if (!words.length) {
    return { rawScore: 0, matchPercent: 0, matchedTerms: [], detectedLang: expansion.detectedLang };
  }

  let rawScore = 0;
  const matchedTerms = [];
  const searchable = buildSearchableText(doc);

  for (const word of words) {
    const wordScore = scoreWord(doc, word);
    if (wordScore > 0) {
      rawScore += wordScore;
      matchedTerms.push(word);
    } else if (searchable.includes(word)) {
      rawScore += 2;
      matchedTerms.push(word);
    }
  }

  const uniqueMatched = [...new Set(matchedTerms)];
  const termCoverage = uniqueMatched.length / Math.max(words.length, 1);
  const normalized = Math.min(rawScore / (Math.min(words.length, 8) * 12), 1);
  const matchPercent = Math.round(
    Math.min(100, normalized * 70 + termCoverage * 30)
  );

  return {
    rawScore: Math.round(rawScore * 10) / 10,
    matchPercent,
    matchedTerms: uniqueMatched,
    detectedLang: expansion.detectedLang,
  };
}

function highlightSnippet(doc, query, maxLen = 160) {
  const text = doc.description || doc.content || doc.title || "";
  if (!query || !text) return text.slice(0, maxLen);

  const words = tokenize(query);
  const lower = text.toLowerCase();
  let bestIdx = -1;

  for (const w of words) {
    const idx = lower.indexOf(w);
    if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) bestIdx = idx;
  }

  if (bestIdx === -1) return text.slice(0, maxLen) + (text.length > maxLen ? "…" : "");

  const start = Math.max(0, bestIdx - 40);
  const snippet = text.slice(start, start + maxLen);
  return (start > 0 ? "…" : "") + snippet + (start + maxLen < text.length ? "…" : "");
}

const { normalizeLang } = require("./multilingualSearchService");

function searchDocuments(documents, { q, source, fileType, category, department, limit = 50, lang }) {
  const langPref = normalizeLang(lang);
  let results = [...documents];

  if (source && source !== "all") {
    results = results.filter((d) => d.source === source);
  }
  if (fileType && fileType !== "all") {
    results = results.filter((d) => d.fileType === fileType);
  }
  const deptFilter = department && department !== "all" ? department : category && category !== "all" ? category : null;
  if (deptFilter) {
    results = results.filter((d) => d.department === deptFilter || d.category === deptFilter);
  }

  const hasQuery = q && q.trim();

  let searchMeta = {
    detectedLang: langPref === "auto" ? detectLanguage(q || "") : langPref,
    multilingual: false,
  };

  results = results
    .map((doc) => {
      const scoring = scoreDocument(doc, q, langPref);
      if (scoring.detectedLang) searchMeta.detectedLang = scoring.detectedLang;
      if (hasQuery) searchMeta.multilingual = true;
      return {
        ...doc,
        score: scoring.rawScore,
        matchPercent: scoring.matchPercent,
        matchedTerms: scoring.matchedTerms,
        snippet: highlightSnippet(doc, q),
      };
    })
    .filter((d) => !hasQuery || d.matchPercent > 0)
    .sort(
      (a, b) =>
        b.matchPercent - a.matchPercent ||
        b.score - a.score ||
        new Date(b.addedAt) - new Date(a.addedAt)
    )
    .slice(0, limit);

  results.searchMeta = searchMeta;
  return results;
}

function contentTokens(text) {
  return new Set(
    tokenize(text).filter((w) => w.length > 3)
  );
}

function findSimilarDocuments(targetDoc, documents, limit = 5) {
  const targetText = [targetDoc.title, targetDoc.description, targetDoc.content, (targetDoc.tags || []).join(" ")].join(" ");
  const targetSet = contentTokens(targetText);
  if (!targetSet.size) return [];

  return documents
    .filter((d) => String(d.id) !== String(targetDoc.id))
    .map((doc) => {
      const text = [doc.title, doc.description, doc.content, (doc.tags || []).join(" ")].join(" ");
      const tokens = contentTokens(text);
      let overlap = 0;
      for (const t of targetSet) {
        if (tokens.has(t)) overlap++;
      }
      const similarity = Math.round((overlap / Math.max(targetSet.size, 1)) * 100);
      return { ...doc, similarity, snippet: highlightSnippet(doc, targetDoc.title) };
    })
    .filter((d) => d.similarity >= 15)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

module.exports = {
  searchDocuments,
  scoreDocument,
  tokenize,
  findSimilarDocuments,
};
