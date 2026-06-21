import { api } from "../api.js";

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

export async function loadSavedSearchesMenu() {
  const menu = document.getElementById("savedSearchMenu");
  if (!menu) return;

  try {
    const items = await api("/saved-searches");
    if (!items.length) {
      menu.innerHTML = `<div class="saved-search-empty">No saved searches yet</div>`;
      return;
    }
    menu.innerHTML = items.map((s) => `
      <div class="saved-search-item">
        <button type="button" class="saved-search-run" data-id="${esc(s.id)}" data-query="${esc(s.query)}" data-source="${esc(s.source)}" data-cat="${esc(s.category)}" data-type="${esc(s.fileType)}">
          <strong>${esc(s.name)}</strong>
          <small>${esc(s.query)}</small>
        </button>
        <button type="button" class="saved-search-del" data-id="${esc(s.id)}" title="Delete">×</button>
      </div>`).join("");

    menu.querySelectorAll(".saved-search-run").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.applySavedSearch?.({
          query: btn.dataset.query,
          source: btn.dataset.source,
          category: btn.dataset.cat,
          fileType: btn.dataset.type,
        });
        menu.classList.remove("open");
      });
    });

    menu.querySelectorAll(".saved-search-del").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await api(`/saved-searches/${btn.dataset.id}`, { method: "DELETE" });
        loadSavedSearchesMenu();
      });
    });
  } catch (err) {
    menu.innerHTML = `<div class="saved-search-empty">${esc(err.message)}</div>`;
  }
}

export async function saveCurrentSearch(state) {
  const name = prompt("Name this saved search:", state.query || "My search");
  if (!name) return;
  await api("/saved-searches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      query: state.query || "",
      source: state.source || "all",
      category: state.category || "all",
      fileType: state.type || "all",
      lang: state.lang || "auto",
    }),
  });
  window.showToast?.("Search saved");
  loadSavedSearchesMenu();
}

export function initSavedSearches() {
  const toggle = document.getElementById("savedSearchToggle");
  const menu = document.getElementById("savedSearchMenu");
  const saveBtn = document.getElementById("saveSearchBtn");

  toggle?.addEventListener("click", (e) => {
    e.stopPropagation();
    menu?.classList.toggle("open");
    if (menu?.classList.contains("open")) loadSavedSearchesMenu();
  });

  saveBtn?.addEventListener("click", () => {
    window.saveCurrentSearch?.();
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".saved-search-wrap")) menu?.classList.remove("open");
  });

  loadSavedSearchesMenu();
}

export async function showSimilarDocuments(docId, title) {
  const panel = document.getElementById("similarDocsPanel");
  if (!panel) return;
  panel.classList.add("open");
  panel.innerHTML = `<div class="similar-loading">Finding similar documents…</div>`;

  try {
    const data = await api(`/documents/${docId}/similar`);
    if (!data.similar?.length) {
      panel.innerHTML = `<div class="similar-head"><strong>Similar to: ${esc(title)}</strong><button type="button" class="btn btn-sm" id="closeSimilar">Close</button></div><p class="version-muted">No similar documents found.</p>`;
    } else {
      panel.innerHTML = `
        <div class="similar-head"><strong>Similar to: ${esc(title)}</strong><button type="button" class="btn btn-sm" id="closeSimilar">Close</button></div>
        ${data.similar.map((d) => `
          <div class="similar-item">
            <div><strong>${esc(d.title)}</strong> <span class="analytics-status status-live">${d.similarity}% match</span></div>
            <p>${esc(d.snippet || d.description || "")}</p>
            ${d.url && d.url !== "#" ? `<button type="button" class="btn btn-sm open-link" data-doc-url="${esc(d.url)}">Open</button>` : ""}
          </div>`).join("")}`;
      panel.querySelectorAll(".open-link[data-doc-url]").forEach((btn) => {
        btn.addEventListener("click", () => window.openDocument?.(btn.dataset.docUrl));
      });
    }
    document.getElementById("closeSimilar")?.addEventListener("click", () => panel.classList.remove("open"));
  } catch (err) {
    panel.innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
  }
}

export function initSimilarDocsPanel() {
  window.showSimilarDocuments = showSimilarDocuments;
}
