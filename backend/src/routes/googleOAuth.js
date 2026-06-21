const express = require("express");
const googleOAuth = require("../services/googleOAuthService");

const router = express.Router();

router.get("/callback", async (req, res) => {
  const fail = (msg) => {
    res.status(400).send(`<!DOCTYPE html><html><body><script>
      if (window.opener) window.opener.postMessage({ type:"google-oauth-error", error:${JSON.stringify(msg)} }, "*");
      window.close();
    </script><p>${msg}</p></body></html>`);
  };

  try {
    if (req.query.error) return fail(String(req.query.error));
    if (!req.query.code) return fail("Missing authorization code");

    const { sessionId, email } = await googleOAuth.handleCallback(req.query.code);
    const sent = await googleOAuth.sendOtpForSession(sessionId);

    res.send(`<!DOCTYPE html><html><head><title>Google sign-in</title></head><body><script>
      if (window.opener) {
        window.opener.postMessage({
          type: "google-oauth-ok",
          sessionId: ${JSON.stringify(sessionId)},
          email: ${JSON.stringify(sent.sentTo || email)},
          message: ${JSON.stringify(sent.message)}
        }, "*");
      }
      window.close();
    </script><p>Signed in. Verification code sent to ${sent.sentTo || email}. Close this window.</p></body></html>`);
  } catch (err) {
    fail(err.message);
  }
});

module.exports = router;
