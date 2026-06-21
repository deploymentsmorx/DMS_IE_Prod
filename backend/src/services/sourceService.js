const { getAllSourceTypes, getSourceType } = require("../config/sourceRegistry");
const googleOAuth = require("./googleOAuthService");
const store = require("./relationalStore");
const { syncFromPath } = require("./connectors/pathConnector");
const { syncFromFtp } = require("./connectors/ftpConnector");
const { syncFromSftp } = require("./connectors/sftpConnector");
const { CLOUD_SYNC } = require("./connectors/cloudConnector");
const { resolveAutoConfig, getOneDriveLocalPaths } = require("./sourceAutoConfigService");
const { filterAccessibleDocuments, buildStats } = require("./sourceAccessService");
const { ingestBrowserFiles } = require("./folderService");
const db = require("./dbService");
const gov = require("./enterpriseGovernanceService");
const aux = require("./dmsAuxStore");

const PATH_TYPES = new Set(["local_directory", "smb", "nas"]);
const BACKGROUND_SYNC_TYPES = new Set([
  "local_directory",
  "onedrive",
  "smb",
  "nas",
  "google_drive",
]);

function runPostConnectWorkflows(typeId, connectionId) {
  const type = getSourceType(typeId);
  const docSource = type?.docSource || typeId;
  gov.runWorkflows(
    "source_connected",
    { source: docSource, summary: `Connected ${type?.label || typeId}`, connectionId },
    {
      notify: (p) =>
        aux.pushNotification({
          userId: "all",
          type: "workflow",
          title: p.title,
          message: p.message,
          meta: p.meta,
        }),
      addTag: (_docId, tag) => {
        for (const doc of store.getDocuments().filter((d) => d.source === docSource)) {
          const tags = [...(doc.tags || [])];
          if (!tags.includes(tag)) {
            tags.push(tag);
            store.updateDocument(doc.id, { tags });
          }
        }
      },
    }
  );
}

async function runBackgroundSync(connectionId, typeId) {
  store.updateConnectedSource(connectionId, { status: "syncing", lastError: null });
  try {
    const syncResult = await syncConnection(connectionId);
    const typeLabel = getSourceType(typeId)?.label || typeId;
    aux.pushNotification({
      userId: "all",
      type: "source",
      title: `${typeLabel} sync complete`,
      message: syncResult.imported
        ? `${syncResult.imported} document(s) imported.`
        : syncResult.message || "Scan finished.",
      meta: { connectionId, imported: syncResult.imported || 0 },
    });
    runPostConnectWorkflows(typeId, connectionId);
  } catch (err) {
    store.updateConnectedSource(connectionId, {
      status: "error",
      lastError: err.message,
    });
  }
}

function shouldBackgroundSync(typeId) {
  return BACKGROUND_SYNC_TYPES.has(typeId);
}

function listSourceTypes() {
  return getAllSourceTypes().map((t) => ({
    ...t,
    configured: isTypeConfigured(t.id),
  }));
}

function isTypeConfigured(typeId) {
  if (typeId === "google_drive") return googleOAuth.isConfigured();
  const t = getSourceType(typeId);
  if (!t?.envKeys?.length) return true;
  if (typeId === "onedrive") {
    return t.envKeys.some((k) => process.env[k]) || getOneDriveLocalPaths().length > 0;
  }
  return t.envKeys.some((k) => process.env[k]);
}

function getConnections() {
  return store.getConnectedSources().map((c) => ({
    ...c,
    config: sanitizeConfig(c.config),
  }));
}

async function connect(typeId, config = {}, label, options = {}) {
  const { verified = false, backgroundSync = shouldBackgroundSync(typeId) } = options;
  const type = getSourceType(typeId);
  if (!type) throw new Error(`Unknown source type: ${typeId}`);

  const resolvedConfig = resolveAutoConfig(typeId, config);
  const authUser = resolvedConfig.authUsername || resolvedConfig.username || "user";
  if (!verified) {
    throw new Error("Sign in to the app before connecting a source.");
  }

  if (typeId !== "google_drive") {
    resolvedConfig.authUsername = authUser;
    resolvedConfig.otpEmail =
      resolvedConfig.otpEmail ||
      resolvedConfig.email ||
      resolvedConfig.googleEmail ||
      `${authUser}@session.local`;
  }

  const connection = store.addConnectedSource({
    type: typeId,
    label: label || type.label,
    config: resolvedConfig,
    status: backgroundSync ? "syncing" : "connected",
  });

  if (backgroundSync) {
    setImmediate(() => {
      runBackgroundSync(connection.id, typeId).catch(() => {});
    });
    return {
      connection: {
        ...store.getConnectedSource(connection.id),
        config: sanitizeConfig(store.getConnectedSource(connection.id).config),
      },
      sync: {
        imported: 0,
        background: true,
        message:
          "Connected. Scanning your files in the background — documents will appear as they are indexed.",
      },
    };
  }

  let syncResult = { imported: 0 };
  try {
    syncResult = await syncConnection(connection.id);
  } catch (err) {
    syncResult = { imported: 0, error: err.message };
  }

  if (!syncResult.imported) {
    syncResult.message =
      syncResult.message ||
      "Source connected. No documents were found yet — add files to this source and click Sync.";
  }

  store.updateConnectedSource(connection.id, {
    status: syncResult.error && !syncResult.imported ? "connected" : "synced",
    lastSync: new Date().toISOString(),
    documentCount: syncResult.imported || 0,
    lastError: syncResult.error && !syncResult.imported ? syncResult.error : null,
  });

  runPostConnectWorkflows(typeId, connection.id);

  return {
    connection: {
      ...store.getConnectedSource(connection.id),
      config: sanitizeConfig(store.getConnectedSource(connection.id).config),
    },
    sync: syncResult,
  };
}

async function syncConnection(sourceId) {
  const conn = store.getConnectedSource(sourceId);
  if (!conn) throw new Error("Connection not found");

  if (conn.config?.browserUpload) {
    return {
      imported: conn.documentCount || 0,
      needsBrowserUpload: true,
      message: "Pick your local folder again in the browser to sync new files.",
    };
  }

  const { type, config } = conn;
  let result;

  if (PATH_TYPES.has(type)) {
    result = await syncFromPath(type, config, sourceId);
  } else if (type === "ftp") {
    result = await syncFromFtp(config);
  } else if (type === "sftp") {
    result = await syncFromSftp(config);
  } else if (CLOUD_SYNC[type]) {
    result = await CLOUD_SYNC[type](config);
  } else {
    throw new Error(`No sync handler for ${type}`);
  }

  store.updateConnectedSource(sourceId, {
    lastSync: new Date().toISOString(),
    documentCount: result.imported ?? conn.documentCount ?? 0,
    status: result.error ? "error" : "synced",
    lastError: result.error || null,
  });

  return result;
}

async function syncAll() {
  const connections = store.getConnectedSources();
  const results = [];
  for (const conn of connections) {
    try {
      const r = await syncConnection(conn.id);
      results.push({ id: conn.id, type: conn.type, success: true, ...r });
    } catch (err) {
      results.push({ id: conn.id, type: conn.type, success: false, error: err.message });
    }
  }
  return results;
}

function disconnect(sourceId) {
  const conn = store.getConnectedSource(sourceId);
  if (!conn) return false;

  const connType = conn.type;
  const stillConnectedAfter = store
    .getConnectedSources()
    .filter((c) => String(c.id) !== String(sourceId))
    .some((c) => c.type === connType);

  if (db.isUsingNeon()) {
    db.deleteByConnectionId(sourceId).catch(() => {});
  }

  if (stillConnectedAfter) {
    return store.removeConnectedSource(sourceId);
  }

  const typeDef = getSourceType(connType);
  const docSource = typeDef?.docSource || connType;
  if (db.isUsingNeon()) {
    db.deleteBySource(docSource).catch(() => {});
  }
  return store.removeConnectedSourceAndPurgeDocs(sourceId, docSource);
}

function disconnectAll() {
  const connections = store.getConnectedSources();
  if (!connections.length) {
    return { disconnected: 0, documentsRemoved: 0 };
  }

  const docSources = connections.map((conn) => {
    const typeDef = getSourceType(conn.type);
    return typeDef?.docSource || conn.type;
  });

  return store.purgeSourcesAndConnections(docSources, connections.length);
}

function sanitizeConfig(config) {
  const safe = { ...config };
  if (safe.password) safe.password = "***";
  if (safe.accessToken) safe.accessToken = "***";
  if (safe.oauthTokens) safe.oauthTokens = { connected: true };
  return safe;
}

function getSourceStats() {
  const docs = store.getDocuments();
  const stats = buildStats(docs);
  return {
    connections: store.getConnectedSources().length,
    bySource: stats.bySource,
    types: listSourceTypes().length,
  };
}

async function connectLocalFolderUpload(files, config = {}, label) {
  if (!files?.length) throw new Error("No files selected from your folder");

  const folderLabel =
    config.folderLabel ||
    files[0]?.originalname?.split("/")?.[0] ||
    files[0]?.originalname?.split("\\")?.[0] ||
    "Local folder";

  const resolvedConfig = {
    ...resolveAutoConfig("local_directory", config),
    browserUpload: true,
    folderLabel,
    scanAll: false,
  };

  const connection = store.addConnectedSource({
    type: "local_directory",
    label: label || "Local Directory",
    config: resolvedConfig,
    status: "syncing",
  });

  const imported = await ingestBrowserFiles(files, {
    connectionId: connection.id,
    department: resolvedConfig.department,
    folderLabel,
    source: "local",
  });

  store.updateConnectedSource(connection.id, {
    status: "synced",
    lastSync: new Date().toISOString(),
    documentCount: imported.length,
    lastError: imported.length ? null : "No supported files found in folder",
  });

  runPostConnectWorkflows("local_directory", connection.id);

  return {
    connection: {
      ...store.getConnectedSource(connection.id),
      config: sanitizeConfig(store.getConnectedSource(connection.id).config),
    },
    sync: {
      imported: imported.length,
      browserUpload: true,
      folderLabel,
      message: imported.length
        ? `${imported.length} document(s) uploaded from your folder.`
        : "Folder connected, but no supported file types were found.",
    },
  };
}

async function syncLocalFolderUpload(sourceId, files) {
  const conn = store.getConnectedSource(sourceId);
  if (!conn) throw new Error("Connection not found");
  if (conn.type !== "local_directory") throw new Error("Not a local folder connection");
  if (!files?.length) throw new Error("No files selected from your folder");

  store.purgeDocumentsForConnection(sourceId);
  if (db.isUsingNeon()) await db.deleteByConnectionId(sourceId);

  const folderLabel =
    conn.config?.folderLabel ||
    files[0]?.originalname?.split("/")?.[0] ||
    "Local folder";

  store.updateConnectedSource(sourceId, { status: "syncing", lastError: null });

  const imported = await ingestBrowserFiles(files, {
    connectionId: sourceId,
    department: conn.config?.department,
    folderLabel,
    source: "local",
  });

  store.updateConnectedSource(sourceId, {
    status: "synced",
    lastSync: new Date().toISOString(),
    documentCount: imported.length,
    lastError: null,
  });

  return {
    imported: imported.length,
    browserUpload: true,
    folderLabel,
    message: `${imported.length} document(s) synced from your folder.`,
  };
}

module.exports = {
  listSourceTypes,
  getConnections,
  connect,
  connectLocalFolderUpload,
  syncLocalFolderUpload,
  syncConnection,
  syncAll,
  disconnect,
  disconnectAll,
  getSourceStats,
  isTypeConfigured,
};
