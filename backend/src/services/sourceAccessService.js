const store = require("./relationalStore");
const { isDemoDocument } = require("./documentFilterService");

const DOC_SOURCE_TO_CONN = {
  google_drive: "google_drive",
  onedrive: "onedrive",
  neondb: "neondb",
  dropbox: "dropbox",
  box: "box",
  sharepoint: "sharepoint",
  local: "local_directory",
  smb: "smb",
  nas: "nas",
  ftp: "ftp",
  sftp: "sftp",
  sap: "sap",
  teams: "teams",
};

function getConnectedTypes() {
  return new Set(store.getConnectedSources().map((c) => c.type));
}

function isDocumentAccessible(doc) {
  if (isDemoDocument(doc)) return false;
  const connected = getConnectedTypes();
  const connType = DOC_SOURCE_TO_CONN[doc.source];
  if (!connType) return false;
  return connected.has(connType);
}

function filterAccessibleDocuments(docs) {
  return docs.filter(isDocumentAccessible);
}

function buildStats(docs) {
  const visible = filterAccessibleDocuments(docs);
  const bySource = {};
  const byFileType = {};
  const byCategory = {};
  const byDepartment = {};

  for (const d of visible) {
    bySource[d.source] = (bySource[d.source] || 0) + 1;
    byFileType[d.fileType] = (byFileType[d.fileType] || 0) + 1;
    const cat = d.category || "other";
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    const dept = d.department || d.category || "other";
    byDepartment[dept] = (byDepartment[dept] || 0) + 1;
  }

  return {
    total: visible.length,
    bySource,
    byFileType,
    byCategory,
    byDepartment,
  };
}

module.exports = {
  isDocumentAccessible,
  filterAccessibleDocuments,
  buildStats,
  getConnectedTypes,
  isDemoDocument,
};
