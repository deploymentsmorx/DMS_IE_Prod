const path = require("path");
const { walkDir, ingestFile } = require("../folderService");
const { getOneDriveLocalPaths } = require("../sourceAutoConfigService");
const store = require("../relationalStore");

function mimeToType(item) {
  if (item.folder) return null;
  const name = (item.name || "").toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (/\.(doc|docx)$/.test(name)) return "docx";
  if (/\.(xls|xlsx)$/.test(name)) return "xlsx";
  if (/\.(ppt|pptx)$/.test(name)) return "pptx";
  if (/\.(dwg|dxf)$/.test(name)) return "dwg";
  if (/\.(png|jpg|jpeg|gif|webp)$/.test(name)) return "image";
  return "other";
}

function formatBytes(b) {
  if (!b) return "";
  if (b > 1e6) return (b / 1e6).toFixed(1) + " MB";
  return (b / 1e3).toFixed(0) + " KB";
}

function guessCategory(name) {
  const n = String(name || "").toLowerCase();
  if (/invoice|bill|finance|budget|revenue/.test(n)) return "finance";
  if (/hr|employee|handbook|policy/.test(n)) return "hr";
  if (/logistic|shipment|freight|warehouse/.test(n)) return "logistics";
  if (/cad|dwg|inspection|drawing|engineering/.test(n)) return "engineering";
  return "other";
}

async function getGraphAccessToken() {
  const tenant = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (!tenant || !clientId || !clientSecret) {
    throw new Error("Azure credentials missing (AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID)");
  }

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Failed to authenticate with Microsoft Graph");
  }
  return data.access_token;
}

async function fetchGraphJson(url, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Graph API error (${res.status})`);
  }
  return data;
}

async function listGraphDriveItems(token, userEmail, itemId = "root") {
  const docs = [];
  const user = encodeURIComponent(userEmail);
  let url =
    itemId === "root"
      ? `https://graph.microsoft.com/v1.0/users/${user}/drive/root/children?$top=200&$select=id,name,description,size,webUrl,file,folder,lastModifiedDateTime`
      : `https://graph.microsoft.com/v1.0/users/${user}/drive/items/${itemId}/children?$top=200&$select=id,name,description,size,webUrl,file,folder,lastModifiedDateTime`;

  while (url) {
    const data = await fetchGraphJson(url, token);
    for (const item of data.value || []) {
      if (item.folder) {
        const nested = await listGraphDriveItems(token, userEmail, item.id);
        docs.push(...nested);
      } else if (item.file) {
        const fileType = mimeToType(item);
        if (!fileType) continue;
        docs.push({
          title: item.name,
          description: item.description || `Synced from OneDrive: ${item.name}`,
          content: `${item.name} ${item.description || ""}`,
          url: item.webUrl || "",
          source: "onedrive",
          fileType,
          category: guessCategory(item.name),
          department: guessCategory(item.name),
          size: formatBytes(Number(item.size)),
          addedAt: item.lastModifiedDateTime,
          tags: ["onedrive"],
        });
      }
    }
    url = data["@odata.nextLink"] || null;
  }

  return docs;
}

async function syncOneDriveGraph(userEmail) {
  if (!userEmail) throw new Error("User email is required for OneDrive cloud sync");
  const token = await getGraphAccessToken();
  return listGraphDriveItems(token, userEmail);
}

async function scanOneDrivePath(folderPath, deptDefault) {
  const resolved = path.resolve(folderPath);
  const dept =
    deptDefault && deptDefault !== "auto" ? deptDefault : store.guessDepartment(resolved);
  const files = walkDir(resolved);
  const imported = [];
  const seen = new Set();

  for (const file of files) {
    const key = file.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const doc = await ingestFile(file, {
      department: store.guessDepartment(file) !== "other" ? store.guessDepartment(file) : dept,
      folderPath: resolved,
      source: "onedrive",
    });
    imported.push(doc);
  }

  return { imported, resolved, files: files.length };
}

async function syncOneDriveLocal(config = {}) {
  const dept = config.department && config.department !== "auto" ? config.department : "auto";
  const paths =
    config.scanAll && Array.isArray(config.autoPaths) && config.autoPaths.length
      ? config.autoPaths
      : getOneDriveLocalPaths();

  if (!paths.length) {
    return {
      imported: 0,
      documents: [],
      scannedPaths: [],
      autoDetected: true,
      message:
        "No OneDrive folder found on this PC. Sign in to the OneDrive app, or add AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, and AZURE_TENANT_ID to backend/.env for cloud sync.",
    };
  }

  const allImported = [];
  const scanned = [];

  for (const folderPath of paths) {
    try {
      const result = await scanOneDrivePath(folderPath, dept);
      allImported.push(...result.imported);
      scanned.push({ path: result.resolved, files: result.files, imported: result.imported.length });
    } catch (err) {
      scanned.push({ path: folderPath, error: err.message, imported: 0 });
    }
  }

  return {
    imported: allImported.length,
    documents: allImported,
    scannedPaths: scanned,
    autoDetected: true,
    message:
      allImported.length > 0
        ? `Imported ${allImported.length} file(s) from ${scanned.length} OneDrive folder(s)`
        : "OneDrive folder(s) found but no supported documents yet.",
  };
}

module.exports = {
  syncOneDriveGraph,
  syncOneDriveLocal,
  getGraphAccessToken,
};
