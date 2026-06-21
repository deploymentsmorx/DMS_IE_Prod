import { api, getToken } from "./api.js";

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

export function initFeatures(getDocs) {
  window.getDocs = getDocs;
}

async function populateDocSelects() {
  const docs = await window.getDocs?.() || [];
  const opts = docs.map((d) => `<option value="${d.id}">${esc(d.title)} (rev ${d.revision || 1})</option>`).join("");
  ["compareA", "compareB", "revisionDoc", "viewer3dDoc"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<option value="">Select document…</option>${opts}`;
  });
}

async function uploadFiles(e) {
  e.preventDefault();
  const input = document.getElementById("fileInput");
  const dept = document.getElementById("uploadDept").value;
  if (!input.files.length) return alert("Choose files first");

  const fd = new FormData();
  for (const f of input.files) fd.append("files", f);
  fd.append("department", dept);

  try {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${window.location.origin}/api/upload`, { method: "POST", headers, body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    document.getElementById("uploadResult").innerHTML =
      `<div class="success-msg">✅ Uploaded ${data.imported} file(s) to <strong>${dept}</strong></div>`;
    input.value = "";
    if (window.render) window.render();
    populateDocSelects();
  } catch (err) {
    document.getElementById("uploadResult").innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
  }
}

async function connectFolder() {
  const path = document.getElementById("folderPath").value.trim();
  const dept = document.getElementById("folderDept").value;
  if (!path) return alert("Enter folder path");

  try {
    const res = await api("/folders/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, department: dept }),
    });
    document.getElementById("folderResult").innerHTML =
      `<div class="success-msg">✅ Connected <code>${esc(res.folder)}</code> — imported ${res.imported} documents (${esc(res.department)})</div>`;
    if (window.render) window.render();
    populateDocSelects();
  } catch (err) {
    document.getElementById("folderResult").innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
  }
}

async function loadRevisions() {
  const docId = document.getElementById("revisionDoc")?.value;
  const el = document.getElementById("revisionContent");
  if (!docId) { el.innerHTML = "<p class='hint'>Select a document</p>"; return; }

  try {
    const data = await api(`/revisions/${docId}`);
    el.innerHTML = `
      <div class="rev-header">Current: <strong>Rev ${data.currentRevision}</strong> — ${esc(data.document.title)}</div>
      ${data.revisions.length ? data.revisions.map((r) => `
        <div class="rev-card">
          <span class="rev-num">Rev ${r.revision}</span>
          <span>${esc(r.changeNote || "Previous version")}</span>
          <span class="rev-date">${r.savedAt?.slice(0, 10)}</span>
        </div>`).join("") : "<p class='hint'>No prior revisions — upload again to create revision history</p>"}`;
  } catch (err) {
    el.innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
  }
}

async function runCompare() {
  const a = document.getElementById("compareA").value;
  const b = document.getElementById("compareB").value;
  const el = document.getElementById("compareResult");
  if (!a || !b) return alert("Select two documents");

  try {
    const data = await api("/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docIdA: a, docIdB: b }),
    });
    el.innerHTML = `
      <div class="compare-score">${data.similarityPercent}% similar</div>
      <p>${esc(data.analysis)}</p>
      <p class="hint">${esc(data.recommendation)}</p>
      ${data.metadataDifferences.length ? `<ul>${data.metadataDifferences.map((d) =>
        `<li><strong>${d.field}</strong>: ${esc(String(d.a))} → ${esc(String(d.b))}</li>`).join("")}</ul>` : ""}`;
  } catch (err) {
    el.innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
  }
}

async function loadDefects() {
  const el = document.getElementById("defectContent");
  if (!el) return;
  try {
    const [list, analytics] = await Promise.all([
      api("/defects"),
      api("/defects/analytics"),
    ]);

    el.innerHTML = `
      <div class="analytics-grid">
        <div class="stat-card"><span class="stat-num">${analytics.total}</span><span>Total</span></div>
        <div class="stat-card warn"><span class="stat-num">${analytics.open}</span><span>Open</span></div>
        <div class="stat-card"><span class="stat-num">${analytics.bySeverity?.high || 0}</span><span>High</span></div>
        <div class="stat-card"><span class="stat-num">${analytics.bySeverity?.medium || 0}</span><span>Medium</span></div>
      </div>
      <div class="defect-list">
        ${list.defects.map((d) => `
          <div class="defect-card sev-${d.severity}">
            <strong>${esc(d.title)}</strong>
            <span class="badge">${d.severity}</span>
            <span class="badge">${d.status}</span>
            <p>${esc(d.description)}</p>
            <small>${esc(d.project)} · ${esc(d.location)} · ${d.detectedAt}</small>
            <button class="btn btn-sm" onclick="runRCAForDefect('${d.id}')">Root Cause</button>
          </div>`).join("")}
      </div>`;
  } catch (err) {
    el.innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
  }
}

window.runRCAForDefect = async (defectId) => {
  window.switchWorkspace("rca", document.querySelector('[data-ws="rca"]'));
  document.getElementById("rcaDefectId").value = defectId;
  runRootCause();
};

async function runAgentic() {
  const query = document.getElementById("agenticQuery").value.trim();
  const el = document.getElementById("agenticResult");
  if (!query) return;

  el.innerHTML = "<div class='hint'>Running agentic search…</div>";
  try {
    const data = await api("/agentic/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    el.innerHTML = `
      <div class="agent-steps">${data.steps.map((s) =>
        `<span class="step-pill">Step ${s.step}: ${s.action}</span>`).join("")}</div>
      <div class="synthesis">${esc(data.synthesis).replace(/\n/g, "<br>")}</div>
      <h4>Results (${data.results.length})</h4>
      ${data.results.slice(0, 5).map((d) =>
        `<div class="mini-doc">${esc(d.title)} <span>${d.matchPercent}%</span></div>`).join("")}
      ${data.defects?.length ? `<h4>Defects (${data.defects.length})</h4>${data.defects.map((d) => `<div class="mini-doc">${esc(d.title)} — ${d.severity}</div>`).join("")}` : ""}`;
  } catch (err) {
    el.innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
  }
}

async function loadGraph() {
  const canvas = document.getElementById("graphCanvas");
  const legend = document.getElementById("graphLegend");
  if (!canvas || !legend) return;

  try {
    const data = await api("/graph");
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.offsetWidth || 600;
    const h = canvas.height = 320;
    ctx.clearRect(0, 0, w, h);

    const nodes = data.nodes.slice(0, 30);
    const nodePos = {};
    const cols = Math.ceil(Math.sqrt(nodes.length));
    nodes.forEach((n, i) => {
      nodePos[n.id] = {
        x: 60 + (i % cols) * (w - 120) / Math.max(cols - 1, 1),
        y: 40 + Math.floor(i / cols) * 70,
      };
    });

    const colors = { document: "#6366f1", department: "#10b981", project: "#f59e0b", equipment: "#38bdf8", defect: "#f43f5e" };

    data.edges.forEach((e) => {
      const a = nodePos[e.fromId], b = nodePos[e.toId];
      if (!a || !b) return;
      ctx.strokeStyle = "rgba(99,102,241,.25)";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });

    nodes.forEach((n) => {
      const p = nodePos[n.id];
      ctx.fillStyle = colors[n.type] || "#94a3b8";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e2e4f0";
      ctx.font = "10px Inter";
      ctx.fillText(n.label.slice(0, 22), p.x + 12, p.y + 4);
    });

    legend.innerHTML = `${nodes.length} nodes · ${data.edges.length} edges · departments, projects, documents linked`;
  } catch (err) {
    legend.textContent = err.message;
  }
}

async function runRootCause() {
  const issue = document.getElementById("rcaIssue").value.trim();
  const defectId = document.getElementById("rcaDefectId").value;
  const el = document.getElementById("rcaResult");
  if (!issue && !defectId) return alert("Enter an issue or select a defect");

  el.innerHTML = "<div class='hint'>Analyzing…</div>";
  try {
    const data = await api("/root-cause/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issue, defectId: defectId || undefined }),
    });

    el.innerHTML = `
      <p><strong>Analysis:</strong> ${esc(data.analysis)}</p>
      <h4>Root Causes</h4><ul>${(data.rootCauses || []).map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
      <h4>Recommendations</h4><ul>${(data.recommendations || []).map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
      <p class="hint">Evidence: ${data.chain.documentCount} docs, ${data.chain.defectCount} defects, ${data.chain.graphEdgeCount} graph links</p>`;
  } catch (err) {
    el.innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
  }
}

let threeScene = null;

async function load3DViewer() {
  const docId = document.getElementById("viewer3dDoc")?.value;
  const container = document.getElementById("viewer3dContainer");
  if (!docId) return alert("Select a document");

  try {
    const data = await api(`/viewer3d/${docId}`);
    container.innerHTML = `<canvas id="threeCanvas"></canvas><div id="viewer3dInfo"></div>`;

    document.getElementById("viewer3dInfo").innerHTML = `
      <strong>${esc(data.title)}</strong> · Rev ${data.revision} · ${data.viewerType}
      <p class="hint">${esc(data.note)}</p>
      <div class="layer-list">${data.layers.map((l) =>
        `<span class="layer-pill" style="border-color:${l.color}">${esc(l.name)}</span>`).join("")}</div>`;

    if (typeof THREE === "undefined") {
      container.innerHTML += "<p class='error-msg'>Three.js not loaded</p>";
      return;
    }

    const canvas = document.getElementById("threeCanvas");
    const w = container.clientWidth || 500;
    const h = 280;
    canvas.width = w;
    canvas.height = h;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(w, h);
    renderer.setClearColor(0x0c0e14);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.set(...data.camera.position);
    camera.lookAt(...data.camera.target);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 5);
    scene.add(dir);

    for (const p of data.primitives) {
      let mesh;
      const color = new THREE.Color(p.color);
      if (p.type === "cylinder" || p.type === "pipe") {
        mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(p.scale[0], p.scale[0], p.scale[1], 16),
          new THREE.MeshStandardMaterial({ color })
        );
      } else {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(...p.scale),
          new THREE.MeshStandardMaterial({ color })
        );
      }
      mesh.position.set(...p.position);
      scene.add(mesh);
    }

    scene.add(new THREE.GridHelper(10, 10, 0x252840, 0x1a1d2b));

    function animate() {
      requestAnimationFrame(animate);
      scene.rotation.y += 0.005;
      renderer.render(scene, camera);
    }
    animate();
    threeScene = { scene, renderer, camera };
  } catch (err) {
    container.innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
  }
}
