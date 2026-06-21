const crypto = require("crypto");
const { getSourceType } = require("../config/sourceRegistry");
const emailService = require("./emailService");

const OTP_TTL_MS = 5 * 60 * 1000;
const pending = new Map();

function key(email, type) {
  return `${String(email || "").toLowerCase().trim()}::${type}`;
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

async function deliverOtp(email, type, username) {
  const otpEmail = String(email || "").trim();
  if (!otpEmail) throw new Error("Enter your email address");
  if (!emailService.isValidEmail(otpEmail)) throw new Error("Enter a valid email address");
  if (!type) throw new Error("Source type is required");

  ensureEmailConfigured();

  const code = generateOtp();
  const sourceLabel = getSourceType(type)?.label || type;
  const delivery = await emailService.sendOtpEmail(otpEmail, code, sourceLabel);

  pending.set(key(otpEmail, type), {
    code,
    username: username || "user",
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });

  return {
    success: true,
    emailSent: true,
    smtpConfigured: true,
    sentTo: delivery.to,
    message: `Verification code sent to ${delivery.to}. Check your inbox and spam folder.`,
    expiresIn: OTP_TTL_MS / 1000,
  };
}

/** Connect source — user already logged in; OTP only */
async function sendOtpForSession({ user, email, type }) {
  return deliverOtp(email, type, user?.username);
}

/** Legacy: username + password + email (login uses authOtpService instead) */
async function sendOtp({ username, password, email, type }) {
  const authService = require("./authService");
  const loginUser = String(username || "").trim();
  if (!loginUser) throw new Error("Username is required");
  if (!password) throw new Error("Password is required");

  const auth = authService.verifyCredentials(loginUser, password);
  if (!auth.ok) throw new Error(auth.error || "Invalid username or password");

  return deliverOtp(email, type, loginUser);
}

function verifyOtp(email, type, otp) {
  if (!email?.trim() || !otp?.trim()) return false;
  const entry = pending.get(key(email, type));
  if (!entry || Date.now() > entry.expiresAt) {
    pending.delete(key(email, type));
    return false;
  }
  entry.attempts += 1;
  if (entry.attempts > 5) {
    pending.delete(key(email, type));
    return false;
  }
  if (String(otp).trim() !== entry.code) return false;
  pending.delete(key(email, type));
  return true;
}

module.exports = { sendOtp, sendOtpForSession, verifyOtp };
