require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const db = require("./services/dbService");
const authService = require("./services/authService");
const { extractToken } = require("./middleware/auth");
const createEnterpriseRouter = require("../enterprise/routes");

const FRONTEND_DIR = path.join(__dirname, "../../frontend");
const ENTERPRISE_FRONTEND_DIR = path.join(__dirname, "../../frontend/enterprise");

const documentsRouter = require("./routes/documents");
const chatRouter = require("./routes/chat");
const syncRouter = require("./routes/sync");
const uploadRouter = require("./routes/upload");
const foldersRouter = require("./routes/folders");
const revisionsRouter = require("./routes/revisions");
const graphRouter = require("./routes/graph");
const defectsRouter = require("./routes/defects");
const compareRouter = require("./routes/compare");
const agenticRouter = require("./routes/agentic");
const rootCauseRouter = require("./routes/rootCause");
const viewer3dRouter = require("./routes/viewer3d");
const filesRouter = require("./routes/files");
const sourcesRouter = require("./routes/sources");
const googleOAuthRouter = require("./routes/googleOAuth");
const authRouter = require("./routes/auth");
const licenseRouter = require("./routes/license");
const documentVersionRouter = require("./modules/documentVersion/router");
const governanceRouter = require("./routes/governance");
const analyticsRouter = require("./routes/analytics");
const savedSearchesRouter = require("./routes/savedSearches");
const notificationsRouter = require("./routes/notifications");
const intelligenceRouter = require("./routes/intelligence");
const { requireAuth } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5173",
  "null",
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(null, true);
    },
  })
);
app.use(express.json({ limit: "10mb" }));

const liveClients = new Set();

function broadcastEnterprise(payload) {
  const data = JSON.stringify(payload);
  for (const client of liveClients) {
    if (client.readyState === 1) client.send(data);
  }
}

function enterpriseUser(req) {
  const user = authService.validateToken(extractToken(req));
  if (!user) return null;
  const role = user.role === "user" ? "viewer" : "admin";
  return {
    id: user.id || user.username,
    name: user.displayName || user.username,
    email: `${user.username}@smorx.ai`,
    role,
    department: "General",
    groups: role === "admin" ? ["admins", "all-staff"] : ["all-staff"],
  };
}

app.use("/enterprise-api", createEnterpriseRouter(broadcastEnterprise, { resolveUser: enterpriseUser }));
app.use("/enterprise", express.static(ENTERPRISE_FRONTEND_DIR));

app.use("/api/auth", authRouter);
app.use("/api", licenseRouter);

app.use("/api/sources/google", googleOAuthRouter);

app.use("/api", (req, res, next) => {
  if (req.path === "/health") return next();
  if (req.path === "/license/activate") return next();
  return requireAuth(req, res, next);
});

app.get("/api", (_req, res) => {
  res.json({
    name: "SmorX.ai DMS API",
    status: "running",
    modules: {
      searchEngine: "/api/documents",
      documentVersion: "/api/dms/version",
      analytics: "/api/analytics/dashboard",
      enterpriseSuite: "/enterprise/",
    },
    openai: !!process.env.OPENAI_API_KEY,
    app: "Open http://localhost:" + PORT + " for the full UI",
    endpoints: {
      health: "/api/health",
      search: "/api/documents?q=invoice",
      chat: "POST /api/chat",
      upload: "POST /api/upload",
      folders: "POST /api/folders/connect",
      sources: "GET /api/sources/types",
      connect: "POST /api/sources/connect",
      agentic: "POST /api/agentic/search",
      graph: "/api/graph",
      defects: "/api/defects/analytics",
      compare: "POST /api/compare",
      rootCause: "POST /api/root-cause/analyze",
      viewer3d: "/api/viewer3d/:docId",
      revisions: "/api/revisions/:docId",
    },
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    storage: db.isUsingNeon() ? "neondb" : "memory",
    openai: !!process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || "gpt-4o",
    version: "1.0.0",
  });
});

app.get("/api/stats", (req, res, next) => {
  req.url = "/stats";
  documentsRouter(req, res, next);
});

app.use("/api/documents", documentsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/sync", syncRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/folders", foldersRouter);
app.use("/api/revisions", revisionsRouter);
app.use("/api/graph", graphRouter);
app.use("/api/defects", defectsRouter);
app.use("/api/compare", compareRouter);
app.use("/api/agentic", agenticRouter);
app.use("/api/root-cause", rootCauseRouter);
app.use("/api/viewer3d", viewer3dRouter);
app.use("/api/files", filesRouter);
app.use("/api/sources", sourcesRouter);
app.use("/api/dms/version", documentVersionRouter);
app.use("/api/governance", governanceRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/saved-searches", savedSearchesRouter);
app.use("/api/intelligence", intelligenceRouter);
app.use("/api/notifications", notificationsRouter);

app.use(express.static(FRONTEND_DIR));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/enterprise")) return next();
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

async function start() {
  await db.initDb();
  const emailService = require("./services/emailService");
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws) => {
    liveClients.add(ws);
    ws.send(JSON.stringify({ type: "connected", message: "Connected — receiving live updates" }));
    ws.on("close", () => liveClients.delete(ws));
  });
  server.listen(PORT, () => {
    console.log(`✅  SmorX.ai DMS  → http://localhost:${PORT}`);
    console.log(`   Modules: Search · Version · Analytics · Governance · Enterprise Suite`);
    console.log(`   Login: superadmin / SuperAdmin@123`);
    console.log(`   API docs       → http://localhost:${PORT}/api`);
    console.log(`   Storage: ${db.isUsingNeon() ? "Neon PostgreSQL" : "JSON (local)"}`);
    console.log(`   GPT chat: ${process.env.OPENAI_API_KEY ? "enabled" : "fallback mode (set OPENAI_API_KEY)"}`);
    if (emailService.isEmailConfigured()) {
      console.log(`   OTP email: Gmail/SMTP ready (${process.env.SMTP_USER})`);
    } else {
      console.log(`   ⚠️  OTP email: NOT configured — run: npm run setup:gmail`);
    }
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

module.exports = app;
