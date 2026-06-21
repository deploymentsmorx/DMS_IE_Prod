const db = require("./dbService");
const store = require("./relationalStore");
const aux = require("./dmsAuxStore");
const { filterAccessibleDocuments, buildStats } = require("./sourceAccessService");
const { getSourceType } = require("../config/sourceRegistry");

function mapToSortedEntries(obj, limit = 12) {
  return Object.entries(obj || {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function formatSourceLabel(source) {
  const type = getSourceType(source);
  return type?.label || String(source || "unknown").replace(/_/g, " ");
}

async function buildDashboard() {
  const connections = store.getConnectedSources();
  const auxCounts = aux.getUsageCounts();
  const folders = store.getConnectedFolders();
  const revisionCount = store.getRevisionCount();

  if (!connections.length) {
    return {
      product: "SmorX.ai DMS",
      updatedAt: new Date().toISOString(),
      requiresConnection: true,
      summary: {
        indexedDocuments: 0,
        connectedSources: 0,
        connectedFolders: folders.length,
        revisions: revisionCount,
        savedSearches: auxCounts.savedSearches,
        notifications: auxCounts.notifications,
        unreadNotifications: auxCounts.unreadNotifications,
        defects: store.getDefectAnalytics().total,
      },
      breakdown: {
        bySource: [],
        byFileType: [],
        byCategory: [],
        byDepartment: [],
      },
      connections: [],
      recentDocuments: [],
      storage: db.isUsingNeon() ? "neondb" : "memory",
      openaiEnabled: !!process.env.OPENAI_API_KEY,
    };
  }

  const allDocs = await db.getAllDocuments();
  const visible = filterAccessibleDocuments(allDocs);
  const stats = buildStats(allDocs);

  const recentDocuments = [...visible]
    .sort((a, b) => new Date(b.addedAt || 0) - new Date(a.addedAt || 0))
    .slice(0, 10)
    .map((d) => ({
      id: d.id,
      title: d.title,
      source: d.source,
      fileType: d.fileType,
      department: d.department || d.category || "other",
      addedAt: d.addedAt || null,
    }));

  const connectionRows = connections.map((c) => {
    const typeDef = getSourceType(c.type);
    return {
      id: c.id,
      type: c.type,
      label: c.label || typeDef?.label || c.type,
      status: c.status,
      documentCount: c.documentCount || 0,
      lastSync: c.lastSync || null,
      connectedAt: c.connectedAt || null,
    };
  });

  return {
    product: "SmorX.ai DMS",
    updatedAt: new Date().toISOString(),
    requiresConnection: false,
    summary: {
      indexedDocuments: stats.total,
      connectedSources: connections.length,
      connectedFolders: folders.length,
      revisions: revisionCount,
      savedSearches: auxCounts.savedSearches,
      notifications: auxCounts.notifications,
      unreadNotifications: auxCounts.unreadNotifications,
      defects: store.getDefectAnalytics().total,
    },
    breakdown: {
      bySource: mapToSortedEntries(stats.bySource).map((row) => ({
        ...row,
        label: formatSourceLabel(row.label),
      })),
      byFileType: mapToSortedEntries(stats.byFileType),
      byCategory: mapToSortedEntries(stats.byCategory),
      byDepartment: mapToSortedEntries(stats.byDepartment),
    },
    connections: connectionRows,
    recentDocuments,
    storage: db.isUsingNeon() ? "neondb" : "memory",
    openaiEnabled: !!process.env.OPENAI_API_KEY,
  };
}

module.exports = { buildDashboard };
