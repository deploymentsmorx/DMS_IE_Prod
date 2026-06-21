const path = require("path");

const SUPPORTED_EXTENSIONS = new Set([
  ".docx", ".doc",
  ".pdf",
  ".txt",
  ".csv",
  ".xlsx", ".xls",
  ".pptx", ".ppt",
]);

const FORMAT_LABELS = {
  ".docx": "Word",
  ".doc": "Word",
  ".pdf": "PDF",
  ".txt": "Text",
  ".csv": "CSV",
  ".xlsx": "Excel",
  ".xls": "Excel",
  ".pptx": "PowerPoint",
  ".ppt": "PowerPoint",
};

function getFormatLabel(filename = "", mimeType = "") {
  const ext = path.extname(filename).toLowerCase();
  if (FORMAT_LABELS[ext]) return FORMAT_LABELS[ext];
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("wordprocessingml")) return "Word";
  if (mimeType.includes("spreadsheetml")) return "Excel";
  if (mimeType.includes("presentationml")) return "PowerPoint";
  if (mimeType.includes("text/plain")) return "Text";
  if (mimeType.includes("text/csv")) return "CSV";
  return "Document";
}

function isSupportedUpload(filename = "", mimeType = "") {
  const ext = path.extname(filename).toLowerCase();
  if (SUPPORTED_EXTENSIONS.has(ext)) return true;
  return /pdf|word|spreadsheet|presentation|text\/plain|text\/csv/.test(mimeType || "");
}

function looksBinary(buffer) {
  const sample = buffer.slice(0, Math.min(buffer.length, 800));
  if (sample.length >= 2 && sample[0] === 0x50 && sample[1] === 0x4b) return true;
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    if (c === 0 || (c < 32 && c !== 9 && c !== 10 && c !== 13)) nonPrintable++;
  }
  return nonPrintable > sample.length * 0.1;
}

function clip(text, max = 50000) {
  return String(text || "").trim().slice(0, max);
}

async function extractOfficeXmlText(buffer, xmlPathPattern) {
  const JSZip = require("jszip");
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.keys(zip.files)
    .filter((name) => xmlPathPattern.test(name))
    .sort();
  const chunks = [];
  for (const name of files) {
    const xml = await zip.file(name).async("string");
    const parts = [...xml.matchAll(/<(?:a:t|w:t)[^>]*>([^<]*)<\/(?:a:t|w:t)>/g)].map((m) => m[1]);
    if (parts.length) chunks.push(parts.join(" "));
  }
  return chunks.join("\n\n");
}

async function extractExcelText(buffer, filename) {
  try {
    const XLSX = require("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheets = workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      return csv ? `[${sheetName}]\n${csv}` : "";
    }).filter(Boolean);
    return clip(sheets.join("\n\n")) || `[No readable cells found in ${filename}]`;
  } catch {
    return `[Could not extract text from Excel file: ${filename}]`;
  }
}

async function extractTextFromBuffer(buffer, filename = "", mimeType = "") {
  const ext = path.extname(filename).toLowerCase();

  if (ext === ".txt" || mimeType === "text/plain") {
    return clip(buffer.toString("utf8"));
  }

  if (ext === ".csv" || mimeType === "text/csv") {
    return clip(buffer.toString("utf8"));
  }

  if (ext === ".pdf" || mimeType === "application/pdf") {
    try {
      const pdfParse = require("pdf-parse");
      const data = await pdfParse(buffer);
      return clip(data.text) || `[No text found in PDF: ${filename}]`;
    } catch {
      return `[Could not extract text from PDF: ${filename}]`;
    }
  }

  if (ext === ".docx" || mimeType.includes("wordprocessingml")) {
    try {
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return clip(result.value) || `[No readable text found in ${filename}]`;
    } catch {
      return `[Could not extract text from Word document: ${filename}]`;
    }
  }

  if (ext === ".doc") {
    return `[Legacy .doc preview is limited. Save as .docx and upload again: ${filename}]`;
  }

  if (ext === ".xlsx" || ext === ".xls" || mimeType.includes("spreadsheetml") || mimeType.includes("ms-excel")) {
    return extractExcelText(buffer, filename);
  }

  if (ext === ".pptx" || mimeType.includes("presentationml")) {
    try {
      const text = await extractOfficeXmlText(buffer, /^ppt\/slides\/slide\d+\.xml$/);
      return clip(text) || `[No readable slides found in ${filename}]`;
    } catch {
      return `[Could not extract text from PowerPoint file: ${filename}]`;
    }
  }

  if (ext === ".ppt") {
    return `[Legacy .ppt preview is limited. Save as .pptx and upload again: ${filename}]`;
  }

  if (looksBinary(buffer)) {
    return `[Unsupported or binary file (${filename}). Supported: Word, PDF, Text, CSV, Excel, PowerPoint.]`;
  }

  return clip(buffer.toString("utf8"));
}

module.exports = {
  extractTextFromBuffer,
  looksBinary,
  isSupportedUpload,
  getFormatLabel,
  SUPPORTED_EXTENSIONS,
  FORMAT_LABELS,
};
