import { api, getToken } from "./api.js";
import { CONFIG } from "./config.js";
import { getCurrentUser } from "./auth.js";

const SOURCE_ICONS = {
  google_drive: "🟢",
  onedrive: "🔵",
  dropbox: "🟦",
  box: "📦",
  sharepoint: "🟩",
  smb: "🖧",
  nas: "💾",
  local_directory: "📂",
  ftp: "🌐",
  sftp: "🔐",
  sap: "🏭",
};

const SIDEBAR_TO_TYPE = {
  google_drive: "google_drive",
  onedrive: "onedrive",
  local: "local_directory",
  smb: "smb",
  dropbox: "dropbox",
  ftp: "ftp",
  sap: "sap",
};

const TYPE_TO_SIDEBAR = {
  google_drive: "google_drive",
  onedrive: "onedrive",
  local_directory: "local",
  smb: "smb",
  nas: "smb",
  dropbox: "dropbox",
  ftp: "ftp",
  sftp: "ftp",
  sap: "sap",
};

const AUTO_HIDDEN_FIELDS = new Set([
  "path", "folderPath", "folderId", "remotePath", "siteUrl", "library",
  "systemId", "client", "host", "teamId", "channelId", "tenantId",
  "serviceAccount", "accessToken", "department",
]);

let sourceTypes = [];
let googleOAuthStatus = { configured: false };
let connections = [];
let connectStep = 1;
let pendingUsername = "";
let pendingEmail = "";
let pendingGoogleSessionId = "";
let pendingGoogleEmail = "";
let connectUsesGoogle = false;
let pendingTypeId = "";
let syncPollTimer = null;

const CONNECT_TIMEOUT_MS = 30000;
const DISCONNECT_TIMEOUT_MS = 180000;
const LOCAL_FOLDER_UPLOAD_MS = 300000;

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

function resolveDocSource(typeId) {
  return sourceTypes.find((t) => t.id === typeId)?.docSource || typeId;
}

export function isSourceConnected(sidebarSrc) {
  if (!connections.length) return false;
  if (sidebarSrc === "all") return true;

  const typeId = SIDEBAR_TO_TYPE[sidebarSrc] || sidebarSrc;
  return connections.some((c) => c.type === typeId);
}

export function hasConnectedSources() {
  return connections.length > 0;
}

export function getConnectionsList() {
  return connections;
}

export function shouldPromptSourceConnect(sidebarSrc) {
  return sidebarSrc !== "all" && !isSourceConnected(sidebarSrc);
}

export function initSources() {
  document.getElementById("syncAllSourcesBtn")?.addEventListener("click", syncAllSources);
  document.getElementById("closeSourceModal")?.addEventListener("click", closeSourceModal);
  document.getElementById("sourceConnectBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    submitConnect();
  });
  document.getElementById("sourceResendOtpBtn")?.addEventListener("click", resendOtp);
  document.getElementById("sourceConnectBackBtn")?.addEventListener("click", () => {
    setConnectStep(1);
    document.getElementById("sourceModalResult").innerHTML = "";
  });
  document.getElementById("sourceModal")?.addEventListener("click", (e) => {
    if (e.target.id === "sourceModal") closeSourceModal();
  });
  return loadSourcesHub();
}

async function loadSourcesHub() {
  try {
    const [typesRes, connRes] = await Promise.all([
      api("/sources/types"),
      api("/sources"),
    ]);
    sourceTypes = typesRes.types || [];
    googleOAuthStatus = typesRes.googleOAuth || { configured: false };
    connections = connRes.connections || [];
    renderSourceGrid();
    renderActiveConnections();
    renderSidebarConnections();
    updateSidebarSources(connRes.stats?.bySource || {}, connections.length);
    if (window.render) window.render();
  } catch (err) {
    const grid = document.getElementById("sourceGrid");
    if (grid) {
      grid.innerHTML =
        `<div class="error-msg">Backend offline — start server to connect sources. ${esc(err.message)}</div>`;
    }
  }
}

function renderSourceGrid() {
  const grid = document.getElementById("sourceGrid");
  if (!grid) return;

  grid.innerHTML = sourceTypes.map((t) => {
    const connected = connections.filter((c) => c.type === t.id).length;
    const statusCls = t.configured ? "ready" : "needs-config";
    return `
      <div class="source-card" data-type="${t.id}">
        <div class="source-card-icon ${t.icon}">${SOURCE_ICONS[t.id] || "📁"}</div>
        <div class="source-card-body">
          <h4>${esc(t.label)}</h4>
          <span class="source-cat">${t.category}</span>
          <p class="source-help">${esc(t.help)}</p>
          <div class="source-card-footer">
            <span class="source-status ${statusCls}">${t.configured ? "Ready" : "Needs credentials"}</span>
            ${connected ? `<span class="source-count">${connected} connected</span>` : ""}
            <button class="btn btn-primary btn-sm source-connect-btn" data-type="${t.id}">Connect ↗</button>
          </div>
        </div>
      </div>`;
  }).join("");

  grid.querySelectorAll(".source-connect-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openConnectModal(btn.dataset.type);
    });
  });
}

function renderSidebarConnections() {
  const el = document.getElementById("sidebarConnections");
  const hint = document.getElementById("sidebarSourceHint");
  if (hint) {
    hint.textContent = connections.length
      ? `${connections.length} source${connections.length !== 1 ? "s" : ""} connected — documents are visible below.`
      : "No sources connected yet. Connect a source from the sidebar to import documents.";
  }

  document.querySelectorAll(".sidebar-group .nav-btn[data-src]").forEach((btn) => {
    const src = btn.dataset.src;
    if (src === "all") return;
    btn.classList.toggle("source-connected", isSourceConnected(src));
  });

  if (!el) return;

  if (!connections.length) {
    el.innerHTML = "";
    el.classList.add("dms-hidden");
    return;
  }

  el.classList.remove("dms-hidden");
  el.innerHTML = `
    <div class="sidebar-connections-head">
      <strong>Active connections</strong>
      <button type="button" class="btn btn-sm" id="disconnectAllSourcesBtn">Disconnect all</button>
    </div>
    ${connections.map((c) => `
      <div class="sidebar-connection-item">
        <span>${SOURCE_ICONS[c.type] || "📁"}</span>
        <div>
          <strong>${esc(c.label || c.type)}</strong>
          <small>${c.documentCount || 0} docs · ${esc(c.status || "connected")}</small>
          ${c.lastError ? `<small class="conn-error">${esc(c.lastError)}</small>` : ""}
        </div>
        <button type="button" class="btn btn-sm btn-danger sidebar-disconnect" data-id="${esc(c.id)}" title="Disconnect">×</button>
      </div>`).join("")}`;

  el.querySelectorAll(".sidebar-disconnect").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      disconnectOne(btn.dataset.id);
    });
  });
  document.getElementById("disconnectAllSourcesBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    disconnectAllSources();
  });
}

function startBackgroundSyncWatch() {
  if (syncPollTimer) clearInterval(syncPollTimer);
  let ticks = 0;
  syncPollTimer = setInterval(async () => {
    ticks += 1;
    try {
      await loadSourcesHub();
      if (window.render) window.render();
      const syncing = connections.some((c) => c.status === "syncing");
      if (!syncing || ticks >= 120) {
        clearInterval(syncPollTimer);
        syncPollTimer = null;
        if (!syncing && ticks > 1) {
          showSourceToast("Background scan finished");
        }
      }
    } catch {
      if (ticks >= 120) {
        clearInterval(syncPollTimer);
        syncPollTimer = null;
      }
    }
  }, 5000);
}

async function disconnectAllSources() {
  if (!connections.length) return;
  if (!confirm("Disconnect all sources? Documents from these sources will be hidden and removed.")) return;
  showSourceToast("Disconnecting all sources…");
  try {
    await api("/sources/disconnect-all", { method: "POST", timeout: DISCONNECT_TIMEOUT_MS });
    showSourceToast("All sources disconnected");
    await loadSourcesHub();
    if (window.render) window.render();
  } catch (err) {
    showSourceToast(err.message || "Disconnect failed", true);
  }
}

function renderActiveConnections() {
  const el = document.getElementById("activeConnections");
  if (!el) return;

  if (!connections.length) {
    el.innerHTML = `<p class="hint">No sources connected yet. Click a source in the sidebar or Connect above.</p>`;
    return;
  }

  el.innerHTML = connections.map((c) => `
    <div class="connection-row">
      <span class="conn-icon">${SOURCE_ICONS[c.type] || "📁"}</span>
      <div class="conn-info">
        <strong>${esc(c.label)}</strong>
        <small>${c.type} · ${c.documentCount || 0} docs · ${c.status}</small>
        ${c.lastSync ? `<small>Last sync: ${c.lastSync.slice(0, 16).replace("T", " ")}</small>` : ""}
        ${c.lastError ? `<small class="conn-error">${esc(c.lastError)}</small>` : ""}
      </div>
      <button class="btn btn-sm" data-sync="${c.id}">Sync</button>
      <button class="btn btn-sm btn-danger" data-disconnect="${c.id}">Remove</button>
    </div>`).join("");

  el.querySelectorAll("[data-sync]").forEach((btn) => {
    btn.addEventListener("click", () => syncOne(btn.dataset.sync));
  });
  el.querySelectorAll("[data-disconnect]").forEach((btn) => {
    btn.addEventListener("click", () => disconnectOne(btn.dataset.disconnect));
  });
}

function setConnectStep(step) {
  connectStep = step;
  const usesOtp = connectUsesGoogle;
  document.getElementById("connectStep1")?.classList.toggle("hidden", usesOtp && step !== 1);
  document.getElementById("connectStep2")?.classList.toggle("hidden", !usesOtp || step !== 2);
  const btn = document.getElementById("sourceConnectBtn");
  if (btn) {
    if (connectUsesGoogle) {
      btn.textContent = step === 1 ? "Sign in with Google" : "Verify & connect";
    } else {
      btn.textContent = "Connect";
    }
  }
  const backBtn = document.getElementById("sourceConnectBackBtn");
  if (backBtn) backBtn.classList.toggle("hidden", !usesOtp || step === 1);
}

function startGoogleSignIn() {
  return api("/sources/google/auth-url")
    .then(({ url }) => {
      window.open(url, "google-oauth", "width=520,height=640");
      return new Promise((resolve, reject) => {
        function onMsg(e) {
          if (!e.data || typeof e.data !== "object") return;
          if (e.data.type === "google-oauth-ok") {
            window.removeEventListener("message", onMsg);
            pendingGoogleSessionId = e.data.sessionId;
            pendingGoogleEmail = e.data.email;
            const hint = document.getElementById("sourceOtpHint");
            if (hint) {
              hint.innerHTML = `Code sent to <strong>${esc(e.data.email)}</strong>. Check your Gmail inbox and spam.`;
              hint.className = "hint";
            }
            setConnectStep(2);
            document.getElementById("sourceOtpInput")?.focus();
            resolve(e.data);
          }
          if (e.data.type === "google-oauth-error") {
            window.removeEventListener("message", onMsg);
            reject(new Error(e.data.error || "Google sign-in failed"));
          }
        }
        window.addEventListener("message", onMsg);
      });
    });
}

async function openConnectModal(typeId, options = {}) {
  if (!sourceTypes.length) {
    try {
      await loadSourcesHub();
    } catch (err) {
      showSourceToast(err.message || "Could not load source types", true);
      return;
    }
  }

  const type = sourceTypes.find((t) => t.id === typeId);
  if (!type) {
    showSourceToast(`Unknown source: ${typeId}`, true);
    return;
  }

  connectStep = 1;
  connectUsesGoogle = typeId === "google_drive";
  pendingUsername = "";
  pendingEmail = "";
  pendingGoogleSessionId = "";
  pendingGoogleEmail = "";
  pendingTypeId = typeId;
  document.getElementById("sourceModalResult").innerHTML = "";
  document.getElementById("sourceOtpHint").textContent = "";
  document.getElementById("sourceModalTitle").textContent = `Connect ${type.label}`;
  document.getElementById("sourceModalType").value = typeId;

  const fieldsEl = document.getElementById("sourceModalFields");
  const deptOptions = `<option value="auto">Auto-detect</option>
    <option value="finance">Finance</option><option value="hr">HR</option>
    <option value="project">Project</option><option value="admin">Admin</option>
    <option value="engineering">Engineering</option><option value="logistics">Logistics</option>`;

  const protocolPicker = options.showProtocolPicker || typeId === "ftp"
    ? `<div class="field">
        <label>Protocol</label>
        <select name="_protocol" id="sourceProtocolSelect">
          <option value="ftp" ${typeId === "ftp" ? "selected" : ""}>FTP</option>
          <option value="sftp" ${typeId === "sftp" ? "selected" : ""}>SFTP</option>
        </select>
      </div>`
    : "";

  const isLocal = typeId === "local_directory";
  const isOneDrive = typeId === "onedrive";
  const googleReady = connectUsesGoogle && type.configured;

  let authFields = "";
  if (connectUsesGoogle) {
    authFields = googleReady
      ? `<div class="connect-auth-block">
          <p class="hint"><strong>Step 1:</strong> Sign in with Google (your Gmail account).<br>
          <strong>Step 2:</strong> Enter the 6-digit code sent to your Gmail inbox.<br>
          <strong>Step 3:</strong> Your Google Drive files are imported.</p>
        </div>`
      : `<div class="error-msg connect-setup-msg">
          Google sign-in is not configured on this server yet.<br><br>
          An administrator must add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to <code>backend/.env</code>.<br>
          Create credentials at <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud Console</a>
          and set redirect URI to <code>${esc(googleOAuthStatus.redirectUri || "http://localhost:3001/api/sources/google/callback")}</code>.
        </div>`;
  } else {
    const scanHint = isLocal
      ? ""
      : isOneDrive
      ? "Your OneDrive folder on this PC will be scanned."
      : esc(type.help);
    authFields = isLocal
      ? `<div class="connect-auth-block">
          <p class="hint">Files stay on this PC. Search and chat use the local index.</p>
          <div class="local-mode-options">
            <label class="local-mode-option">
              <input type="radio" name="localMode" value="folder" checked/>
              <span>
                <strong>Select specific folder</strong>
                <small>Pick one folder from this computer</small>
              </span>
            </label>
            <label class="local-mode-option">
              <input type="radio" name="localMode" value="system"/>
              <span>
                <strong>Sync all local system data</strong>
                <small>Index Documents, Desktop, Downloads, Pictures, Videos, Music on this PC</small>
              </span>
            </label>
          </div>
        </div>`
      : `<div class="connect-auth-block">
          <p class="hint">${scanHint} Click <strong>Connect</strong> to start — no email verification.</p>
        </div>`;
  }

  const typeFields = (type.fields || [])
    .filter((f) => !AUTO_HIDDEN_FIELDS.has(f.key))
    .map((f) => {
    if (f.type === "select" && f.key === "department") {
      return `<div class="field"><label>${f.label}</label><select name="${f.key}">${deptOptions}</select></div>`;
    }
    return `<div class="field">
      <label>${f.label}${f.required ? " *" : ""}</label>
      <input name="${f.key}" type="${f.type || "text"}" placeholder="${esc(f.placeholder || "")}" ${f.required ? "required" : ""}/>
    </div>`;
  }).join("");

  fieldsEl.innerHTML = protocolPicker + authFields + typeFields;

  if (!connectUsesGoogle && !isLocal && !isOneDrive && !type.fields?.length && !protocolPicker) {
    fieldsEl.innerHTML += `<p class="hint">${esc(type.help)}</p>`;
  }

  document.getElementById("sourceModalHelp").textContent = connectUsesGoogle
    ? (googleReady
      ? "Sign in with Google — OTP goes to your Gmail inbox."
      : "Google OAuth must be configured before connecting Drive.")
    : isLocal
      ? "Choose one folder, or sync local system folders on this PC."
      : "";

  document.getElementById("sourceOtpInput").value = "";
  connectStep = 1;
  setConnectStep(1);
  const connectBtn = document.getElementById("sourceConnectBtn");
  if (connectBtn) {
    connectBtn.disabled = connectUsesGoogle && !googleReady;
    connectBtn.textContent = connectUsesGoogle
      ? "Sign in with Google"
      : typeId === "local_directory"
        ? "Connect"
        : "Connect";
  }

  if (isLocal) {
    const syncLabel = () => {
      const mode = document.querySelector('input[name="localMode"]:checked')?.value || "folder";
      if (connectBtn) {
        connectBtn.textContent = mode === "system"
          ? "Sync all local data"
          : "Choose folder…";
      }
    };
    document.querySelectorAll('input[name="localMode"]').forEach((el) => {
      el.addEventListener("change", syncLabel);
    });
    syncLabel();
  }

  document.getElementById("sourceModal").classList.add("open");
}

function openConnectModalForSidebar(sidebarSrc) {
  const typeId = SIDEBAR_TO_TYPE[sidebarSrc] || sidebarSrc;
  return openConnectModal(typeId, { showProtocolPicker: sidebarSrc === "ftp" });
}

function closeSourceModal() {
  document.getElementById("sourceModal")?.classList.remove("open");
  connectStep = 1;
  connectUsesGoogle = false;
  pendingGoogleSessionId = "";
  setConnectStep(1);
  const connectBtn = document.getElementById("sourceConnectBtn");
  if (connectBtn) {
    connectBtn.disabled = false;
    connectBtn.textContent = "Connect";
  }
}

function readConnectForm() {
  const typeEl = document.getElementById("sourceModalType");
  let type = typeEl?.value;
  const protocol = document.querySelector("[name=_protocol]")?.value;
  if (protocol) type = protocol;

  const config = {};
  document.querySelectorAll("#sourceModalFields [name]").forEach((el) => {
    if (el.name.startsWith("_")) return;
    if (el.name === "otpEmail") return;
    if (el.value) config[el.name] = el.value;
  });

  const email = document.querySelector("[name=otpEmail]")?.value?.trim() || "";

  return { type, config, email };
}

function pickLocalFolder() {
  return new Promise((resolve, reject) => {
    let input = document.getElementById("localFolderPicker");
    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.id = "localFolderPicker";
      input.hidden = true;
      input.multiple = true;
      input.setAttribute("webkitdirectory", "");
      document.body.appendChild(input);
    }
    input.value = "";
    const onChange = () => {
      input.removeEventListener("change", onChange);
      if (!input.files?.length) {
        reject(new Error("No folder selected"));
        return;
      }
      resolve(input.files);
    };
    input.addEventListener("change", onChange);
    input.click();
  });
}

async function uploadLocalFolderFiles(fileList, { connectionId, department, label } = {}) {
  const files = Array.from(fileList || []);
  if (!files.length) throw new Error("No files in folder");

  const folderLabel =
    files[0]?.webkitRelativePath?.split("/")?.[0] ||
    files[0]?.webkitRelativePath?.split("\\")?.[0] ||
    "Local folder";

  const fd = new FormData();
  for (const file of files) {
    fd.append("files", file, file.webkitRelativePath || file.name);
  }
  fd.append("department", department || "auto");
  fd.append("folderLabel", folderLabel);
  if (label) fd.append("label", label);

  const path = connectionId
    ? `/sources/${connectionId}/local-folder-sync`
    : "/sources/connect/local-folder";

  const token = getToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOCAL_FOLDER_UPLOAD_MS);

  try {
    const res = await fetch(`${CONFIG.API_BASE}${path}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error(data.error || "Session expired. Please sign in again.");
    if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
    return data;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Folder upload timed out. Try a smaller folder.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function finishLocalFolderConnect(res, resolvedType) {
  closeSourceModal();
  showSourceToast(res.sync?.message || `Connected! ${res.sync?.imported || 0} document(s) imported.`);
  await loadSourcesHub();
  if (window.render) await window.render();
  const sidebar = TYPE_TO_SIDEBAR[resolvedType];
  if (sidebar && window.setSourceFilter) window.setSourceFilter(sidebar);
}

async function sendOtpStep() {
  const { type, email } = readConnectForm();
  if (!email) throw new Error("Enter your email address");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address");
  }

  pendingEmail = email;
  pendingTypeId = type;

  const res = await api("/sources/send-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, type }),
  });

  const hint = document.getElementById("sourceOtpHint");
  if (hint) {
    hint.innerHTML = `Code sent to <strong>${esc(res.sentTo || email)}</strong>. Check inbox and spam (valid 5 min).`;
    hint.className = "hint";
  }

  setConnectStep(2);
  document.getElementById("sourceOtpInput")?.focus();
  return res;
}

async function resendOtp() {
  try {
    if (connectUsesGoogle && pendingGoogleSessionId) {
      const res = await api("/sources/google/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: pendingGoogleSessionId }),
      });
      const hint = document.getElementById("sourceOtpHint");
      if (hint) {
        hint.innerHTML = `Code sent to <strong>${esc(res.sentTo || pendingGoogleEmail)}</strong>. Check inbox and spam.`;
      }
    } else {
      await sendOtpStep();
    }
    showSourceToast("New verification code sent");
  } catch (err) {
    document.getElementById("sourceModalResult").innerHTML =
      `<div class="error-msg">${esc(err.message)}</div>`;
  }
}

async function submitConnect() {
  const resultEl = document.getElementById("sourceModalResult");
  if (resultEl) resultEl.innerHTML = "";

  const btn = document.getElementById("sourceConnectBtn");
  btn.disabled = true;

  try {
    if (connectUsesGoogle) {
      if (connectStep === 1) {
        btn.textContent = "Opening Google…";
        await startGoogleSignIn();
        return;
      }
      btn.textContent = "Connecting…";
      const otp = document.getElementById("sourceOtpInput")?.value?.trim();
      if (!otp) throw new Error("Enter the 6-digit code from your Gmail");
      if (!pendingGoogleSessionId) throw new Error("Sign in with Google first");

      const res = await api("/sources/connect/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: pendingGoogleSessionId, otp }),
      });

      closeSourceModal();
      if (res.sync?.background) {
        showSourceToast(res.sync.message || "Connected — syncing Drive in background…");
        startBackgroundSyncWatch();
      } else {
        showSourceToast(res.sync?.message || "Google Drive connected!");
      }
      await loadSourcesHub();
      if (window.render) await window.render();
      if (window.setSourceFilter) window.setSourceFilter("google_drive");
      return;
    }

    const { type, config } = readConnectForm();
    const resolvedType = type || pendingTypeId;
    const typeDef = sourceTypes.find((t) => t.id === resolvedType);

    if (resolvedType === "local_directory") {
      const localMode = document.querySelector('input[name="localMode"]:checked')?.value || "folder";
      if (localMode === "system") {
        btn.textContent = "Indexing local files…";
        const res = await api("/sources/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          timeout: CONNECT_TIMEOUT_MS,
          body: JSON.stringify({
            type: "local_directory",
            label: "Local System Data",
            config: {
              mode: "system",
              scanAll: true,
              localOnly: true,
              department: config.department || "auto",
            },
          }),
        });
        closeSourceModal();
        showSourceToast(res.sync?.message || "Local system indexing started…");
        if (res.sync?.background) startBackgroundSyncWatch();
        await loadSourcesHub();
        if (window.render) await window.render();
        if (window.setSourceFilter) window.setSourceFilter("local");
        return;
      }

      btn.textContent = "Choose folder…";
      const files = await pickLocalFolder();
      btn.textContent = `Uploading ${files.length} file(s)…`;
      const res = await uploadLocalFolderFiles(files, {
        department: config.department || "auto",
        label: typeDef?.label || "Local Folder",
      });
      await finishLocalFolderConnect(res, resolvedType);
      return;
    }

    btn.textContent = "Connecting…";
    const res = await api("/sources/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: CONNECT_TIMEOUT_MS,
      body: JSON.stringify({
        type: resolvedType,
        label: typeDef?.label,
        config,
      }),
    });

    closeSourceModal();
    if (res.sync?.background) {
      showSourceToast(res.sync.message || "Connected — scanning in background…");
      startBackgroundSyncWatch();
    } else {
      const autoNote = res.sync?.autoDetected ? " (auto-detected)" : "";
      const pathNote = res.sync?.scannedPaths?.length
        ? ` from ${res.sync.scannedPaths.length} location(s)`
        : "";
      const msg = res.sync?.imported
        ? `Connected! ${res.sync.imported} document(s) imported${pathNote}${autoNote}.`
        : res.sync?.message || "Source connected — documents will appear as they sync.";
      showSourceToast(msg);
    }
    await loadSourcesHub();
    if (window.render) await window.render();

    const sidebar = TYPE_TO_SIDEBAR[resolvedType];
    if (sidebar && window.setSourceFilter) {
      window.setSourceFilter(sidebar);
    }
  } catch (err) {
    if (resultEl) {
      resultEl.innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
    }
    showSourceToast(err.message || "Connect failed", true);
  } finally {
    const googleType = sourceTypes.find((t) => t.id === "google_drive");
    const modalType = document.getElementById("sourceModalType")?.value || pendingTypeId;
    btn.disabled = connectUsesGoogle && connectStep === 1 && !googleType?.configured;
    if (connectUsesGoogle) {
      btn.textContent = connectStep === 1 ? "Sign in with Google" : "Verify & connect";
    } else if (modalType === "local_directory") {
      const mode = document.querySelector('input[name="localMode"]:checked')?.value || "folder";
      btn.textContent = mode === "system" ? "Sync all local data" : "Choose folder…";
    } else {
      btn.textContent = "Connect";
    }
  }
}

async function syncOne(id) {
  try {
    const conn = connections.find((c) => String(c.id) === String(id));
    if (conn?.type === "local_directory") {
      const files = await pickLocalFolder();
      showSourceToast(`Uploading ${files.length} file(s)…`);
      const res = await uploadLocalFolderFiles(files, { connectionId: id });
      showSourceToast(res.message || `Synced — ${res.imported || 0} documents imported`);
      await loadSourcesHub();
      if (window.render) window.render();
      return;
    }
    const res = await api(`/sources/${id}/sync`, { method: "POST" });
    if (res.needsBrowserUpload) {
      const files = await pickLocalFolder();
      const up = await uploadLocalFolderFiles(files, { connectionId: id });
      showSourceToast(up.message || `Synced — ${up.imported || 0} documents imported`);
    } else {
      showSourceToast(`Synced — ${res.imported || 0} documents imported`);
    }
    await loadSourcesHub();
    if (window.render) window.render();
  } catch (err) {
    showSourceToast(err.message, true);
  }
}

async function disconnectOne(id) {
  if (!id) return;
  if (!confirm("Remove this source connection?")) return;
  showSourceToast("Disconnecting source…");
  try {
    await api(`/sources/${id}`, { method: "DELETE", timeout: DISCONNECT_TIMEOUT_MS });
    showSourceToast("Source disconnected");
    await loadSourcesHub();
    if (window.render) window.render();
  } catch (err) {
    showSourceToast(err.message || "Disconnect failed", true);
  }
}

async function syncAllSources() {
  showSourceToast("Syncing all sources…");
  try {
    const res = await api("/sources/sync-all", { method: "POST" });
    const total = res.results?.reduce((a, r) => a + (r.imported || 0), 0) || 0;
    showSourceToast(`Sync complete — ${total} documents imported`);
    await loadSourcesHub();
    if (window.render) window.render();
  } catch (err) {
    showSourceToast(err.message, true);
  }
}

function updateSidebarSources(bySource, connectedCount = connections.length) {
  const map = {
    onedrive: "cnt-onedrive",
    local: "cnt-local",
  };

  if (!connectedCount) {
    const elAll = document.getElementById("cnt-all");
    if (elAll) elAll.textContent = "0";
    Object.values(map).forEach((elId) => {
      const el = document.getElementById(elId);
      if (el) el.textContent = "0";
    });
    return;
  }

  let total = 0;
  Object.values(bySource).forEach((n) => { total += n; });
  const elAll = document.getElementById("cnt-all");
  if (elAll) elAll.textContent = total;
  Object.entries(map).forEach(([src, elId]) => {
    const el = document.getElementById(elId);
    if (el) el.textContent = bySource[src] || 0;
  });
}

function showSourceToast(msg, isError) {
  if (window.showToast) window.showToast(isError ? `⚠ ${msg}` : `✅ ${msg}`);
}

window.loadSourcesHub = loadSourcesHub;
window.openConnectModal = openConnectModal;
window.openConnectModalForSidebar = openConnectModalForSidebar;
window.isSourceConnected = isSourceConnected;
window.hasConnectedSources = hasConnectedSources;
window.getCurrentUser = getCurrentUser;
window.shouldPromptSourceConnect = shouldPromptSourceConnect;
