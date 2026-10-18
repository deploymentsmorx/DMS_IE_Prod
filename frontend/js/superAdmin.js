import { getCurrentUser } from "./auth.js";

/** True when the signed-in DMS account can provision logins. */
export function isDmsSuperAdmin(user = getCurrentUser()) {
  if (!user) return false;
  const role = String(user.role || "").toLowerCase();
  const username = String(user.username || "").toLowerCase();
  return role === "superadmin" || role === "super_admin" || username === "superadmin";
}

/** True when the signed-in account can administer its team's DMS access. */
export function isDmsAdmin(user = getCurrentUser()) {
  if (!user) return false;
  const role = String(user.role || "").toLowerCase();
  return role === "admin" || isDmsSuperAdmin(user);
}

/** Show administration entry points to Admins and Super Admins. */
export function syncSuperAdminUi(user = getCurrentUser()) {
  const ok = isDmsAdmin(user);
  const adminGroup = document.getElementById("adminSidebarGroup");
  const usersModuleBtn = document.getElementById("dmsUsersModuleBtn");
  const usersNav = document.getElementById("settingsUsersNav");
  if (adminGroup) adminGroup.hidden = !ok;
  if (usersModuleBtn) usersModuleBtn.hidden = !ok;
  if (usersNav) usersNav.hidden = !ok;
  return ok;
}

window.isDmsSuperAdmin = isDmsSuperAdmin;
window.isDmsAdmin = isDmsAdmin;
window.syncSuperAdminUi = syncSuperAdminUi;
