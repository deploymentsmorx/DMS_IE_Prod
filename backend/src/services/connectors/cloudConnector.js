const store = require("../relationalStore");
const db = require("../dbService");

async function syncGoogleDrive(config) {
  let docs = [];

  if (config?.oauthTokens) {
    const { syncGoogleDriveWithOAuth } = require("../sync/googleDrive");
    docs = await syncGoogleDriveWithOAuth(
      config.oauthTokens,
      config.folderId || process.env.GOOGLE_DRIVE_FOLDER_ID || "root"
    );
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_PATH) {
    const { syncGoogleDrive: sync } = require("../sync/googleDrive");
    const folderId = config.folderId || process.env.GOOGLE_DRIVE_FOLDER_ID || "root";
    docs = await sync(folderId);
  } else {
    throw new Error("Sign in with Google to connect Google Drive");
  }

  const imported = [];
  for (const doc of docs) {
    imported.push(await db.persistDocument({ ...doc, source: "google_drive" }));
  }
  return {
    imported: imported.length,
    documents: imported,
    message: `Imported ${imported.length} file(s) from Google Drive`,
  };
}

async function syncOneDrive(config) {
  const { syncOneDriveGraph, syncOneDriveLocal } = require("../sync/oneDrive");
  const userEmail = config.otpEmail || config.authUsername;
  let docs = [];
  let meta = { autoDetected: false, scannedPaths: [] };

  const hasAzure =
    process.env.AZURE_CLIENT_ID &&
    process.env.AZURE_CLIENT_SECRET &&
    process.env.AZURE_TENANT_ID;

  if (hasAzure && userEmail) {
    try {
      docs = await syncOneDriveGraph(userEmail);
      meta = {
        autoDetected: true,
        message: `Imported ${docs.length} file(s) from OneDrive (Microsoft Graph)`,
      };
    } catch (err) {
      console.warn("OneDrive Graph sync failed, trying local folders:", err.message);
      meta.graphError = err.message;
    }
  }

  if (!docs.length) {
    const local = await syncOneDriveLocal(config);
    if (local.documents?.length) {
      return {
        imported: local.imported,
        documents: local.documents,
        message: local.message,
        scannedPaths: local.scannedPaths,
        autoDetected: local.autoDetected,
      };
    }
    return {
      imported: 0,
      message: local.message || meta.graphError || "No OneDrive documents found",
      scannedPaths: local.scannedPaths || [],
      autoDetected: local.autoDetected,
    };
  }

  const imported = [];
  for (const doc of docs) {
    imported.push(await db.persistDocument({ ...doc, source: "onedrive" }));
  }
  return { imported: imported.length, documents: imported, ...meta };
}

async function syncDropbox(config) {
  const token = config.accessToken || process.env.DROPBOX_ACCESS_TOKEN;
  if (!token) throw new Error("Provide Dropbox access token in config or DROPBOX_ACCESS_TOKEN in .env");
  return {
    imported: 0,
    message: "Dropbox connector configured. Full API sync requires DROPBOX_ACCESS_TOKEN.",
    folderPath: config.folderPath,
  };
}

async function syncBox(config) {
  const token = config.accessToken || process.env.BOX_ACCESS_TOKEN;
  if (!token) throw new Error("Provide Box access token in config or BOX_ACCESS_TOKEN in .env");
  return {
    imported: 0,
    message: "Box connector configured. Set BOX_ACCESS_TOKEN and BOX_FOLDER_ID in .env.",
    folderId: config.folderId,
  };
}

async function syncSharePoint(config) {
  if (!process.env.AZURE_CLIENT_ID) {
    throw new Error("SharePoint uses Azure AD — set AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID");
  }
  return {
    imported: 0,
    message: `SharePoint connector ready for ${config.siteUrl || "site"} / ${config.library || "library"}`,
    config,
  };
}

async function syncTeams(config) {
  if (!process.env.AZURE_CLIENT_ID && !config.tenantId) {
    throw new Error("Configure AZURE_CLIENT_ID or provide tenantId for Teams");
  }
  return {
    imported: 0,
    message: `Teams connector ready for team ${config.teamId || "channel"}`,
    config,
  };
}

async function syncSap(config) {
  if (!config.systemId && !process.env.SAP_HOST) {
    throw new Error("Provide SAP systemId and host, or set SAP_HOST in .env");
  }
  return {
    imported: 0,
    message: `SAP ERP connector ready for system ${config.systemId || "PRD"} client ${config.client || "100"}`,
    config,
  };
}

const CLOUD_SYNC = {
  google_drive: syncGoogleDrive,
  onedrive: syncOneDrive,
  dropbox: syncDropbox,
  box: syncBox,
  sharepoint: syncSharePoint,
  teams: syncTeams,
  sap: syncSap,
};

module.exports = { CLOUD_SYNC };
