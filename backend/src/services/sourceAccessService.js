const store = require("./relationalStore");
const { isDemoDocument } = require("./documentFilterService");
const authService = require("./authService");

const DOC_SOURCE_TO_CONN = {
  google_drive: "google_drive",
  onedrive: "onedrive",
  dropbox: "dropbox",
  box: "box",
  sharepoint: "sharepoint",
  local: "local_directory",
  smb: "smb",
  nas: "nas",
  ftp: "ftp",
  sftp: "sftp",
  sap: "sap",
  folder: "folder",
};

function normalizeValue(value) {
  return String(value || "").trim().toLowerCase();
}

function getAccessControl(connection) {
  const current = connection?.accessControl || {};
  return {
    locked: current.locked === undefined ? true : Boolean(current.locked),
    allowedRoles: Array.isArray(current.allowedRoles) ? current.allowedRoles : [],
    allowedUsers: Array.isArray(current.allowedUsers) ? current.allowedUsers : [],
  };
}

function isConnectionAccessible(connection, user) {
  if (!connection) return false;
  const access = getAccessControl(connection);
  if (!access.locked || authService.isAdmin(user)) return true;
  if (!user) return false;

  const roles = new Set(access.allowedRoles.map(normalizeValue));
  const users = new Set(access.allowedUsers.map(normalizeValue));
  return (
    roles.has(normalizeValue(user.role)) ||
    users.has(normalizeValue(user.id)) ||
    users.has(normalizeValue(user.username))
  );
}

function getConnectionsForDocument(doc) {
  const sources = store.getConnectedSources();
  const folders = store.getConnectedFolders();
  const connectionId = String(doc?.connectionId || "");

  if (connectionId) {
    const exact = sources.filter((connection) => String(connection.id) === connectionId);
    if (exact.length) return exact;
    const exactFolder = folders.filter((folder) => String(folder.id) === connectionId);
    if (exactFolder.length) return exactFolder;
  }

  if (doc?.source === "folder") {
    const folderPath = normalizeValue(doc.folderPath);
    const matching = folders.filter((folder) =>
      folderPath && normalizeValue(folder.path) === folderPath
    );
    return matching.length ? matching : folders;
  }

  const type = DOC_SOURCE_TO_CONN[doc?.source];
  return type ? sources.filter((connection) => connection.type === type) : [];
}

function getConnectedTypes() {
  return new Set(store.getConnectedSources().map((c) => c.type));
}

function isDocumentAccessible(doc) {
  return isDocumentAccessibleForUser(doc, null);
}

function isDocumentAccessibleForUser(doc, user) {
  if (doc?.source === "enterprise") return true;
  if (isDemoDocument(doc)) return false;
  const connections = getConnectionsForDocument(doc);
  if (!connections.length) return false;
  return connections.every((connection) => isConnectionAccessible(connection, user));
}

function filterAccessibleDocuments(docs, user) {
  return docs.filter((doc) => isDocumentAccessibleForUser(doc, user));
}

function filterAccessibleConnections(connections, user) {
  return connections.filter((connection) => isConnectionAccessible(connection, user));
}

function filterAccessibleGraph(graph, visibleDocuments) {
  const docs = visibleDocuments || [];
  const allowedDocIds = new Set(docs.map((doc) => String(doc.id)));
  const allowedDepartments = new Set(
    docs.map((doc) => String(doc.department || doc.category || "other"))
  );
  const nodes = (graph.nodes || []).filter((node) => {
    if (node.type === "document") return allowedDocIds.has(String(node.meta?.docId || ""));
    if (node.type === "department") return allowedDepartments.has(String(node.label));
    return false;
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: (graph.edges || []).filter(
      (edge) => nodeIds.has(edge.fromId) && nodeIds.has(edge.toId)
    ),
  };
}

function buildStats(docs, user) {
  const visible = filterAccessibleDocuments(docs, user);
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
  isDocumentAccessibleForUser,
  isConnectionAccessible,
  filterAccessibleConnections,
  filterAccessibleGraph,
  filterAccessibleDocuments,
  buildStats,
  getConnectedTypes,
  isDemoDocument,
};
