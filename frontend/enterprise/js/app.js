async function loadModule(id) {
  state.module = id;
  renderNav();
  const mod = state.platform.modules.find(m => m.id === id);
  document.getElementById('moduleHeader').innerHTML = `
    <div><h2>${esc(mod.title)}</h2><p>${esc(mod.description)}</p></div>
    <span class="tier-badge">${esc(mod.tier)}</span>`;
  document.getElementById('moduleBody').innerHTML = '<div class="loading">Loading…</div>';
  try {
    document.getElementById('moduleBody').innerHTML = await MODULE_RENDERERS[id]();
    setupDocumentUpload();
  } catch (e) {
    document.getElementById('moduleBody').innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
}

function renderNav() {
  const tiers = { basic: 'Basic', intermediate: 'Intermediate', advanced: 'Advanced', modern: 'Modern AI' };
  let html = '';
  for (const [tier, label] of Object.entries(tiers)) {
    const items = state.platform.modules.filter(m => m.tier === tier);
    if (!items.length) continue;
    html += `<div class="nav-group"><span>${label}</span>`;
    html += items.map(m =>
      `<button class="nav-item${state.module === m.id ? ' active' : ''}" onclick="loadModule('${m.id}')">${esc(m.title)}</button>`
    ).join('');
    html += '</div>';
  }
  document.getElementById('navMenu').innerHTML = html;
}

function setupDocumentUpload() {
  const zone = document.getElementById('dropZone');
  const input = document.getElementById('bulkFiles');
  if (!zone || !input) return;

  async function uploadFiles(files) {
    if (!files.length) return;
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    fd.append('author', state.user?.name || 'Uploader');
    fd.append('organization', state.user?.department || 'Unknown');
    fd.append('folderId', state.currentFolder);
    await fetch(`${API}/documents/upload`, { method: 'POST', headers: { 'X-Session-Token': state.token }, body: fd });
    showToast(`Uploaded ${files.length} file(s)`);
    loadModule('documents');
  }

  zone.ondragover = e => { e.preventDefault(); zone.classList.add('drag'); };
  zone.ondragleave = () => zone.classList.remove('drag');
  zone.ondrop = e => { e.preventDefault(); zone.classList.remove('drag'); uploadFiles([...e.dataTransfer.files]); };
  input.onchange = () => uploadFiles([...input.files]);
}

function connectLive() {
  const dot = document.getElementById('liveDot');
  const label = document.getElementById('liveLabel');
  function connect() {
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => { dot.className = 'live-dot connected'; label.textContent = 'Connected'; };
    ws.onclose = () => { dot.className = 'live-dot disconnected'; label.textContent = 'Reconnecting…'; setTimeout(connect, 3000); };
    ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'version_saved') showToast('Document updated live');
      if (msg.type === 'bulk_upload') showToast(`${msg.count} files uploaded`);
    };
  }
  connect();
}

async function initApp() {
  state.platform = await api('/platform');
  state.user = await api('/auth/me');
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('navUser').innerHTML = `<strong>${esc(state.user.name)}</strong><small>${esc(state.user.role)} · ${esc(state.user.department)}</small>`;
  renderNav();
  connectLive();
  loadModule('documents');
}

document.getElementById('modalOverlay').onclick = e => { if (e.target === e.currentTarget) closeModal(); };

const embedded = new URLSearchParams(location.search).get('embed') === '1';
let ssoStarted = false;

async function acceptParentAuth(token) {
  if (ssoStarted || !token) return;
  ssoStarted = true;
  try {
    const res = await fetch(`${API}/auth/sso`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Sign-in failed');
    state.token = data.token;
    localStorage.setItem('ds-token', data.token);
    await initApp();
  } catch (e) {
    ssoStarted = false;
    showToast(e.message);
  }
}

if (embedded) {
  document.getElementById('loginScreen')?.classList.add('hidden');
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin) return;
    if (event.data?.type !== 'smorx-auth') return;
    acceptParentAuth(event.data.token);
  });
  window.parent?.postMessage({ type: 'enterprise-ready' }, location.origin);
} else {
  document.getElementById('loginBtn').onclick = async () => {
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('loginEmail').value,
          password: document.getElementById('loginPassword').value,
        }),
      });
      state.token = data.token;
      localStorage.setItem('ds-token', data.token);
      await initApp();
    } catch (e) {
      showToast(e.message);
    }
  };

  (async () => {
    if (state.token) {
      try { await initApp(); return; } catch { localStorage.removeItem('ds-token'); state.token = null; }
    }
  })();
}

window.loadModule = loadModule;
