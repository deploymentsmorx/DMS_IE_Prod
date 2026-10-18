const path = require("path");
const { PassThrough } = require("stream");
const { ingestBuffer } = require("../folderService");
const store = require("../relationalStore");

const SUPPORTED_EXT = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".dwg", ".dxf", ".txt", ".csv", ".png", ".jpg", ".jpeg",
]);

function downloadBuffer(client, remotePath) {
  const chunks = [];
  const output = new PassThrough();
  output.on("data", (chunk) => chunks.push(chunk));
  return client.downloadTo(output, remotePath).then(() => Buffer.concat(chunks));
}

async function syncFromFtp(config, connectionId) {
  let Client;
  try {
    Client = require("basic-ftp").Client;
  } catch {
    throw new Error("FTP support requires: npm install basic-ftp");
  }

  const client = new Client();
  try {
    await client.access({
      host: config.host,
      port: Number(config.port) || 21,
      user: config.user,
      password: config.password,
      secure: config.secure === true,
    });

    const remotePath = config.remotePath || "/";
    const remoteFiles = await listRecursive(client, remotePath);
    const imported = [];
    for (const remoteFile of remoteFiles) {
      const buffer = await downloadBuffer(client, remoteFile.path);
      const doc = await ingestBuffer(buffer, remoteFile.name, {
        department: store.guessDepartment(remoteFile.name),
        folderPath: `ftp://${config.host}${remotePath}`,
        source: "ftp",
        connectionId,
        mimeType: "application/octet-stream",
      });
      if (doc) imported.push(doc);
    }

    return { imported: imported.length, documents: imported, host: config.host };
  } finally {
    client.close();
  }
}

async function listRecursive(client, remoteDir, files = []) {
  const list = await client.list(remoteDir);
  for (const item of list) {
    const remote = remoteDir.endsWith("/") ? `${remoteDir}${item.name}` : `${remoteDir}/${item.name}`;
    if (item.isDirectory) {
      await listRecursive(client, remote, files);
    } else if (SUPPORTED_EXT.has(path.extname(item.name).toLowerCase())) {
      files.push({ path: remote, name: item.name });
    }
  }
  return files;
}

module.exports = { syncFromFtp };
