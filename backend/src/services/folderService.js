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

async function extractTextFromBuffer(buffer, ext) {
  if (!Buffer.isBuffer(buffer)) return "";
  if (ext === ".txt" || ext === ".csv") return buffer.toString("utf8").slice(0, 50000);
  if (ext === ".pdf") {
    try {
      const pdfParse = require("pdf-parse");
      const data = await pdfParse(buffer);
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
  const sourcePath = path.resolve(filePath);
  const url = `/api/files/local/${encodeURIComponent(Buffer.from(sourcePath).toString("base64url"))}`;

  return db.persistDocument({
    title: fileName,
    description: `Indexed from ${options.folderPath || path.dirname(sourcePath)}`,
    content: content || fileName,
    tags: [department, store.extToFileType(ext), options.keepInPlace ? "local-index" : "upload"],
    department,
    category: department,
    source: options.source || "folder",
    fileType: store.extToFileType(ext),
    size: store.formatBytes(stat.size),
    folderPath: options.folderPath || path.dirname(filePath),
    filePath: sourcePath,
    url,
    connectionId: options.connectionId || null,
  }, { deferSave: options.deferSave });
}

async function ingestBuffer(buffer, originalName, options = {}) {
  const fileName = path.basename(String(originalName || "document"));
  const ext = path.extname(fileName).toLowerCase();
  if (!SUPPORTED_EXT.has(ext) || !Buffer.isBuffer(buffer)) return null;

  const department = options.department || store.guessDepartment(fileName);
  const content = await extractTextFromBuffer(buffer, ext);
  const folderLabel = options.folderPath || options.folderLabel || "Browser upload";
  const doc = await db.persistDocument({
    title: fileName,
    description: `Indexed from ${folderLabel}`,
    content: content || fileName,
    tags: [department, store.extToFileType(ext), "transient-upload"],
    department,
    category: department,
    source: options.source || "upload",
    fileType: store.extToFileType(ext),
    size: store.formatBytes(buffer.length),
    folderPath: folderLabel,
    filePath: null,
    url: "",
    connectionId: options.connectionId || null,
  });

  store.putTransientFile(doc.id, {
    buffer,
    originalName: fileName,
    mimeType: options.mimeType || "application/octet-stream",
  });
  return store.updateDocument(doc.id, { url: `/api/files/memory/${encodeURIComponent(doc.id)}` });
}

async function connectFolder(folderPath, department) {
  const resolved = path.resolve(folderPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Folder not found: ${resolved}`);
  }

  const dept = department || store.guessDepartment(resolved);
  const files = walkDir(resolved);
  const imported = [];
  const connectedFolder = store.addConnectedFolder({
    path: resolved,
    department: dept,
    label: path.basename(resolved),
    fileCount: 0,
  });

  for (const file of files) {
    const doc = await ingestFile(file, {
      department: store.guessDepartment(file) !== "other" ? store.guessDepartment(file) : dept,
      folderPath: resolved,
      source: "folder",
      connectionId: connectedFolder.id,
      keepInPlace: true,
    });
    imported.push(doc);
  }

  store.updateConnectedFolder(connectedFolder.id, { fileCount: imported.length });

  return { folder: resolved, department: dept, imported: imported.length, documents: imported };
}

async function ingestBrowserFiles(files, options = {}) {
  const imported = [];
  const connectionId = options.connectionId;
  const folderLabel = options.folderLabel || "Local folder";

  for (const file of files) {
    if (!Buffer.isBuffer(file?.buffer)) continue;
    const ext = path.extname(file.originalname || file.filename || "").toLowerCase();
    if (!SUPPORTED_EXT.has(ext)) continue;

    const relativePath = file.originalname || file.filename || path.basename(file.path);
    const dept =
      options.department && options.department !== "auto"
        ? options.department
        : store.guessDepartment(relativePath);

    const doc = await ingestBuffer(file.buffer, relativePath, {
      department: dept,
      folderPath: folderLabel,
      source: options.source || "local",
      connectionId,
      mimeType: file.mimetype,
    });
    if (doc) imported.push(doc);
  }

  return imported;
}

module.exports = { connectFolder, ingestFile, ingestBuffer, ingestBrowserFiles, walkDir, SUPPORTED_EXT };
