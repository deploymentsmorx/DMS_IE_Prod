import { api, getToken } from "../api.js";
import { CONFIG } from "../config.js";
import { attachEditorAutocomplete } from "../autocomplete.js";

const VERSION_API = "/dms/version";
const COLOR_PALETTE = [
  { bg: "#1e1830", text: "#a899ff" },
  { bg: "#1e1525", text: "#e87eb0" },
  { bg: "#0d1e1a", text: "#4ecfa0" },
  { bg: "#1e1a0a", text: "#f0b84e" },
  { bg: "#0d1625", text: "#68b0f5" },
  { bg: "#0f1e0a", text: "#89c93d" },
];

const versionState = {
  selectedDocId: null,
  selectedVersionId: null,
  viewMode: "document",
  editMode: false,
  editContent: null,
  currentFolder: "root",
  user: null,
  permissions: { canApprove: true, canDelete: true, canUpload: true, label: "Admin" },
};

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function formatTime(iso) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function formatVersionLabel(id) {
  return `Version ${String(id).replace(/^v/i, "")}`;
}

function approvalLabel(status) {
  const map = { draft: "Draft", pending: "Under Review", approved: "Approved", rejected: "Rejected" };
  return map[status] || status;
}

function renderMetadataPanel(metadata = {}) {
  const rows = [
    ["Document Type", metadata.documentType],
    ["Project Name", metadata.projectName],
    ["Vendor", metadata.vendor],
    ["Date", metadata.date],
    ["Department", metadata.department],
    ["Status", metadata.status],
    ["Version", metadata.version || "1.0"],
  ].filter(([, v]) => v);
  if (!rows.length) return "<p class=\"version-muted\">Upload or click Extract metadata to identify fields automatically.</p>";
  return rows.map(([k, v]) => `<div class="version-meta-row"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join("");
}

function looksLikeBinaryPreview(text) {
  if (!text) return false;
  const sample = text.slice(0, 400);
  if (sample.startsWith("PK")) return true;
  if (/\uFFFD/.test(sample)) return true;
  const bad = (sample.match(/[\x00-\x08\x0E-\x1F]/g) || []).length;
  return bad > 8;
}

function canEditDocument(doc) {
  if (!doc) return false;
  if (!doc.checkedOutBy) return true;
  const userName = versionState.user?.name || "User";
  return doc.checkedOutBy === userName;
}

function renderPreviewOrEditor(doc, ver) {
  if (versionState.editMode && canEditDocument(doc)) {
    return `<div class="version-editor-wrap">
      <p class="version-help">You are editing the extracted text. Click <strong>Save changes</strong> to create a new version, or <strong>Check in</strong> when finished.</p>
      <textarea id="versionInlineEditor" class="version-inline-editor" spellcheck="true"></textarea>
    </div>`;
  }
  return renderPreviewContent(ver.content);
}

function renderPreviewContent(text) {
  if (looksLikeBinaryPreview(text)) {
    return `<div class="version-preview version-preview--notice">
      <p><strong>This file was uploaded before text extraction was enabled.</strong></p>
      <p>Word (.docx) and PDF files are not plain text — the preview showed raw file data by mistake.</p>
      <p>Please upload the file again to see readable content in your document's language.</p>
    </div>`;
  }
  return `<div class="version-preview">${text.split("\n\n").map((p) => `<p>${esc(p)}</p>`).join("")}</div>`;
}

function authorColor(name) {
  const idx = Math.abs([...String(name)].reduce((s, c) => s + c.charCodeAt(0), 0)) % COLOR_PALETTE.length;
  return COLOR_PALETTE[idx];
}

function versionApi(path, opts = {}) {
  return api(`${VERSION_API}${path}`, opts);
}

async function downloadExport(docId, format) {
  const token = getToken();
  const res = await fetch(`${CONFIG.API_BASE}${VERSION_API}/documents/${docId}/export?format=${format}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Export failed");
  }
  const blob = await res.blob();
  const dispo = res.headers.get("Content-Disposition") || "";
  const match = dispo.match(/filename="([^"]+)"/);
  const filename = match?.[1] || `document.${format}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function computeLineChanges(a, b) {
  const lcs = (x, y) => {
    const m = x.length;
    const n = y.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = x[i - 1] === y[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    const seq = [];
    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
      if (x[i - 1] === y[j - 1]) { seq.push({ type: "ctx", line: x[i - 1] }); i--; j--; }
      else if (dp[i - 1][j] > dp[i][j - 1]) { seq.push({ type: "del", line: x[i - 1] }); i--; }
      else { seq.push({ type: "add", line: y[j - 1] }); j--; }
    }
    while (i > 0) { seq.push({ type: "del", line: x[i - 1] }); i--; }
    while (j > 0) { seq.push({ type: "add", line: y[j - 1] }); j--; }
    return seq.reverse();
  };
  return lcs(a, b);
}

async function renderDocumentVersionModule() {
  const root = document.getElementById("versionModuleRoot");
  if (!root) return;

  root.innerHTML = '<div class="version-loading">Loading Document Version module…</div>';

  try {
    const [folders, docs, platform, permissions] = await Promise.all([
      versionApi("/folders"),
      versionApi(`/documents${versionState.currentFolder !== "root" ? "?folderId=" + versionState.currentFolder : ""}`),
      versionApi("/platform"),
      versionApi("/permissions").catch(() => ({ permissions: versionState.permissions })),
    ]);
    versionState.permissions = permissions.permissions || versionState.permissions;

    const folderBar = folders.map((f) =>
      `<button type="button" class="version-folder-btn${versionState.currentFolder === f.id ? " active" : ""}" data-folder="${esc(f.id)}">${esc(f.name)}</button>`
    ).join("");

    const docRows = docs.map((d) => {
      const ac = authorColor(d.lastAuthor);
      return `<tr class="version-row" data-doc-id="${d.id}">
        <td><strong>${esc(d.name)}</strong>${d.checkedOutBy ? `<span class="version-badge warn">Checked out: ${esc(d.checkedOutBy)}</span>` : ""}${d.approvalStatus && d.approvalStatus !== "draft" ? `<span class="version-badge">${esc(d.approvalStatus)}</span>` : ""}</td>
        <td><span class="version-format-badge">${esc(d.fileType || "Document")}</span></td>
        <td>${esc(d.classification || "")}</td>
        <td>${d.versionCount}</td>
        <td><span class="version-pill" style="background:${ac.bg};color:${ac.text}">${esc(d.lastAuthor)}</span></td>
        <td>${formatTime(d.lastTime)}</td>
        <td class="version-row-actions">
          ${versionState.permissions?.canDelete !== false ? `<button type="button" class="btn btn-sm btn-danger version-delete-btn" data-doc-id="${d.id}" data-doc-name="${esc(d.name)}" title="Delete document">Delete</button>` : ""}
        </td>
      </tr>`;
    }).join("");

    if (versionState.selectedDocId && !docs.some((d) => d.id === versionState.selectedDocId)) {
      versionState.selectedDocId = null;
      versionState.selectedVersionId = null;
    }

    let detail = "";
    let latestEditContent = "";
    if (versionState.selectedDocId) {
      const doc = await versionApi(`/documents/${versionState.selectedDocId}`);
      const audit = await versionApi(`/audit/${versionState.selectedDocId}`);
      const ver = doc.versions.find((v) => v.id === versionState.selectedVersionId) || doc.versions.at(-1);
      latestEditContent = ver.content || "";
      const ac = authorColor(ver.author);
      const approval = doc.approvalStatus || "draft";
      const perms = versionState.permissions || {};
      const signatures = doc.signatures || [];
      const history = [...doc.versions].reverse().map((v) => {
        const c = authorColor(v.author);
        return `<div class="version-history-item${v.id === versionState.selectedVersionId ? " selected" : ""}" data-version-id="${esc(v.id)}">
          <span class="version-pill" style="background:${c.bg};color:${c.text}">${esc(v.author)}</span>
          <span>${formatVersionLabel(v.id)}</span>
          <small>${formatTime(v.time)} — ${esc(v.message)}</small>
          <button type="button" class="btn btn-sm version-restore-btn" data-doc-id="${doc.id}" data-version-id="${esc(v.id)}">Restore</button>
        </div>`;
      }).join("");

      const contentView = versionState.viewMode === "changes" && doc.versions.length > 1
        ? renderChanges(doc)
        : renderPreviewOrEditor(doc, ver);
      const checkedOutByOther = doc.checkedOutBy && !canEditDocument(doc);
      const workflowHint = checkedOutByOther
        ? `Checked out by ${esc(doc.checkedOutBy)} — you cannot edit until they check in.`
        : versionState.editMode
          ? "Editing enabled — change the text below, then click Save changes."
          : "Click <strong>Edit</strong> or <strong>Check out</strong> to modify this document.";

      detail = `<div class="version-detail">
        <div class="version-detail-toolbar">
          <strong>${esc(doc.name)}</strong>
          <span class="analytics-status status-${approval === "approved" ? "live" : approval === "pending" ? "partial" : "planned"}">${esc(approvalLabel(approval))}</span>
          <div class="version-btn-group">
            <button type="button" class="btn btn-sm version-view-btn${versionState.viewMode === "document" ? " active" : ""}" data-mode="document">Preview</button>
            <button type="button" class="btn btn-sm version-view-btn${versionState.viewMode === "changes" ? " active" : ""}" data-mode="changes"${doc.versions.length < 2 ? " disabled title=\"Save at least one edit to compare versions\"" : ""}>Changes</button>
            <button type="button" class="btn btn-sm version-ai-summary-btn" data-doc-id="${doc.id}">AI Summary</button>
            <button type="button" class="btn btn-sm version-ai-metadata-btn" data-doc-id="${doc.id}">Extract metadata</button>
            ${!versionState.editMode && canEditDocument(doc)
              ? `<button type="button" class="btn btn-sm version-edit-btn" data-doc-id="${doc.id}">Edit</button>`
              : ""}
            ${!doc.checkedOutBy
              ? `<button type="button" class="btn btn-sm version-checkout-btn" data-doc-id="${doc.id}">Check out</button>`
              : `<button type="button" class="btn btn-sm version-checkin-btn" data-doc-id="${doc.id}">Check in</button>`}
            ${(approval === "draft" || approval === "rejected")
              ? `<button type="button" class="btn btn-sm version-submit-approval-btn" data-doc-id="${doc.id}">Submit for approval</button>`
              : ""}
            ${approval === "pending" && perms.canApprove
              ? `<button type="button" class="btn btn-sm version-approve-btn" data-doc-id="${doc.id}">Approve</button>
                 <button type="button" class="btn btn-sm version-reject-btn" data-doc-id="${doc.id}">Reject</button>`
              : ""}
            <button type="button" class="btn btn-sm version-sign-btn" data-doc-id="${doc.id}">E-Sign</button>
            <div class="version-export-wrap">
              <button type="button" class="btn btn-sm version-export-btn" data-doc-id="${doc.id}">Export ▾</button>
              <div class="version-export-menu" hidden>
                <button type="button" class="version-export-item" data-format="pdf" data-doc-id="${doc.id}">PDF</button>
                <button type="button" class="version-export-item" data-format="docx" data-doc-id="${doc.id}">Word (.docx)</button>
                <button type="button" class="version-export-item" data-format="xlsx" data-doc-id="${doc.id}">Excel (.xlsx)</button>
                <button type="button" class="version-export-item" data-format="txt" data-doc-id="${doc.id}">Text (.txt)</button>
              </div>
            </div>
            ${perms.canDelete !== false ? `<button type="button" class="btn btn-sm btn-danger version-delete-btn version-delete-btn--detail" data-doc-id="${doc.id}" data-doc-name="${esc(doc.name)}">Delete</button>` : ""}
            <button type="button" class="btn btn-sm version-save-btn${versionState.editMode ? " btn-primary" : ""}" id="versionSaveBtn"${!canEditDocument(doc) ? " disabled" : ""}>Save changes</button>
          </div>
        </div>
        <div class="version-workflow-hint">${workflowHint}</div>
        <div class="version-banner" style="background:${ac.bg};color:${ac.text}">${formatVersionLabel(ver.id)} · edited by ${esc(ver.author)} · ${formatTime(ver.time)}</div>
        <div class="version-split"><div>${contentView}</div><div class="version-side-panel">
          <h4>Extracted metadata</h4>
          <div id="versionMetadataPanel">${renderMetadataPanel(doc.metadata)}</div>
          <div id="versionAiSummaryPanel"></div>
          <h4 style="margin-top:16px">Change history</h4>${history}
          <h4 style="margin-top:16px">E-Signatures</h4>
          ${signatures.length ? signatures.map((s) => `<div class="version-history-item"><strong>${esc(s.signedBy)}</strong><small>${formatTime(s.signedAt)} · ${esc(s.versionId)}</small></div>`).join("") : "<p class=\"version-muted\">None yet</p>"}
          <h4 style="margin-top:16px">Audit trail</h4>
          ${audit.entries?.length ? audit.entries.slice(0, 8).map((a) => `<div class="version-history-item"><strong>${esc(a.action)}</strong><small>${formatTime(a.time)} · ${esc(a.user || a.userId || "")}</small></div>`).join("") : "<p class=\"version-muted\">No audit entries</p>"}
        </div></div>
      </div>`;
    }

    root.innerHTML = `
      <div class="version-module-header">
        <div>
          <div class="breadcrumb">DMS <span>/</span> Document Version</div>
          <h1>Document Version</h1>
          <p>${esc(platform.description)}</p>
        </div>
        <button type="button" class="btn btn-sm analytics-link-btn" onclick="openModuleAnalytics()">Analytics</button>
      </div>
      <div class="version-drop-zone" id="versionDropZone">
        <p>Drag & drop files here or <label class="version-link-btn">browse<input type="file" id="versionBulkFiles" multiple accept=".docx,.doc,.pdf,.txt,.csv,.xlsx,.xls,.pptx,.ppt" hidden /></label></p>
        <small>Supported: Word · PDF · Text · CSV · Excel · PowerPoint · version history · check-in/out · rollback</small>
      </div>
      <div class="version-folder-bar">${folderBar}</div>
      <div class="version-card">
        <div class="version-card-head"><h3>Documents</h3></div>
        <div class="version-card-body">
          ${docs.length
            ? `<table class="version-table"><thead><tr><th>Name</th><th>Format</th><th>Type</th><th>Copies</th><th>Last editor</th><th>Updated</th><th></th></tr></thead><tbody>${docRows}</tbody></table>`
            : "<p class=\"version-muted\">No documents in this folder. Upload Word, PDF, Text, CSV, Excel, or PowerPoint files above.</p>"}
        </div>
      </div>
      ${detail}
      <div class="version-modal-overlay" id="versionModalOverlay" hidden>
        <div class="version-modal" id="versionModal"></div>
      </div>`;

    bindVersionEvents(docs, latestEditContent);
  } catch (err) {
    root.innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
  }
}

function renderChanges(doc) {
  if (doc.versions.length < 2) {
    return `<div class="version-preview version-preview--notice"><p>Make and save an edit first — then use <strong>Changes</strong> to compare versions.</p></div>`;
  }
  const idx = doc.versions.findIndex((v) => v.id === versionState.selectedVersionId);
  const curr = doc.versions[Math.max(1, idx)];
  const prev = doc.versions[Math.max(0, Math.min(idx - 1, doc.versions.length - 2))];
  const diff = computeLineChanges(
    prev.content.split("\n").filter(Boolean),
    curr.content.split("\n").filter(Boolean)
  );
  return `<div class="version-diff">${diff.map((d) =>
    `<div class="version-diff-line ${d.type}"><span>${d.type === "add" ? "+" : d.type === "del" ? "−" : " "}</span>${esc(d.line)}</div>`
  ).join("")}</div>`;
}

function bindVersionEvents(docs = [], latestContent = "") {
  const root = document.getElementById("versionModuleRoot");
  if (!root) return;

  const editor = document.getElementById("versionInlineEditor");
  if (editor) {
    editor.value = versionState.editContent ?? latestContent ?? "";
    editor.addEventListener("input", () => {
      versionState.editContent = editor.value;
    });
    attachEditorAutocomplete(editor);
  }

  root.querySelectorAll(".version-btn-group button, .version-detail-toolbar button").forEach((btn) => {
    btn.addEventListener("click", (e) => e.stopPropagation());
  });

  root.querySelectorAll("[data-folder]").forEach((btn) => {
    btn.addEventListener("click", () => {
      versionState.currentFolder = btn.dataset.folder;
      versionState.selectedDocId = null;
      renderDocumentVersionModule();
    });
  });

  root.querySelectorAll(".version-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".version-delete-btn")) return;
      versionState.selectedDocId = Number(row.dataset.docId);
      versionState.selectedVersionId = null;
      versionState.viewMode = "document";
      versionState.editMode = false;
      versionState.editContent = null;
      renderDocumentVersionModule();
    });
  });

  root.querySelectorAll(".version-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.docId;
      const name = btn.dataset.docName || "this document";
      if (!confirm(`Delete "${name}"? This removes all versions and cannot be undone.`)) return;
      await versionApi(`/documents/${id}`, { method: "DELETE" });
      if (Number(versionState.selectedDocId) === Number(id)) {
        versionState.selectedDocId = null;
        versionState.selectedVersionId = null;
      }
      window.showToast?.("Document deleted");
      window.refreshNotifications?.();
      renderDocumentVersionModule();
    });
  });

  root.querySelectorAll(".version-history-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".version-restore-btn")) return;
      versionState.selectedVersionId = item.dataset.versionId;
      renderDocumentVersionModule();
    });
  });

  root.querySelectorAll(".version-restore-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await versionApi(`/documents/${btn.dataset.docId}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: btn.dataset.versionId, author: versionState.user?.name || "User" }),
      });
      window.showToast?.("Restored previous version");
      renderDocumentVersionModule();
    });
  });

  root.querySelectorAll(".version-view-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      versionState.viewMode = btn.dataset.mode;
      renderDocumentVersionModule();
    });
  });

  root.querySelector(".version-ai-summary-btn")?.addEventListener("click", async (e) => {
    const id = e.currentTarget.dataset.docId;
    const panel = document.getElementById("versionAiSummaryPanel");
    if (panel) panel.innerHTML = '<p class="version-muted">Generating summary…</p>';
    const result = await api("/intelligence/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: id, task: "summarize" }),
    });
    if (panel) {
      panel.innerHTML = `<h4 style="margin-top:16px">AI Summary</h4>
        <p>${esc(result.summary || "")}</p>
        ${result.keyPoints?.length ? `<ul>${result.keyPoints.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
        ${result.risks?.length ? `<p><strong>Risks:</strong> ${result.risks.map((r) => esc(r)).join("; ")}</p>` : ""}`;
    }
    window.showToast?.("AI summary ready");
  });

  root.querySelector(".version-ai-metadata-btn")?.addEventListener("click", async (e) => {
    const id = e.currentTarget.dataset.docId;
    const result = await api("/intelligence/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: id, persist: true }),
    });
    const panel = document.getElementById("versionMetadataPanel");
    if (panel) panel.innerHTML = renderMetadataPanel(result.metadata || {});
    window.showToast?.("Metadata extracted");
  });

  root.querySelector(".version-edit-btn")?.addEventListener("click", async (e) => {
    const id = e.currentTarget.dataset.docId;
    const doc = await versionApi(`/documents/${id}`);
    if (!doc.checkedOutBy) {
      await versionApi(`/documents/${id}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: versionState.user?.name || "User" }),
      });
    }
    versionState.editMode = true;
    versionState.viewMode = "document";
    versionState.editContent = doc.versions.at(-1)?.content || "";
    window.showToast?.("Edit mode enabled");
    renderDocumentVersionModule();
  });

  root.querySelector(".version-checkout-btn")?.addEventListener("click", async (e) => {
    const id = e.currentTarget.dataset.docId;
    await versionApi(`/documents/${id}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName: versionState.user?.name || "User" }),
    });
    versionState.editMode = true;
    versionState.viewMode = "document";
    versionState.editContent = null;
    window.showToast?.("Checked out — you can edit now");
    renderDocumentVersionModule();
  });

  root.querySelector(".version-checkin-btn")?.addEventListener("click", async (e) => {
    const id = e.currentTarget.dataset.docId;
    const editorEl = document.getElementById("versionInlineEditor");
    const pending = editorEl?.value;
    if (versionState.editMode && pending && pending !== (versionState.editContent ?? "")) {
      if (!confirm("You have unsaved edits. Check in without saving?")) return;
    }
    await versionApi(`/documents/${id}/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author: versionState.user?.name || "User" }),
    });
    versionState.editMode = false;
    versionState.editContent = null;
    window.showToast?.("Document checked in");
    window.refreshNotifications?.();
    renderDocumentVersionModule();
  });

  root.querySelector(".version-submit-approval-btn")?.addEventListener("click", async (e) => {
    const id = e.currentTarget.dataset.docId;
    const comment = prompt("Approval note (optional):") || "";
    await versionApi(`/documents/${id}/submit-approval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment }),
    });
    window.showToast?.("Submitted for approval");
    window.refreshNotifications?.();
    renderDocumentVersionModule();
  });

  root.querySelector(".version-approve-btn")?.addEventListener("click", async (e) => {
    const id = e.currentTarget.dataset.docId;
    await versionApi(`/documents/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: "Approved" }),
    });
    window.showToast?.("Document approved");
    window.refreshNotifications?.();
    renderDocumentVersionModule();
  });

  root.querySelector(".version-reject-btn")?.addEventListener("click", async (e) => {
    const id = e.currentTarget.dataset.docId;
    const comment = prompt("Rejection reason:") || "Rejected";
    await versionApi(`/documents/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment }),
    });
    window.showToast?.("Document rejected");
    window.refreshNotifications?.();
    renderDocumentVersionModule();
  });

  root.querySelector(".version-sign-btn")?.addEventListener("click", async (e) => {
    const id = e.currentTarget.dataset.docId;
    const signatureText = prompt("Type your full name to e-sign:") || versionState.user?.name;
    if (!signatureText) return;
    await versionApi(`/documents/${id}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signedBy: versionState.user?.name || "User", signatureText }),
    });
    window.showToast?.("Document e-signed");
    window.refreshNotifications?.();
    renderDocumentVersionModule();
  });

  root.querySelector(".version-export-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = e.currentTarget.parentElement?.querySelector(".version-export-menu");
    if (menu) menu.hidden = !menu.hidden;
  });

  root.querySelectorAll(".version-export-item").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await downloadExport(btn.dataset.docId, btn.dataset.format);
        window.showToast?.(`Exported as ${btn.dataset.format.toUpperCase()}`);
      } catch (err) {
        window.showToast?.(err.message);
      }
      root.querySelector(".version-export-menu")?.setAttribute("hidden", "");
    });
  });

  document.getElementById("versionSaveBtn")?.addEventListener("click", async () => {
    if (!versionState.editMode) {
      const doc = await versionApi(`/documents/${versionState.selectedDocId}`);
      if (!canEditDocument(doc)) {
        window.showToast?.("Document is checked out by another user");
        return;
      }
      if (!doc.checkedOutBy) {
        await versionApi(`/documents/${versionState.selectedDocId}/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userName: versionState.user?.name || "User" }),
        });
      }
      versionState.editMode = true;
      versionState.editContent = doc.versions.at(-1)?.content || "";
      renderDocumentVersionModule();
      window.showToast?.("Edit the text below, then click Save changes again");
      return;
    }

    const content = document.getElementById("versionInlineEditor")?.value ?? versionState.editContent ?? "";
    const message = prompt("What did you change?", "Updated") || "Updated";
    await versionApi(`/documents/${versionState.selectedDocId}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        author: versionState.user?.name || "User",
        organization: versionState.user?.department || "General",
        message,
        content,
      }),
    });
    versionState.editMode = false;
    versionState.editContent = null;
    window.showToast?.("New version saved");
    window.refreshNotifications?.();
    versionState.viewMode = "document";
    renderDocumentVersionModule();
  });

  setupVersionUpload();
}

function setupVersionUpload() {
  const zone = document.getElementById("versionDropZone");
  const input = document.getElementById("versionBulkFiles");
  if (!zone || !input) return;

  async function uploadFiles(files) {
    if (!files.length) return;
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    fd.append("author", versionState.user?.name || "Uploader");
    fd.append("organization", versionState.user?.department || "General");
    fd.append("folderId", versionState.currentFolder);
    const result = await versionApi("/documents/upload", { method: "POST", body: fd });
    const msg = result.rejected?.length
      ? `Uploaded ${result.uploaded} file(s). Skipped unsupported: ${result.rejected.join(", ")}`
      : `Uploaded ${result.uploaded || files.length} file(s)`;
    window.showToast?.(msg);
    renderDocumentVersionModule();
  }

  zone.ondragover = (e) => { e.preventDefault(); zone.classList.add("drag"); };
  zone.ondragleave = () => zone.classList.remove("drag");
  zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove("drag"); uploadFiles([...e.dataTransfer.files]); };
  input.onchange = () => uploadFiles([...input.files]);
}

export function initDocumentVersion(user) {
  versionState.user = user
    ? {
        name: user.displayName || user.name || user.username || "User",
        department: user.department || "General",
        role: user.role || "user",
      }
    : null;
}

export function loadDocumentVersionModule() {
  return renderDocumentVersionModule();
}

export function resetDocumentVersionSelection() {
  versionState.selectedDocId = null;
  versionState.selectedVersionId = null;
  versionState.viewMode = "document";
  versionState.editMode = false;
  versionState.editContent = null;
}
