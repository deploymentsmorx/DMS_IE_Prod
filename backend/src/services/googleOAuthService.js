const crypto = require("crypto");
const { google } = require("googleapis");

const OTP_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 15 * 60 * 1000;

const oauthSessions = new Map();
const otpPending = new Map();

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

function isConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function getRedirectUri() {
  return (
    process.env.GOOGLE_REDIRECT_URI ||
    `http://localhost:${process.env.PORT || 3001}/api/sources/google/callback`
  );
}

function getOAuth2Client() {
  if (!isConfigured()) {
    throw new Error(
      "Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env"
    );
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  );
}

function getAuthUrl(state) {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: state || crypto.randomBytes(16).toString("hex"),
  });
}

async function handleCallback(code) {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data: profile } = await oauth2.userinfo.get();
  const email = profile.email;
  if (!email) throw new Error("Could not read your Google account email");

  const sessionId = crypto.randomBytes(24).toString("hex");
  oauthSessions.set(sessionId, {
    email,
    tokens,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });

  return { sessionId, email, name: profile.name || email };
}

async function sendOtpViaGmail(accessToken, toEmail, code) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth });

  const body = [
    `Your SmorX.ai verification code is: ${code}`,
    "",
    "This code expires in 5 minutes.",
  ].join("\n");

  const raw = Buffer.from(
    [
      `To: ${toEmail}`,
      `Subject: SmorX.ai verification code`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
    ].join("\r\n")
  ).toString("base64url");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
}

function otpKey(email) {
  return String(email || "").toLowerCase().trim();
}

async function sendOtpForSession(sessionId) {
  const session = oauthSessions.get(sessionId);
  if (!session || Date.now() > session.expiresAt) {
    oauthSessions.delete(sessionId);
    throw new Error("Google sign-in expired. Click Sign in with Google again.");
  }

  const code = String(crypto.randomInt(100000, 999999));
  await sendOtpViaGmail(session.tokens.access_token, session.email, code);

  otpPending.set(otpKey(session.email), {
    code,
    sessionId,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });

  return {
    success: true,
    sentTo: session.email,
    sessionId,
    message: `Verification code sent to ${session.email}. Check your Gmail inbox and spam.`,
  };
}

function verifyOtpForSession(sessionId, otp) {
  const session = oauthSessions.get(sessionId);
  if (!session || Date.now() > session.expiresAt) {
    oauthSessions.delete(sessionId);
    return null;
  }

  const entry = otpPending.get(otpKey(session.email));
  if (!entry || entry.sessionId !== sessionId || Date.now() > entry.expiresAt) {
    return null;
  }

  entry.attempts += 1;
  if (entry.attempts > 5 || String(otp).trim() !== entry.code) {
    if (entry.attempts > 5) otpPending.delete(otpKey(session.email));
    return null;
  }

  otpPending.delete(otpKey(session.email));
  return session;
}

function verifyOtp(email, otp) {
  const entry = otpPending.get(otpKey(email));
  if (!entry || Date.now() > entry.expiresAt) {
    otpPending.delete(otpKey(email));
    return null;
  }
  entry.attempts += 1;
  if (entry.attempts > 5 || String(otp).trim() !== entry.code) {
    if (entry.attempts > 5) otpPending.delete(otpKey(email));
    return null;
  }
  otpPending.delete(otpKey(email));
  return oauthSessions.get(entry.sessionId);
}

function takeSession(sessionId) {
  const session = oauthSessions.get(sessionId);
  if (!session) return null;
  oauthSessions.delete(sessionId);
  return session;
}

module.exports = {
  isConfigured,
  getAuthUrl,
  getRedirectUri,
  handleCallback,
  sendOtpForSession,
  verifyOtp,
  verifyOtpForSession,
  takeSession,
};
