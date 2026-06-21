const authService = require("../services/authService");

function extractToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return req.headers["x-auth-token"] || null;
}

function requireAuth(req, res, next) {
  const user = authService.validateToken(extractToken(req));
  if (!user) {
    return res.status(401).json({ error: "Authentication required. Please sign in." });
  }
  req.user = user;
  next();
}

function requireSuperAdmin(req, res, next) {
  if (!authService.isSuperAdmin(req.user)) {
    return res.status(403).json({ error: "Super Admin access required" });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: "You do not have permission for this action" });
    }
    next();
  };
}

function requireApprove(req, res, next) {
  if (!authService.canApprove(req.user)) {
    return res.status(403).json({ error: "Manager or Admin role required to approve documents" });
  }
  next();
}

module.exports = { requireAuth, requireSuperAdmin, requireRole, requireApprove, extractToken };
