require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

async function main() {
  const url = process.env.DATABASE_URL || "";

  if (!url) {
    console.warn("ℹ️  DATABASE_URL not set — skipping db:init (schema runs on server start when URL is configured).");
    process.exit(0);
  }

  if (/username[:@]|password[:@]/i.test(url) && !url.includes("neondb_owner")) {
    console.warn("⚠️  DATABASE_URL looks like a placeholder (username/password). Update Render Environment with your real Neon connection string.");
    console.warn("   Skipping db:init so the build can finish — fix DATABASE_URL before going live.");
    process.exit(0);
  }

  const db = require("../src/services/dbService");
  await db.initDb();

  if (!db.isUsingNeon()) {
    console.warn("⚠️  Could not connect to NeonDB during db:init — check DATABASE_URL on Render.");
    console.warn("   Build will continue; schema is retried automatically when the server starts.");
    process.exit(0);
  }

  console.log("✅  Database schema ready on Neon PostgreSQL");
  process.exit(0);
}

main().catch((err) => {
  console.warn("⚠️  db:init error (non-fatal for Render build):", err.message);
  process.exit(0);
});
