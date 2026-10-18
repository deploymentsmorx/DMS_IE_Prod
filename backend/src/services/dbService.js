const relationalStore = require("./relationalStore");

async function initDb() {
  relationalStore.initStore();
  console.log("ℹ️  Document index and source sessions are memory-only; no Neon or remote database is used.");
}

async function getAllDocuments() {
  return relationalStore.getDocuments();
}

async function getDocumentById(id) {
  return relationalStore.getDocumentById(id);
}

async function insertDocument(data, options = {}) {
  return relationalStore.addDocument(data, options);
}

async function persistDocument(data, options = {}) {
  return relationalStore.addDocument(data, options);
}

async function updateDocument(id, data) {
  return relationalStore.updateDocument(id, data);
}

async function deleteDocument(id) {
  return relationalStore.deleteDocument(id);
}

async function deleteByConnectionId(connectionId) {
  if (!connectionId) return 0;
  const before = relationalStore.getDocuments().length;
  relationalStore.purgeDocumentsForConnection(connectionId);
  return before - relationalStore.getDocuments().length;
}

async function deleteBySource(source) {
  if (!source) return 0;
  return relationalStore.deleteDocumentsBySource(source);
}

async function upsertMany(docs) {
  const results = [];
  for (const doc of docs) {
    const existing = relationalStore.getDocuments().find((item) => item.url === doc.url || item.title === doc.title);
    if (existing) results.push(await relationalStore.updateDocument(existing.id, doc));
    else results.push(await relationalStore.addDocument(doc));
  }
  return results;
}

module.exports = {
  initDb,
  getAllDocuments,
  getDocumentById,
  insertDocument,
  persistDocument,
  updateDocument,
  deleteDocument,
  deleteByConnectionId,
  deleteBySource,
  upsertMany,
};
