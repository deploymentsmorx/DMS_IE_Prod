const SOURCE_TYPES = {
  onedrive: {
    id: "onedrive",
    label: "Microsoft OneDrive",
    icon: "onedrive",
    category: "cloud",
    docSource: "onedrive",
    fields: [],
    envKeys: ["AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "AZURE_TENANT_ID"],
    help: "Scans your OneDrive folder on this PC automatically. Cloud sync works when Azure credentials are in .env.",
  },
  box: {
    id: "box",
    label: "Box",
    icon: "box",
    category: "cloud",
    docSource: "box",
    fields: [],
    envKeys: ["BOX_ACCESS_TOKEN", "BOX_FOLDER_ID"],
    help: "After email verification, Box documents are imported automatically.",
  },
  sharepoint: {
    id: "sharepoint",
    label: "SharePoint",
    icon: "sharepoint",
    category: "cloud",
    docSource: "sharepoint",
    fields: [],
    envKeys: ["AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "AZURE_TENANT_ID"],
    help: "After email verification, SharePoint libraries are synced automatically.",
  },
  local_directory: {
    id: "local_directory",
    label: "Local Files",
    icon: "local",
    category: "local",
    docSource: "local",
    fields: [],
    help: "Choose one folder, or sync Documents, Desktop, Downloads and other local folders on this PC. Files stay on this machine.",
  },
};

function getAllSourceTypes() {
  return Object.values(SOURCE_TYPES);
}

function getSourceType(id) {
  return SOURCE_TYPES[id] || null;
}

module.exports = { SOURCE_TYPES, getAllSourceTypes, getSourceType };
