const crypto = require('crypto');
const db = require('./db');

const DOCUMENTS_FILE = 'documents.json';
const AUTHORS_FILE = 'authors.json';
const versionContents = new Map();
const originalFiles = new Map();

function readJson(file, fallback) {
  return db.read(file, fallback);
}

function writeJson(file, data) {
  db.write(file, data);
}

function docDir(docId) {
  return String(docId);
}

function versionPath(docId, versionId) {
  return `${docId}:${versionId}`;
}

function filePath(docId) {
  return `${docId}:current`;
}

function ensureDocDir(docId) { return docDir(docId); }

function getAuthors() {
  return readJson(AUTHORS_FILE, []);
}

function getDocuments() {
  return readJson(DOCUMENTS_FILE, []);
}

function saveDocuments(docs) {
  writeJson(DOCUMENTS_FILE, docs);
}

function readVersionContent(docId, versionId) {
  return versionContents.get(versionPath(docId, versionId)) || '';
}

function writeVersionContent(docId, versionId, content) {
  versionContents.set(versionPath(docId, versionId), String(content || ''));
  versionContents.set(filePath(docId), String(content || ''));
}

function saveOriginalFile(docId, buffer, originalName) {
  if (!Buffer.isBuffer(buffer)) return;
  originalFiles.set(String(docId), {
    buffer: Buffer.from(buffer),
    originalName: String(originalName || 'document'),
  });
}

function getOriginalFile(docId) {
  return originalFiles.get(String(docId)) || null;
}

function deleteDocument(docId, userId) {
  const docs = getDocuments();
  const index = docs.findIndex((doc) => doc.id === Number(docId));
  if (index < 0) return null;
  const [removed] = docs.splice(index, 1);
  saveDocuments(docs);
  originalFiles.delete(String(docId));
  for (const key of versionContents.keys()) {
    if (key.startsWith(`${docId}:`)) versionContents.delete(key);
  }
  db.appendAudit({ action: 'document_deleted', userId, documentId: docId, name: removed.name });
  return removed;
}

function enrichDocument(doc) {
  const versions = doc.versions.map(v => ({
    ...v,
    content: readVersionContent(doc.id, v.id),
  }));
  return { ...doc, versions };
}

function getDocument(id) {
  const doc = getDocuments().find(d => d.id === Number(id));
  return doc ? enrichDocument(doc) : null;
}

function listDocumentsSummary(folderId) {
  let docs = getDocuments();
  if (folderId && folderId !== 'root') docs = docs.filter(d => d.folderId === folderId);
  return docs.map(doc => {
    const last = doc.versions[doc.versions.length - 1];
    return {
      id: doc.id,
      name: doc.name,
      folderId: doc.folderId,
      mimeType: doc.mimeType,
      size: doc.size,
      classification: doc.classification,
      category: doc.category,
      labels: doc.labels,
      tags: doc.tags,
      checkedOutBy: doc.checkedOutBy,
      versionCount: doc.versions.length,
      lastAuthor: last.author,
      lastOrganization: last.organization,
      lastTime: last.time,
      lastMessage: last.message,
    };
  });
}

function detectClassification(name, content) {
  const n = name.toLowerCase();
  const c = (content || '').toLowerCase();
  if (n.includes('invoice') || c.includes('invoice total')) return 'Invoice';
  if (n.includes('contract') || c.includes('agreement between')) return 'Contract';
  if (n.includes('drawing') || n.includes('.dwg')) return 'Drawing';
  if (n.includes('policy') || n.includes('sop')) return 'SOP';
  if (n.includes('inspection') || n.includes('meeting')) return 'Inspection Report';
  if (n.includes('purchase') || n.includes('po-')) return 'Purchase Order';
  if (n.includes('resume') || n.includes('cv')) return 'Resume';
  if (n.includes('proposal') || n.includes('spec')) return 'Technical Specification';
  return 'Document';
}

function autoTags(name, content) {
  const tags = [];
  if (/202[4-9]/.test(name + content)) tags.push('recent');
  if (/budget|cost|price/i.test(content)) tags.push('financial');
  if (/policy|compliance|gdpr|hipaa/i.test(content)) tags.push('compliance');
  return tags;
}

function createDocument({ name, author, organization, content, message, folderId, mimeType, size, userId }) {
  const docs = getDocuments();
  const id = docs.length ? Math.max(...docs.map(d => d.id)) + 1 : 1;
  const classification = detectClassification(name, content);
  const version = {
    id: 'v1',
    author,
    organization,
    time: new Date().toISOString(),
    message: message || 'Initial upload',
  };
  const doc = {
    id,
    name,
    fileName: slugify(name),
    folderId: folderId || 'root',
    mimeType: mimeType || 'text/plain',
    size: size || (content || '').length,
    classification,
    category: 'General',
    labels: [],
    tags: autoTags(name, content),
    metadata: {},
    checkedOutBy: null,
    ocrText: '',
    versions: [version],
  };
  docs.push(doc);
  saveDocuments(docs);
  writeVersionContent(id, 'v1', content || '(Empty document)');
  db.appendAudit({ action: 'document_created', userId, documentId: id, name });
  return enrichDocument(doc);
}

function saveVersion(docId, { author, organization, content, message, userId }) {
  const docs = getDocuments();
  const idx = docs.findIndex(d => d.id === Number(docId));
  if (idx === -1) return null;
  const doc = docs[idx];
  if (doc.checkedOutBy && doc.checkedOutBy !== author) {
    return { error: `Document is checked out by ${doc.checkedOutBy}` };
  }
  const newId = `v${doc.versions.length + 1}`;
  doc.versions.push({
    id: newId,
    author,
    organization,
    time: new Date().toISOString(),
    message: message || 'Updated document',
  });
  doc.size = (content || '').length;
  doc.tags = [...new Set([...doc.tags, ...autoTags(doc.name, content)])];
  saveDocuments(docs);
  writeVersionContent(doc.id, newId, content);
  db.appendAudit({ action: 'version_saved', userId, documentId: doc.id, version: newId });
  return enrichDocument(doc);
}

function rollbackVersion(docId, versionId, { author, userId }) {
  const doc = getDocument(docId);
  if (!doc) return null;
  const ver = doc.versions.find(v => v.id === versionId);
  if (!ver) return null;
  return saveVersion(docId, {
    author,
    organization: ver.organization,
    content: ver.content,
    message: `Restored from ${versionId}`,
    userId,
  });
}

function checkoutDocument(docId, userName, userId) {
  const docs = getDocuments();
  const doc = docs.find(d => d.id === Number(docId));
  if (!doc) return null;
  if (doc.checkedOutBy && doc.checkedOutBy !== userName) {
    return { error: `Already checked out by ${doc.checkedOutBy}` };
  }
  doc.checkedOutBy = userName;
  saveDocuments(docs);
  db.appendAudit({ action: 'checkout', userId, documentId: docId, user: userName });
  return doc;
}

function checkinDocument(docId, { author, organization, content, message, userId }) {
  const docs = getDocuments();
  const doc = docs.find(d => d.id === Number(docId));
  if (!doc) return null;
  doc.checkedOutBy = null;
  saveDocuments(docs);
  db.appendAudit({ action: 'checkin', userId, documentId: docId });
  if (content !== undefined) {
    return saveVersion(docId, { author, organization, content, message, userId });
  }
  return enrichDocument(doc);
}

function updateMetadata(docId, updates, userId) {
  const docs = getDocuments();
  const doc = docs.find(d => d.id === Number(docId));
  if (!doc) return null;
  if (updates.metadata) doc.metadata = { ...doc.metadata, ...updates.metadata };
  if (updates.category) doc.category = updates.category;
  if (updates.labels) doc.labels = updates.labels;
  if (updates.tags) doc.tags = updates.tags;
  saveDocuments(docs);
  db.appendAudit({ action: 'metadata_updated', userId, documentId: docId });
  return doc;
}

function runOcr(docId, userId) {
  const doc = getDocument(docId);
  if (!doc) return null;
  const content = doc.versions[doc.versions.length - 1].content;
  const ocrText = `[OCR] ${content.replace(/\n/g, ' ').slice(0, 500)}`;
  const docs = getDocuments();
  const d = docs.find(x => x.id === Number(docId));
  d.ocrText = ocrText;
  saveDocuments(docs);
  db.appendAudit({ action: 'ocr_processed', userId, documentId: docId });
  return { ocrText, extracted: { lines: content.split('\n').length } };
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
}

function getFolders() {
  return readJson('folders.json', []);
}

function unifiedSearch({ q, mode, repos, userId }) {
  const query = (q || '').toLowerCase().trim();
  const docs = getDocuments().map(d => enrichDocument(d));
  const connectors = readJson('connectors.json', []);
  const results = [];

  for (const doc of docs) {
    const content = doc.versions[doc.versions.length - 1].content;
    let score = 0;
    const matches = [];

    if (!query) continue;

    if (doc.name.toLowerCase().includes(query)) { score += 10; matches.push('filename'); }
    if (doc.classification?.toLowerCase().includes(query)) { score += 8; matches.push('classification'); }
    if (doc.category?.toLowerCase().includes(query)) { score += 6; matches.push('category'); }
    if (doc.tags?.some(t => t.includes(query))) { score += 5; matches.push('tags'); }
    if (JSON.stringify(doc.metadata).toLowerCase().includes(query)) { score += 5; matches.push('metadata'); }
    if (content.toLowerCase().includes(query)) { score += 4; matches.push('fulltext'); }
    if (doc.ocrText?.toLowerCase().includes(query)) { score += 7; matches.push('ocr'); }

    if (mode === 'natural' || mode === 'semantic' || mode === 'ai') {
      const words = query.split(/\s+/);
      for (const w of words) {
        if (w.length > 3 && (content + doc.name).toLowerCase().includes(w)) score += 2;
      }
      if (/approved by|from 20\d{2}|project/i.test(query)) score += 3;
    }

    if (score > 0) {
      results.push({
        id: doc.id,
        name: doc.name,
        source: 'Local Directory',
        classification: doc.classification,
        score,
        matches,
        snippet: content.slice(0, 120),
      });
    }
  }

  if (repos && repos.length) {
    for (const conn of connectors) {
      if (repos.includes(conn.id) && conn.id !== 'local') {
        if (query && conn.name.toLowerCase().includes(query.split(' ')[0])) {
          results.push({
            id: `conn-${conn.id}`,
            name: `${conn.name} — connector ready`,
            source: conn.name,
            classification: 'Connector',
            score: 1,
            matches: ['enterprise'],
            snippet: `Search index pending for ${conn.name}`,
          });
        }
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  db.appendAudit({ action: 'search', userId, query, mode, resultCount: results.length });
  return { query, mode: mode || 'standard', results, total: results.length };
}

function detectPii(text) {
  const findings = [];
  if (/\b[\w.-]+@[\w.-]+\.\w+\b/.test(text)) findings.push({ type: 'email', label: 'Email address' });
  if (/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(text)) findings.push({ type: 'phone', label: 'Phone number' });
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) findings.push({ type: 'ssn', label: 'SSN pattern' });
  if (/\b(?:credit card|visa|mastercard)\b/i.test(text)) findings.push({ type: 'financial', label: 'Financial reference' });
  return findings;
}

function aiQuery({ question, documentIds }) {
  const docs = documentIds?.length
    ? documentIds.map(id => getDocument(id)).filter(Boolean)
    : getDocuments().map(d => enrichDocument(d));

  const q = question.toLowerCase();
  const answers = [];

  for (const doc of docs) {
    const content = doc.versions[doc.versions.length - 1].content;
    if (q.includes('summarize') || q.includes('summary')) {
      answers.push({ document: doc.name, answer: content.slice(0, 200) + '…' });
    } else if (q.includes('compare')) {
      answers.push({ document: doc.name, answer: `${doc.name}: ${doc.versions.length} saved copies, last edited by ${doc.versions.at(-1).author}` });
    } else {
      const lines = content.split('\n').filter(l => q.split(' ').some(w => w.length > 3 && l.toLowerCase().includes(w)));
      if (lines.length) answers.push({ document: doc.name, answer: lines.slice(0, 3).join(' ') });
    }
  }

  return {
    question,
    answers: answers.length ? answers : [{ document: 'System', answer: 'No matching content found. Try uploading more documents or refining your question.' }],
  };
}

module.exports = {
  getAuthors,
  getDocuments,
  getDocument,
  listDocumentsSummary,
  createDocument,
  saveVersion,
  rollbackVersion,
  checkoutDocument,
  checkinDocument,
  updateMetadata,
  runOcr,
  getFolders,
  unifiedSearch,
  detectClassification,
  detectPii,
  aiQuery,
  readVersionContent,
  writeVersionContent,
  saveOriginalFile,
  getOriginalFile,
  deleteDocument,
  ensureDocDir,
  docDir,
};
