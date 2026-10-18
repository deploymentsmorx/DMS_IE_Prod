import { api, getToken } from "./api.js";
import { initFeatures } from "./features.js";
import { initChatManager } from "./chatManager.js";
import { initSettings } from "./settings.js";
import { initSearchLanguageSelect, languageLabel } from "./languages.js";
import { initSources } from "./sources.js";
import { initDmsNavigation } from "./modules/dms-nav.js";
import { getCurrentUser } from "./auth.js";
import { syncSuperAdminUi } from "./superAdmin.js";
import { initNotifications } from "./modules/notifications.js";
import { initSavedSearches, saveCurrentSearch as persistSavedSearch } from "./modules/saved-searches.js";
import { initGlobalAutocomplete } from "./autocomplete.js";

const chat = initChatManager();

const ICON = {
  pdf: "📄", docx: "📝", xlsx: "📊", pptx: "📑",
  dwg: "📐", image: "🖼️", other: "📁",
};
const SRC_COLOR = {
  google_drive: "var(--gdrive)",
  onedrive: "var(--onedrive)",
  manual: "var(--manual)",
};
const SRC_LABEL = {
  google_drive: "Google Drive",
  onedrive: "OneDrive",
  manual: "Manual",
  local: "Local",
  folder: "Local Folder",
  upload: "Upload",
  smb: "SMB Share",
  nas: "NAS",
  dropbox: "Dropbox",
  box: "Box",
  sharepoint: "SharePoint",
  ftp: "FTP",
  sftp: "SFTP",
  sap: "SAP ERP",
  teams: "Microsoft Teams",
  enterprise: "Library",
};
const CAT_LABEL = {
  engineering: "Engineering",
  finance: "Finance",
  hr: "HR",
  logistics: "Logistics",
  project: "Project",
  admin: "Admin",
  other: "Other",
};

const PAGE_META = {
  search: { title: "Document Search", sub: "Advanced full-text search with match scoring across all departments" },
  sources: { title: "Data Sources", sub: "Connect Google Drive, OneDrive, Dropbox, SMB, NAS, FTP/SFTP & more" },
  upload: { title: "Upload & Connect", sub: "Import files or connect local folder directories" },
  revisions: { title: "Revision Management", sub: "Track document version history" },
  compare: { title: "Drawing Comparison", sub: "Compare similarity between drawings and documents" },
  defects: { title: "Defect Analytics", sub: "Inspection defects by severity and project" },
  agentic: { title: "Agentic Search", sub: "Multi-step AI search across all data sources" },
  graph: { title: "Knowledge Graph", sub: "Relational map of documents and entities" },
  rca: { title: "Root Cause Analysis", sub: "AI-powered engineering RCA" },
  viewer3d: { title: "3D Viewer", sub: "Interactive drawing-to-3D visualization" },
};

let state = {
  docs: [],
  source: "all",
  type: "all",
  category: "all",
  query: "",
  lang: "auto",
  searchMeta: { detectedLang: "en", multilingual: false },
  requiresConnection: false,
};

function syncSearchLanguage(lang) {
  state.lang = lang || "auto";
  const langEl = document.getElementById("searchLang");
  if (langEl && langEl.value !== state.lang) langEl.value = state.lang;
}

function applySettingsLanguage() {
  const settings = chat.loadSettings();
  syncSearchLanguage(settings.language || "auto");
}

async function fetchDocs(overrides = {}) {
  const p = new URLSearchParams();
  const q = overrides.q !== undefined ? overrides.q : state.query;
  const source = overrides.source !== undefined ? overrides.source : state.source;
  const type = overrides.type !== undefined ? overrides.type : state.type;
  const category = overrides.category !== undefined ? overrides.category : state.category;

  if (q) p.set("q", q);
  if (source !== "all") p.set("source", source);
  if (type !== "all") p.set("fileType", type);
  if (category !== "all") p.set("category", category);
  const lang = overrides.lang !== undefined ? overrides.lang : state.lang;
  if (lang && lang !== "auto") p.set("lang", lang);
  p.set("limit", "100");
  try {
    const d = await api(`/documents?${p}`);
    state.searchMeta = {
      detectedLang: d.detectedLang || "en",
      multilingual: Boolean(d.multilingual),
    };
    state.requiresConnection = Boolean(d.requiresConnection);
    return d.results;
  } catch {
    return [];
  }
}

async function fetchStats() {
  try {
    const stats = await api("/stats");
    state.requiresConnection = Boolean(stats.requiresConnection);
    return stats;
  } catch {
    return { total: 0, bySource: {}, requiresConnection: true };
  }
}

function matchBadge(pct) {
  const cls = pct >= 80 ? "high" : pct >= 50 ? "mid" : "low";
  return `<span class="match-badge ${cls}">${pct}% match</span>`;
}

function matchBar(pct) {
  const color = pct >= 80 ? "var(--emerald)" : pct >= 50 ? "var(--amber)" : "var(--indigo-lt)";
  return `<div class="match-bar-wrap" title="${pct}% match"><div class="match-bar" style="width:${pct}%;background:${color}"></div></div>`;
}

async function updateKpis(docs) {
  const stats = await fetchStats();
  const depts = Object.keys(stats.byDepartment || stats.byCategory || {}).length;
  const topMatch = docs.length && state.query ? (docs[0].matchPercent || 0) : 0;

  document.getElementById("kpiTotal").textContent = stats.total ?? docs.length;
  document.getElementById("kpiDepts").textContent = depts || "—";
  document.getElementById("kpiMatch").textContent = state.query ? `${topMatch}%` : "—";
}

function setPageMeta(ws) {
  const meta = PAGE_META[ws] || PAGE_META.search;
  document.getElementById("pageTitle").textContent = meta.title;
  document.getElementById("pageSubtitle").textContent = meta.sub;
  document.getElementById("pageBreadcrumb").textContent = meta.title;
}

async function render() {
  const list = document.getElementById("docList");
  try {
    const docs = await fetchDocs();
    state.docs = docs;

    const count = document.getElementById("resultCount");
    if (count) count.textContent = `${docs.length} result${docs.length !== 1 ? "s" : ""}`;
    if (!list) return;

    await updateKpis(docs);

    const langBadge = document.getElementById("detectedLangBadge");
    if (langBadge) {
      if (state.query && state.searchMeta?.detectedLang) {
        langBadge.hidden = false;
        langBadge.textContent = state.searchMeta.multilingual
          ? `Multilingual · ${languageLabel(state.searchMeta.detectedLang)}`
          : `Language · ${languageLabel(state.searchMeta.detectedLang)}`;
      } else {
        langBadge.hidden = true;
      }
    }

    if (!docs.length) {
      const srcLabel = SRC_LABEL[state.source] || state.source;
      const canManageFolders = window.canManageFolderAccess?.() !== false;
      const needsConnect = state.requiresConnection || !window.hasConnectedSources?.()
        || (state.source !== "all" && window.shouldPromptSourceConnect?.(state.source));
      const folderAccessNeeded = !canManageFolders && needsConnect;
      const filters = activeFilterLabels();
      const filterHint = filters.length && !needsConnect
        ? `<p style="margin-top:8px">Active filters: <strong>${filters.join(", ")}</strong> — these may hide matches.</p>
           <button class="btn btn-primary" style="margin-top:10px" type="button" onclick="clearSearchFilters()">Clear filters</button>`
        : "";
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${needsConnect ? "🔌" : "🔍"}</div>
          <h3>${folderAccessNeeded ? "No folder access yet" : needsConnect ? "Connect a data source first" : state.query ? "No matches for your search" : "No documents found"}</h3>
          <p>${folderAccessNeeded
            ? "Ask an Admin or Super Admin to grant your role or account access to a folder."
            : needsConnect
            ? "Documents appear only after you connect a source (OneDrive or Local folder). Click <strong>Connect a source</strong> in the sidebar."
            : state.query
              ? `Nothing matched "<strong>${esc(state.query)}</strong>". Try fewer keywords or check spelling.`
              : "Try finance, invoice, inspection, CAD, HR, or connect a folder in Data Sources."}</p>
          ${filterHint}
          ${needsConnect && canManageFolders ? `<button class="btn btn-primary" style="margin-top:12px" type="button" onclick="document.getElementById('sidebarConnectBtn')?.click()">Connect a source</button>` : ""}
          ${needsConnect && canManageFolders && state.source !== "all" ? `<button class="btn btn-sm" style="margin-top:8px;margin-left:8px" type="button" onclick="openConnectModalForSidebar('${state.source}')">Connect ${srcLabel}</button>` : ""}
        </div>`;
      return;
    }

    list.innerHTML = docs.map((doc, i) => {
    const isTop = doc.matchPercent > 0 && i < 3;
    const srcCol = SRC_COLOR[doc.source] || "var(--text3)";
    const tags = (doc.tags || []).slice(0, 3).map(t => `<span class="tag-pill">${t}</span>`).join("");
    const isReal = doc.url && !doc.url.includes("REPLACE") && doc.url !== "#";
    const pct = doc.matchPercent || 0;

    const dept = doc.department || doc.category;

    return `
      <div class="doc-card${isTop ? " top-match" : ""}" data-url="${doc.url}">
        <div class="file-icon fi-${doc.fileType || "other"}">${ICON[doc.fileType] || "📁"}</div>
        <div class="card-body">
          <div class="card-title-row">
            <div class="card-title">${esc(doc.title)}</div>
            ${state.query && pct > 0 ? matchBadge(pct) : ""}
          </div>
          <div class="card-desc">${esc(doc.snippet || doc.description)}</div>
          <div class="card-meta">
            <span class="src-badge">
              <span class="src-dot" style="background:${srcCol}"></span>
              ${SRC_LABEL[doc.source] || doc.source}
            </span>
            ${dept ? `<span class="cat-badge">${CAT_LABEL[dept] || dept}</span>` : ""}
            ${tags}
            ${doc.size ? `<span class="size-label">${doc.size}</span>` : ""}
          </div>
          ${state.query && pct > 0 ? matchBar(pct) : ""}
        </div>
        <div class="card-action">
          ${doc.revision ? `<span class="rev-label">Rev ${doc.revision}</span>` : ""}
          <button type="button" class="btn btn-sm similar-btn" data-doc-id="${esc(doc.id)}" data-doc-title="${esc(doc.title)}">Similar</button>
          ${isReal
            ? `<button type="button" class="open-link" data-doc-url="${esc(doc.url)}">Open ↗</button>`
            : `<span class="open-link disabled">No link</span>`}
        </div>
      </div>`;
  }).join("");

  list.querySelectorAll(".doc-card").forEach(card => {
    card.addEventListener("click", e => {
      if (e.target.closest(".open-link")) return;
      const url = card.dataset.url;
      if (url && !url.includes("REPLACE") && url !== "#") openDocument(url);
    });
  });

  list.querySelectorAll(".similar-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      window.showSimilarDocuments?.(btn.dataset.docId, btn.dataset.docTitle);
    });
  });

  list.querySelectorAll(".open-link[data-doc-url]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openDocument(btn.dataset.docUrl);
    });
  });

  await updateSidebar();
  } catch (err) {
    console.error("render failed:", err);
    if (list) {
      list.innerHTML = `<div class="error-msg">Could not load documents: ${esc(err.message)}. Try logging out and back in.</div>`;
    }
  }
}

async function updateSidebar() {
  const stats = await fetchStats();
  if (stats.requiresConnection || !window.hasConnectedSources?.()) {
    const elAll = document.getElementById("cnt-all");
    if (elAll) elAll.textContent = "0";
    ["onedrive", "local", "manual"].forEach((s) => {
      const el = document.getElementById(`cnt-${s}`);
      if (el) el.textContent = "0";
    });
    return;
  }
  const elAll = document.getElementById("cnt-all");
  if (elAll) elAll.textContent = stats.total ?? 0;
  ["onedrive", "local", "manual"].forEach((s) => {
    const el = document.getElementById(`cnt-${s}`);
    if (el) el.textContent = stats.bySource?.[s] || 0;
  });
}

function setSource(src, btn) {
  state.source = src;
  document.querySelectorAll(".nav-btn[data-src]").forEach(b => b.classList.remove("active"));
  btn?.classList.add("active");

  if (src !== "all" && window.shouldPromptSourceConnect?.(src)) {
    window.openConnectModalForSidebar?.(src);
    const msg = `Connect ${SRC_LABEL[src] || src} to import your documents.`;
    showToast(msg);
  }

  render();
}

function setSourceFilter(src) {
  const btn = document.querySelector(`.nav-btn[data-src="${src}"]`);
  if (btn) setSource(src, btn);
}

function setType(type, btn) {
  state.type = type;
  document.querySelectorAll(".chip[data-type]").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  render();
}

function setCategory(cat, btn) {
  state.category = cat;
  document.querySelectorAll(".chip[data-cat]").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  render();
}

function resetSearchFilters() {
  state.type = "all";
  state.category = "all";
  document.querySelectorAll(".chip[data-type]").forEach((b) => {
    b.classList.toggle("active", b.dataset.type === "all");
  });
  document.querySelectorAll(".chip[data-cat]").forEach((b) => {
    b.classList.toggle("active", b.dataset.cat === "all");
  });
}

function activeFilterLabels() {
  const labels = [];
  if (state.source !== "all") labels.push(SRC_LABEL[state.source] || state.source);
  if (state.category !== "all") labels.push(CAT_LABEL[state.category] || state.category);
  if (state.type !== "all") labels.push(state.type.toUpperCase());
  return labels;
}

function runSearch(query) {
  const q = (query ?? "").trim();
  if (q) resetSearchFilters();
  state.query = q;
  const input = document.getElementById("globalSearch");
  if (input && input.value.trim() !== q) input.value = q;
  render();
}

function quickSearch(q) {
  runSearch(q);
}

async function initChatExamples() {
  const footer = document.querySelector(".chat-footer");
  if (!footer || document.getElementById("chatExamples")) return;
  try {
    const data = await api("/intelligence/capabilities");
    const examples = data.examples?.chat || [];
    const wrap = document.createElement("div");
    wrap.id = "chatExamples";
    wrap.className = "ai-example-chips";
    wrap.innerHTML = examples
      .slice(0, 4)
      .map((text) => `<button type="button" class="ai-example-chip" data-text="${text.replace(/"/g, "&quot;")}">${text}</button>`)
      .join("");
    footer.parentElement?.insertBefore(wrap, footer);
    wrap.querySelectorAll(".ai-example-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const input = document.getElementById("chatInput");
        if (input) input.value = btn.dataset.text || "";
        sendMessage();
      });
    });
  } catch {
    /* optional */
  }
}

async function initAiInsightsPanel() {
  const host = document.getElementById("searchSidebarExtras");
  if (!host || document.getElementById("aiInsightsPanel")) return;
  try {
    const insights = await api("/intelligence/insights");
    const panel = document.createElement("div");
    panel.id = "aiInsightsPanel";
    panel.className = "ai-insights-panel sidebar-group";
    panel.innerHTML = `
      <h4>AI Insights</h4>
      <div class="ai-insight-grid">
        <div class="ai-insight-card"><strong>${insights.pendingApprovals?.length || 0}</strong><span>Pending approvals</span></div>
        <div class="ai-insight-card"><strong>${insights.draftCount || 0}</strong><span>Draft documents</span></div>
        <div class="ai-insight-card"><strong>${insights.approvedCount || 0}</strong><span>Approved</span></div>
        <div class="ai-insight-card"><strong>${insights.unreadNotifications || 0}</strong><span>Notifications</span></div>
      </div>
      <p class="sidebar-hint">Role: ${insights.permissions?.label || insights.role || "Viewer"}</p>`;
    host.insertBefore(panel, host.firstChild?.nextSibling || null);
  } catch {
    /* optional */
  }
}

function openModal() { document.getElementById("addModal").classList.add("open"); }
function closeModal() { document.getElementById("addModal").classList.remove("open"); }

async function addDocument() {
  const title = document.getElementById("fTitle").value.trim();
  const url = document.getElementById("fUrl").value.trim();
  if (!title || !url) { showToast("Title and URL are required"); return; }

  const doc = {
    title, url,
    description: document.getElementById("fDesc").value,
    content: document.getElementById("fContent").value,
    source: document.getElementById("fSource").value,
    fileType: document.getElementById("fType").value,
    category: document.getElementById("fCategory").value,
    tags: document.getElementById("fTags").value,
    size: document.getElementById("fSize").value,
  };

  try {
    await api("/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    });
    showToast("Document added");
  } catch {
    showToast("Saved locally (backend offline)");
  }

  closeModal();
  ["fTitle","fDesc","fUrl","fContent","fTags","fSize"].forEach(id => {
    document.getElementById(id).value = "";
  });
  render();
  aiMsg(`<strong>${esc(title)}</strong> has been added and is now searchable.`);
}

async function syncDocs() {
  showToast("Syncing all sources…");
  try {
    const res = await api("/sources/sync-all", { method: "POST" });
    const total = res.results?.reduce((a, r) => a + (r.imported || 0), 0) || 0;
    showToast(`Sync complete — ${total} docs`);
    if (window.loadSourcesHub) window.loadSourcesHub();
    render();
  } catch {
    try {
      const res = await api("/sync", { method: "POST" });
      showToast(res.message || "Sync complete");
      render();
    } catch {
      showToast("Backend offline — run npm start in backend/");
    }
  }
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

async function openDocument(url) {
  if (!url || url === "#" || url.includes("REPLACE")) {
    showToast("No file link available for this document");
    return;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    window.open(url, "_blank", "noopener");
    return;
  }

  const fullUrl = url.startsWith("/") ? `${window.location.origin}${url}` : url;
  const token = getToken();

  try {
    const res = await fetch(fullUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const contentType = res.headers.get("content-type") || "";

    if (!res.ok) {
      if (contentType.includes("application/json")) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not open document");
      }
      throw new Error(`Could not open document (${res.status})`);
    }

    if (contentType.includes("application/json")) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Could not open document");
    }

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } catch (err) {
    showToast(err.message || "Could not open document");
  }
}

function renderChatUI() {
  const box = document.getElementById("messages");
  const session = chat.getActiveSession();
  const settings = chat.loadSettings();

  const sessionLabel = document.getElementById("chatSessionLabel");
  if (sessionLabel) {
    sessionLabel.textContent = session?.title && session.title !== "New Chat"
      ? `${session.title} · Chat with your documents`
      : "Chat with one file or several. Give a file name as a clue, or pick files below.";
  }
  renderChatHistoryDropdown();

  box.innerHTML = "";
  const msgs = session?.messages || [];

  if (!msgs.length && settings.showWelcomeOnNewChat) {
    box.innerHTML = `<div class="msg msg-ai">${chat.getWelcomeHtml()}</div>`;
  } else {
    msgs.forEach((m) => {
      const div = document.createElement("div");
      div.className = `msg msg-${m.role === "user" ? "user" : "ai"}`;
      if (m.html) div.innerHTML = m.html;
      else div.textContent = m.content;
      box.appendChild(div);
    });
  }

  updateChatToolbar();
  box.querySelectorAll(".chat-doc-link[data-doc-url]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openDocument(btn.dataset.docUrl);
    });
  });
  box.scrollTop = box.scrollHeight;
}

function renderChatHistoryDropdown() {
  const el = document.getElementById("chatHistoryList");
  if (!el) return;
  const active = chat.getActiveSession();
  el.innerHTML = chat.getAllSessions().map((s) => `
    <button class="chat-history-item${s.id === active?.id ? " active" : ""}" data-id="${s.id}">
      <span>${esc(s.title)}</span>
      <small>${s.updatedAt?.slice(0, 10)}</small>
    </button>`).join("");

  el.querySelectorAll(".chat-history-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      chat.setActiveSession(btn.dataset.id);
      renderChatUI();
      document.getElementById("chatHistoryDropdown")?.classList.remove("open");
    });
  });
}

function updateChatToolbar() {
  const undoBtn = document.getElementById("chatUndo");
  const redoBtn = document.getElementById("chatRedo");
  if (undoBtn) undoBtn.disabled = !chat.canUndo();
  if (redoBtn) redoBtn.disabled = !chat.canRedo();
}

function aiMsg(html, content = "") {
  chat.addMessage("assistant", content || html.replace(/<[^>]+>/g, ""), html);
  renderChatUI();
}

function userMsg(text) {
  chat.addMessage("user", text);
  renderChatUI();
}

function showTyping() {
  const box = document.getElementById("messages");
  const div = document.createElement("div");
  div.className = "typing-bubble";
  div.id = "typing";
  div.innerHTML = "<span></span><span></span><span></span>";
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function hideTyping() {
  document.getElementById("typing")?.remove();
}

function renderRefCards(refs) {
  if (!refs?.length) return "";
  let html = `<br><br><strong class="ref-label">Referenced documents</strong>`;
  refs.forEach(doc => {
    const srcCol = SRC_COLOR[doc.source] || "var(--text3)";
    const isReal = doc.url && !doc.url.includes("REPLACE") && doc.url !== "#";
    html += `
      <div class="chat-doc">
        <div class="chat-doc-title">
          ${ICON[doc.fileType] || "📁"} ${esc(doc.title)}
          <span class="match-pct-sm">${doc.scoped ? "This file" : `${doc.matchPercent || 0}%`}</span>
        </div>
        <div class="chat-doc-desc">${esc(doc.description)}</div>
        <div class="chat-doc-meta">
          <span class="src-dot-sm" style="background:${srcCol}"></span>
          ${SRC_LABEL[doc.source] || doc.source}
          ${doc.category ? ` · ${CAT_LABEL[doc.category] || doc.category}` : ""}
        </div>
        ${isReal
          ? `<button type="button" class="chat-doc-link" data-doc-url="${esc(doc.url)}">↗ Open document</button>`
          : ""}
      </div>`;
  });
  return html;
}

const chatFileIds = new Set();
let followUpFileIds = [];

function resetFollowUpFiles() {
  followUpFileIds = [];
}

function updateChatFilesLabel(docs) {
  const label = document.getElementById("chatFilesLabel");
  if (!label) return;
  if (!chatFileIds.size) {
    label.textContent = "Using a file name in your question";
    return;
  }
  const names = docs
    .filter((doc) => chatFileIds.has(String(doc.id)))
    .map((doc) => doc.title);
  label.textContent = names.length ? `Only: ${names.join(", ")}` : `${chatFileIds.size} file(s) selected`;
}

async function loadChatFilePicker() {
  const menu = document.getElementById("chatFilesMenu");
  if (!menu) return;
  let docs = [];
  try {
    const data = await api("/documents?limit=100");
    docs = data.results || [];
  } catch {
    docs = [];
  }
  if (!docs.length) {
    menu.innerHTML = `<p class="hint">No files are in the DMS yet.</p>`;
    updateChatFilesLabel([]);
    return;
  }
  menu.innerHTML = docs.map((doc) => `
    <label>
      <input type="checkbox" value="${esc(doc.id)}" ${chatFileIds.has(String(doc.id)) ? "checked" : ""}/>
      <span>${esc(doc.title)}</span>
    </label>`).join("");
  menu.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) chatFileIds.add(input.value);
      else chatFileIds.delete(input.value);
      updateChatFilesLabel(docs);
    });
  });
  updateChatFilesLabel(docs);
}

async function sendMessage() {
  const inp = document.getElementById("chatInput");
  const text = inp.value.trim();
  if (!text) return;
  inp.value = "";
  inp.style.height = "38px";

  userMsg(text);
  showTyping();

  let reply = "";
  let refs = [];
  const history = chat.getApiHistory().slice(0, -1);

  try {
    const data = await api("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        history: history.slice(-8),
        documentIds: [...chatFileIds],
        followUpIds: chatFileIds.size ? [] : followUpFileIds,
      }),
    });
    reply = data.reply || "";
    refs = data.references || [];
    if (!chatFileIds.size && refs.length) {
      followUpFileIds = refs.map((doc) => String(doc.id)).filter(Boolean);
    }
  } catch {
    const old = state.query;
    state.query = text;
    const matched = await fetchDocs();
    state.query = old;
    refs = matched.slice(0, 4).map(d => ({
      ...d,
      matchPercent: d.matchPercent || 0,
    }));
    reply = matched.length
      ? `Found ${matched.length} document(s) matching your query. Top match: ${matched[0].title} (${matched[0].matchPercent || 0}%).`
      : `No documents found for "${text}". Try keywords like invoice, inspection, CAD, or HR.`;
  }

  hideTyping();
  const html = reply.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>") + renderRefCards(refs);
  aiMsg(html);
}

async function checkHealth() {
  const badge = document.getElementById("statusBadge");
  try {
    const h = await api("/health");
    if (badge) {
      badge.textContent = h.openai ? "Online" : "Offline";
      badge.className = `status-badge ${h.openai ? "ok" : "warn"}`;
    }
  } catch (err) {
    if (badge) {
      badge.textContent = "Offline";
      badge.className = "status-badge warn";
    }
    console.warn("Health check failed:", err.message);
  }
}

function clearCurrentChat() {
  resetFollowUpFiles();
  chatFileIds.clear();
  updateChatFilesLabel([]);
  chat.clearActiveChat();
  const box = document.getElementById("messages");
  if (box) box.innerHTML = "";
  renderChatUI();
  showToast("Chat cleared");
}

function deleteCurrentChat() {
  if (!window.confirm("Delete this chat permanently?")) return;
  resetFollowUpFiles();
  chatFileIds.clear();
  updateChatFilesLabel([]);
  chat.deleteActiveChat();
  renderChatUI();
  showToast("Chat deleted");
}

function startNewChat() {
  resetFollowUpFiles();
  chatFileIds.clear();
  updateChatFilesLabel([]);
  chat.newChat();
  renderChatUI();
  showToast("New chat started");
}

function toggleChatHistory() {
  document.getElementById("chatHistoryDropdown")?.classList.toggle("open");
}

export async function bootstrapApp() {
  try {
    window.renderChatUI = renderChatUI;
    window.startNewChat = startNewChat;
    window.clearCurrentChat = clearCurrentChat;
    window.deleteCurrentChat = deleteCurrentChat;
    window.setSource = setSource;
    window.setSourceFilter = setSourceFilter;
    window.setType = setType;
    window.setCategory = setCategory;
    window.quickSearch = quickSearch;
    window.runSearch = runSearch;
    window.clearSearchFilters = function clearSearchFilters() {
      resetSearchFilters();
      render();
    };
    window.openModal = openModal;
    window.closeModal = closeModal;
    window.addDocument = addDocument;
    window.syncDocs = syncDocs;
    window.sendMessage = sendMessage;
    window.render = render;
    window.setPageMeta = setPageMeta;
    window.showToast = showToast;
    window.syncSearchLanguage = syncSearchLanguage;
    window.saveCurrentSearch = () => persistSavedSearch(state);
    window.applySavedSearch = function applySavedSearch(saved) {
      state.query = saved.query || "";
      state.source = saved.source || "all";
      state.category = saved.category || "all";
      state.type = saved.fileType || "all";
      state.lang = saved.lang || "auto";
      const searchEl = document.getElementById("globalSearch");
      if (searchEl) searchEl.value = state.query;
      const langEl = document.getElementById("searchLang");
      if (langEl) langEl.value = state.lang;
      document.querySelectorAll(".sidebar-group .nav-btn[data-src]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.src === state.source);
      });
      document.querySelectorAll(".chip[data-cat]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.cat === state.category);
      });
      document.querySelectorAll(".chip[data-type]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.type === state.type);
      });
      render();
    };

    document.getElementById("headerSearchBtn")?.addEventListener("click", () => {
      document.querySelector(".topbar")?.classList.add("search-open");
      if (typeof window.switchDmsModule === "function") window.switchDmsModule("search");
      const input = document.getElementById("globalSearch");
      if (input) {
        input.focus();
        input.scrollIntoView({ block: "nearest" });
      }
    });

    document.getElementById("globalSearch")?.addEventListener("input", (e) => {
      runSearch(e.target.value);
    });

    document.getElementById("globalSearch")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        runSearch(e.target.value);
      }
    });

    document.getElementById("searchLang")?.addEventListener("change", (e) => {
      state.lang = e.target.value;
      chat.saveSettings({ ...chat.loadSettings(), language: state.lang });
      render();
    });

    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("globalSearch")?.focus();
      }
    });

    document.getElementById("addModal")?.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    document.getElementById("chatFilesToggle")?.addEventListener("click", async () => {
      const menu = document.getElementById("chatFilesMenu");
      if (!menu) return;
      menu.classList.toggle("open");
      if (menu.classList.contains("open")) await loadChatFilePicker();
    });

    document.getElementById("chatInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    document.getElementById("chatInput")?.addEventListener("input", function () {
      this.style.height = "38px";
      this.style.height = Math.min(this.scrollHeight, 110) + "px";
    });

    initFeatures(fetchDocs);
    initSettings(chat);
    applySettingsLanguage();
    initSearchLanguageSelect(document.getElementById("searchLang"), state.lang);
    await initSources();
    initDmsNavigation(getCurrentUser());
    syncSuperAdminUi(getCurrentUser());
    const loginDetailsBtn = document.getElementById("sidebarLoginDetailsBtn");
    loginDetailsBtn?.addEventListener("click", () => window.switchDmsModule?.("users"));
    initNotifications();
    initSavedSearches();
    initSimilarDocsPanel();
    initGlobalAutocomplete();
    initChatExamples();
    initAiInsightsPanel();

    document.getElementById("chatNew")?.addEventListener("click", startNewChat);
    document.getElementById("chatClear")?.addEventListener("click", clearCurrentChat);
    document.getElementById("chatDelete")?.addEventListener("click", deleteCurrentChat);
    document.getElementById("chatUndo")?.addEventListener("click", () => {
      if (chat.undo()) { renderChatUI(); showToast("Undone"); }
    });
    document.getElementById("chatRedo")?.addEventListener("click", () => {
      if (chat.redo()) { renderChatUI(); showToast("Redone"); }
    });
    document.getElementById("chatHistoryToggle")?.addEventListener("click", toggleChatHistory);
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".chat-history-wrap")) {
        document.getElementById("chatHistoryDropdown")?.classList.remove("open");
      }
    });

    renderChatUI();
    render().then(() => {
      if (window.hasConnectedSources?.()) {
        showToast("Ready — search across your connected sources.");
      } else {
        showToast("Connect a data source in the sidebar to import documents.");
      }
    });
    checkHealth();
  } catch (err) {
    console.error("App bootstrap failed:", err);
    const list = document.getElementById("docList");
    if (list) {
      list.innerHTML = `<div class="error-msg">App failed to start: ${esc(err.message)}. Refresh the page.</div>`;
    }
  }
}
