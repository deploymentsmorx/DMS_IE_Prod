import { api } from "../api.js";
import { getCurrentUser } from "../auth.js";
import { isDmsSuperAdmin } from "../superAdmin.js";

function escapeHtml(t) {
  const d = document.createElement("div");
  d.textContent = t || "";
  return d.innerHTML;
}

async function loadCustomers() {
  const el = document.getElementById("dmsUsersTable");
  if (!el) return;
  el.innerHTML = `<p class="hint">Loading accounts…</p>`;
  try {
    const res = await api("/admin/customers");
    const items = res.items || [];
    if (!items.length) {
      el.innerHTML = `<p class="hint">No licensed organisations yet.</p>`;
      return;
    }
    el.innerHTML = items
      .map(
        (item) => `
      <article class="admin-card" style="margin-bottom:14px;padding:12px 0;border-bottom:1px solid var(--border, #e5e7eb)">
        <header style="display:flex;gap:12px;flex-wrap:wrap;align-items:baseline">
          <strong>${escapeHtml(item.companyName)}</strong>
          <code>${escapeHtml(item.licenseKey)}</code>
        </header>
        <p class="hint">Device: ${escapeHtml(item.deviceId || "—")} · Host: ${escapeHtml(item.hostName || "—")} · Require device: ${item.requireDevice ? "ON" : "OFF"}</p>
        <p>${(item.engineers || [])
          .map(
            (e) =>
              `${escapeHtml(e.email)} <span class="dms-role-pill">${escapeHtml(e.role)}</span>${e.activated ? "" : " (pending activate)"}`
          )
          .join(", ") || "No engineers yet."}</p>
      </article>`
      )
      .join("");
  } catch (err) {
    el.innerHTML = `<p class="hint">${escapeHtml(err.message || "Could not load customers")}</p>`;
  }
}

function bindForm() {
  const form = document.getElementById("dmsAddCustomerForm");
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.getElementById("dmsUserStatus");
    const creds = document.getElementById("dmsUserCreds");
    const btn = document.getElementById("dmsUserSave");

    if (status) {
      status.textContent = "Saving…";
      status.className = "form-status";
    }
    if (btn) btn.disabled = true;

    try {
      const res = await api("/admin/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: document.getElementById("dmsCompany")?.value?.trim(),
          licenseKey: document.getElementById("dmsLicense")?.value?.trim(),
          installPassword: document.getElementById("dmsInstall")?.value || "",
          deviceId: document.getElementById("dmsDevice")?.value?.trim(),
          hostName: document.getElementById("dmsHost")?.value?.trim(),
          engineerName: document.getElementById("dmsEngName")?.value?.trim(),
          engineerEmail: document.getElementById("dmsEngEmail")?.value?.trim(),
          temporaryPassword: document.getElementById("dmsTempPassword")?.value,
          requireDevice: Boolean(document.getElementById("dmsRequireDevice")?.checked),
          grantFullAccess: Boolean(document.getElementById("dmsGrantFull")?.checked),
          role: document.getElementById("dmsEngRole")?.value || "admin",
        }),
      });

      if (status) {
        status.textContent = res.message || "Customer saved";
        status.className = "form-status ok";
      }

      const c = res.credentials || {};
      const pack = [
        `License key: ${c.licenseKey || ""}`,
        `Install password: ${c.installPassword || "(none)"}`,
        `Email: ${c.email || ""}`,
        `Temporary password: ${c.temporaryPassword || ""}`,
      ].join("\n");

      if (creds) {
        creds.hidden = false;
        creds.innerHTML = `
          <strong>Send to customer</strong>
          <pre>License key: ${escapeHtml(c.licenseKey)}
Install password: ${escapeHtml(c.installPassword || "(none)")}
Email: ${escapeHtml(c.email)}
Temporary password: ${escapeHtml(c.temporaryPassword)}</pre>
          <p class="hint">Customer opens Activate, enters these credentials with their Device ID / Host, then signs in on that PC only.</p>
          <button type="button" class="btn btn-sm" id="dmsCopyCreds">Copy credentials</button>`;
        document.getElementById("dmsCopyCreds")?.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(pack);
            window.showToast?.("Credentials copied");
          } catch {
            window.showToast?.("Copy failed", true);
          }
        });
      }

      form.reset();
      const requireDevice = document.getElementById("dmsRequireDevice");
      const grantFull = document.getElementById("dmsGrantFull");
      if (requireDevice) requireDevice.checked = true;
      if (grantFull) grantFull.checked = true;
      await loadCustomers();
      window.showToast?.("Customer credentials saved");
    } catch (err) {
      if (status) {
        status.textContent = err.message || "Could not create customer";
        status.className = "form-status error";
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

export function loadDmsUsers() {
  if (!isDmsSuperAdmin(getCurrentUser())) {
    const root = document.getElementById("dmsUsersRoot");
    if (root) {
      root.innerHTML = `<div class="content-card"><h2>Login &amp; system details</h2><p class="hint">Super Admin access required. Sign in as superadmin.</p></div>`;
    }
    return;
  }
  bindForm();
  loadCustomers();
}

window.loadDmsUsers = loadDmsUsers;
