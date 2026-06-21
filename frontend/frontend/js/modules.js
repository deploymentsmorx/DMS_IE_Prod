const MODULE_RENDERERS = {};

function featureList(features) {
  return `<div class="feature-chips">${features.map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div>`;
}

function card(title, body, actions = '') {
  return `<div class="card"><div class="card-head"><h3>${esc(title)}</h3>${actions}</div><div class="card-body">${body}</div></div>`;
}

function table(headers, rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) return '';
  return `<table class="data-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${safeRows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

// ─── DOCUMENTS (only place for storage, upload, versions, checkout) ───
MODULE_RENDERERS.documents = async function() {
  const [folders, docs] = await Promise.all([
    api('/folders'),
    api(`/documents${state.currentFolder !== 'root' ? '?folderId=' + state.currentFolder : ''}`),
  ]);

  const folderBar = folders.map(f =>
    `<button class="folder-btn${state.currentFolder === f.id ? ' active' : ''}" onclick="state.currentFolder='${f.id}';loadModule('documents')">${esc(f.name)}</button>`
  ).join('');

  const dropZone = `
    <div class="drop-zone" id="dropZone">
      <p>Drag & drop files here or <label class="link-btn">browse<input type="file" id="bulkFiles" multiple hidden /></label></p>
      <small>Bulk upload supported · Max 20 files</small>
    </div>`;

  const docRows = docs.map(d => {
    const ac = authorColor(d.lastAuthor);
    return `<tr class="clickable" onclick="openDocument(${d.id})">
      <td><strong>${esc(d.name)}</strong>${d.checkedOutBy ? `<span class="badge warn">Checked out: ${esc(d.checkedOutBy)}</span>` : ''}</td>
      <td>${esc(d.classification || '')}</td>
      <td>${d.versionCount}</td>
      <td><span class="pill" style="background:${ac.bg};color:${ac.text}">${esc(d.lastAuthor)}</span></td>
      <td>${formatTime(d.lastTime)}</td>
    </tr>`;
  }).join('');

  let detail = '';
  if (state.selectedDocId) {
    const doc = await api(`/documents/${state.selectedDocId}`);
    const ver = doc.versions.find(v => v.id === state.selectedVersionId) || doc.versions.at(-1);
    const ac = authorColor(ver.author);
    const history = [...doc.versions].reverse().map(v => {
      const c = authorColor(v.author);
      return `<div class="history-item${v.id===state.selectedVersionId?' selected':''}" onclick="state.selectedVersionId='${v.id}';loadModule('documents')">
        <span class="pill" style="background:${c.bg};color:${c.text}">${esc(v.author)}</span>
        <span>${formatVersionLabel(v.id)}</span>
        <small>${formatTime(v.time)} — ${esc(v.message)}</small>
        <button class="btn-sm" onclick="event.stopPropagation();rollbackDoc(${doc.id},'${v.id}')">Restore</button>
      </div>`;
    }).join('');

    const contentView = state.viewMode === 'changes' && doc.versions.length > 1
      ? renderChanges(doc)
      : `<div class="preview-box">${ver.content.split('\n\n').map(p=>`<p>${esc(p)}</p>`).join('')}</div>`;

    detail = `<div class="doc-detail">
      <div class="detail-toolbar">
        <strong>${esc(doc.name)}</strong>
        <div class="btn-group">
          <button class="btn-sm${state.viewMode==='document'?' active':''}" onclick="state.viewMode='document';loadModule('documents')">Preview</button>
          <button class="btn-sm${state.viewMode==='changes'?' active':''}" onclick="state.viewMode='changes';loadModule('documents')">Changes</button>
          ${!doc.checkedOutBy ? `<button class="btn-sm" onclick="checkoutDoc(${doc.id})">Check out</button>` : `<button class="btn-sm" onclick="checkinDoc(${doc.id})">Check in</button>`}
          <button class="btn-primary btn-sm" onclick="showSaveModal()">Save changes</button>
        </div>
      </div>
      <div class="banner" style="background:${ac.bg};color:${ac.text}">${formatVersionLabel(ver.id)} · edited by ${esc(ver.author)} · ${formatTime(ver.time)}</div>
      <div class="split"><div>${contentView}</div><div class="side-panel"><h4>Change history</h4>${history}</div></div>
    </div>`;
  }

  const docTable = docs.length
    ? `<table class="data-table"><thead><tr><th>Name</th><th>Type</th><th>Copies</th><th>Last editor</th><th>Updated</th></tr></thead><tbody>${docRows}</tbody></table>`
    : '<p class="muted">No documents in this folder</p>';

  return `${dropZone}
    <div class="folder-bar">${folderBar}</div>
    ${card('Documents', docTable)}
    ${detail}`;
};

function renderChanges(doc) {
  const idx = doc.versions.findIndex(v => v.id === state.selectedVersionId);
  const curr = doc.versions[Math.max(1, idx)];
  const prev = doc.versions[Math.max(0, Math.min(idx - 1, doc.versions.length - 2))];
  const diff = computeLineChanges(prev.content.split('\n').filter(Boolean), curr.content.split('\n').filter(Boolean));
  return `<div class="diff-block">${diff.map(d =>
    `<div class="diff-line ${d.type}"><span>${d.type==='add'?'+':d.type==='del'?'−':' '}</span>${esc(d.line)}</div>`
  ).join('')}</div>`;
}

window.openDocument = id => { state.selectedDocId = id; state.selectedVersionId = null; state.viewMode = 'document'; loadModule('documents'); };
window.rollbackDoc = async (id, vid) => { await api(`/documents/${id}/rollback`, { method:'POST', body: JSON.stringify({ versionId: vid, author: state.user?.name || 'User' }) }); showToast('Restored previous copy'); loadModule('documents'); };
window.checkoutDoc = async id => { await api(`/documents/${id}/checkout`, { method:'POST', body: JSON.stringify({ userName: state.user?.name }) }); showToast('Document checked out'); loadModule('documents'); };
window.checkinDoc = async id => { await api(`/documents/${id}/checkin`, { method:'POST', body: JSON.stringify({ author: state.user?.name }) }); showToast('Document checked in'); loadModule('documents'); };

window.showSaveModal = async () => {
  const doc = await api(`/documents/${state.selectedDocId}`);
  const curr = doc.versions.at(-1);
  showModal(`<h3>Save changes</h3>
    <div class="form-group"><label>What did you change?</label><input id="f-msg" /></div>
    <div class="form-group"><label>Content</label><textarea id="f-content">${esc(curr.content)}</textarea></div>
    <div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="doSave()">Save</button></div>`);
};

window.doSave = async () => {
  await api(`/documents/${state.selectedDocId}/save`, { method:'POST', body: JSON.stringify({
    author: state.user?.name || 'User', organization: state.user?.department || 'Unknown',
    message: document.getElementById('f-msg').value || 'Updated', content: document.getElementById('f-content').value,
  })});
  closeModal(); showToast('Changes saved'); state.viewMode = 'changes'; loadModule('documents');
};

// ─── SEARCH (only place for ALL search types) ─────────────────────────
MODULE_RENDERERS.search = async function() {
  const q = document.getElementById('searchQ')?.value || '';
  const mode = document.getElementById('searchMode')?.value || 'standard';
  const repos = [...document.querySelectorAll('.repo-check:checked')].map(c => c.value);
  let results = '';
  if (q) {
    const data = await api(`/search?q=${encodeURIComponent(q)}&mode=${mode}&repos=${repos.join(',')}`);
    results = data.results.length
      ? table(['Document','Source','Type','Matches','Snippet'], data.results.map(r =>
          [`<a href="#" onclick="openDocument(${r.id});return false">${esc(r.name)}</a>`, esc(r.source), esc(r.classification), r.matches.join(', '), esc(r.snippet)]))
      : '<p class="muted">No results found</p>';
  }

  const mod = state.platform.modules.find(m => m.id === 'search');
  const repoChecks = ['local','sharepoint','onedrive','gdrive','dropbox','teams','slack','confluence','jira'].map(r =>
    `<label class="check-label"><input type="checkbox" class="repo-check" value="${r}" ${r==='local'?'checked':''}/> ${esc(r)}</label>`
  ).join('');

  return `${featureList(mod.features)}
    <div class="search-hub">
      <input class="search-big" id="searchQ" placeholder='Try: "inspection reports from 2025" or "documents approved by John"' value="${esc(q)}" onkeydown="if(event.key==='Enter')loadModule('search')"/>
      <select id="searchMode">
        <option value="standard">Standard search</option>
        <option value="metadata">Metadata search</option>
        <option value="fulltext">Full-text search</option>
        <option value="ocr">OCR search</option>
        <option value="natural">Natural language</option>
        <option value="semantic">Semantic search</option>
        <option value="vector">Vector search</option>
        <option value="rag">RAG search</option>
        <option value="hybrid">Hybrid search</option>
        <option value="ai">AI-powered</option>
      </select>
      <button class="btn-primary" onclick="loadModule('search')">Search all repositories</button>
    </div>
    <div class="repo-filters"><strong>Repositories:</strong> ${repoChecks}</div>
    ${card('Results', results || '<p class="muted">Enter a query above — one search bar for all sources</p>')}`;
};

// ─── USERS ──────────────────────────────────────────────────────────────
MODULE_RENDERERS.users = async function() {
  const [users, groups] = await Promise.all([api('/users'), api('/groups')]);
  const mod = state.platform.modules.find(m => m.id === 'users');
  return `${featureList(mod.features)}
    ${card('Users & roles', table(['Name','Email','Role','Department'], users.map(u =>
      [esc(u.name), esc(u.email), `<span class="badge">${esc(u.role)}</span>`, esc(u.department)])))}
    ${card('Groups', groups.map(g => `<div class="group-item"><strong>${esc(g.name)}</strong><span>${g.members.join(', ')}</span></div>`).join(''))}`;
};

// ─── SHARING ────────────────────────────────────────────────────────────
MODULE_RENDERERS.sharing = async function() {
  const shares = await api('/shares');
  const docs = await api('/documents');
  const mod = state.platform.modules.find(m => m.id === 'sharing');
  const opts = docs.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  return `${featureList(mod.features)}
    ${card('Create share link', `
      <div class="form-row">
        <select id="shareDoc">${opts}</select>
        <select id="shareType"><option value="internal">Internal</option><option value="external">External</option></select>
        <input id="shareDays" type="number" placeholder="Expires in days" min="1"/>
        <input id="sharePass" placeholder="Password (optional)"/>
        <button class="btn-primary" onclick="createShare()">Create link</button>
      </div>`)}
    ${card('Active shares', shares.length ? table(['Document','Type','Expires','Link'], shares.map(s =>
      [`#${s.documentId}`, esc(s.type), s.expiresAt ? formatTime(s.expiresAt) : 'Never', `<code>${esc(s.url)}</code>`])) : '<p class="muted">No shares yet</p>')}`;
};

window.createShare = async () => {
  await api('/shares', { method:'POST', body: JSON.stringify({
    documentId: Number(document.getElementById('shareDoc').value),
    type: document.getElementById('shareType').value,
    expiresInDays: Number(document.getElementById('shareDays').value) || null,
    password: document.getElementById('sharePass').value || null,
    createdBy: state.user?.name,
  })});
  showToast('Share link created'); loadModule('sharing');
};

// ─── SECURITY (only place for encryption, audit, activity) ────────────
MODULE_RENDERERS.security = async function() {
  const [status, audit, activity] = await Promise.all([
    api('/security/status'), api('/security/audit'), api('/security/activity'),
  ]);
  const mod = state.platform.modules.find(m => m.id === 'security');
  return `${featureList(mod.features)}
    <div class="grid-2">
      ${card('Encryption at rest', `<p class="status-ok">● ${status.encryptionAtRest.algorithm} enabled</p>`)}
      ${card('Encryption in transit', `<p class="status-ok">● ${status.encryptionInTransit.protocol} enabled</p>`)}
    </div>
    ${card('Audit log', table(['Time','Action','Detail'], audit.slice(0,30).map(a =>
      [formatTime(a.time), esc(a.action), esc(a.name || a.documentId || a.query || '')])))}
    ${card('Activity tracking', table(['Time','User','Action','Detail'], activity.map(a =>
      [formatTime(a.time), esc(a.user), esc(a.action), esc(a.detail)])))}`;
};

// ─── METADATA ─────────────────────────────────────────────────────────
MODULE_RENDERERS.metadata = async function() {
  const [schemas, docs] = await Promise.all([api('/metadata/schemas'), api('/documents')]);
  const mod = state.platform.modules.find(m => m.id === 'metadata');
  const rows = docs.map(d => [esc(d.name), esc(d.category), (d.tags||[]).join(', '), (d.labels||[]).join(', '), esc(d.classification)]);
  return `${featureList(mod.features)}
    ${card('Custom fields', schemas.customFields.map(f => `<span class="chip">${esc(f)}</span>`).join(''))}
    ${card('Categories & labels', `<p>Categories: ${schemas.categories.join(', ')}</p><p>Labels: ${schemas.labelSuggestions.join(', ')}</p>`)}
    ${card('Document metadata', table(['Document','Category','Tags','Labels','Auto-classified'], rows))}`;
};

// ─── OCR ──────────────────────────────────────────────────────────────
MODULE_RENDERERS.ocr = async function() {
  const docs = await api('/documents');
  const mod = state.platform.modules.find(m => m.id === 'ocr');
  const opts = docs.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  return `${featureList(mod.features)}
    ${card('OCR & extraction', `
      <div class="form-row">
        <select id="ocrDoc">${opts}</select>
        <button class="btn-primary" onclick="runOcr()">Run OCR</button>
        <button class="btn-sm" onclick="extractDoc('invoice')">Invoice</button>
        <button class="btn-sm" onclick="extractDoc('form')">Form</button>
        <button class="btn-sm" onclick="extractDoc('table')">Table</button>
      </div>
      <div id="ocrResult" class="result-box"></div>`)}`;
};

window.runOcr = async () => {
  const id = document.getElementById('ocrDoc').value;
  const r = await api(`/ocr/${id}`, { method:'POST' });
  document.getElementById('ocrResult').textContent = r.ocrText;
};
window.extractDoc = async (type) => {
  const r = await api('/ocr/extract', { method:'POST', body: JSON.stringify({ documentId: Number(document.getElementById('ocrDoc').value), type }) });
  document.getElementById('ocrResult').textContent = JSON.stringify(r.fields, null, 2);
};

// ─── WORKFLOW ─────────────────────────────────────────────────────────
MODULE_RENDERERS.workflow = async function() {
  const [workflows, notifications] = await Promise.all([api('/workflows'), api('/notifications')]);
  const docs = await api('/documents');
  const mod = state.platform.modules.find(m => m.id === 'workflow');
  const opts = docs.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  return `${featureList(mod.features)}
    ${card('Create workflow', `<div class="form-row"><select id="wfDoc">${opts}</select>
      <select id="wfType"><option>Approval</option><option>Review</option></select>
      <input id="wfAssignee" placeholder="Assignee"/>
      <button class="btn-primary" onclick="createWorkflow()">Start</button></div>`)}
    ${card('Notifications', notifications.length ? notifications.map(n => `<div class="notif">${esc(n.message)} <small>${formatTime(n.time)}</small></div>`).join('') : '<p class="muted">No pending notifications</p>')}
    ${card('Active workflows', workflows.length ? table(['Type','Document','Status','Created'], workflows.map(w =>
      [esc(w.type), `#${w.documentId}`, esc(w.status), formatTime(w.createdAt)])) : '<p class="muted">No workflows</p>')}`;
};

window.createWorkflow = async () => {
  await api('/workflows', { method:'POST', body: JSON.stringify({
    type: document.getElementById('wfType').value,
    documentId: Number(document.getElementById('wfDoc').value),
    assignee: document.getElementById('wfAssignee').value,
  })});
  showToast('Workflow started'); loadModule('workflow');
};

// ─── COLLABORATION ────────────────────────────────────────────────────
MODULE_RENDERERS.collaboration = async function() {
  const docs = await api('/documents');
  const mod = state.platform.modules.find(m => m.id === 'collaboration');
  const sel = state.collabDocId || docs[0]?.id;
  const comments = sel ? await api(`/comments/${sel}`) : [];
  const opts = docs.map(d => `<option value="${d.id}" ${d.id===sel?'selected':''}>${esc(d.name)}</option>`).join('');
  return `${featureList(mod.features)}
    ${card('Comments & mentions', `
      <select id="collabDoc" onchange="state.collabDocId=this.value;loadModule('collaboration')">${opts}</select>
      <div class="comments">${comments.map(c => `<div class="comment"><strong>${esc(c.author)}</strong> ${esc(c.text)} <small>${formatTime(c.time)}</small></div>`).join('') || '<p class="muted">No comments yet</p>'}
      <div class="form-row"><input id="commentText" placeholder="Add comment… use @name to mention"/>
      <button class="btn-primary" onclick="addComment()">Post</button></div>`)}
    ${card('Annotations & co-authoring', '<p class="muted">Select a checked-out document to annotate collaboratively. Use Check out in Documents module.</p>')}`;
};

window.addComment = async () => {
  await api('/comments', { method:'POST', body: JSON.stringify({
    documentId: Number(document.getElementById('collabDoc').value),
    author: state.user?.name, text: document.getElementById('commentText').value,
  })});
  showToast('Comment posted'); loadModule('collaboration');
};

// ─── INTEGRATIONS ─────────────────────────────────────────────────────
MODULE_RENDERERS.integrations = async function() {
  const items = await api('/integrations');
  const mod = state.platform.modules.find(m => m.id === 'integrations');
  return `${featureList(mod.features)}
    ${card('Identity integrations', table(['Service','Status','Protocol'], items.map(i =>
      [esc(i.name), `<span class="badge">${esc(i.status)}</span>`, esc(i.protocol)])))}`;
};

// ─── CONNECTORS ───────────────────────────────────────────────────────
MODULE_RENDERERS.connectors = async function() {
  const items = await api('/connectors');
  const mod = state.platform.modules.find(m => m.id === 'connectors');
  return `${featureList(mod.features)}
    ${card('Source connectors', `<div class="connector-grid">${items.map(c =>
      `<div class="connector-card"><strong>${esc(c.name)}</strong><span class="badge">${esc(c.status)}</span>
        <button class="btn-sm" onclick="connectSource('${c.id}')">Connect</button></div>`
    ).join('')}</div>`)}`;
};

window.connectSource = async (id) => {
  await api(`/connectors/${id}/connect`, { method:'POST' });
  showToast('Connector activated'); loadModule('connectors');
};

// ─── AI ASSISTANT ───────────────────────────────────────────────────────
MODULE_RENDERERS['ai-assistant'] = async function() {
  const mod = state.platform.modules.find(m => m.id === 'ai-assistant');
  const q = document.getElementById('aiQ')?.value || '';
  let status = '';
  try {
    const s = await api('/ai/status');
    status = s.configured ? `<span class="badge" style="background:rgba(46,204,113,.2);color:#5ddea8">OpenAI · ${esc(s.model)}</span>` : '<span class="badge warn">OpenAI not configured</span>';
  } catch {}
  let answer = '';
  if (q) {
    const r = await api('/ai/ask', { method:'POST', body: JSON.stringify({ question: q }) });
    const text = r.rawAnswer || r.answers.map(a => a.answer).join('\n');
    answer = `<div class="ai-answer"><p>${esc(text)}</p>${r.poweredBy ? `<small>Powered by ${esc(r.poweredBy)} (${esc(r.model)})</small>` : ''}</div>`;
  }
  return `${featureList(mod.features)} ${status}
    ${card('Chat with documents', `
      <textarea id="aiQ" placeholder="Ask a question, request a summary, compare documents, or generate a report…">${esc(q)}</textarea>
      <button class="btn-primary" onclick="loadModule('ai-assistant')">Ask</button>
      <div class="ai-results">${answer}</div>`)}`;
};

// ─── CLASSIFICATION ─────────────────────────────────────────────────────
MODULE_RENDERERS.classification = async function() {
  const [types, docs] = await Promise.all([api('/classification/types'), api('/documents')]);
  const mod = state.platform.modules.find(m => m.id === 'classification');
  return `${featureList(mod.features)}
    ${card('Auto-detected types', types.map(t => `<span class="chip">${esc(t)}</span>`).join(''))}
    ${card('Classified documents', table(['Document','Detected type','Category'], docs.map(d =>
      [esc(d.name), esc(d.classification), esc(d.category)])))}`;
};

// ─── COMPLIANCE ───────────────────────────────────────────────────────
MODULE_RENDERERS.compliance = async function() {
  const data = await api('/compliance');
  const mod = state.platform.modules.find(m => m.id === 'compliance');
  return `${featureList(mod.features)}
    ${card('Frameworks', data.frameworks.map(f => `<span class="chip">${esc(f)}</span>`).join(''))}
    ${card('Retention policies', table(['Policy','Years','Archive','Delete'], data.retentionPolicies.map(p =>
      [esc(p.name), p.years, p.autoArchive?'Yes':'No', p.autoDelete?'Yes':'No'])))}
    ${card('Legal holds', data.legalHolds.length ? data.legalHolds.join(', ') : '<p class="muted">No legal holds active</p>')}`;
};

// ─── GOVERNANCE ───────────────────────────────────────────────────────
MODULE_RENDERERS.governance = async function() {
  const docs = await api('/documents');
  const mod = state.platform.modules.find(m => m.id === 'governance');
  const opts = docs.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  return `${featureList(mod.features)}
    ${card('PII & sensitive data scan', `
      <select id="govDoc">${opts}</select>
      <button class="btn-primary" onclick="scanGov()">Scan document</button>
      <div id="govResult" class="result-box"></div>`)}`;
};

window.scanGov = async () => {
  const r = await api('/governance/scan', { method:'POST', body: JSON.stringify({ documentId: Number(document.getElementById('govDoc').value) }) });
  document.getElementById('govResult').innerHTML = `<p>Classification: <strong>${esc(r.classification)}</strong></p>
    <p>PII found: ${r.pii.map(p => esc(p.label)).join(', ') || 'None'}</p><p>${esc(r.accessGovernance)}</p>`;
};

// ─── AI UNDERSTANDING ─────────────────────────────────────────────────
MODULE_RENDERERS['ai-understanding'] = async function() {
  const docs = await api('/documents');
  const mod = state.platform.modules.find(m => m.id === 'ai-understanding');
  const opts = docs.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  return `${featureList(mod.features)}
    ${card('Document understanding', `
      <select id="underDoc">${opts}</select>
      <select id="underTask"><option value="summarize">Summarize</option><option value="extract">Extract key info</option><option value="risk">Risk detection</option><option value="contract">Contract analysis</option></select>
      <button class="btn-primary" onclick="runUnderstand()">Analyze</button>
      <div id="underResult" class="result-box"></div>
      <p class="muted" style="margin-top:12px">Supports PDF, image, drawing, and handwriting understanding via multimodal AI pipeline.</p>`)}`;
};

window.runUnderstand = async () => {
  const r = await api('/ai/understand', { method:'POST', body: JSON.stringify({
    documentId: Number(document.getElementById('underDoc').value),
    task: document.getElementById('underTask').value,
  })});
  document.getElementById('underResult').textContent = JSON.stringify(r.output, null, 2);
};

// ─── AGENTS ───────────────────────────────────────────────────────────
MODULE_RENDERERS.agents = async function() {
  const agents = await api('/agents');
  const mod = state.platform.modules.find(m => m.id === 'agents');
  return `${featureList(mod.features)}
    ${card('AI agents', table(['Agent','Status','Last run'], agents.map(a =>
      [esc(a.name), `<span class="badge">${esc(a.status)}</span>`, a.lastRun ? formatTime(a.lastRun) : '—'])))}`;
};

// ─── ANALYTICS ────────────────────────────────────────────────────────
MODULE_RENDERERS.analytics = async function() {
  const data = await api('/analytics');
  const mod = state.platform.modules.find(m => m.id === 'analytics');
  return `${featureList(mod.features)}
    <div class="stats-grid">
      <div class="stat"><span>${data.documents}</span><label>Documents</label></div>
      <div class="stat"><span>${data.totalVersions}</span><label>Saved copies</label></div>
      <div class="stat"><span>${data.searches}</span><label>Searches</label></div>
      <div class="stat"><span>${data.uploads}</span><label>Uploads</label></div>
      <div class="stat"><span>${data.activeConnectors}</span><label>Connectors</label></div>
      <div class="stat"><span>${data.pendingWorkflows}</span><label>Pending workflows</label></div>
    </div>
    ${card('Recent activity', table(['Time','Action','Detail'], data.recentActivity.map(a =>
      [formatTime(a.time), esc(a.action), esc(a.name || a.documentId || a.query || '')])))}`;
};

window.MODULE_RENDERERS = MODULE_RENDERERS;
