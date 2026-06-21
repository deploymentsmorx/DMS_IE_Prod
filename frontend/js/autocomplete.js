import { api } from "./api.js";

const activeMenus = new Map();

function ensureMenu(input) {
  let menu = input.parentElement?.querySelector(".ai-suggest-menu");
  if (!menu) {
    menu = document.createElement("div");
    menu.className = "ai-suggest-menu";
    menu.hidden = true;
    input.parentElement?.classList.add("ai-suggest-wrap");
    input.parentElement?.appendChild(menu);
  }
  return menu;
}

function renderMenu(menu, suggestions, onPick) {
  if (!suggestions.length) {
    menu.hidden = true;
    menu.innerHTML = "";
    return;
  }
  menu.innerHTML = suggestions
    .map(
      (s, i) =>
        `<button type="button" class="ai-suggest-item" data-index="${i}">
          <span class="ai-suggest-type">${(s.type || "text").replace("_", " ")}</span>
          <span class="ai-suggest-text">${escapeHtml(s.text)}</span>
        </button>`
    )
    .join("");
  menu.hidden = false;
  menu.querySelectorAll(".ai-suggest-item").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const item = suggestions[Number(btn.dataset.index)];
      if (item) onPick(item.text, item);
      menu.hidden = true;
    });
  });
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

export function attachAutocomplete(input, { scope = "all", onSelect, minChars = 0 } = {}) {
  if (!input || activeMenus.has(input)) return;
  const menu = ensureMenu(input);
  let timer = null;

  async function fetchSuggestions(value) {
    const q = String(value || "").trim();
    if (q.length < minChars && minChars > 0) {
      menu.hidden = true;
      return;
    }
    try {
      const data = await api(`/intelligence/suggest?q=${encodeURIComponent(q)}&scope=${encodeURIComponent(scope)}`);
      renderMenu(menu, data.suggestions || [], (text, item) => {
        input.value = text;
        onSelect?.(text, item, input);
      });
    } catch {
      menu.hidden = true;
    }
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => fetchSuggestions(input.value), 180);
  });

  input.addEventListener("focus", () => fetchSuggestions(input.value));
  input.addEventListener("blur", () => setTimeout(() => { menu.hidden = true; }, 150));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") menu.hidden = true;
  });

  activeMenus.set(input, menu);
}

export function initGlobalAutocomplete() {
  attachAutocomplete(document.getElementById("globalSearch"), {
    scope: "search",
    onSelect: (text) => {
      window.runSearch?.(text);
    },
  });

  attachAutocomplete(document.getElementById("chatInput"), {
    scope: "chat",
    minChars: 0,
    onSelect: (text) => {
      const input = document.getElementById("chatInput");
      if (input) input.value = text;
    },
  });
}

export function attachEditorAutocomplete(input, onSelect) {
  attachAutocomplete(input, { scope: "edit", onSelect });
}
