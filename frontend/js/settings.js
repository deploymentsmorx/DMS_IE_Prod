import { applyTheme, watchSystemTheme } from "./theme.js";
import { languageOptionsHtml } from "./languages.js";
import { api } from "./api.js";
import { getCurrentUser } from "./auth.js";
import { isDmsAdmin, isDmsSuperAdmin, syncSuperAdminUi } from "./superAdmin.js";

export function initSettings(chat) {
  const overlay = document.getElementById("settingsModal");
  if (!overlay) return;

  let activeSection = "general";

  function openSettings() {
    syncSuperAdminUi(getCurrentUser());
    overlay.classList.add("open");
    renderSection(activeSection);
    renderChatHistoryList();
  }

  function closeSettings() {
    overlay.classList.remove("open");
  }

  function switchSection(section, btn) {
    activeSection = section;
    document.querySelectorAll(".settings-nav-btn").forEach((b) => b.classList.remove("active"));
    btn?.classList.add("active");
    renderSection(section);
  }

  function renderSection(section) {
    const panel = document.getElementById("settingsContent");
    const s = chat.loadSettings();

    const sections = {
      general: `
        <h2>General</h2>
        <div class="setting-row">
          <div><strong>Appearance</strong><p class="setting-desc">Choose light or dark theme</p></div>
          <select id="setAppearance">
            <option value="dark" ${s.appearance === "dark" ? "selected" : ""}>Dark</option>
            <option value="light" ${s.appearance === "light" ? "selected" : ""}>Light</option>
            <option value="system" ${s.appearance === "system" ? "selected" : ""}>System</option>
          </select>
        </div>
        <div class="setting-row">
          <div><strong>Accent color</strong></div>
          <select id="setAccent">
            <option value="indigo" ${s.accentColor === "indigo" ? "selected" : ""}>Indigo</option>
            <option value="emerald" ${s.accentColor === "emerald" ? "selected" : ""}>Emerald</option>
            <option value="sky" ${s.accentColor === "sky" ? "selected" : ""}>Sky</option>
          </select>
        </div>
        <div class="setting-row">
          <div><strong>Language</strong><p class="setting-desc">Preferred search language — works with multilingual document search</p></div>
          <select id="setLanguage">
            ${languageOptionsHtml(s.language || "auto")}
          </select>
        </div>`,

      chat: `
        <h2>Chat</h2>
        <div class="setting-row">
          <div>
            <strong>Save chat history</strong>
            <p class="setting-desc">Keep previous chats when opening a new one</p>
          </div>
          <label class="toggle"><input type="checkbox" id="setSaveHistory" ${s.saveChatHistory ? "checked" : ""}/><span></span></label>
        </div>
        <div class="setting-row">
          <div>
            <strong>Show welcome on new chat</strong>
            <p class="setting-desc">Display intro message when starting a new chat</p>
          </div>
          <label class="toggle"><input type="checkbox" id="setWelcome" ${s.showWelcomeOnNewChat ? "checked" : ""}/><span></span></label>
        </div>
        <div class="setting-row">
          <div><strong>Max saved chats</strong></div>
          <input type="number" id="setMaxChats" min="5" max="200" value="${s.maxSavedChats}"/>
        </div>
        <div class="setting-row">
          <div>
            <strong>Enable dictation</strong>
            <p class="setting-desc">Use voice input in chat composer</p>
          </div>
          <label class="toggle"><input type="checkbox" id="setDictation" ${s.enableDictation ? "checked" : ""}/><span></span></label>
        </div>
        <hr/>
        <h3>Chat actions</h3>
        <div class="setting-actions">
          <button class="btn" id="settingsNewChat">+ New Chat</button>
          <button class="btn" id="settingsClearChat">Clear current chat</button>
          <button class="btn" id="settingsDeleteChat">Delete current chat</button>
        </div>
        <h3 style="margin-top:16px">Chat history</h3>
        <div id="settingsChatList" class="settings-chat-list"></div>`,

      search: `
        <h2>Search</h2>
        <div class="setting-row">
          <div><strong>Default department</strong><p class="setting-desc">Filter applied on startup</p></div>
          <select id="setDefaultDept">
            <option value="all">All</option>
            <option value="finance">Finance</option>
            <option value="hr">HR</option>
            <option value="project">Project</option>
            <option value="admin">Admin</option>
            <option value="engineering">Engineering</option>
          </select>
        </div>
        <div class="setting-row">
          <div><strong>Match % threshold</strong><p class="setting-desc">Highlight results above this %</p></div>
          <input type="number" id="setMatchThreshold" min="0" max="100" value="${s.matchThreshold || 50}"/>
        </div>`,

      data: `
        <h2>Data controls</h2>
        <div class="setting-row">
          <div>
            <strong>Export chat history</strong>
            <p class="setting-desc">Download all chats as JSON</p>
          </div>
          <button class="btn" id="settingsExport">Export</button>
        </div>
        <div class="setting-row danger">
          <div>
            <strong>Delete all chats</strong>
            <p class="setting-desc">Permanently remove all saved conversations</p>
          </div>
          <button class="btn btn-danger" id="settingsClearAll">Delete all</button>
        </div>`,

      users: `
        <h2>Team accounts</h2>
        <p class="setting-desc" style="margin-bottom:14px">Create team logins here, then use each folder's Access settings to grant access by role or by person.</p>
        <form id="addLoginForm" class="add-login-form">
          <div class="field">
            <label for="loginDetailName">Full name</label>
            <input id="loginDetailName" required minlength="2" placeholder="e.g. Mordhwaj Singh"/>
          </div>
          <div class="field">
            <label for="loginDetailUsername">Username</label>
            <input id="loginDetailUsername" required minlength="2" autocomplete="off" placeholder="e.g. mordhwaj"/>
          </div>
          <div class="field">
            <label for="loginDetailRole">Role</label>
            <select id="loginDetailRole">
              <option value="user">User</option>
              <option value="engineer">Engineer</option>
              <option value="team_lead">Team Lead</option>
              <option value="manager">Manager</option>
              ${isDmsSuperAdmin(getCurrentUser()) ? `<option value="admin">Admin</option>` : ""}
            </select>
          </div>
          <div class="field">
            <label for="loginDetailPassword">Temporary password</label>
            <input id="loginDetailPassword" type="password" required minlength="6" autocomplete="new-password" placeholder="User signs in with this"/>
          </div>
          <div id="loginDetailStatus" class="form-status" aria-live="polite"></div>
          <button type="submit" class="btn btn-primary" id="loginDetailSave">Create &amp; save</button>
        </form>
        <div id="loginDetailCreds" class="credentials-box" hidden></div>
        <h3 style="margin-top:20px">Accounts</h3>
        <div id="loginDetailUsers" class="settings-chat-list"><p class="hint">Loading…</p></div>`,
    };

    if (section === "users" && !isDmsAdmin(getCurrentUser())) {
      panel.innerHTML = `<h2>Login details</h2><p class="hint">Admin access required.</p>`;
      return;
    }

    panel.innerHTML = sections[section] || sections.general;
    bindSectionEvents(section);
    if (section === "chat") renderChatHistoryList();
    if (section === "users") loadLoginUsers();
  }

  async function loadLoginUsers() {
    const el = document.getElementById("loginDetailUsers");
    if (!el) return;
    try {
      const res = await api("/auth/users");
      const users = res.users || [];
      const currentUser = getCurrentUser();
      el.innerHTML = users.length
        ? users.map((u) => `
            <div class="settings-chat-item">
              <span class="chat-item-title">${escapeHtml(u.displayName || u.username)}</span>
              <span class="chat-item-date">${escapeHtml(u.username)} · ${escapeHtml(u.role)}</span>
              ${u.builtIn
                ? `<span class="chat-item-date">Built-in</span>`
              : String(u.id) === String(currentUser?.id || "")
                ? `<span class="chat-item-date">You</span>`
                : `<button type="button" class="chat-item-del" data-user-id="${escapeHtml(u.id)}">Remove</button>`}
            </div>`).join("")
        : "<p class='hint'>No users yet</p>";

      el.querySelectorAll("[data-user-id]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm("Remove this login?")) return;
          try {
            await api(`/auth/users/${btn.dataset.userId}`, { method: "DELETE" });
            await loadLoginUsers();
            window.showToast?.("✅ Login removed");
          } catch (err) {
            window.showToast?.(err.message || "Could not remove login", true);
          }
        });
      });
    } catch (err) {
      el.innerHTML = `<p class="hint">${escapeHtml(err.message || "Could not load users")}</p>`;
    }
  }

  function renderChatHistoryList() {
    const el = document.getElementById("settingsChatList");
    if (!el) return;
    const list = chat.getAllSessions();
    const active = chat.getActiveSession();

    el.innerHTML = list.length
      ? list.map((s) => `
          <div class="settings-chat-item${s.id === active?.id ? " active" : ""}" data-id="${s.id}">
            <span class="chat-item-title">${escapeHtml(s.title)}</span>
            <span class="chat-item-date">${s.updatedAt?.slice(0, 16).replace("T", " ")}</span>
            <button class="chat-item-open" data-id="${s.id}">Open</button>
            <button class="chat-item-del" data-id="${s.id}">Delete</button>
          </div>`).join("")
      : "<p class='hint'>No saved chats</p>";

    el.querySelectorAll(".chat-item-open").forEach((btn) => {
      btn.addEventListener("click", () => {
        chat.setActiveSession(btn.dataset.id);
        window.renderChatUI?.();
        closeSettings();
      });
    });
    el.querySelectorAll(".chat-item-del").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (confirm("Delete this chat?")) {
          chat.deleteChat(btn.dataset.id);
          renderChatHistoryList();
          window.renderChatUI?.();
        }
      });
    });
  }

  function bindSectionEvents(section) {
    if (section === "general" || section === "chat" || section === "search") {
      panelChangeHandlers();
    }
    document.getElementById("settingsNewChat")?.addEventListener("click", () => {
      window.startNewChat?.();
      renderChatHistoryList();
    });
    document.getElementById("settingsClearChat")?.addEventListener("click", () => {
      if (confirm("Clear current chat messages?")) {
        window.clearCurrentChat?.();
        renderChatHistoryList();
      }
    });
    document.getElementById("settingsDeleteChat")?.addEventListener("click", () => {
      if (confirm("Delete current chat?")) {
        window.deleteCurrentChat?.();
        renderChatHistoryList();
      }
    });
    document.getElementById("settingsExport")?.addEventListener("click", () => {
      const blob = new Blob([chat.exportChats()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `docsearch-chats-${Date.now()}.json`;
      a.click();
    });
    document.getElementById("settingsClearAll")?.addEventListener("click", () => {
      if (confirm("Delete ALL chat history? This cannot be undone.")) {
        chat.clearAllChats();
        window.renderChatUI?.();
        renderChatHistoryList();
      }
    });

    if (section === "users") {
      document.getElementById("addLoginForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const status = document.getElementById("loginDetailStatus");
        const creds = document.getElementById("loginDetailCreds");
        const btn = document.getElementById("loginDetailSave");
        const username = document.getElementById("loginDetailUsername")?.value?.trim();
        const displayName = document.getElementById("loginDetailName")?.value?.trim();
        const role = document.getElementById("loginDetailRole")?.value;
        const password = document.getElementById("loginDetailPassword")?.value;
        if (status) {
          status.textContent = "Saving…";
          status.className = "form-status";
        }
        if (btn) btn.disabled = true;
        try {
          const res = await api("/auth/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, displayName, role, password }),
          });
          if (status) {
            status.textContent = res.message || "Login created";
            status.className = "form-status ok";
          }
          if (creds) {
            creds.hidden = false;
            creds.innerHTML = `
              <strong>Give these login details to the user</strong>
              <pre>Username: ${escapeHtml(res.user?.username)}
Temporary password: ${escapeHtml(res.temporaryPassword)}
Role: ${escapeHtml(res.user?.role)}</pre>`;
          }
          document.getElementById("addLoginForm")?.reset();
          await loadLoginUsers();
          window.showToast?.("✅ Login details saved");
        } catch (err) {
          if (status) {
            status.textContent = err.message || "Could not create login";
            status.className = "form-status error";
          }
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    }
  }

  function panelChangeHandlers() {
    const save = () => {
      const s = chat.loadSettings();
      chat.saveSettings({
        ...s,
        appearance: document.getElementById("setAppearance")?.value || s.appearance,
        accentColor: document.getElementById("setAccent")?.value || s.accentColor,
        language: document.getElementById("setLanguage")?.value || s.language,
        saveChatHistory: document.getElementById("setSaveHistory")?.checked ?? s.saveChatHistory,
        showWelcomeOnNewChat: document.getElementById("setWelcome")?.checked ?? s.showWelcomeOnNewChat,
        maxSavedChats: Number(document.getElementById("setMaxChats")?.value) || s.maxSavedChats,
        enableDictation: document.getElementById("setDictation")?.checked ?? s.enableDictation,
        defaultDept: document.getElementById("setDefaultDept")?.value,
        matchThreshold: Number(document.getElementById("setMatchThreshold")?.value) || 50,
      });
      applyTheme(chat.loadSettings());
      window.syncSearchLanguage?.(document.getElementById("setLanguage")?.value || s.language);
      if (window.render) window.render();
    };

    document.getElementById("settingsContent")?.querySelectorAll("select, input").forEach((el) => {
      el.addEventListener("change", save);
    });
  }

  function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t || "";
    return d.innerHTML;
  }

  document.getElementById("openSettings")?.addEventListener("click", openSettings);
  document.getElementById("closeSettings")?.addEventListener("click", closeSettings);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeSettings(); });

  document.querySelectorAll(".settings-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchSection(btn.dataset.section, btn));
  });

  watchSystemTheme();
  applyTheme(chat.loadSettings());
  window.openSettings = openSettings;
  window.openLoginDetails = () => {
    syncSuperAdminUi(getCurrentUser());
    // Prefer the full Administration page; fall back to settings modal.
    if (typeof window.switchDmsModule === "function") {
      window.switchDmsModule("users");
      return;
    }
    activeSection = "users";
    document.querySelectorAll(".settings-nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.section === "users");
    });
    overlay.classList.add("open");
    renderSection("users");
  };
}
