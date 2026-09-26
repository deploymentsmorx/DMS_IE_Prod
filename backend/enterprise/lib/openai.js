const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function isConfigured() {
  return Boolean(API_KEY);
}

async function chat(system, user, { json = false, maxTokens = 1200 } = {}) {
  if (!API_KEY) throw new Error('OpenAI API key not configured. Add OPENAI_API_KEY to backend/.env');

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
    max_tokens: maxTokens,
  };
  if (json) body.response_format = { type: 'json_object' };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI request failed (${res.status})`);
  }

  const data = await res.json();
  const content = data.choices[0].message.content.trim();
  return content
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[\t ]*[-*•]\s+/gm, '• ')
    .trim();
}

function buildDocContext(docs) {
  return docs.map(d => {
    const content = d.versions?.at(-1)?.content || d.content || '';
    return `--- Document: ${d.name} (ID: ${d.id}) ---\n${content.slice(0, 4000)}`;
  }).join('\n\n');
}

async function askDocuments({ question, documents }) {
  const context = buildDocContext(documents);
  const answer = await chat(
    'You are a document assistant for an enterprise DMS. Answer using only the provided documents. Be concise and cite document names. Plain text only: use "• " bullets when listing; never use "-", "*", **, __, # headings, backticks, or markdown.',
    `Documents:\n${context}\n\nQuestion: ${question}`,
  );
  return {
    question,
    poweredBy: 'OpenAI',
    model: MODEL,
    answers: [{ document: 'AI Assistant', answer }],
    rawAnswer: answer,
  };
}

async function understandDocument({ task, name, content }) {
  const prompts = {
    summarize: 'Summarize this document in 3-5 bullet points.',
    extract: 'Extract key information as JSON with fields: title, keyPoints (array), dates (array), people (array), amounts (array).',
    risk: 'Analyze risks. Return JSON with fields: level (low/medium/high), risks (array of strings), recommendations (array).',
    contract: 'Analyze as a contract. Return JSON with fields: parties (array), effectiveDate, keyClauses (array), obligations (array).',
  };

  const instruction = prompts[task] || 'Analyze this document and provide useful structured insight.';
  const useJson = ['extract', 'risk', 'contract'].includes(task);

  const result = await chat(
    'You are a document intelligence engine. ' + instruction,
    `Document: ${name}\n\n${content.slice(0, 8000)}`,
    { json: useJson },
  );

  let output = result;
  if (useJson) {
    try { output = JSON.parse(result); } catch { output = { analysis: result }; }
  }

  return { task, document: name, poweredBy: 'OpenAI', model: MODEL, output };
}

async function aiSearch({ query, documents, mode }) {
  const docList = documents.map(d => ({
    id: d.id,
    name: d.name,
    classification: d.classification,
    category: d.category,
    tags: d.tags,
    snippet: (d.versions?.at(-1)?.content || '').slice(0, 500),
  }));

  const raw = await chat(
    `You are an enterprise search engine (${mode} mode). Given documents and a query, return JSON: { "results": [{ "id": number, "name": string, "reason": string, "relevance": number }] }. Only include relevant documents. Sort by relevance descending.`,
    `Query: ${query}\n\nDocuments:\n${JSON.stringify(docList, null, 2)}`,
    { json: true },
  );

  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = { results: [] }; }

  return (parsed.results || []).map(r => {
    const doc = documents.find(d => d.id === r.id);
    return {
      id: r.id,
      name: r.name || doc?.name,
      source: 'Local Directory',
      classification: doc?.classification,
      score: r.relevance || 5,
      matches: [mode, 'openai'],
      snippet: r.reason || doc?.versions?.at(-1)?.content?.slice(0, 120) || '',
    };
  });
}

async function classifyDocument({ name, content }) {
  const raw = await chat(
    'Classify the document into exactly one of: Invoice, Contract, Drawing, SOP, Inspection Report, Purchase Order, Resume, Technical Specification, Document. Return JSON: { "classification": string, "confidence": number, "reason": string }',
    `Filename: ${name}\n\nContent:\n${content.slice(0, 3000)}`,
    { json: true },
  );
  try { return { ...JSON.parse(raw), poweredBy: 'OpenAI' }; }
  catch { return { classification: 'Document', confidence: 0.5, reason: raw, poweredBy: 'OpenAI' }; }
}

async function governanceScan({ name, content }) {
  const raw = await chat(
    'Scan for PII and sensitive data. Return JSON: { "pii": [{ "type": string, "label": string }], "classification": "Public"|"Internal"|"Confidential"|"Restricted", "sensitiveData": boolean, "summary": string }',
    `Document: ${name}\n\n${content.slice(0, 4000)}`,
    { json: true },
  );
  try { return { ...JSON.parse(raw), poweredBy: 'OpenAI' }; }
  catch { return { pii: [], classification: 'Internal', sensitiveData: false, summary: raw, poweredBy: 'OpenAI' }; }
}

async function extractStructured({ type, name, content }) {
  const raw = await chat(
    `Extract structured data from this ${type} document. Return JSON with relevant fields only.`,
    `Document: ${name}\n\n${content.slice(0, 6000)}`,
    { json: true },
  );
  try { return { type, fields: JSON.parse(raw), poweredBy: 'OpenAI' }; }
  catch { return { type, fields: { raw }, poweredBy: 'OpenAI' }; }
}

module.exports = {
  isConfigured,
  askDocuments,
  understandDocument,
  aiSearch,
  classifyDocument,
  governanceScan,
  extractStructured,
  model: MODEL,
};
