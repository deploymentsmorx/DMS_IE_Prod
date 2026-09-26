function resolveApiBase() {
  try {
    if (window.smorxDesktop?.getApiUrl) {
      const fromDesktop = String(window.smorxDesktop.getApiUrl() || "").trim();
      if (fromDesktop) return fromDesktop.replace(/\/$/, "");
    }
  } catch {
    /* browser / no bridge */
  }
  if (window.DOCSEARCH_API) return String(window.DOCSEARCH_API).replace(/\/$/, "");
  return `${window.location.origin}/api`;
}

export const CONFIG = {
  API_BASE: resolveApiBase(),
};
