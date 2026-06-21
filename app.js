// ─── Author colour palette ────────────────────────────────
const AUTHORS = [
  { name: 'Arjun',  bg: 'var(--c0-bg)', text: 'var(--c0-text)', dot: 'var(--c0-dot)' },
  { name: 'Priya',  bg: 'var(--c1-bg)', text: 'var(--c1-text)', dot: 'var(--c1-dot)' },
  { name: 'Rohan',  bg: 'var(--c2-bg)', text: 'var(--c2-text)', dot: 'var(--c2-dot)' },
  { name: 'Sneha',  bg: 'var(--c3-bg)', text: 'var(--c3-text)', dot: 'var(--c3-dot)' },
  { name: 'Dev',    bg: 'var(--c4-bg)', text: 'var(--c4-text)', dot: 'var(--c4-dot)' },
  { name: 'Meera',  bg: 'var(--c5-bg)', text: 'var(--c5-text)', dot: 'var(--c5-dot)' },
];

// ─── Sample data ──────────────────────────────────────────
let docs = [
  {
    id: 1,
    name: 'Project Proposal.docx',
    versions: [
      { id: 'v1', author: 'Arjun', time: '2026-06-05T09:12:00', message: 'Initial draft', content: 'This document outlines the Q3 product roadmap.\n\nWe plan to launch three major features: user analytics dashboard, export functionality, and the new onboarding flow.\n\nTimeline: All features must be delivered by September 30, 2026.' },
      { id: 'v2', author: 'Priya', time: '2026-06-07T14:45:00', message: 'Updated scope and timeline', content: 'This document outlines the Q3 product roadmap.\n\nWe plan to launch four major features: user analytics dashboard, export functionality, the new onboarding flow, and mobile push notifications.\n\nTimeline: All features must be delivered by October 15, 2026.' },
      { id: 'v3', author: 'Rohan', time: '2026-06-10T11:30:00', message: 'Added budget section', content: 'This document outlines the Q3 product roadmap.\n\nWe plan to launch four major features: user analytics dashboard, export functionality, the new onboarding flow, and mobile push notifications.\n\nTimeline: All features must be delivered by October 15, 2026.\n\nBudget: The total allocated budget is ₹12,00,000 across all workstreams.' },
    ]
  },
  {
    id: 2,
    name: 'HR Policy 2026.docx',
    versions: [
      { id: 'v1', author: 'Sneha', time: '2026-01-10T10:00:00', message: 'Initial policy document', content: 'Leave Policy: All employees are entitled to 20 days of paid leave per year.\n\nRemote Work: Employees may work remotely up to 2 days per week.\n\nPerformance Reviews: Conducted annually in December.' },
      { id: 'v2', author: 'Dev',   time: '2026-03-15T15:00:00', message: 'Remote work policy update', content: 'Leave Policy: All employees are entitled to 20 days of paid leave per year.\n\nRemote Work: Employees may work remotely up to 3 days per week with manager approval.\n\nPerformance Reviews: Conducted annually in December.' },
    ]
  },
  {
    id: 3,
    name: 'Meeting Notes — Sprint Review.docx',
    versions: [
      { id: 'v1', author: 'Meera', time: '2026-06-11T17:00:00', message: 'Notes from sprint review', content: 'Attendees: Arjun, Priya, Rohan, Sneha, Dev, Meera\n\nDecisions: The team agreed to push the release date by one week.\n\nAction Items: Arjun to update the roadmap. Priya to notify stakeholders.' },
    ]
  },
];

// ─── State ────────────────────────────────────────────────
let state = {
  selectedDocId:     null,
  selectedVersionId: null,
  viewMode:          'document',   // 'document' | 'diff'
  searchQuery:       '',
};

// ─── Helpers ──────────────────────────────────────────────
function authorColor(name) {
  return AUTHORS.find(a => a.name === name) || AUTHORS[0];
}

function formatTime(iso) {
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const hh = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ampm = hh < 12 ? 'AM' : 'PM';
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${hh % 12 || 12}:${mm} ${ampm}`;
}

function nowISO() { return new Date().toISOString(); }

function uniqueAuthors(doc) {
  const seen = new Set();
  return doc.versions.filter(v => !seen.has(v.author) && seen.add(v.author)).map(v => v.author);
}

function computeDiff(prevLines, currLines) {
  // Simple line-based LCS diff
  const lcs = (a, b) => {
    const m = a.length, n = b.length;
    const dp = Array.from({length: m+1}, () => Array(n+1).fill(0));
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
    const seq = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (a[i-1] === b[j-1]) { seq.push({type:'ctx', line: a[i-1]}); i--; j--; }
      else if (dp[i-1][j] > dp[i][j-1]) { seq.push({type:'del', line: a[i-1]}); i--; }
      else { seq.push({type:'add', line: b[j-1]}); j--; }
    }
    while (i > 0) { seq.push({type:'del', line: a[i-1]}); i--; }
    while (j > 0) { seq.push({type:'add', line: b[j-1]}); j--; }
    return seq.reverse();
  };
  return lcs(prevLines, currLines);
}

// ─── Rendering ────────────────────────────────────────────
function renderDocList() {
  const container = document.getElementById('docList');
  const q = state.searchQuery.toLowerCase();
  const filtered = docs.filter(d => d.name.toLowerCase().includes(q));
  container.innerHTML = '';
  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:24px 12px;color:var(--text3);font-size:12px">No documents found</div>`;
    return;
  }
  filtered.forEach(doc => {
    const last = doc.versions[doc.versions.length - 1];
    const ac = authorColor(last.author);
    const el = document.createElement('div');
    el.className = 'doc-item' + (doc.id === state.selectedDocId ? ' active' : '');
    el.innerHTML = `
      <div class="doc-item-name">${escHtml(doc.name)}</div>
      <div class="doc-item-meta">${doc.versions.length} version${doc.versions.length > 1 ? 's' : ''} · ${formatTime(last.time).split('·')[0].trim()}</div>
      <span class="doc-item-pill" style="background:${ac.bg};color:${ac.text}">
        <span style="width:7px;height:7px;border-radius:50%;background:${ac.dot}"></span>${last.author}
      </span>`;
    el.onclick = () => selectDoc(doc.id);
    container.appendChild(el);
  });
}

function selectDoc(id) {
  state.selectedDocId     = id;
  const doc               = docs.find(d => d.id === id);
  state.selectedVersionId = doc.versions[doc.versions.length - 1].id;
  state.viewMode          = 'document';
  document.getElementById('emptyState') && (document.getElementById('main').innerHTML = '');
  renderDocList();
  renderMain();
}

function renderMain() {
  const doc = docs.find(d => d.id === state.selectedDocId);
  if (!doc) return;

  document.getElementById('main').innerHTML = `
    <div class="toolbar" id="toolbar">
      <span class="toolbar-title">${escHtml(doc.name)}</span>
      <div class="view-toggle">
        <button class="view-btn${state.viewMode === 'document' ? ' active' : ''}" onclick="setView('document')">Document</button>
        <button class="view-btn${state.viewMode === 'diff' ? ' active' : ''}" onclick="setView('diff')">Diff</button>
      </div>
      <button class="btn-primary" onclick="showCommitModal()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><line x1="1.05" y1="12" x2="7" y2="12"/><line x1="17.01" y1="12" x2="22.96" y2="12"/></svg>
        Save version
      </button>
    </div>
    <div class="content-area">
      <div class="editor-panel" id="editorPanel">
        ${state.viewMode === 'document' ? renderDocumentView(doc) : renderDiffView(doc)}
      </div>
      ${renderHistoryPanel(doc)}
    </div>`;
}

function renderDocumentView(doc) {
  const ver = doc.versions.find(v => v.id === state.selectedVersionId) || doc.versions[doc.versions.length - 1];
  const ac  = authorColor(ver.author);
  return `
    <div class="version-banner" style="background:${ac.bg}">
      <span class="version-banner-avatar" style="background:${ac.dot};color:#fff">${ver.author[0]}</span>
      <div>
        <span style="font-weight:600;color:${ac.text}">${ver.id}</span>
        <span style="color:${ac.text};opacity:0.8"> · saved by ${ver.author}</span>
        <div style="font-size:11px;color:${ac.text};opacity:0.6;margin-top:1px">${formatTime(ver.time)} · ${escHtml(ver.message)}</div>
      </div>
    </div>
    <div class="doc-content">
      ${ver.content.split('\n\n').map(p => `<p>${escHtml(p)}</p>`).join('')}
    </div>`;
}

function renderDiffView(doc) {
  if (doc.versions.length < 2) {
    return `<div style="text-align:center;padding:60px 20px;color:var(--text3);font-size:13px">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px;display:block;margin:0 auto 12px">
        <circle cx="12" cy="12" r="4"/><line x1="1.05" y1="12" x2="7" y2="12"/><line x1="17.01" y1="12" x2="22.96" y2="12"/>
      </svg>
      Only one version exists.<br>Save a new version to see the diff.
    </div>`;
  }

  const idx   = doc.versions.findIndex(v => v.id === state.selectedVersionId);
  const curr  = doc.versions[Math.max(1, idx)];
  const prev  = doc.versions[Math.max(0, Math.min(idx - 1, doc.versions.length - 2))];
  const acP   = authorColor(prev.author);
  const acC   = authorColor(curr.author);

  const prevLines = prev.content.split('\n').filter(l => l.trim() !== '');
  const currLines = curr.content.split('\n').filter(l => l.trim() !== '');
  const diff      = computeDiff(prevLines, currLines);

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
          ${prev.id} · ${prev.author}
        </div>
        <span class="diff-arrow">→</span>
        <div class="diff-pill" style="background:${acC.bg};color:${acC.text}">
          <span style="width:7px;height:7px;border-radius:50%;background:${acC.dot}"></span>
          ${curr.id} · ${curr.author}
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
    return `<span class="legend-chip"><span class="legend-dot" style="background:${ac.dot}"></span>${name}</span>`;
  }).join('');

  const itemsHtml = [...doc.versions].reverse().map(v => {
    const ac = authorColor(v.author);
    return `<div class="history-item${v.id === state.selectedVersionId ? ' selected' : ''}" onclick="selectVersion('${v.id}')">
      <div class="hi-top">
        <span class="hi-avatar" style="background:${ac.dot};color:#fff">${v.author[0]}</span>
        <span class="hi-name">${v.author}</span>
        <span class="hi-vid">${v.id}</span>
      </div>
      <div class="hi-time">${formatTime(v.time)}</div>
      <div class="hi-msg">${escHtml(v.message)}</div>
    </div>`;
  }).join('');

  return `<div class="history-panel">
    <div class="history-header">
      <span>Version history</span>
      <span>${doc.versions.length} save${doc.versions.length > 1 ? 's' : ''}</span>
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

function showCommitModal() {
  const authorOpts = AUTHORS.map(a => `<option>${a.name}</option>`).join('');
  const doc  = docs.find(d => d.id === state.selectedDocId);
  const curr = doc.versions[doc.versions.length - 1];
  showModal(`
    <h3>Save new version</h3>
    <div class="form-group">
      <label>Author</label>
      <select id="f-author">${authorOpts}</select>
    </div>
    <div class="form-group">
      <label>Commit message</label>
      <input type="text" id="f-msg" placeholder="Describe what you changed…" />
    </div>
    <div class="form-group">
      <label>Content</label>
      <textarea id="f-content">${curr.content}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-cancel" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="doCommit()">Save version</button>
    </div>`);
}

function doCommit() {
  const doc     = docs.find(d => d.id === state.selectedDocId);
  const author  = document.getElementById('f-author').value;
  const msg     = document.getElementById('f-msg').value.trim() || 'Updated document';
  const content = document.getElementById('f-content').value;
  const newVer  = { id: `v${doc.versions.length + 1}`, author, time: nowISO(), message: msg, content };
  doc.versions.push(newVer);
  state.selectedVersionId = newVer.id;
  state.viewMode = 'diff';
  closeModal();
  renderDocList();
  renderMain();
}

function showNewDocModal() {
  const authorOpts = AUTHORS.map(a => `<option>${a.name}</option>`).join('');
  showModal(`
    <h3>New document</h3>
    <div class="form-group">
      <label>Document name</label>
      <input type="text" id="f-name" placeholder="e.g. Contract Draft.docx" />
    </div>
    <div class="form-group">
      <label>Created by</label>
      <select id="f-author">${authorOpts}</select>
    </div>
    <div class="form-group">
      <label>Initial content</label>
      <textarea id="f-content" placeholder="Start writing…"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-cancel" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="doNewDoc()">Create</button>
    </div>`);
}

function doNewDoc() {
  const name    = document.getElementById('f-name').value.trim() || 'Untitled.docx';
  const author  = document.getElementById('f-author').value;
  const content = document.getElementById('f-content').value || '(Empty document)';
  const newDoc  = {
    id:       Date.now(),
    name,
    versions: [{ id: 'v1', author, time: nowISO(), message: 'Initial version', content }],
  };
  docs.push(newDoc);
  closeModal();
  selectDoc(newDoc.id);
}

// ─── Modal helpers ────────────────────────────────────────
function showModal(html) {
  document.getElementById('modal').innerHTML = html;
  document.getElementById('modalOverlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
}

// ─── Escape HTML ──────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Event wiring ─────────────────────────────────────────
document.getElementById('newDocBtn').onclick    = showNewDocModal;
document.getElementById('emptyNewBtn').onclick  = showNewDocModal;
document.getElementById('modalOverlay').onclick = e => { if (e.target === e.currentTarget) closeModal(); };
document.getElementById('searchInput').oninput  = e => {
  state.searchQuery = e.target.value;
  renderDocList();
};

// ─── Init ─────────────────────────────────────────────────
renderDocList();
