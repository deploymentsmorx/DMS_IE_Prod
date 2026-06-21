(function () {
  function showBootError(err) {
    console.error("bootMainApp failed:", err);
    var list = document.getElementById("docList");
    if (list) {
      list.innerHTML =
        '<div class="error-msg"><strong>App failed to start.</strong> ' +
        (err && err.message ? err.message : "Unknown error") +
        '<br><br>Use <code>http://localhost:3001</code> (run: cd backend &amp;&amp; npm start)<br>' +
        '<button class="btn btn-primary" style="margin-top:10px" onclick="location.reload()">Refresh page</button></div>';
    }
  }

  window.bootMainApp = function bootMainApp() {
    if (window.__appLaunched) return Promise.resolve();
    if (window.__bootPromise) return window.__bootPromise;

    window.__bootPromise = import("./start-app.js")
      .then(function (mod) {
        window.launchApp = mod.launchApp;
        mod.launchApp();
      })
      .catch(function (err) {
        window.__bootPromise = null;
        showBootError(err);
        throw err;
      });

    return window.__bootPromise;
  };

  function initUi() {
    document.getElementById("sidebarConnectBtn")?.addEventListener("click", function (e) {
      e.preventDefault();
      var boot = window.bootMainApp || window.launchApp;
      if (typeof boot !== "function") return;
      boot()
        .then(function () {
          if (window.openConnectModalForSidebar) {
            return window.openConnectModalForSidebar("local");
          }
          showBootError(new Error("Connect dialog failed to load. Refresh the page."));
        })
        .catch(showBootError);
    });

    if (localStorage.getItem("adse_auth_token")) {
      var overlay = document.getElementById("loginOverlay");
      if (overlay && !overlay.classList.contains("open")) {
        window.bootMainApp();
      }
    }

    if (window.__needsLaunch && localStorage.getItem("adse_auth_token")) {
      window.__needsLaunch = false;
      window.bootMainApp();
    }

    setTimeout(function () {
      if (window.__appLaunched) return;
      if (!localStorage.getItem("adse_auth_token")) return;
      var list = document.getElementById("docList");
      if (list && list.innerHTML.indexOf("Loading documents") !== -1) {
        window.bootMainApp().catch(function () {});
      }
    }, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUi);
  } else {
    initUi();
  }
})();
