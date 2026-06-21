const crypto = require("crypto");

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function getSecret() {
  return process.env.AUTH_SECRET || "smorx-advance-search-dev-secret";
}

function hashPassword(password) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(String(password))
    .digest("hex");
}

function getUsers() {
  return [
    {
      id: "superadmin",
      username: process.env.SUPER_ADMIN_USERNAME || "superadmin",
      passwordHash: hashPassword(process.env.SUPER_ADMIN_PASSWORD || "SuperAdmin@123"),
      role: "superadmin",
      displayName: "Super Admin",
    },
    {
      id: "admin",
      username: process.env.ADMIN_USERNAME || "admin",
      passwordHash: hashPassword(process.env.ADMIN_PASSWORD || "Admin@123"),
      role: "admin",
      displayName: "Administrator",
    },
    {
      id: "user",
      username: process.env.USER_USERNAME || "user",
      passwordHash: hashPassword(process.env.USER_PASSWORD || "User@123"),
      role: "user",
      displayName: "Standard User",
    },
  ];
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.displayName,
  };
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

function login(username, password) {
  const user = getUsers().find((u) => u.username === username);
  if (!user || user.passwordHash !== hashPassword(password)) {
    return { ok: false, error: "Invalid username or password" };
  }

  return completeLogin(username);
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
};
