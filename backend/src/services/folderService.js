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

function walkDir(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, files);
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

  const uploadsDir = store.ensureUploadsDir();
  const destDir = path.join(uploadsDir, department);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const destPath = path.join(destDir, `${Date.now()}-${fileName}`);
  fs.copyFileSync(filePath, destPath);

  return db.persistDocument({
    title: fileName,
    description: `Imported from ${options.folderPath || filePath}`,
    content: content || fileName,
    tags: [department, store.extToFileType(ext)],
    department,
    category: department,
    source: options.source || "folder",
    fileType: store.extToFileType(ext),
    size: store.formatBytes(stat.size),
    folderPath: options.folderPath || path.dirname(filePath),
    filePath: destPath,
    url: `/api/files/${department}/${path.basename(destPath)}`,
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
