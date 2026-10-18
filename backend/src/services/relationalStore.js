const path = require("path");

const DEPARTMENTS = ["finance", "hr", "project", "admin", "engineering", "logistics", "other"];

let store = null;
const transientFiles = new Map();
let nextIds = { doc: 9, revision: 1, node: 1, edge: 1, defect: 1, folder: 1, source: 1 };

function defaultStore() {
  return {
    documents: [],
    revisions: [],
    graphNodes: [],
    graphEdges: [],
    defects: [],
    connectedFolders: [],
    connectedSources: [],
  };
}

function initializeMemoryStore() {
  store = defaultStore();
  transientFiles.clear();
  nextIds = { doc: 1, revision: 1, node: 1, edge: 1, defect: 1, folder: 1, source: 1 };
}

function saveStore() {
  // Document index, folder settings, and source sessions remain in memory only.
}

function guessDepartment(nameOrPath) {
  const s = (nameOrPath || "").toLowerCase();
  if (/finance|invoice|bill|budget|account/.test(s)) return "finance";
  if (/hr|human|employee|payroll|handbook/.test(s)) return "hr";
  if (/project|site|construction|engineering/.test(s)) return "project";
  if (/admin|office|policy|compliance/.test(s)) return "admin";
  if (/logistic|warehouse|shipment|freight/.test(s)) return "logistics";
  if (/cad|dwg|drawing|inspection/.test(s)) return "engineering";
  return "other";
}

function extToFileType(ext) {
  const e = (ext || "").toLowerCase().replace(".", "");
  const map = { pdf: "pdf", docx: "docx", doc: "docx", xlsx: "xlsx", xls: "xlsx", pptx: "pptx", dwg: "dwg", dxf: "dwg", png: "image", jpg: "image", jpeg: "image", txt: "other", csv: "xlsx" };
  return map[e] || "other";
}

function formatBytes(b) {
  if (!b) return "";
  if (b > 1e6) return (b / 1e6).toFixed(1) + " MB";
  return (b / 1e3).toFixed(0) + " KB";
}

function mapDocument(d) {
  return {
    id: String(d.id),
    title: d.title,
    description: d.description || "",
    content: d.content || "",
    tags: d.tags || [],
    category: d.category || d.department || "other",
    department: d.department || d.category || "other",
    source: d.source || "manual",
    url: d.url || "",
    fileType: d.fileType || d.file_type || "other",
    size: d.size || "",
    folderPath: d.folderPath || "",
    filePath: d.filePath || null,
    connectionId: d.connectionId ? String(d.connectionId) : null,
    revision: d.revision || 1,
    parentDocId: d.parentDocId || null,
    addedAt: d.addedAt || new Date().toISOString(),
  };
}

function getDocuments() {
  return store.documents.map(mapDocument);
}

function getDocumentById(id) {
  const d = store.documents.find((x) => String(x.id) === String(id));
  return d ? mapDocument(d) : null;
}

function addDocument(data, options = {}) {
  const existing = store.documents.find(
    (d) => d.filePath && data.filePath && d.filePath === data.filePath
  );

  if (existing) {
    return createRevision(existing, data);
  }

  const doc = {
    id: String(nextIds.doc++),
    title: data.title,
    description: data.description || "",
    content: data.content || data.description || "",
    tags: Array.isArray(data.tags) ? data.tags : (data.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
    category: data.category || data.department || "other",
    department: data.department || data.category || guessDepartment(data.title),
    source: data.source || "upload",
    url: data.url || (data.filePath ? `/api/files/${path.basename(data.filePath)}` : ""),
    fileType: data.fileType || "other",
    size: data.size || "",
    folderPath: data.folderPath || "",
    filePath: data.filePath || null,
    connectionId: data.connectionId ? String(data.connectionId) : null,
    revision: 1,
    parentDocId: null,
    addedAt: new Date().toISOString(),
  };

  store.documents.unshift(doc);
  if (!options.deferSave) saveStore();
  return mapDocument(doc);
}

function flushStore() {
  saveStore();
}

function createRevision(existing, newData) {
  const revNum = (existing.revision || 1) + 1;
  store.revisions.push({
    id: String(nextIds.revision++),
    documentId: String(existing.id),
    revision: existing.revision || 1,
    title: existing.title,
    content: existing.content,
    filePath: existing.filePath,
    url: existing.url,
    savedAt: new Date().toISOString(),
    changeNote: newData.changeNote || "Updated from folder sync/upload",
  });

  Object.assign(existing, {
    title: newData.title || existing.title,
    description: newData.description || existing.description,
    content: newData.content || existing.content,
    filePath: newData.filePath || existing.filePath,
    url: newData.url || existing.url,
    size: newData.size || existing.size,
    revision: revNum,
    addedAt: new Date().toISOString(),
  });

  saveStore();
  return mapDocument(existing);
}

function updateDocument(id, data) {
  const idx = store.documents.findIndex((d) => String(d.id) === String(id));
  if (idx === -1) return null;
  store.documents[idx] = { ...store.documents[idx], ...data, id: String(id) };
  saveStore();
  return mapDocument(store.documents[idx]);
}

function deleteDocument(id) {
  const idx = store.documents.findIndex((d) => String(d.id) === String(id));
  if (idx === -1) return false;
  store.documents.splice(idx, 1);
  transientFiles.delete(String(id));
  saveStore();
  return true;
}

function deleteDocumentsBySource(docSource) {
  if (!docSource) return 0;
  const before = store.documents.length;
  for (const doc of store.documents) {
    if (doc.source === docSource) transientFiles.delete(String(doc.id));
  }
  store.documents = store.documents.filter((d) => d.source !== docSource);
  const removed = before - store.documents.length;
  if (removed > 0) saveStore();
  return removed;
}

function clearConnectedSources() {
  store.connectedSources = [];
  saveStore();
}

function purgeSourcesAndConnections(docSources, connectionCount, docCountBefore) {
  const sources = new Set(docSources || []);
  const before = docCountBefore ?? store.documents.length;
  for (const doc of store.documents) {
    if (sources.has(doc.source)) transientFiles.delete(String(doc.id));
  }
  store.documents = store.documents.filter((d) => !sources.has(d.source));
  store.connectedSources = [];
  saveStore();
  return {
    disconnected: connectionCount ?? 0,
    documentsRemoved: before - store.documents.length,
  };
}

function getRevisions(docId) {
  return store.revisions
    .filter((r) => String(r.documentId) === String(docId))
    .sort((a, b) => b.revision - a.revision);
}

function getRevisionCount(allowedDocumentIds) {
  if (!allowedDocumentIds) return (store.revisions || []).length;
  const allowed = new Set([...allowedDocumentIds].map(String));
  return (store.revisions || []).filter((revision) => allowed.has(String(revision.documentId))).length;
}

function getGraph() {
  const docNodes = store.documents.map((d) => ({
    id: `doc-${d.id}`,
    type: "document",
    label: d.title,
    meta: { docId: d.id, department: d.department, fileType: d.fileType },
  }));

  const deptNodes = [...new Set(store.documents.map((d) => d.department))].map((dept) => ({
    id: `dept-${dept}`,
    type: "department",
    label: dept,
    meta: {},
  }));

  const docEdges = store.documents.map((d) => ({
    id: `de-${d.id}`,
    fromId: `doc-${d.id}`,
    toId: `dept-${d.department || "other"}`,
    relation: "belongs_to",
    fromType: "document",
    toType: "department",
  }));

  return {
    nodes: [...store.graphNodes, ...docNodes, ...deptNodes],
    edges: [...store.graphEdges, ...docEdges],
  };
}

function addGraphEdge(edge) {
  const e = { id: String(nextIds.edge++), ...edge };
  store.graphEdges.push(e);
  saveStore();
  return e;
}

function getDefects() {
  return [...store.defects];
}

function addDefect(data) {
  const defect = { id: String(nextIds.defect++), status: "open", ...data };
  store.defects.push(defect);
  saveStore();
  return defect;
}

function getDefectAnalytics(allowedDocumentIds) {
  const allowed = allowedDocumentIds ? new Set([...allowedDocumentIds].map(String)) : null;
  const defects = allowed
    ? store.defects.filter((defect) => !defect.documentId || allowed.has(String(defect.documentId)))
    : store.defects;
  const bySeverity = {};
  const byStatus = {};
  const byProject = {};
  const byDepartment = {};

  for (const d of defects) {
    bySeverity[d.severity] = (bySeverity[d.severity] || 0) + 1;
    byStatus[d.status] = (byStatus[d.status] || 0) + 1;
    byProject[d.project || "Unknown"] = (byProject[d.project || "Unknown"] || 0) + 1;
    const doc = store.documents.find((x) => String(x.id) === String(d.documentId));
    const dept = doc?.department || "other";
    byDepartment[dept] = (byDepartment[dept] || 0) + 1;
  }

  return {
    total: defects.length,
    open: defects.filter((d) => d.status === "open").length,
    bySeverity,
    byStatus,
    byProject,
    byDepartment,
    recent: defects.slice(-5).reverse(),
  };
}

function addConnectedFolder(data) {
  const folder = {
    id: `folder_${nextIds.folder++}`,
    path: data.path,
    department: data.department || guessDepartment(data.path),
    label: data.label || path.basename(data.path),
    connectedAt: new Date().toISOString(),
    fileCount: data.fileCount || 0,
    accessControl: data.accessControl || {
      locked: true,
      allowedRoles: [],
      allowedUsers: [],
    },
  };
  const existing = store.connectedFolders.find((f) => f.path === data.path);
  if (existing) {
    Object.assign(existing, folder, {
      id: existing.id,
      accessControl: existing.accessControl || folder.accessControl,
    });
    saveStore();
    return existing;
  }
  store.connectedFolders.push(folder);
  saveStore();
  return folder;
}

function getConnectedFolders() {
  return [...store.connectedFolders];
}

function addConnectedSource(data) {
  const src = {
    id: String(nextIds.source++),
    type: data.type,
    label: data.label,
    config: data.config || {},
    status: data.status || "connected",
    documentCount: data.documentCount || 0,
    lastSync: data.lastSync || null,
    lastError: data.lastError || null,
    connectedAt: new Date().toISOString(),
    accessControl: data.accessControl || {
      locked: true,
      allowedRoles: [],
      allowedUsers: [],
    },
  };
  store.connectedSources = store.connectedSources || [];
  store.connectedSources.push(src);
  saveStore();
  return src;
}

function getConnectedSources() {
  return [...(store.connectedSources || [])];
}

function getConnectedSource(id) {
  return (store.connectedSources || []).find((s) => String(s.id) === String(id)) || null;
}

function updateConnectedFolder(id, data) {
  const idx = (store.connectedFolders || []).findIndex((f) => String(f.id) === String(id));
  if (idx === -1) return null;
  store.connectedFolders[idx] = { ...store.connectedFolders[idx], ...data, id: String(id) };
  saveStore();
  return store.connectedFolders[idx];
}

function updateConnectedSource(id, data) {
  const idx = (store.connectedSources || []).findIndex((s) => String(s.id) === String(id));
  if (idx === -1) return null;
  store.connectedSources[idx] = { ...store.connectedSources[idx], ...data, id: String(id) };
  saveStore();
  return store.connectedSources[idx];
}

function removeConnectedSource(id) {
  const idx = (store.connectedSources || []).findIndex((s) => String(s.id) === String(id));
  if (idx === -1) return false;
  store.connectedSources.splice(idx, 1);
  saveStore();
  return true;
}

function removeConnectedSourceAndPurgeDocs(id, docSource) {
  const idx = (store.connectedSources || []).findIndex((s) => String(s.id) === String(id));
  if (idx === -1) return false;
  store.connectedSources.splice(idx, 1);
  purgeDocumentsForConnection(String(id));
  if (docSource) {
    store.documents = store.documents.filter(
      (d) => !(d.source === docSource && !d.connectionId)
    );
  }
  saveStore();
  return true;
}

function purgeDocumentsForConnection(connectionId) {
  const removed = store.documents.filter((d) => String(d.connectionId || "") === String(connectionId));
  for (const doc of removed) transientFiles.delete(String(doc.id));
  store.documents = store.documents.filter(
    (d) => String(d.connectionId || "") !== String(connectionId)
  );
}

function putTransientFile(id, file) {
  transientFiles.set(String(id), {
    buffer: Buffer.from(file.buffer),
    originalName: String(file.originalName || "document"),
    mimeType: String(file.mimeType || "application/octet-stream"),
  });
}

function getTransientFile(id) {
  return transientFiles.get(String(id)) || null;
}

function initStore() {
  initializeMemoryStore();
  if (!store.connectedSources) store.connectedSources = [];
}

module.exports = {
  DEPARTMENTS,
  initStore,
  saveStore,
  guessDepartment,
  extToFileType,
  formatBytes,
  getDocuments,
  getDocumentById,
  addDocument,
  flushStore,
  updateDocument,
  deleteDocument,
  deleteDocumentsBySource,
  clearConnectedSources,
  purgeSourcesAndConnections,
  createRevision,
  getRevisions,
  getRevisionCount,
  getGraph,
  addGraphEdge,
  getDefects,
  addDefect,
  getDefectAnalytics,
  addConnectedFolder,
  getConnectedFolders,
  updateConnectedFolder,
  addConnectedSource,
  getConnectedSources,
  getConnectedSource,
  updateConnectedSource,
  removeConnectedSource,
  removeConnectedSourceAndPurgeDocs,
  purgeDocumentsForConnection,
  putTransientFile,
  getTransientFile,
};
