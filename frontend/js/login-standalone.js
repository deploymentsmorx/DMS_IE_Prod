(function () {
  var AUTH_KEY = "adse_auth_token";
  var loggingIn = false;

  function showErr(msg) {
    var el = document.getElementById("loginError");
    if (el) el.textContent = msg || "";
  }

  async function doLogin(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (loggingIn) return false;

    var userEl = document.getElementById("loginUsername");
    var passEl = document.getElementById("loginPassword");
    var user = userEl ? userEl.value.trim() : "";
    var pass = passEl ? passEl.value : "";

    if (!user || !pass) {
      showErr("Please enter username and password.");
      return false;
    }

    var btn = document.getElementById("loginBtn");
    loggingIn = true;
    showErr("");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Signing in…";
    }

    try {
      var res = await fetch(window.location.origin + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass }),
      });
      var data = {};
      try {
        data = await res.json();
      } catch (_) {}

      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      localStorage.setItem(AUTH_KEY, data.token);
      window.location.replace(window.location.pathname || "/");
      return false;
    } catch (err) {
      showErr(err.message || "Login failed. Use superadmin / SuperAdmin@123");
      loggingIn = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Sign In";
      }
      return false;
    }
  }

  window.doLogin = doLogin;

  function bindLogin() {
    var form = document.getElementById("loginForm");
    var btn = document.getElementById("loginBtn");
    var pass = document.getElementById("loginPassword");

    if (form) {
      form.addEventListener("submit", function (e) {
        doLogin(e);
        return false;
      });
    }
    if (btn) {
      btn.addEventListener("click", doLogin);
    }
    if (pass) {
      pass.addEventListener("keydown", function (e) {
        if (e.key === "Enter") doLogin(e);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindLogin);
  } else {
    bindLogin();
  }
})();
