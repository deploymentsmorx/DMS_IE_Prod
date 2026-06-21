const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ENV_PATH = path.join(__dirname, "../.env");

function upsertEnv(lines, key, value) {
  const re = new RegExp(`^${key}=`);
  let found = false;
  const out = lines.map((line) => {
    if (re.test(line)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) out.push(`${key}=${value}`);
  return out;
}

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("\nSmorX.ai — Gmail SMTP setup (for OTP emails)\n");
  console.log("1. Open https://myaccount.google.com/apppasswords");
  console.log("2. Create an App Password for Mail");
  console.log("3. Enter details below\n");

  const gmail = await ask("Gmail address (e.g. you@gmail.com): ");
  const appPass = await ask("Gmail App Password (16 characters): ");

  if (!gmail || !appPass) {
    console.log("\nCancelled — both email and app password are required.\n");
    process.exit(1);
  }

  let lines = [];
  if (fs.existsSync(ENV_PATH)) {
    lines = fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
  }

  lines = upsertEnv(lines, "SMTP_HOST", "smtp.gmail.com");
  lines = upsertEnv(lines, "SMTP_PORT", "587");
  lines = upsertEnv(lines, "SMTP_SECURE", "false");
  lines = upsertEnv(lines, "SMTP_USER", gmail);
  lines = upsertEnv(lines, "SMTP_PASS", appPass.replace(/\s/g, ""));
  lines = upsertEnv(lines, `SMTP_FROM`, `"SmorX.ai DMS <${gmail}>"`);

  // Remove dev console flag if present
  lines = lines.filter((l) => !/^OTP_DEV_CONSOLE=/.test(l));

  fs.writeFileSync(ENV_PATH, lines.filter((l, i, arr) => l !== "" || i < arr.length - 1).join("\n") + "\n");

  console.log("\n✅ Saved to backend/.env");
  console.log("   Run: npm run test:smtp");
  console.log("   Then: npm start\n");
}

main().catch(console.error);
