const fs = require("fs");
const path = require("path");
const os = require("os");
const { ingestFile } = require("../folderService");
const store = require("../relationalStore");

const SUPPORTED_EXT = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".dwg", ".dxf", ".txt", ".csv", ".png", ".jpg", ".jpeg",
]);

async function syncFromSftp(config) {
  let SftpClient;
  try {
    SftpClient = require("ssh2-sftp-client");
  } catch {
    throw new Error("SFTP support requires: npm install ssh2-sftp-client");
  }

  const sftp = new SftpClient();
  const tempDir = path.join(os.tmpdir(), `docsearch-sftp-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const connectOpts = {
    host: config.host,
    port: Number(config.port) || 22,
    username: config.user,
  };
  if (config.privateKey && fs.existsSync(config.privateKey)) {
    connectOpts.privateKey = fs.readFileSync(config.privateKey);
  } else if (config.password) {
    connectOpts.password = config.password;
  } else {
    throw new Error("SFTP requires password or private key path");
  }

  try {
    await sftp.connect(connectOpts);
    const remotePath = config.remotePath || "/";
    await downloadRecursive(sftp, remotePath, tempDir);

    const imported = [];
    const files = walkLocal(tempDir);
    for (const file of files) {
      const doc = await ingestFile(file, {
        department: store.guessDepartment(file),
        folderPath: `sftp://${config.host}${remotePath}`,
        source: "sftp",
      });
      imported.push(doc);
    }

    return { imported: imported.length, documents: imported, host: config.host };
  } finally {
    await sftp.end().catch(() => {});
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* */ }
  }
}

async function downloadRecursive(sftp, remoteDir, localDir) {
  const list = await sftp.list(remoteDir);
  for (const item of list) {
    if (item.name === "." || item.name === "..") continue;
    const remote = `${remoteDir.replace(/\/$/, "")}/${item.name}`;
    const local = path.join(localDir, item.name);
    if (item.type === "d") {
      fs.mkdirSync(local, { recursive: true });
      await downloadRecursive(sftp, remote, local);
    } else if (SUPPORTED_EXT.has(path.extname(item.name).toLowerCase())) {
      await sftp.fastGet(remote, local);
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

module.exports = { syncFromSftp };
