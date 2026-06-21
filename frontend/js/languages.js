/** Supported search / UI language preferences */
export const SUPPORTED_LANGUAGES = [
  { code: "auto", label: "Auto-detect" },
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "kn", label: "Kannada" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "pa", label: "Punjabi" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "ar", label: "Arabic" },
];

export function languageOptionsHtml(selected = "auto") {
  return SUPPORTED_LANGUAGES.map(
    (lang) =>
      `<option value="${lang.code}"${lang.code === selected ? " selected" : ""}>${lang.label}</option>`
  ).join("");
}

export function initSearchLanguageSelect(selectEl, selected = "auto", onChange) {
  if (!selectEl) return;
  selectEl.innerHTML = languageOptionsHtml(selected);
  if (onChange) {
    selectEl.addEventListener("change", onChange);
  }
}

export function languageLabel(code) {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.label || code?.toUpperCase() || "Auto";
}
