const SUPPORTED_LANGUAGES = [
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

const SUPPORTED_CODES = new Set(SUPPORTED_LANGUAGES.map((l) => l.code));

function normalizeLang(lang) {
  const code = String(lang || "auto").toLowerCase();
  return SUPPORTED_CODES.has(code) ? code : "auto";
}

module.exports = { SUPPORTED_LANGUAGES, SUPPORTED_CODES, normalizeLang };
