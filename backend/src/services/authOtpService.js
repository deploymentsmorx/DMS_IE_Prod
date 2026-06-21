const crypto = require("crypto");
const authService = require("./authService");
const emailService = require("./emailService");

const OTP_TTL_MS = 5 * 60 * 1000;
const pending = new Map();

function key(email) {
  return String(email || "").toLowerCase().trim();
}

function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

function ensureEmailConfigured() {
  if (!emailService.isEmailConfigured()) {
    throw new Error(
      "Gmail is not configured. Run: cd backend && node scripts/setup-gmail-smtp.js — then restart the server."
    );
  }
}

async function sendLoginOtp({ username, password, email }) {
  const loginUser = String(username || "").trim();
  const otpEmail = String(email || "").trim();

  if (!loginUser) throw new Error("Username is required");
  if (!password) throw new Error("Password is required");
  if (!otpEmail) throw new Error("Enter your email address");
  if (!emailService.isValidEmail(otpEmail)) throw new Error("Enter a valid email address");

  const auth = authService.verifyCredentials(loginUser, password);
  if (!auth.ok) throw new Error(auth.error || "Invalid username or password");

  ensureEmailConfigured();

  const code = generateOtp();
  const delivery = await emailService.sendOtpEmail(otpEmail, code, "SmorX.ai sign-in");

  pending.set(key(otpEmail), {
    code,
    username: loginUser,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });

  return {
    requiresOtp: true,
    smtpConfigured: true,
    sentTo: delivery.to,
    message: `Verification code sent to ${delivery.to}. Check your inbox and spam folder.`,
    expiresIn: OTP_TTL_MS / 1000,
  };
}

function verifyLoginOtp({ username, email, otp }) {
  const loginUser = String(username || "").trim();
  const otpEmail = String(email || "").trim();
  if (!loginUser || !otpEmail || !otp?.trim()) {
    return { ok: false, error: "Enter the 6-digit code from your email" };
  }

  const entry = pending.get(key(otpEmail));
  if (!entry || Date.now() > entry.expiresAt) {
    pending.delete(key(otpEmail));
    return { ok: false, error: "Code expired. Click Back and request a new code." };
  }
  if (entry.username !== loginUser) {
    return { ok: false, error: "Invalid verification code" };
  }

  entry.attempts += 1;
  if (entry.attempts > 5) {
    pending.delete(key(otpEmail));
    return { ok: false, error: "Too many attempts. Request a new code." };
  }
  if (String(otp).trim() !== entry.code) {
    return { ok: false, error: "Invalid verification code" };
  }

  pending.delete(key(otpEmail));
  return authService.completeLogin(loginUser);
}

module.exports = { sendLoginOtp, verifyLoginOtp };
