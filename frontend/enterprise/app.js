const API = window.location.origin;
const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

const COLOR_PALETTE = [
  { bg: 'var(--c0-bg)', text: 'var(--c0-text)', dot: 'var(--c0-dot)' },
  { bg: 'var(--c1-bg)', text: 'var(--c1-text)', dot: 'var(--c1-dot)' },
  { bg: 'var(--c2-bg)', text: 'var(--c2-text)', dot: 'var(--c2-dot)' },
  { bg: 'var(--c3-bg)', text: 'var(--c3-text)', dot: 'var(--c3-dot)' },
  { bg: 'var(--c4-bg)', text: 'var(--c4-text)', dot: 'var(--c4-dot)' },
  { bg: 'var(--c5-bg)', text: 'var(--c5-text)', dot: 'var(--c5-dot)' },
];

let authors = [];
let docSummaries = [];
let currentDoc = null;

let state = {
  selectedDocId: null,
  selectedVersionId: null,
  viewMode: 'document',   // 'document' | 'changes'
  searchQuery: '',
};

// ─── API ──────────────────────────────────────────────────

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

async function loadAuthors() {
  authors = await api('/api/authors');
}

async function loadDocList() {
  docSummaries = await api('/api/documents');
  renderDocList();
}

async function loadDocument(id) {
  currentDoc = await api(`/api/documents/${id}`);
  if (!state.selectedVersionId) {
    const last = currentDoc.versions[currentDoc.versions.length - 1];
    state.selectedVersionId = last.id;
  }
  renderMain();
}

// ─── Author colors ────────────────────────────────────────

function authorColor(name) {
  const author = authors.find(a => a.name === name);
  const idx = author ? author.colorIndex % COLOR_PALETTE.length : 0;
  return COLOR_PALETTE[idx];
}

function authorOrg(name) {
  const author = authors.find(a => a.name === name);
  return author ? author.organization : '';
}

// ─── Helpers ──────────────────────────────────────────────

function formatTime(iso) {
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const hh = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ampm = hh < 12 ? 'AM' : 'PM';
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${hh % 12 || 12}:${mm} ${ampm}`;
}

function formatVersionLabel(id) {
  const n = String(id).replace(/^v/i, '');
  return `Version ${n}`;
}

function uniqueAuthors(doc) {
  const seen = new Set();
  return doc.versions.filter(v => !seen.has(v.author) && seen.add(v.author)).map(v => v.author);
}

function computeDiff(prevLines, currLines) {
  const lcs = (a, b) => {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    const seq = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) { seq.push({ type: 'ctx', line: a[i - 1] }); i--; j--; }
      else if (dp[i - 1][j] > dp[i][j - 1]) { seq.push({ type: 'del', line: a[i - 1] }); i--; }
      else { seq.push({ type: 'add', line: b[j - 1] }); j--; }
    }
    while (i > 0) { seq.push({ type: 'del', line: a[i - 1] }); i--; }
    while (j > 0) { seq.push({ type: 'add', line: b[j - 1] }); j--; }
    return seq.reverse();
  };
  return lcs(prevLines, currLines);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ─── Rendering ────────────────────────────────────────────

function renderDocList() {
  const container = document.getElementById('docList');
  const q = state.searchQuery.toLowerCase();
  const filtered = docSummaries.filter(d => d.name.toLowerCase().includes(q));
  container.innerHTML = '';
  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:24px 12px;color:var(--text3);font-size:12px">No documents found</div>`;
    return;
  }
  filtered.forEach(doc => {
    const ac = authorColor(doc.lastAuthor);
    const el = document.createElement('div');
    el.className = 'doc-item' + (doc.id === state.selectedDocId ? ' active' : '');
    el.innerHTML = `
      <div class="doc-item-name">${escHtml(doc.name)}</div>
      <div class="doc-item-meta">${doc.versionCount} saved cop${doc.versionCount > 1 ? 'ies' : 'y'} · ${formatTime(doc.lastTime).split('·')[0].trim()}</div>
      <span class="doc-item-pill" style="background:${ac.bg};color:${ac.text}">
        <span style="width:7px;height:7px;border-radius:50%;background:${ac.dot}"></span>${escHtml(doc.lastAuthor)}
      </span>`;
    el.onclick = () => selectDoc(doc.id);
    container.appendChild(el);
  });
}

async function selectDoc(id) {
  state.selectedDocId = id;
  state.selectedVersionId = null;
  state.viewMode = 'document';
  document.getElementById('emptyState')?.remove();
  renderDocList();
  document.getElementById('main').innerHTML = '<div class="loading">Loading document…</div>';
  await loadDocument(id);
}

function renderMain() {
  const doc = currentDoc;
  if (!doc) return;

  document.getElementById('main').innerHTML = `
    <div class="toolbar" id="toolbar">
      <span class="toolbar-title">${escHtml(doc.name)}</span>
      <div class="view-toggle">
        <button class="view-btn${state.viewMode === 'document' ? ' active' : ''}" onclick="setView('document')">Document</button>
        <button class="view-btn${state.viewMode === 'changes' ? ' active' : ''}" onclick="setView('changes')">Changes</button>
      </div>
      <button class="btn-primary" onclick="showSaveModal()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Save changes
      </button>
    </div>
    <div class="content-area">
      <div class="editor-panel" id="editorPanel">
        ${state.viewMode === 'document' ? renderDocumentView(doc) : renderChangesView(doc)}
      </div>
      ${renderHistoryPanel(doc)}
    </div>`;
}

function renderDocumentView(doc) {
  const ver = doc.versions.find(v => v.id === state.selectedVersionId) || doc.versions[doc.versions.length - 1];
  const ac = authorColor(ver.author);
  const org = ver.organization || authorOrg(ver.author);
  return `
    <div class="version-banner" style="background:${ac.bg}">
      <span class="version-banner-avatar" style="background:${ac.dot};color:#fff">${ver.author[0]}</span>
      <div>
        <span style="font-weight:600;color:${ac.text}">${formatVersionLabel(ver.id)}</span>
        <span style="color:${ac.text};opacity:0.8"> · edited by ${escHtml(ver.author)}</span>
        ${org ? `<span class="org-badge">${escHtml(org)}</span>` : ''}
        <div style="font-size:11px;color:${ac.text};opacity:0.6;margin-top:1px">${formatTime(ver.time)} · ${escHtml(ver.message)}</div>
      </div>
    </div>
    <div class="doc-content">
      ${ver.content.split('\n\n').map(p => `<p>${escHtml(p)}</p>`).join('')}
    </div>`;
}

function renderChangesView(doc) {
  if (doc.versions.length < 2) {
    return `<div style="text-align:center;padding:60px 20px;color:var(--text3);font-size:13px">
      Only one saved copy exists.<br>Save your changes to see what was added or removed.
    </div>`;
  }

  const idx = doc.versions.findIndex(v => v.id === state.selectedVersionId);
  const curr = doc.versions[Math.max(1, idx)];
  const prev = doc.versions[Math.max(0, Math.min(idx - 1, doc.versions.length - 2))];
  const acP = authorColor(prev.author);
  const acC = authorColor(curr.author);

  const prevLines = prev.content.split('\n').filter(l => l.trim() !== '');
  const currLines = curr.content.split('\n').filter(l => l.trim() !== '');
  const diff = computeDiff(prevLines, currLines);

  const linesHtml = diff.map(d => {
    if (d.type === 'ctx') return `<div class="diff-line ctx"><span class="diff-gutter"> </span>${escHtml(d.line)}</div>`;
    if (d.type === 'add') return `<div class="diff-line add"><span class="diff-gutter">+</span>${escHtml(d.line)}</div>`;
    return `<div class="diff-line del"><span class="diff-gutter">−</span>${escHtml(d.line)}</div>`;
  }).join('');

  const adds = diff.filter(d => d.type === 'add').length;
  const dels = diff.filter(d => d.type === 'del').length;

  return `
    <div class="diff-wrap">
      <div class="diff-header">
        <div class="diff-pill" style="background:${acP.bg};color:${acP.text}">
          <span style="width:7px;height:7px;border-radius:50%;background:${acP.dot}"></span>
          ${formatVersionLabel(prev.id)} · ${escHtml(prev.author)}
        </div>
        <span class="diff-arrow">→</span>
        <div class="diff-pill" style="background:${acC.bg};color:${acC.text}">
          <span style="width:7px;height:7px;border-radius:50%;background:${acC.dot}"></span>
          ${formatVersionLabel(curr.id)} · ${escHtml(curr.author)}
        </div>
        <span style="margin-left:auto;font-size:11px;color:var(--text3)">
          <span style="color:#4ecfa0">+${adds}</span> / <span style="color:#e87eb0">−${dels}</span> lines
        </span>
      </div>
      <div class="diff-block">${linesHtml || '<div class="diff-line ctx"><span class="diff-gutter"> </span>No changes</div>'}</div>
    </div>`;
}

function renderHistoryPanel(doc) {
  const authorList = uniqueAuthors(doc);
  const legendHtml = authorList.map(name => {
    const ac = authorColor(name);
    const org = authorOrg(name);
    return `<span class="legend-chip" title="${escHtml(org)}"><span class="legend-dot" style="background:${ac.dot}"></span>${escHtml(name)}</span>`;
  }).join('');

  const itemsHtml = [...doc.versions].reverse().map(v => {
    const ac = authorColor(v.author);
    const org = v.organization || authorOrg(v.author);
    return `<div class="history-item${v.id === state.selectedVersionId ? ' selected' : ''}" onclick="selectVersion('${v.id}')">
      <div class="hi-top">
        <span class="hi-avatar" style="background:${ac.dot};color:#fff">${v.author[0]}</span>
        <span class="hi-name">${escHtml(v.author)}</span>
        <span class="hi-vid">${formatVersionLabel(v.id)}</span>
      </div>
      ${org ? `<div class="hi-org">${escHtml(org)}</div>` : ''}
      <div class="hi-time">${formatTime(v.time)}</div>
      <div class="hi-msg">${escHtml(v.message)}</div>
    </div>`;
  }).join('');

  return `<div class="history-panel">
    <div class="history-header">
      <span>Change history</span>
      <span>${doc.versions.length} edit${doc.versions.length > 1 ? 's' : ''}</span>
    </div>
    <div class="author-legend">${legendHtml}</div>
    <div class="history-list">${itemsHtml}</div>
  </div>`;
}

// ─── Actions ──────────────────────────────────────────────

function selectVersion(vid) {
  state.selectedVersionId = vid;
  renderMain();
}

function setView(mode) {
  state.viewMode = mode;
  renderMain();
}

function authorOptions() {
  return authors.map(a =>
    `<option value="${escHtml(a.name)}" data-org="${escHtml(a.organization)}">${escHtml(a.name)} (${escHtml(a.organization)})</option>`
  ).join('');
}

function showSaveModal() {
  const doc = currentDoc;
  const curr = doc.versions[doc.versions.length - 1];
  showModal(`
    <h3>Save changes</h3>
    <p style="font-size:12px;color:var(--text3);margin-bottom:14px">Records who made the change, when, and what they updated.</p>
    <div class="form-group">
      <label>Your name</label>
      <select id="f-author" onchange="updateOrgPreview()">${authorOptions()}</select>
    </div>
    <div class="form-group">
      <label>Organization</label>
      <input type="text" id="f-org" readonly />
    </div>
    <div class="form-group">
      <label>What did you change?</label>
      <input type="text" id="f-msg" placeholder="e.g. Updated the budget section…" />
    </div>
    <div class="form-group">
      <label>Document content</label>
      <textarea id="f-content">${escHtml(curr.content)}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-cancel" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="saveBtn" onclick="doSave()">Save changes</button>
    </div>`);
  updateOrgPreview();
}

function updateOrgPreview() {
  const sel = document.getElementById('f-author');
  const opt = sel.options[sel.selectedIndex];
  document.getElementById('f-org').value = opt.dataset.org || '';
}

function showNewDocModal() {
  showModal(`
    <h3>New document</h3>
    <div class="form-group">
      <label>Document name</label>
      <input type="text" id="f-name" placeholder="e.g. Contract Draft.docx" />
    </div>
    <div class="form-group">
      <label>Your name</label>
      <select id="f-author" onchange="updateOrgPreview()">${authorOptions()}</select>
    </div>
    <div class="form-group">
      <label>Organization</label>
      <input type="text" id="f-org" readonly />
    </div>
    <div class="form-group">
      <label>Initial content</label>
      <textarea id="f-content" placeholder="Start writing…"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-cancel" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="createBtn" onclick="doNewDoc()">Create</button>
    </div>`);
  updateOrgPreview();
}

async function doSave() {
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  try {
    const author = document.getElementById('f-author').value;
    const organization = document.getElementById('f-org').value;
    const msg = document.getElementById('f-msg').value.trim() || 'Updated document';
    const content = document.getElementById('f-content').value;
    currentDoc = await api(`/api/documents/${state.selectedDocId}/save`, {
      method: 'POST',
      body: JSON.stringify({ author, organization, content, message: msg }),
    });
    const newVer = currentDoc.versions[currentDoc.versions.length - 1];
    state.selectedVersionId = newVer.id;
    state.viewMode = 'changes';
    closeModal();
    await loadDocList();
    renderMain();
  } catch (e) {
    alert(e.message);
    btn.disabled = false;
  }
}

async function doNewDoc() {
  const btn = document.getElementById('createBtn');
  btn.disabled = true;
  try {
    const name = document.getElementById('f-name').value.trim() || 'Untitled.docx';
    const author = document.getElementById('f-author').value;
    const organization = document.getElementById('f-org').value;
    const content = document.getElementById('f-content').value || '(Empty document)';
    const doc = await api('/api/documents', {
      method: 'POST',
      body: JSON.stringify({ name, author, organization, content }),
    });
    closeModal();
    await loadDocList();
    state.selectedVersionId = 'v1';
    state.selectedDocId = doc.id;
    currentDoc = doc;
    renderDocList();
    renderMain();
  } catch (e) {
    alert(e.message);
    btn.disabled = false;
  }
}

// ─── Modal ────────────────────────────────────────────────

function showModal(html) {
  document.getElementById('modal').innerHTML = html;
  document.getElementById('modalOverlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
}

// ─── WebSocket live sync ──────────────────────────────────

function connectLiveSync() {
  const dot = document.getElementById('liveDot');
  const label = document.getElementById('liveLabel');

  function setStatus(connected) {
    dot.className = 'live-dot ' + (connected ? 'connected' : 'disconnected');
    label.textContent = connected ? 'Connected — watching for updates' : 'Disconnected — reconnecting…';
  }

  let ws;
  function connect() {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => setStatus(true);
    ws.onclose = () => {
      setStatus(false);
      setTimeout(connect, 3000);
    };
    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'connected') return;

      if (msg.type === 'document_created') {
        await loadDocList();
        const last = msg.document.versions[msg.document.versions.length - 1];
        showToast(`New document: ${msg.document.name} by ${last.author} (${last.organization})`);
      }

      if (msg.type === 'version_saved') {
        await loadDocList();
        const last = msg.document.versions[msg.document.versions.length - 1];
        showToast(`${msg.document.name}: ${last.author} saved ${formatVersionLabel(last.id)} — "${last.message}"`);

        if (state.selectedDocId === msg.documentId) {
          currentDoc = msg.document;
          if (!state.selectedVersionId || state.viewMode === 'document') {
            state.selectedVersionId = last.id;
          }
          renderMain();
        }
      }
    };
  }
  connect();
}

// ─── Init ─────────────────────────────────────────────────

document.getElementById('newDocBtn').onclick = showNewDocModal;
document.getElementById('emptyNewBtn').onclick = showNewDocModal;
document.getElementById('modalOverlay').onclick = e => { if (e.target === e.currentTarget) closeModal(); };
document.getElementById('searchInput').oninput = e => {
  state.searchQuery = e.target.value;
  renderDocList();
};

(async function init() {
  try {
    await loadAuthors();
    await loadDocList();
    connectLiveSync();
  } catch (e) {
    document.getElementById('docList').innerHTML =
      `<div style="padding:16px;font-size:12px;color:#e87eb0">Cannot reach backend. Run: cd backend && npm install && npm start</div>`;
  }
})();
