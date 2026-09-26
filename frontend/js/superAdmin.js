import { getCurrentUser } from "./auth.js";

/** True when the signed-in DMS account can provision logins. */
export function isDmsSuperAdmin(user = getCurrentUser()) {
  if (!user) return false;
  const role = String(user.role || "").toLowerCase();
  const username = String(user.username || "").toLowerCase();
  return role === "superadmin" || role === "super_admin" || username === "superadmin";
}

/** Show/hide Super Admin entry points in the DMS shell. */
export function syncSuperAdminUi(user = getCurrentUser()) {
  const ok = isDmsSuperAdmin(user);
  const adminGroup = document.getElementById("adminSidebarGroup");
  const usersModuleBtn = document.getElementById("dmsUsersModuleBtn");
  const usersNav = document.getElementById("settingsUsersNav");
  if (adminGroup) adminGroup.hidden = !ok;
  if (usersModuleBtn) usersModuleBtn.hidden = !ok;
  if (usersNav) usersNav.hidden = !ok;
  return ok;
}

window.isDmsSuperAdmin = isDmsSuperAdmin;
window.syncSuperAdminUi = syncSuperAdminUi;
