import { api } from "../api.js";

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

let activeTab = "policies";

export async function loadEnterpriseGovernance(tab = activeTab) {
  activeTab = tab;
  const root = document.getElementById("governanceModuleRoot");
  if (!root) return;

  root.innerHTML = '<div class="version-loading">Loading enterprise governance…</div>';

  try {
    const data = await api("/governance");
    root.innerHTML = `
      <div class="analytics-module-header">
        <div>
          <div class="breadcrumb">DMS <span>/</span> Enterprise Governance</div>
          <h1>Enterprise Governance</h1>
          <p>Policy management, retention schedules, and workflow automation.</p>
        </div>
      </div>
      <div class="gov-tabs">
        <button type="button" class="gov-tab${tab === "policies" ? " active" : ""}" data-tab="policies">Policy Management</button>
        <button type="button" class="gov-tab${tab === "retention" ? " active" : ""}" data-tab="retention">Retention Management</button>
        <button type="button" class="gov-tab${tab === "workflows" ? " active" : ""}" data-tab="workflows">Workflow Automation</button>
        <button type="button" class="gov-tab${tab === "duplicates" ? " active" : ""}" data-tab="duplicates">Duplicate Detection</button>
      </div>
      <div id="govTabBody">${renderTab(tab, data)}</div>`;

    root.querySelectorAll(".gov-tab").forEach((btn) => {
      btn.addEventListener("click", () => loadEnterpriseGovernance(btn.dataset.tab));
    });
    bindGovernanceEvents(tab);
  } catch (err) {
    root.innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
  }
}

function renderTab(tab, data) {
  if (tab === "policies") return renderPolicies(data.policies || []);
  if (tab === "retention") return renderRetention(data.retentionRules || []);
  if (tab === "workflows") return renderWorkflows(data.workflows || []);
  return renderDuplicatesPlaceholder();
}

function renderPolicies(policies) {
  if (!policies.length) {
    return `
      <div class="gov-actions">
        <button type="button" class="btn btn-primary btn-sm" id="govAddPolicy">+ Add policy</button>
      </div>
      <p class="version-muted">No policies yet. Add your own compliance rules after you connect sources or upload documents.</p>`;
  }
  return `
    <div class="gov-actions">
      <button type="button" class="btn btn-primary btn-sm" id="govAddPolicy">+ Add policy</button>
    </div>
    <table class="analytics-feature-table">
      <thead><tr><th>Policy</th><th>Framework</th><th>Rules</th><th>Status</th><th></th></tr></thead>
      <tbody>${policies.map((p) => `
        <tr>
          <td><strong>${esc(p.name)}</strong><br><span class="analytics-desc">${esc(p.description)}</span></td>
          <td>${esc(p.framework)}</td>
          <td>${(p.rules || []).map((r) => `<span class="analytics-status status-partial">${esc(r)}</span>`).join(" ")}</td>
          <td><span class="analytics-status ${p.enabled ? "status-live" : "status-planned"}">${p.enabled ? "Active" : "Disabled"}</span></td>
          <td><button type="button" class="btn btn-sm gov-del-policy" data-id="${esc(p.id)}">Delete</button></td>
        </tr>`).join("")}</tbody>
    </table>`;
}

function renderRetention(rules) {
  if (!rules.length) {
    return `
      <div class="gov-actions">
        <button type="button" class="btn btn-primary btn-sm" id="govAddRetention">+ Add retention rule</button>
        <button type="button" class="btn btn-sm" id="govScanRetention">Run retention scan</button>
      </div>
      <p class="version-muted">No retention rules yet. Create rules to track how long documents should be kept.</p>
      <div id="govRetentionResults"></div>`;
  }
  return `
    <div class="gov-actions">
      <button type="button" class="btn btn-primary btn-sm" id="govAddRetention">+ Add retention rule</button>
      <button type="button" class="btn btn-sm" id="govScanRetention">Run retention scan</button>
    </div>
    <table class="analytics-feature-table">
      <thead><tr><th>Rule</th><th>Category</th><th>Keep (years)</th><th>Action</th><th>Status</th></tr></thead>
      <tbody>${rules.map((r) => `
        <tr>
          <td><strong>${esc(r.name)}</strong></td>
          <td>${esc(r.category)}</td>
          <td>${r.years}</td>
          <td>${esc(r.action)}</td>
          <td><span class="analytics-status ${r.enabled ? "status-live" : "status-planned"}">${r.enabled ? "Active" : "Disabled"}</span></td>
        </tr>`).join("")}</tbody>
    </table>
    <div id="govRetentionResults"></div>`;
}

function renderWorkflows(workflows) {
  if (!workflows.length) {
    return `
      <div class="gov-actions">
        <button type="button" class="btn btn-primary btn-sm" id="govAddWorkflow">+ Add workflow</button>
      </div>
      <p class="version-muted">No workflows yet. Add automation rules for uploads, retention scans, or source connections.</p>`;
  }
  return `
    <div class="gov-actions">
      <button type="button" class="btn btn-primary btn-sm" id="govAddWorkflow">+ Add workflow</button>
    </div>
    <table class="analytics-feature-table">
      <thead><tr><th>Workflow</th><th>Trigger</th><th>Action</th><th>Runs</th><th>Status</th></tr></thead>
      <tbody>${workflows.map((w) => `
        <tr>
          <td><strong>${esc(w.name)}</strong></td>
          <td>${esc(w.trigger)}</td>
          <td>${esc(w.action)}</td>
          <td>${w.runs || 0}</td>
          <td>
            <span class="analytics-status ${w.enabled ? "status-live" : "status-planned"}">${w.enabled ? "Active" : "Disabled"}</span>
            <button type="button" class="btn btn-sm gov-toggle-wf" data-id="${esc(w.id)}" data-enabled="${w.enabled ? "0" : "1"}">${w.enabled ? "Disable" : "Enable"}</button>
          </td>
        </tr>`).join("")}</tbody>
    </table>`;
}

function renderDuplicatesPlaceholder() {
  return `
    <div class="gov-actions">
      <button type="button" class="btn btn-primary btn-sm" id="govScanDuplicates">Scan for duplicates</button>
    </div>
    <div id="govDuplicateResults"><p class="version-muted">Run a scan to find highly similar documents across connected sources.</p></div>`;
}

function bindGovernanceEvents(tab) {
  document.getElementById("govAddPolicy")?.addEventListener("click", async () => {
    const name = prompt("Policy name:");
    if (!name) return;
    await api("/governance/policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, framework: "Internal", description: "Custom policy", rules: ["custom_rule"] }),
    });
    window.showToast?.("Policy added");
    loadEnterpriseGovernance("policies");
  });

  document.querySelectorAll(".gov-del-policy").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this policy?")) return;
      await api(`/governance/policies/${btn.dataset.id}`, { method: "DELETE" });
      loadEnterpriseGovernance("policies");
    });
  });

  document.getElementById("govAddRetention")?.addEventListener("click", async () => {
    const name = prompt("Retention rule name:");
    if (!name) return;
    await api("/governance/retention", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, category: "other", years: 5, action: "archive" }),
    });
    window.showToast?.("Retention rule added");
    loadEnterpriseGovernance("retention");
  });

  document.getElementById("govScanRetention")?.addEventListener("click", async () => {
    const el = document.getElementById("govRetentionResults");
    if (el) el.innerHTML = '<div class="version-loading">Scanning…</div>';
    const scan = await api("/governance/retention/scan", { method: "POST" });
    window.refreshNotifications?.();
    if (!el) return;
    el.innerHTML = `
      <h4 style="margin:16px 0 8px">Scan results (${scan.scanned} documents)</h4>
      ${scan.results?.length ? `<table class="analytics-feature-table"><thead><tr><th>Document</th><th>Status</th><th>Days left</th><th>Action</th></tr></thead><tbody>
        ${scan.results.slice(0, 20).map((r) => `<tr>
          <td>${esc(r.title)}</td>
          <td><span class="analytics-status status-${r.status === "compliant" ? "live" : r.status === "expiring_soon" ? "partial" : "planned"}">${esc(r.status)}</span></td>
          <td>${r.daysRemaining}</td>
          <td>${esc(r.recommendedAction)}</td>
        </tr>`).join("")}
      </tbody></table>` : "<p class=\"version-muted\">All documents compliant.</p>"}`;
  });

  document.getElementById("govAddWorkflow")?.addEventListener("click", async () => {
    const name = prompt("Workflow name:");
    if (!name) return;
    await api("/governance/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, trigger: "document_uploaded", action: "notify", condition: {} }),
    });
    window.showToast?.("Workflow added");
    loadEnterpriseGovernance("workflows");
  });

  document.querySelectorAll(".gov-toggle-wf").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/governance/workflows/${btn.dataset.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: btn.dataset.enabled === "1" }),
      });
      loadEnterpriseGovernance("workflows");
    });
  });

  if (tab === "duplicates") {
    document.getElementById("govScanDuplicates")?.addEventListener("click", async () => {
      const el = document.getElementById("govDuplicateResults");
      if (el) el.innerHTML = '<div class="version-loading">Scanning…</div>';
      const data = await api("/documents/duplicates");
      if (!el) return;
      el.innerHTML = data.groups?.length
        ? data.groups.map((g) => `
          <div class="version-card" style="margin-top:12px">
            <div class="version-card-head"><h3>${esc(g.primary.title)}</h3></div>
            <div class="version-card-body">${g.duplicates.map((d) => `<div class="similar-item"><strong>${esc(d.title)}</strong> <span class="analytics-status status-partial">${d.similarity}% similar</span> · ${esc(d.source)}</div>`).join("")}</div>
          </div>`).join("")
        : "<p class=\"version-muted\">No duplicate groups found.</p>";
    });
  }
}
