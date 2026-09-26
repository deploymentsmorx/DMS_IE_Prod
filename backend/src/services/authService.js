const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const USERS_PATH = path.join(__dirname, "../data/users.json");

function getSecret() {
  return process.env.AUTH_SECRET || "smorx-advance-search-dev-secret";
}

function hashPassword(password) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(String(password))
    .digest("hex");
}

function builtinUsers() {
  return [
    {
      id: "superadmin",
      username: process.env.SUPER_ADMIN_USERNAME || "superadmin",
      passwordHash: hashPassword(process.env.SUPER_ADMIN_PASSWORD || "SuperAdmin@123"),
      role: "superadmin",
      displayName: "Super Admin",
      builtIn: true,
    },
    {
      id: "admin",
      username: process.env.ADMIN_USERNAME || "admin",
      passwordHash: hashPassword(process.env.ADMIN_PASSWORD || "Admin@123"),
      role: "admin",
      displayName: "Administrator",
      builtIn: true,
    },
    {
      id: "user",
      username: process.env.USER_USERNAME || "user",
      passwordHash: hashPassword(process.env.USER_PASSWORD || "User@123"),
      role: "user",
      displayName: "Standard User",
      builtIn: true,
    },
  ];
}

function loadCustomUsers() {
  try {
    if (!fs.existsSync(USERS_PATH)) return [];
    const raw = JSON.parse(fs.readFileSync(USERS_PATH, "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveCustomUsers(users) {
  const dir = path.dirname(USERS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
}

function getUsers() {
  return [...builtinUsers(), ...loadCustomUsers()];
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.displayName,
    builtIn: Boolean(user.builtIn),
    kind: user.kind || (user.builtIn ? "platform" : "user"),
    mustChangePassword: Boolean(user.mustChangePassword),
    requireDevice: Boolean(user.requireDevice),
    activated: user.activated !== undefined ? Boolean(user.activated) : true,
    licenseKey: user.licenseKey || "",
    customerId: user.customerId || "",
  };
}

function findRawUser(username) {
  const name = String(username || "").trim().toLowerCase();
  return getUsers().find((u) => String(u.username || "").toLowerCase() === name) || null;
}

function signToken(user) {
  const payload = {
    ...sanitizeUser(user),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(data).digest("hex");
  return `${data}.${sig}`;
}

function login(username, password, opts = {}) {
  const user = findRawUser(username);
  if (!user || user.passwordHash !== hashPassword(password)) {
    return { ok: false, error: "Invalid username or password" };
  }

  if (user.kind === "engineer" || user.requireDevice) {
    // Lazy require avoids circular init issues with licenseService.
    const licenseService = require("./licenseService");
    const gate = licenseService.checkDeviceGate(
      user,
      opts.deviceId || opts.device_id,
      opts.hostName || opts.host_name || opts.hostname
    );
    if (!gate.ok) return gate;
  }

  return completeLogin(user.username);
}

function completeLogin(username) {
  const user = getUsers().find((u) => u.username === String(username || "").trim());
  if (!user) return { ok: false, error: "User not found" };

  const token = signToken(user);
  const sessionUser = sanitizeUser(user);
  return {
    ok: true,
    token,
    user: sessionUser,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
}

function verifyCredentials(username, password) {
  const user = getUsers().find((u) => u.username === String(username || "").trim());
  if (!user || user.passwordHash !== hashPassword(password)) {
    return { ok: false, error: "Invalid username or password" };
  }
  return { ok: true, user: sanitizeUser(user) };
}

function createUser({ username, displayName, role, password }) {
  const name = String(username || "").trim().toLowerCase();
  const label = String(displayName || "").trim() || name;
  const userRole = ["superadmin", "admin", "user"].includes(role) ? role : "user";
  const tempPassword = String(password || "").trim();

  if (!name || name.length < 2) {
    return { ok: false, error: "Username must be at least 2 characters" };
  }
  if (!/^[a-z0-9._@+-]+$/i.test(name)) {
    return { ok: false, error: "Username may only contain letters, numbers, and . _ @ + -" };
  }
  if (tempPassword.length < 6) {
    return { ok: false, error: "Temporary password must be at least 6 characters" };
  }
  if (getUsers().some((u) => u.username.toLowerCase() === name)) {
    return { ok: false, error: "Username already exists" };
  }

  const custom = loadCustomUsers();
  const user = {
    id: `u_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`,
    username: name,
    displayName: label,
    role: userRole,
    passwordHash: hashPassword(tempPassword),
    builtIn: false,
    createdAt: new Date().toISOString(),
  };
  custom.push(user);
  saveCustomUsers(custom);

  return {
    ok: true,
    user: sanitizeUser(user),
    temporaryPassword: tempPassword,
  };
}

function deleteUser(userId) {
  const id = String(userId || "");
  if (builtinUsers().some((u) => u.id === id)) {
    return { ok: false, error: "Built-in accounts cannot be deleted" };
  }
  const custom = loadCustomUsers();
  const next = custom.filter((u) => u.id !== id);
  if (next.length === custom.length) {
    return { ok: false, error: "User not found" };
  }
  saveCustomUsers(next);
  return { ok: true };
}

function upsertEngineerUser(fields = {}) {
  const username = String(fields.username || "").trim().toLowerCase();
  if (!username) return { ok: false, error: "Engineer email is required." };

  const custom = loadCustomUsers();
  const idx = custom.findIndex(
    (u) => u.id === fields.id || String(u.username || "").toLowerCase() === username
  );
  const next = {
    id: fields.id || `e_${crypto.randomBytes(6).toString("hex")}`,
    username,
    displayName: String(fields.displayName || username).trim(),
    role: ["superadmin", "admin", "user"].includes(fields.role) ? fields.role : "user",
    passwordHash: fields.passwordHash,
    builtIn: false,
    kind: "engineer",
    customerId: fields.customerId || "",
    licenseKey: fields.licenseKey || "",
    deviceId: fields.deviceId || "",
    hostName: fields.hostName || "",
    requireDevice: Boolean(fields.requireDevice),
    activated: Boolean(fields.activated),
    mustChangePassword: fields.mustChangePassword !== false,
    installPasswordHash: fields.installPasswordHash || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (idx >= 0) {
    next.createdAt = custom[idx].createdAt || next.createdAt;
    if (!fields.passwordHash) next.passwordHash = custom[idx].passwordHash;
    custom[idx] = { ...custom[idx], ...next };
  } else {
    if (!next.passwordHash) {
      return { ok: false, error: "Password hash required for new engineer." };
    }
    custom.push(next);
  }
  saveCustomUsers(custom);
  return { ok: true, user: sanitizeUser(next) };
}

function logout(_token) {
  /* stateless tokens — client clears localStorage */
}

function validateToken(token) {
  if (!token || !token.includes(".")) return null;

  const dot = token.lastIndexOf(".");
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!data || !sig) return null;

  const expected = crypto.createHmac("sha256", getSecret()).update(data).digest("hex");
  if (sig !== expected) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return sanitizeUser(payload);
  } catch {
    return null;
  }
}

function isSuperAdmin(user) {
  return user?.role === "superadmin";
}

function isAdmin(user) {
  return user?.role === "superadmin" || user?.role === "admin";
}

function canApprove(user) {
  return isAdmin(user);
}

function canDelete(user) {
  return isAdmin(user);
}

function canGovern(user) {
  return isAdmin(user);
}

function getRolePermissions(user) {
  const { ROLES } = require("../config/aiExamples");
  return ROLES[user?.role] || ROLES.user;
}

module.exports = {
  login,
  completeLogin,
  verifyCredentials,
  createUser,
  deleteUser,
  upsertEngineerUser,
  logout,
  validateToken,
  sanitizeUser,
  isSuperAdmin,
  isAdmin,
  canApprove,
  canDelete,
  canGovern,
  getRolePermissions,
  getUsers: () => getUsers().map(sanitizeUser),
  findRawUser,
};
