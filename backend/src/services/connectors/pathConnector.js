const path = require("path");
const { walkDir, ingestFile } = require("../folderService");
const store = require("../relationalStore");
const { getDefaultLocalPaths } = require("../sourceAutoConfigService");

async function scanPath(sourceType, folderPath, deptDefault) {
  const isUnc = folderPath.startsWith("\\\\") || folderPath.startsWith("//");
  const resolved = isUnc
    ? folderPath.replace(/\//g, "\\")
    : path.resolve(folderPath.replace(/\//g, path.sep));

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
      source: sourceType === "local_directory" ? "local" : sourceType,
      deferSave: true,
    });
    imported.push(doc);
  }

  store.flushStore();

  return { imported, resolved, files: files.length };
}

async function syncFromPath(sourceType, config, sourceId) {
  const dept = config.department && config.department !== "auto" ? config.department : "auto";
  let paths = [];

  if (config.scanAll && Array.isArray(config.autoPaths) && config.autoPaths.length) {
    paths = config.autoPaths;
  } else if (config.path || config.folderPath) {
    paths = [config.path || config.folderPath];
  } else if (sourceType === "local_directory") {
    paths = getDefaultLocalPaths();
    if (!paths.length) paths = [require("os").homedir()];
  }

  if (!paths.length) {
    throw new Error("No accessible folders found for auto-scan");
  }

  const allImported = [];
  const scanned = [];

  for (const folderPath of paths) {
    try {
      const result = await scanPath(sourceType, folderPath, dept);
      allImported.push(...result.imported);
      scanned.push({ path: result.resolved, files: result.files, imported: result.imported.length });
    } catch (err) {
      scanned.push({ path: folderPath, error: err.message, imported: 0 });
    }
  }

  return {
    imported: allImported.length,
    documents: allImported,
    path: scanned[0]?.path || paths[0],
    scannedPaths: scanned,
    department: dept,
    autoDetected: Boolean(config.scanAll || !config.path),
  };
}

module.exports = { syncFromPath };
