const SETTINGS_KEY = "docsearch_settings";

export function loadThemeSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function resolveTheme(appearance = "dark") {
  if (appearance === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return appearance === "light" ? "light" : "dark";
}

export function applyTheme(settings = {}) {
  const theme = resolveTheme(settings.appearance || "dark");
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.accent = settings.accentColor || "indigo";
  document.documentElement.style.colorScheme = theme;
  return theme;
}

let themeWatchBound = false;

export function watchSystemTheme(onSystemChange) {
  if (themeWatchBound) return;
  themeWatchBound = true;
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const settings = loadThemeSettings();
    if (settings.appearance === "system") {
      applyTheme(settings);
      onSystemChange?.();
    }
  });
}
