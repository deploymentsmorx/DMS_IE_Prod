const fs = require("fs");
const os = require("os");
const path = require("path");

const AUTO_HIDDEN_FIELDS = new Set([
  "path",
  "folderPath",
  "folderId",
  "remotePath",
  "siteUrl",
  "library",
  "systemId",
  "client",
  "host",
  "teamId",
  "channelId",
  "tenantId",
  "serviceAccount",
  "accessToken",
]);

function pathExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function getDefaultLocalPaths() {
  const home = os.homedir();
  const candidates = [
    path.join(home, "Documents"),
    path.join(home, "Desktop"),
    path.join(home, "Downloads"),
  ];
  return candidates.filter(pathExists);
}

function getOneDriveLocalPaths() {
  const home = os.homedir();
  const candidates = [
    process.env.OneDrive,
    process.env.OneDriveCommercial,
    process.env.OneDriveConsumer,
    path.join(home, "OneDrive"),
  ].filter(Boolean);

  try {
    for (const entry of fs.readdirSync(home, { withFileTypes: true })) {
      if (entry.isDirectory() && /^OneDrive/i.test(entry.name)) {
        candidates.push(path.join(home, entry.name));
      }
    }
  } catch {
    /* ignore */
  }

  const seen = new Set();
  return candidates
    .map((p) => path.resolve(String(p)))
    .filter((p) => {
      if (seen.has(p.toLowerCase())) return false;
      seen.add(p.toLowerCase());
      return pathExists(p);
    });
}

function resolveAutoConfig(typeId, config = {}) {
  const merged = {
    department: "auto",
    ...config,
  };

  switch (typeId) {
    case "local_directory": {
      const autoPaths = getDefaultLocalPaths();
      merged.autoPaths = autoPaths.length ? autoPaths : [os.homedir()];
      merged.path = merged.path || merged.autoPaths[0];
      merged.scanAll = true;
      break;
    }
    case "smb":
    case "nas":
      if (!merged.path) {
        merged.path = process.env.DEFAULT_SMB_PATH || process.env.DEFAULT_NAS_PATH || "";
        merged.autoSync = !merged.path;
      }
      break;
    case "google_drive":
      merged.folderId = merged.folderId || process.env.GOOGLE_DRIVE_FOLDER_ID || "root";
      merged.autoSync = true;
      break;
    case "onedrive": {
      const autoPaths = getOneDriveLocalPaths();
      merged.autoPaths = autoPaths;
      merged.folderPath = merged.folderPath || "/";
      merged.scanAll = true;
      merged.autoSync = true;
      break;
    }
    case "dropbox":
      merged.folderPath = merged.folderPath || "/";
      merged.autoSync = true;
      break;
    case "box":
      merged.folderId = merged.folderId || process.env.BOX_FOLDER_ID || "0";
      merged.autoSync = true;
      break;
    case "sharepoint":
      merged.siteUrl = merged.siteUrl || process.env.SHAREPOINT_SITE_URL || "";
      merged.library = merged.library || "Shared Documents";
      merged.autoSync = true;
      break;
    case "ftp":
    case "sftp":
      merged.host = merged.host || process.env.FTP_HOST || "";
      merged.remotePath = merged.remotePath || "/";
      merged.autoSync = !merged.host;
      break;
    case "sap":
      merged.systemId = merged.systemId || process.env.SAP_SYSTEM_ID || "PRD";
      merged.client = merged.client || process.env.SAP_CLIENT || "100";
      merged.host = merged.host || process.env.SAP_HOST || "sap.company.com";
      merged.autoSync = true;
      break;
    case "teams":
      merged.teamId = merged.teamId || "auto";
      merged.channelId = merged.channelId || "auto";
      merged.tenantId = merged.tenantId || process.env.AZURE_TENANT_ID || "";
      merged.autoSync = true;
      break;
    default:
      merged.autoSync = true;
  }

  return merged;
}

function shouldHideField(fieldKey) {
  return AUTO_HIDDEN_FIELDS.has(fieldKey);
}

module.exports = {
  AUTO_HIDDEN_FIELDS,
  getDefaultLocalPaths,
  getOneDriveLocalPaths,
  resolveAutoConfig,
  shouldHideField,
};
