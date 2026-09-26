const store = require("./relationalStore");
const seedDocuments = require("../data/seedDocuments");
const { getSourceType } = require("../config/sourceRegistry");

const EXTRA_DEMO = {
  local: [
    {
      title: "Local Folder — Company Policies",
      description: "HR and admin policies synced from your local directory.",
      content: "local folder policies HR admin handbook onboarding",
      tags: ["local", "hr", "policy"],
      category: "hr",
      fileType: "pdf",
      size: "540 KB",
    },
    {
      title: "Local Folder — Project Drawings Pack",
      description: "CAD and PDF drawings imported from local disk.",
      content: "local CAD drawing project engineering specifications",
      tags: ["local", "cad", "project"],
      category: "engineering",
      fileType: "dwg",
      size: "3.2 MB",
    },
  ],
  smb: [
    {
      title: "Network Share — Finance Archive",
      description: "Invoices and reports from SMB/NAS network drive.",
      content: "smb network share finance invoice archive billing",
      tags: ["smb", "finance", "invoice"],
      category: "finance",
      fileType: "pdf",
      size: "920 KB",
    },
  ],
  nas: [
    {
      title: "NAS Volume — Backup Documents",
      description: "Documents indexed from NAS storage volume.",
      content: "nas storage backup documents archive",
      tags: ["nas", "backup"],
      category: "admin",
      fileType: "pdf",
      size: "1.1 MB",
    },
  ],
  dropbox: [
    {
      title: "Dropbox — Shared Team Folder",
      description: "Team documents synced from Dropbox shared folder.",
      content: "dropbox shared team folder collaboration documents",
      tags: ["dropbox", "team"],
      category: "project",
      fileType: "pdf",
      size: "760 KB",
    },
  ],
  ftp: [
    {
      title: "FTP Server — Document Repository",
      description: "Files imported from FTP server remote path.",
      content: "ftp server remote documents repository archive",
      tags: ["ftp", "archive"],
      category: "admin",
      fileType: "pdf",
      size: "640 KB",
    },
  ],
  sftp: [
    {
      title: "SFTP Vault — Secure Files",
      description: "Secure documents pulled from SFTP server.",
      content: "sftp secure vault encrypted documents",
      tags: ["sftp", "secure"],
      category: "admin",
      fileType: "pdf",
      size: "580 KB",
    },
  ],
  box: [
    {
      title: "Box — Enterprise Document Set",
      description: "Enterprise files indexed from Box folder.",
      content: "box enterprise documents folder",
      tags: ["box", "enterprise"],
      category: "admin",
      fileType: "pdf",
      size: "710 KB",
    },
  ],
  sharepoint: [
    {
      title: "SharePoint — Engineering Library",
      description: "Document library synced from SharePoint site.",
      content: "sharepoint engineering library site documents",
      tags: ["sharepoint", "engineering"],
      category: "engineering",
      fileType: "pdf",
      size: "890 KB",
    },
  ],
  sap: [
    {
      title: "SAP — Purchase Order PO-2026-4412",
      description: "SAP ERP purchase order exported from MM module.",
      content: "sap erp purchase order PO vendor invoice material management",
      tags: ["sap", "purchase-order", "finance"],
      category: "finance",
      fileType: "pdf",
      size: "420 KB",
    },
    {
      title: "SAP — Vendor Master Record",
      description: "Vendor master data document from SAP ERP.",
      content: "sap vendor master record supplier finance erp",
      tags: ["sap", "vendor", "master-data"],
      category: "finance",
      fileType: "pdf",
      size: "310 KB",
    },
  ],
};

function resolveDocSource(typeId) {
  return getSourceType(typeId)?.docSource || typeId;
}

function importDemoDocuments(typeId) {
  const docSource = resolveDocSource(typeId);
  const existing = store.getDocuments().filter((d) => d.source === docSource);
  if (existing.length) {
    return { imported: existing.length, message: `${existing.length} document(s) ready from ${docSource}` };
  }

  const fromSeed = seedDocuments.filter((d) => d.source === docSource);
  const extras = EXTRA_DEMO[docSource] || [];
  const batch = fromSeed.length ? fromSeed : extras;

  if (!batch.length) {
    return { imported: 0, message: "Connected — no demo documents for this source type yet" };
  }

  let imported = 0;
  for (const doc of batch) {
    store.addDocument({
      ...doc,
      source: docSource,
      url: doc.url || "#",
      addedAt: doc.addedAt || new Date().toISOString(),
    });
    imported += 1;
  }

  return {
    imported,
    message: `Imported ${imported} document(s) from ${docSource.replace(/_/g, " ")}`,
  };
}

module.exports = { importDemoDocuments, resolveDocSource };
