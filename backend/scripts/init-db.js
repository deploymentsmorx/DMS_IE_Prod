require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Set DATABASE_URL in backend/.env first");
    process.exit(1);
  }

  const db = require("../src/services/dbService");
  await db.initDb();

  if (!db.isUsingNeon()) {
    console.error("Could not connect to NeonDB — check DATABASE_URL");
    process.exit(1);
  }

  console.log("✅  Database schema ready on Neon PostgreSQL");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
