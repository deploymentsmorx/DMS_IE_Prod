const path = require("path");

const ENTERPRISE_STORE = path.join(
  __dirname,
  "../../enterprise/lib/store"
);

function loadEnterpriseDocuments() {
  let store;
  try {
    store = require(ENTERPRISE_STORE);
  } catch {
    return [];
  }

  return store.getDocuments().map((doc) => {
    const full = store.getDocument(doc.id);
    const versions = full?.versions || [];
    const last = versions[versions.length - 1];
    const content = last?.content || doc.ocrText || "";
    const name = doc.name || "Untitled";
    const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "txt";
    const folder = String(doc.folderId || "other").toLowerCase();

    return {
      id: `enterprise-${doc.id}`,
      title: name,
      description: doc.classification || doc.category || "",
      content,
      ocrText: doc.ocrText || content,
      tags: doc.tags || [],
      category: folder,
      department: folder,
      source: "enterprise",
      url: "",
      folderPath: doc.folderId || "library",
      fileType: ext,
      size: doc.size ? `${doc.size} B` : "",
    };
  });
}

function mergeDocuments(primary, extra) {
  const seen = new Set();
  const merged = [];
  for (const doc of [...primary, ...extra]) {
    const key = String(doc.title || doc.id || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(doc);
  }
  return merged;
}

module.exports = { loadEnterpriseDocuments, mergeDocuments };
