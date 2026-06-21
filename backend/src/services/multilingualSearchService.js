/**
 * Multi-language search — expands queries with cross-language synonyms
 * and detects script/language for search.
 */
const { normalizeLang } = require("../config/supportedLanguages");

const TERM_SYNONYMS = {
  invoice: [
    "rechnung", "facture", "factura", "चालान", "chalan", "bil", "ಬಿಲ್", "bill",
    "பில்", "బిల్లు", "ਬਿੱਲ", "فاتورة", "fatura",
  ],
  finance: [
    "finanz", "finances", "financiero", "वित्त", "vitt", "ಹಣ", "நிதி", "ఆర్థిక",
    "ਵਿੱਤ", "مالية", "financier",
  ],
  report: [
    "bericht", "rapport", "informe", "रिपोर्ट", "report", "ವರದಿ", "varadi",
    "அறிக்கை", "arikkai", "నివేదిక", "nivedika", "ਰਿਪੋਰਟ", "تقرير", "taqrir",
  ],
  policy: [
    "richtlinie", "politique", "política", "नीति", "niti", "ನೀತಿ", "neeti",
    "கொள்கை", "kolkai", "విధానం", "vidhanam", "ਨੀਤੀ", "سياسة", "siyasah",
  ],
  contract: [
    "vertrag", "contrat", "contrato", "अनुबंध", "anubandh", "ಒಪ್ಪಂದ", "oppanda",
    "ஒப்பந்தம்", "oppandam", "ఒప్పందం", "oppandam", "ਕਰਾਰ", "عقد", "aqd",
  ],
  employee: [
    "mitarbeiter", "employé", "empleado", "कर्मचारी", "karmachari", "ಉದ್ಯೋಗಿ", "udyogi",
    "ஊழியர்", "ozhiyar", "ఉద్యోగి", "udyogi", "ਕਰਮਚਾਰੀ", "موظف", "muwazzaf",
  ],
  project: [
    "projekt", "projet", "proyecto", "परियोजना", "pariyojana", "ಯೋಜನೆ", "yojane",
    "திட்டம்", "thittam", "ప్రాజెక్టు", "project", "ਪ੍ਰੋਜੈਕਟ", "مشروع", "mashru",
  ],
  inspection: [
    "inspektion", "inspection", "inspección", "निरीक्षण", "nirikshan", "ಪರಿಶೀಲನೆ", "parisheelane",
    "ஆய்வு", "aayvu", "తనిఖీ", "tanikhi", "ਨਿਰੀਖਣ", "تفتيش", "taftish",
  ],
  drawing: [
    "zeichnung", "dessin", "dibujo", "चित्र", "chitra", "ಚಿತ್ರ", "chitra",
    "வரைபடம்", "varaipadam", "చిత్రం", "chitram", "ਚਿੱਤਰ", "رسم", "rasm", "cad",
  ],
  approval: [
    "genehmigung", "approbation", "aprobación", "अनुमोदन", "anumodan", "ಅನುಮೋದನೆ", "anumodane",
    "அனுமதி", "anumathi", "ఆమోదం", "amodam", "ਮਨਜ਼ੂਰੀ", "موافقة", "muwafaqah",
  ],
  document: [
    "dokument", "documento", "दस्तावेज़", "dastavez", "ದಾಖಲೆ", "dakhale",
    "ஆவணம்", "aavanam", "పత్రం", "patram", "ਦਸਤਾਵੇਜ਼", "dastavez", "مستند", "mustanad", "doc",
  ],
  search: [
    "suche", "recherche", "búsqueda", "busqueda", "खोज", "khoj", "ಹುಡುಕಾಟ", "hudukata",
    "தேடல்", "thedal", "శోధన", "shodhana", "ਖੋਜ", "بحث", "bahth",
  ],
  safety: [
    "sicherheit", "sécurité", "seguridad", "सुरक्षा", "suraksha", "ಸುರಕ್ಷತೆ", "surakshate",
    "பாதுகாப்பு", "paadhukaappu", "భద్రత", "bhadhrata", "ਸੁਰੱਖਿਆ", "سلامة", "salamah",
  ],
  meeting: [
    "besprechung", "réunion", "reunion", "reunión", "reunion", "बैठक", "baithak", "ಸಭೆ", "sabhe",
    "கூட்டம்", "kootam", "సమావేశం", "samavesam", "ਮੀਟਿੰਗ", "اجتماع", "ijtimaa",
  ],
  handbook: [
    "handbuch", "manuel", "manual", "पुस्तिका", "pustika", "ಪುಸ್ತಕ", "pustaka",
    "கையேடு", "kaiyedu", "పుస్తకం", "pustakam", "ਹੈਂਡਬੁੱਕ", "دليل", "daleel", "hr",
  ],
  school: [
    "schule", "école", "escuela", "स्कूल", "school", "ಶಾಲೆ", "shale", "பள்ளி", "palli",
    "పాఠశాల", "patashala", "ਸਕੂਲ", "مدرسة", "madrasa", "indus",
  ],
};

const LANG_PATTERNS = [
  { lang: "ar", re: /[\u0600-\u06FF]/ },
  { lang: "hi", re: /[\u0900-\u097F]/ },
  { lang: "pa", re: /[\u0A00-\u0A7F]/ },
  { lang: "ta", re: /[\u0B80-\u0BFF]/ },
  { lang: "te", re: /[\u0C00-\u0C7F]/ },
  { lang: "kn", re: /[\u0C80-\u0CFF]/ },
  { lang: "zh", re: /[\u4E00-\u9FFF]/ },
  { lang: "fr", re: /\b(les|des|une|pour|avec|document|rapport)\b/i },
  { lang: "es", re: /\b(los|las|para|con|documento|informe)\b/i },
  { lang: "de", re: /\b(und|der|die|das|nicht|für|dokument)\b/i },
];

function detectLanguage(text) {
  const sample = String(text || "").slice(0, 800);
  for (const { lang, re } of LANG_PATTERNS) {
    if (re.test(sample)) return lang;
  }
  return "en";
}

function normalizeToken(word) {
  return String(word || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}-]/gu, "");
}

function expandQueryTerms(query, preferredLang) {
  const raw = String(query || "").trim();
  const langPref = normalizeLang(preferredLang);
  if (!raw) {
    return { terms: [], detectedLang: langPref === "auto" ? "en" : langPref, expandedQuery: "" };
  }

  const detectedLang = langPref === "auto" ? detectLanguage(raw) : langPref;
  const baseWords = raw
    .split(/\s+/)
    .map(normalizeToken)
    .filter((w) => w.length > 0);

  const terms = new Set(baseWords);

  for (const word of baseWords) {
    terms.add(word);
    for (const [en, synonyms] of Object.entries(TERM_SYNONYMS)) {
      const normalizedSynonyms = synonyms.map(normalizeToken);
      if (word === en || normalizedSynonyms.includes(word)) {
        terms.add(en);
        normalizedSynonyms.forEach((s) => {
          if (s) terms.add(s);
        });
        synonyms.forEach((s) => terms.add(s.toLowerCase()));
      }
    }
  }

  return {
    terms: [...terms].filter(Boolean),
    detectedLang,
    expandedQuery: [...terms].join(" "),
  };
}

function textMatchesAnyTerm(text, terms) {
  const hay = String(text || "").toLowerCase();
  const normalizedHay = hay.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return terms.some((t) => {
    if (!t) return false;
    const token = String(t).toLowerCase();
    return hay.includes(token) || normalizedHay.includes(normalizeToken(token));
  });
}

module.exports = {
  detectLanguage,
  expandQueryTerms,
  textMatchesAnyTerm,
  TERM_SYNONYMS,
  normalizeLang,
};
