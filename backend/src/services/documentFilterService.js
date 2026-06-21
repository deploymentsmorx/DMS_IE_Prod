function isDemoDocument(doc) {
  if (!doc) return true;
  if (doc.isDemo === true || doc.demo === true) return true;
  const url = String(doc.url || "");
  if (url.includes("REPLACE")) return true;
  if ((url === "#" || !url) && !doc.filePath && !doc.folderPath) return true;
  return false;
}

module.exports = { isDemoDocument };
