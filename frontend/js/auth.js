import { api, getToken, setToken } from "./api.js";

let currentUser = null;

function showLogin() {
  document.getElementById("loginOverlay")?.classList.add("open");
  document.getElementById("appShell")?.classList.add("hidden");
}

function showApp() {
  document.getElementById("loginOverlay")?.classList.remove("open");
  document.getElementById("appShell")?.classList.remove("hidden");
  updateUserBadge();
}

function updateUserBadge() {
  const el = document.getElementById("userBadge");
  if (!el || !currentUser) return;
  const roleLabel = currentUser.role === "superadmin" ? "Super Admin" : currentUser.role;
  el.innerHTML = `
    <span class="user-name">${escapeHtml(currentUser.displayName)}</span>
    <span class="user-role">${escapeHtml(roleLabel)}</span>`;
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

export function getCurrentUser() {
  return currentUser;
}

async function launchMainApp() {
  if (typeof window.bootMainApp === "function") {
    await window.bootMainApp();
    return;
  }
  window.__needsLaunch = true;
}

async function onLoginSuccess(data) {
  currentUser = data.user;
  setToken(data.token);
  showApp();
  updateUserBadge();
  window.syncSuperAdminUi?.(currentUser);
  await launchMainApp();
  window.syncSuperAdminUi?.(currentUser);
}

async function initAuth() {
  window.addEventListener("adse-login-ok", (e) => {
    onLoginSuccess(e.detail).catch((err) => {
      console.error(err);
      const errorEl = document.getElementById("loginError");
      if (errorEl) errorEl.textContent = err.message || "Login failed to start app.";
    });
  });

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch { /* ignore */ }
    setToken(null);
    currentUser = null;
    window.__appLaunched = false;
    showLogin();
  });

  window.addEventListener("auth:expired", () => {
    const overlay = document.getElementById("loginOverlay");
    if (overlay?.classList.contains("open")) return;
    currentUser = null;
    window.__appLaunched = false;
    showLogin();
    const err = document.getElementById("loginError");
    if (err) err.textContent = "Session expired. Please sign in again.";
  });

  if (window.__adsePendingLogin) {
    await onLoginSuccess(window.__adsePendingLogin);
    delete window.__adsePendingLogin;
    return;
  }

  const token = getToken();
  if (!token) {
    showLogin();
    return;
  }

  try {
    const res = await api("/auth/me");
    currentUser = res.user;
    showApp();
    updateUserBadge();
    window.syncSuperAdminUi?.(currentUser);
    await launchMainApp();
    window.syncSuperAdminUi?.(currentUser);
  } catch {
    setToken(null);
    showLogin();
  }
}

initAuth().catch((err) => {
  console.error("Auth init failed:", err);
  showLogin();
});
