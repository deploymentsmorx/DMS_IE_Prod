const fs = require("fs");
const path = require("path");
const os = require("os");
const { ingestFile } = require("../folderService");
const store = require("../relationalStore");

const SUPPORTED_EXT = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".dwg", ".dxf", ".txt", ".csv", ".png", ".jpg", ".jpeg",
]);

async function syncFromFtp(config) {
  let Client;
  try {
    Client = require("basic-ftp").Client;
  } catch {
    throw new Error("FTP support requires: npm install basic-ftp");
  }

  const client = new Client();
  const tempDir = path.join(os.tmpdir(), `docsearch-ftp-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    await client.access({
      host: config.host,
      port: Number(config.port) || 21,
      user: config.user,
      password: config.password,
      secure: config.secure === true,
    });

    const remotePath = config.remotePath || "/";
    await downloadRecursive(client, remotePath, tempDir);

    const imported = [];
    const files = walkLocal(tempDir);
    for (const file of files) {
      const doc = await ingestFile(file, {
        department: store.guessDepartment(file),
        folderPath: `ftp://${config.host}${remotePath}`,
        source: "ftp",
      });
      imported.push(doc);
    }

    return { imported: imported.length, documents: imported, host: config.host };
  } finally {
    client.close();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* */ }
  }
}

async function downloadRecursive(client, remoteDir, localDir) {
  const list = await client.list(remoteDir);
  for (const item of list) {
    const remote = remoteDir.endsWith("/") ? `${remoteDir}${item.name}` : `${remoteDir}/${item.name}`;
    const local = path.join(localDir, item.name);
    if (item.isDirectory) {
      fs.mkdirSync(local, { recursive: true });
      await downloadRecursive(client, remote, local);
    } else if (SUPPORTED_EXT.has(path.extname(item.name).toLowerCase())) {
      await client.downloadTo(local, remote);
    }
  }
}

function walkLocal(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkLocal(full, files);
    else if (SUPPORTED_EXT.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
  return files;
}

module.exports = { syncFromFtp };
