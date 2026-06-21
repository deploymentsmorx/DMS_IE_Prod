window.bootMainApp = window.bootMainApp || async function bootMainApp() {
  if (window.__appLaunched) return;
  if (window.__bootPromise) return window.__bootPromise;
  window.__bootPromise = import("./start-app.js")
    .then((mod) => {
      window.launchApp = mod.launchApp;
      mod.launchApp();
    })
    .catch((err) => {
      window.__bootPromise = null;
      console.error(err);
      throw err;
    });
  return window.__bootPromise;
};

if (window.__needsLaunch && localStorage.getItem("adse_auth_token")) {
  window.__needsLaunch = false;
  window.bootMainApp();
}

import "./auth.js";
