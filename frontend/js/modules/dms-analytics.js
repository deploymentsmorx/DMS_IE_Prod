import { api } from "../api.js";

const CHART_PALETTE = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#38bdf8",
  "#a78bfa",
  "#f472b6",
  "#14b8a6",
  "#fb923c",
];

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function renderSummaryCards(summary) {
  const items = [
    { value: summary.indexedDocuments, label: "Indexed documents" },
    { value: summary.connectedSources, label: "Connected sources" },
    { value: summary.connectedFolders, label: "Connected folders" },
    { value: summary.revisions, label: "Revisions" },
    { value: summary.savedSearches, label: "Saved searches" },
    { value: summary.notifications, label: "Notifications" },
  ];
  return `<div class="analytics-summary-grid">${items
    .map(
      (item) => `<div class="analytics-summary-card">
        <span class="analytics-big">${item.value}</span>
        <label>${esc(item.label)}</label>
      </div>`
    )
    .join("")}</div>`;
}

function renderDonutChart(title, segments, centerLabel) {
  const filtered = segments.filter((s) => s.value > 0);
  if (!filtered.length) {
    return `<div class="analytics-chart-card">
      <h3>${esc(title)}</h3>
      <p class="analytics-chart-sub">No data yet</p>
    </div>`;
  }

  const total = filtered.reduce((s, d) => s + d.value, 0) || 1;
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const r = 58;
  const stroke = 22;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  const arcs = filtered
    .map((seg, i) => {
      const pct = seg.value / total;
      const dash = pct * circ;
      const gap = circ - dash;
      const color = seg.color || CHART_PALETTE[i % CHART_PALETTE.length];
      const el = `<circle class="analytics-donut-seg" cx="${cx}" cy="${cy}" r="${r}" fill="none"
        stroke="${color}" stroke-width="${stroke}" stroke-linecap="butt"
        stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"
        stroke-dashoffset="${(-offset * circ).toFixed(2)}"
        transform="rotate(-90 ${cx} ${cy})">
        <title>${esc(seg.label)}: ${seg.value} (${Math.round(pct * 100)}%)</title>
      </circle>`;
      offset += pct;
      return el;
    })
    .join("");

  const legend = filtered
    .map((seg, i) => {
      const color = seg.color || CHART_PALETTE[i % CHART_PALETTE.length];
      return `<div class="analytics-chart-legend-item">
        <span class="analytics-chart-dot" style="background:${color}"></span>
        <span>${esc(seg.label)}</span>
        <strong>${seg.value}</strong>
        <span class="analytics-chart-pct">${Math.round((seg.value / total) * 100)}%</span>
      </div>`;
    })
    .join("");

  return `<div class="analytics-chart-card">
    <h3>${esc(title)}</h3>
    <div class="analytics-donut-wrap">
      <svg class="analytics-donut" viewBox="0 0 ${size} ${size}" aria-label="${esc(title)}">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface3)" stroke-width="${stroke}"/>
        ${arcs}
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="analytics-donut-center">${esc(centerLabel)}</text>
        <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="analytics-donut-sub">total</text>
      </svg>
      <div class="analytics-chart-legend">${legend}</div>
    </div>
  </div>`;
}

function renderBarChart(title, items) {
  if (!items.length) {
    return `<div class="analytics-chart-card">
      <h3>${esc(title)}</h3>
      <p class="analytics-chart-sub">No data yet</p>
    </div>`;
  }

  const max = Math.max(...items.map((i) => i.value), 1);
  const chartH = 140;
  const barW = 44;
  const gap = 24;
  const pad = 28;
  const width = pad * 2 + items.length * barW + Math.max(0, items.length - 1) * gap;

  const bars = items
    .map((item, i) => {
      const h = Math.max(4, (item.value / max) * chartH);
      const x = pad + i * (barW + gap);
      const y = pad + chartH - h;
      const color = CHART_PALETTE[i % CHART_PALETTE.length];
      const shortLabel = item.label.length > 8 ? `${item.label.slice(0, 7)}…` : item.label;
      return `<g class="analytics-bar-group">
        <rect x="${x}" y="${pad}" width="${barW}" height="${chartH}" rx="6" class="analytics-bar-track"/>
        <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="6" fill="${color}" class="analytics-bar-value">
          <title>${esc(item.label)}: ${item.value}</title>
        </rect>
        <text x="${x + barW / 2}" y="${pad + chartH + 18}" text-anchor="middle" class="analytics-bar-label">${esc(shortLabel)}</text>
        <text x="${x + barW / 2}" y="${y - 8}" text-anchor="middle" class="analytics-bar-pct">${item.value}</text>
      </g>`;
    })
    .join("");

  return `<div class="analytics-chart-card">
    <h3>${esc(title)}</h3>
    <svg class="analytics-bar-chart" viewBox="0 0 ${width} ${chartH + pad + 34}" aria-label="${esc(title)}">
      ${bars}
    </svg>
  </div>`;
}

function renderConnectionsTable(connections) {
  if (!connections.length) {
    return `<section class="analytics-module-section">
      <div class="analytics-module-head">
        <div><h2>Connected sources</h2><p>No sources connected yet.</p></div>
      </div>
    </section>`;
  }

  return `<section class="analytics-module-section">
    <div class="analytics-module-head">
      <div><h2>Connected sources</h2><p>Live connection status from your account.</p></div>
    </div>
    <table class="analytics-feature-table">
      <thead><tr><th>Source</th><th>Status</th><th>Documents</th><th>Last sync</th><th>Connected</th></tr></thead>
      <tbody>${connections
        .map(
          (c) => `<tr>
            <td><strong>${esc(c.label)}</strong><br><span class="analytics-desc">${esc(c.type)}</span></td>
            <td><span class="analytics-status status-${c.status === "synced" || c.status === "connected" ? "live" : c.status === "error" ? "planned" : "partial"}">${esc(c.status || "connected")}</span></td>
            <td>${c.documentCount || 0}</td>
            <td>${formatDate(c.lastSync)}</td>
            <td>${formatDate(c.connectedAt)}</td>
          </tr>`
        )
        .join("")}</tbody>
    </table>
  </section>`;
}

function renderRecentDocuments(docs) {
  if (!docs.length) {
    return `<section class="analytics-module-section">
      <div class="analytics-module-head">
        <div><h2>Recent documents</h2><p>No indexed documents yet.</p></div>
      </div>
    </section>`;
  }

  return `<section class="analytics-module-section">
    <div class="analytics-module-head">
      <div><h2>Recent documents</h2><p>Latest indexed files from connected sources.</p></div>
    </div>
    <table class="analytics-feature-table">
      <thead><tr><th>Document</th><th>Source</th><th>Type</th><th>Department</th><th>Added</th></tr></thead>
      <tbody>${docs
        .map(
          (d) => `<tr>
            <td><strong>${esc(d.title)}</strong></td>
            <td>${esc(d.source)}</td>
            <td>${esc(d.fileType)}</td>
            <td>${esc(d.department)}</td>
            <td>${formatDate(d.addedAt)}</td>
          </tr>`
        )
        .join("")}</tbody>
    </table>
  </section>`;
}

function renderEmptyState() {
  return `<div class="analytics-empty-state">
    <h2>No analytics data yet</h2>
    <p>Connect Google Drive, OneDrive, or another source to index documents. Charts and counts here are built only from your real indexed data.</p>
    <button type="button" class="btn btn-primary" onclick="openConnectModalForSidebar()">Connect a source</button>
  </div>`;
}

export async function loadDmsAnalytics() {
  const root = document.getElementById("analyticsModuleRoot");
  if (!root) return;

  root.innerHTML = '<div class="version-loading">Loading analytics…</div>';

  try {
    const data = await api("/analytics/dashboard");
    const { summary, breakdown, connections, recentDocuments } = data;

    root.innerHTML = `
      <div class="analytics-module-header">
        <div>
          <div class="breadcrumb">DMS <span>/</span> Analytics</div>
          <h1>Usage Analytics</h1>
          <p>Live metrics from indexed documents and connected sources — no demo or placeholder values.</p>
        </div>
      </div>
      ${renderSummaryCards(summary)}
      ${
        data.requiresConnection
          ? renderEmptyState()
          : `<div class="analytics-charts-grid">
              ${renderDonutChart("Documents by source", breakdown.bySource, String(summary.indexedDocuments))}
              ${renderBarChart("Documents by file type", breakdown.byFileType)}
              ${renderBarChart("Documents by department", breakdown.byDepartment)}
            </div>`
      }
      <div class="analytics-legend">
        <span>Storage: <strong>${esc(data.storage)}</strong></span>
        ${data.openaiEnabled ? '<span class="analytics-status status-live">OpenAI enabled</span>' : '<span class="analytics-status status-partial">OpenAI not configured</span>'}
        <span>Updated: ${formatDate(data.updatedAt)}</span>
      </div>
      ${renderConnectionsTable(connections)}
      ${data.requiresConnection ? "" : renderRecentDocuments(recentDocuments)}
    `;
  } catch (err) {
    root.innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
  }
}
