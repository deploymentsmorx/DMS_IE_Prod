import { bootstrapApp } from "./app.js";

export async function launchApp() {
  if (window.__appLaunched) return;
  window.__appLaunched = true;
  try {
    await bootstrapApp();
  } catch (err) {
    console.error("launchApp failed:", err);
    const list = document.getElementById("docList");
    if (list) {
      list.innerHTML = `<div class="error-msg">Failed to start app: ${err.message}. Refresh the page.</div>`;
    }
  }
}

window.launchApp = launchApp;
