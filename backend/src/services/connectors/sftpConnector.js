const path = require("path");
const fs = require("fs");
const { ingestBuffer } = require("../folderService");
const store = require("../relationalStore");

const SUPPORTED_EXT = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".dwg", ".dxf", ".txt", ".csv", ".png", ".jpg", ".jpeg",
]);

async function syncFromSftp(config, connectionId) {
  let SftpClient;
  try {
    SftpClient = require("ssh2-sftp-client");
  } catch {
    throw new Error("SFTP support requires: npm install ssh2-sftp-client");
  }

  const sftp = new SftpClient();
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
    const remoteFiles = await listRecursive(sftp, remotePath);
    const imported = [];
    for (const remoteFile of remoteFiles) {
      const buffer = await sftp.get(remoteFile.path);
      if (!Buffer.isBuffer(buffer)) continue;
      const doc = await ingestBuffer(buffer, remoteFile.name, {
        department: store.guessDepartment(remoteFile.name),
        folderPath: `sftp://${config.host}${remotePath}`,
        source: "sftp",
        connectionId,
        mimeType: "application/octet-stream",
      });
      if (doc) imported.push(doc);
    }

    return { imported: imported.length, documents: imported, host: config.host };
  } finally {
    await sftp.end().catch(() => {});
  }
}

async function listRecursive(sftp, remoteDir, files = []) {
  const list = await sftp.list(remoteDir);
  for (const item of list) {
    if (item.name === "." || item.name === "..") continue;
    const remote = `${remoteDir.replace(/\/$/, "")}/${item.name}`;
    if (item.type === "d") {
      await listRecursive(sftp, remote, files);
    } else if (SUPPORTED_EXT.has(path.extname(item.name).toLowerCase())) {
      files.push({ path: remote, name: item.name });
    }
  }
  return files;
}

module.exports = { syncFromSftp };
