import { api } from "../api.js";

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

export async function refreshNotifications() {
  const badge = document.getElementById("notifBadge");
  const panel = document.getElementById("notifPanel");
  if (!badge) return;

  try {
    const data = await api("/notifications");
    badge.textContent = data.unread > 0 ? String(data.unread) : "";
    badge.classList.toggle("has-unread", data.unread > 0);

    if (panel?.classList.contains("open")) {
      panel.innerHTML = renderPanel(data.notifications);
      bindPanelEvents();
    }
  } catch {
    badge.textContent = "";
  }
}

function renderPanel(notifications) {
  if (!notifications?.length) {
    return `<div class="notif-empty">No notifications yet</div>`;
  }
  return `
    <div class="notif-head">
      <strong>Notifications</strong>
      <button type="button" class="btn btn-sm" id="notifReadAll">Mark all read</button>
    </div>
    <div class="notif-list">${notifications.map((n) => `
      <div class="notif-item${n.read ? "" : " unread"}" data-id="${esc(n.id)}">
        <strong>${esc(n.title)}</strong>
        <p>${esc(n.message)}</p>
        <small>${new Date(n.createdAt).toLocaleString()}</small>
      </div>`).join("")}</div>`;
}

function bindPanelEvents() {
  document.getElementById("notifReadAll")?.addEventListener("click", async () => {
    await api("/notifications/read-all", { method: "POST" });
    refreshNotifications();
  });
  document.querySelectorAll(".notif-item").forEach((item) => {
    item.addEventListener("click", async () => {
      await api(`/notifications/${item.dataset.id}/read`, { method: "POST" });
      refreshNotifications();
    });
  });
}

export function initNotifications() {
  const btn = document.getElementById("notifBtn");
  const panel = document.getElementById("notifPanel");
  if (!btn || !panel) return;

  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) {
      const data = await api("/notifications");
      panel.innerHTML = renderPanel(data.notifications);
      bindPanelEvents();
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".notif-wrap")) panel.classList.remove("open");
  });

  refreshNotifications();
  setInterval(refreshNotifications, 30000);
  window.refreshNotifications = refreshNotifications;
}
