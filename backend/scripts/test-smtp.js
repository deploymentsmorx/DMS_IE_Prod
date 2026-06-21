require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const emailService = require("../src/services/emailService");
const nodemailer = require("nodemailer");

async function main() {
  console.log("\nSmorX.ai — SMTP test\n");

  if (!emailService.isEmailConfigured()) {
    console.log("❌ Gmail SMTP is NOT configured.\n");
    console.log("Run this once (takes 1 minute):\n");
    console.log("  cd backend");
    console.log("  npm run setup:gmail\n");
    process.exit(1);
  }

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    await transport.verify();
    console.log("✅ SMTP connection OK");
    console.log(`   Host: ${process.env.SMTP_HOST}`);
    console.log(`   User: ${process.env.SMTP_USER}\n`);
    console.log("Restart the server (npm start) and try Connect again.\n");
  } catch (err) {
    console.log("❌ SMTP connection failed:", err.message);
    console.log("\nCheck SMTP_USER and SMTP_PASS (Gmail needs an App Password, not your normal password).\n");
    process.exit(1);
  }
}

main();
