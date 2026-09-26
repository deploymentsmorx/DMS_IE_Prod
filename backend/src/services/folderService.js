const fs = require("fs");
const path = require("path");
const store = require("./relationalStore");
const db = require("./dbService");
const SUPPORTED_EXT = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".dwg", ".dxf", ".txt", ".csv", ".png", ".jpg", ".jpeg",
]);

async function extractText(filePath, ext) {
  if (ext === ".txt" || ext === ".csv") {
    try {
      return fs.readFileSync(filePath, "utf8").slice(0, 50000);
    } catch {
      return "";
    }
  }
  if (ext === ".pdf") {
    try {
      const pdfParse = require("pdf-parse");
      const buf = fs.readFileSync(filePath);
      const data = await pdfParse(buf);
      return (data.text || "").slice(0, 50000);
    } catch {
      return "";
    }
  }
  return "";
}

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".svn", "appdata", "application data",
  "local settings", "temp", "tmp", "$recycle.bin", "system volume information",
  "windows", "program files", "program files (x86)", "programdata",
]);

function walkDir(dir, files = [], options = {}) {
  const maxFiles = options.maxFiles || 5000;
  if (!fs.existsSync(dir) || files.length >= maxFiles) return files;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (files.length >= maxFiles) break;
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name.toLowerCase())) continue;
      walkDir(full, files, options);
    } else if (SUPPORTED_EXT.has(path.extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

async function ingestFile(filePath, options = {}) {
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  const department = options.department || store.guessDepartment(filePath);
  const content = await extractText(filePath, ext);
  const keepInPlace = Boolean(options.keepInPlace || options.localOnly);

  let storedPath = filePath;
  let url = "";

  if (keepInPlace) {
    url = `/api/files/local/${encodeURIComponent(Buffer.from(filePath).toString("base64url"))}`;
  } else {
    const uploadsDir = store.ensureUploadsDir();
    const destDir = path.join(uploadsDir, department);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    storedPath = path.join(destDir, `${Date.now()}-${fileName}`);
    fs.copyFileSync(filePath, storedPath);
    url = `/api/files/${department}/${path.basename(storedPath)}`;
  }

  return db.persistDocument({
    title: fileName,
    description: `Indexed from ${options.folderPath || filePath}`,
    content: content || fileName,
    tags: [department, store.extToFileType(ext), keepInPlace ? "local-index" : "upload"],
    department,
    category: department,
    source: options.source || "folder",
    fileType: store.extToFileType(ext),
    size: store.formatBytes(stat.size),
    folderPath: options.folderPath || path.dirname(filePath),
    filePath: storedPath,
    url,
    connectionId: options.connectionId || null,
  }, { deferSave: options.deferSave });
}

async function connectFolder(folderPath, department) {
  const resolved = path.resolve(folderPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Folder not found: ${resolved}`);
  }

  const dept = department || store.guessDepartment(resolved);
  const files = walkDir(resolved);
  const imported = [];

  for (const file of files) {
    const doc = await ingestFile(file, {
      department: store.guessDepartment(file) !== "other" ? store.guessDepartment(file) : dept,
      folderPath: resolved,
      source: "folder",
    });
    imported.push(doc);
  }

  store.addConnectedFolder({
    path: resolved,
    department: dept,
    fileCount: imported.length,
  });

  return { folder: resolved, department: dept, imported: imported.length, documents: imported };
}

async function ingestBrowserFiles(files, options = {}) {
  const imported = [];
  const connectionId = options.connectionId;
  const folderLabel = options.folderLabel || "Local folder";

  for (const file of files) {
    if (!file?.path) continue;
    const ext = path.extname(file.originalname || file.filename || "").toLowerCase();
    if (!SUPPORTED_EXT.has(ext)) continue;

    const relativePath = file.originalname || file.filename || path.basename(file.path);
    const dept =
      options.department && options.department !== "auto"
        ? options.department
        : store.guessDepartment(relativePath);

    const doc = await ingestFile(file.path, {
      department: dept,
      folderPath: folderLabel,
      source: options.source || "local",
      connectionId: options.connectionId,
      deferSave: true,
    });

    imported.push(doc);
  }

  if (!db.isUsingNeon()) store.flushStore();
  return imported;
}

module.exports = { connectFolder, ingestFile, ingestBrowserFiles, walkDir, SUPPORTED_EXT };
