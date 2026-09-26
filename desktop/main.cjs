const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const crypto = require("crypto");
const { execSync } = require("child_process");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function configPath() {
  const packed = path.join(process.resourcesPath, "config.json");
  if (app.isPackaged && fs.existsSync(packed)) return packed;
  return path.join(__dirname, "config.json");
}

function activationPath() {
  return path.join(app.getPath("userData"), "activation.json");
}

function uiRoot() {
  return path.join(__dirname, "ui");
}

function primaryMac() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (!net.internal && net.mac && net.mac !== "00:00:00:00:00:00") {
        return net.mac.toUpperCase();
      }
    }
  }
  return "NO-MAC";
}

function windowsDeviceId() {
  try {
    const output = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\SQMClient" /v MachineId',
      { encoding: "utf8", windowsHide: true }
    );
    const match = output.match(/MachineId\s+REG_SZ\s+(\{?[0-9A-Fa-f-]+\}?)/);
    if (match) {
      return match[1].replace(/[{}]/g, "").toUpperCase();
    }
  } catch {
    /* fall back */
  }
  return null;
}

function deviceId() {
  const winId = windowsDeviceId();
  if (winId) return `DEV-${winId}`;
  const raw = `${os.hostname()}|${primaryMac()}`;
  const hex = crypto.createHash("sha256").update(raw).digest("hex").toUpperCase();
  return `DEV-${hex.slice(0, 8)}-${hex.slice(8, 16)}`;
}

function getMachine() {
  return {
    deviceId: deviceId(),
    hostname: os.hostname(),
  };
}

function getApiUrl() {
  const cfg = readJson(configPath(), {});
  let url = String(cfg.apiUrl || process.env.DMS_API_URL || "http://localhost:3001/api").trim();
  url = url.replace(/\/$/, "");
  if (!/\/api$/i.test(url)) url = `${url}/api`;
  return url;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function startUiServer() {
  const root = uiRoot();
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url || "/", "http://127.0.0.1");
        let urlPath = decodeURIComponent(reqUrl.pathname);
        if (urlPath === "/") urlPath = "/index.html";

        if (urlPath === "/desktop-bridge.js") {
          const api = getApiUrl().replace(/\\/g, "\\\\").replace(/'/g, "\\'");
          const body = `window.DOCSEARCH_API='${api}';window.__SMORX_DESKTOP__=true;`;
          res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
          res.end(body);
          return;
        }

        const safeRel = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
        const filePath = path.join(root, safeRel);
        if (!filePath.startsWith(root)) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        fs.createReadStream(filePath).pipe(res);
      } catch (err) {
        res.writeHead(500);
        res.end(String(err && err.message ? err.message : err));
      }
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

let uiServer = null;

function createWindow(port) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: "SmorX.ai DMS",
    backgroundColor: "#0f1117",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL(`http://127.0.0.1:${port}/`);
  win.setMenuBarVisibility(false);
}

ipcMain.on("smorx:machine", (event) => {
  event.returnValue = getMachine();
});

ipcMain.on("smorx:apiUrl", (event) => {
  event.returnValue = getApiUrl();
});

ipcMain.on("smorx:isActivated", (event) => {
  const saved = readJson(activationPath(), null);
  event.returnValue = Boolean(saved?.licenseKey);
});

ipcMain.on("smorx:setActivated", (event, payload) => {
  writeJson(activationPath(), {
    ...payload,
    activatedAt: new Date().toISOString(),
  });
  event.returnValue = true;
});

app.whenReady().then(async () => {
  uiServer = await startUiServer();
  const port = uiServer.address().port;
  createWindow(port);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
  });
});

app.on("window-all-closed", () => {
  if (uiServer) {
    try {
      uiServer.close();
    } catch {
      /* ignore */
    }
  }
  if (process.platform !== "darwin") app.quit();
});
