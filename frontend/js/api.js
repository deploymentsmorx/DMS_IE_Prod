import { CONFIG } from "./config.js";

const AUTH_KEY = "adse_auth_token";

export function getToken() {
  return localStorage.getItem(AUTH_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(AUTH_KEY, token);
  else localStorage.removeItem(AUTH_KEY);
}

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeout || 15000);

  try {
    const r = await fetch(`${CONFIG.API_BASE}${path}`, {
      ...opts,
      headers,
      signal: controller.signal,
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401) {
      const isLogin = String(path).includes("/auth/login");
      const loginOpen = document.getElementById("loginOverlay")?.classList.contains("open");
      if (!isLogin && !loginOpen) {
        setToken(null);
        window.dispatchEvent(new CustomEvent("auth:expired"));
      }
      throw new Error(data.error || (isLogin ? "Invalid credentials" : "Session expired. Please sign in again."));
    }
    if (!r.ok) throw new Error(data.error || `API ${r.status}`);
    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Request timed out. Make sure the backend is running on port 3001.");
    }
    if (err.message === "Failed to fetch" || err.message.includes("NetworkError")) {
      throw new Error("Cannot reach server. Open http://localhost:3001 and run: cd backend && npm start");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
