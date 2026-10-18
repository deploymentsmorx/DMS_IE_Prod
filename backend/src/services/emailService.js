const nodemailer = require("nodemailer");

let transporter = null;

function isEmailConfigured() {
  const pass = String(process.env.SMTP_PASS || "").trim();
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !pass) return false;
  if (/REPLACE|your-app-password|your-gmail-app-password|changeme/i.test(pass)) return false;
  return true;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

async function getTransporter() {
  if (transporter) return transporter;

  if (!isEmailConfigured()) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

async function sendOtpEmail(to, code, sourceLabel) {
  const email = String(to || "").trim();
  if (!isValidEmail(email)) {
    throw new Error("Enter a valid email address");
  }

  const transport = await getTransporter();
  if (!transport) {
    throw new Error(
      "Gmail is not configured. Run: cd backend && node scripts/setup-gmail-smtp.js — then restart the server."
    );
  }

  const subject = "Your SmorX.ai verification code";
  const text = [
    "Your verification code is:",
    "",
    code,
    "",
    "This code expires in 5 minutes.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <h2 style="margin:0 0 12px">SmorX.ai verification code</h2>
      <p>Enter this code to continue:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0">${code}</p>
      <p style="color:#666;font-size:13px">Expires in 5 minutes.</p>
    </div>`;

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await transport.sendMail({ from, to: email, subject, text, html });

  return { sent: true, smtpConfigured: true, to: email };
}

module.exports = {
  isEmailConfigured,
  isValidEmail,
  sendOtpEmail,
};
