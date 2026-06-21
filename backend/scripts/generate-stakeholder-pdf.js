/**
 * Generates docs/STAKEHOLDER_FEATURE_MATRIX.pdf for stakeholders.
 * Run: npm run docs:pdf (from backend folder)
 */
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const OUT = path.join(__dirname, "../../docs/STAKEHOLDER_FEATURE_MATRIX.pdf");

const MARGIN = 48;
const PAGE_W = 612;
const CONTENT_W = PAGE_W - MARGIN * 2;

function drawTable(doc, headers, rows, colWidths) {
  const rowH = 18;
  const headerH = 22;
  let y = doc.y;

  const drawRow = (cells, isHeader, height) => {
    if (y + height > doc.page.height - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
    let x = MARGIN;
    cells.forEach((cell, i) => {
      const w = colWidths[i];
      if (isHeader) {
        doc.rect(x, y, w, height).fill("#eef2ff");
        doc.fillColor("#1e1b4b").font("Helvetica-Bold").fontSize(7);
      } else {
        doc.rect(x, y, w, height).stroke("#e2e8f0");
        doc.fillColor("#334155").font("Helvetica").fontSize(6.5);
      }
      doc.text(String(cell ?? ""), x + 4, y + 5, { width: w - 8, height: height - 6 });
      x += w;
    });
    y += height;
    doc.y = y;
  };

  drawRow(headers, true, headerH);
  rows.forEach((row) => drawRow(row, false, rowH));
  doc.moveDown(0.5);
}

function sectionTitle(doc, text) {
  if (doc.y > doc.page.height - 120) doc.addPage();
  doc.moveDown(0.6).fillColor("#4338ca").font("Helvetica-Bold").fontSize(11).text(text);
  doc.moveDown(0.3).fillColor("#334155");
}

function bodyText(doc, text, opts = {}) {
  doc.font("Helvetica").fontSize(opts.size || 9).fillColor(opts.color || "#475569").text(text, {
    width: CONTENT_W,
    lineGap: 2,
  });
}

function generate() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  const doc = new PDFDocument({ size: "LETTER", margin: MARGIN, info: {
    Title: "SmorX.ai DMS — Stakeholder Feature Matrix",
    Author: "SmorX.ai",
    Subject: "Document Management System features",
  }});

  doc.pipe(fs.createWriteStream(OUT));

  doc.fillColor("#4338ca").font("Helvetica-Bold").fontSize(20).text("SmorX.ai DMS", { align: "center" });
  doc.fillColor("#64748b").font("Helvetica").fontSize(11).text("Stakeholder Feature Matrix · One Page Summary", { align: "center" });
  doc.moveDown(0.4);
  bodyText(doc, "Product: Document Management System  ·  Modules: Search · Version · Analytics · Governance · AI");
  bodyText(doc, "Access: http://localhost:3001  ·  Demo: superadmin / SuperAdmin@123", { size: 8 });

  sectionTitle(doc, "Feature matrix (20 capabilities)");

  const features = [
    ["1", "Unified search", "Full-text + match %", "Find docs in seconds", "Search Engine", "Live"],
    ["2", "Multi-source connect", "Drive, OneDrive, Local, SMB…", "One portal for all files", "Connect source", "Live"],
    ["3", "AI search & chat", "Natural language Q&A", "Plain-English discovery", "Search + Chat", "Live"],
    ["4", "Multilingual", "10 languages", "Regional team support", "Search · Settings", "Live"],
    ["5", "Smart filters", "Dept, type, source, saved", "Repeatable discovery", "Filter chips", "Live"],
    ["6", "OCR / text index", "Extracted + OCR fields", "Scanned PDFs searchable", "Backend index", "Live"],
    ["7", "Version control", "Upload, edit, rollback, diff", "Controlled changes", "Document Version", "Live"],
    ["8", "Check-out / in", "Edit locks", "No conflicting edits", "Version toolbar", "Live"],
    ["9", "Approval workflow", "Draft → approve/reject", "Compliance review", "Version · RBAC", "Live"],
    ["10", "E-signatures", "Sign + audit trail", "Sign-off without extra tool", "Version · E-Sign", "Live"],
    ["11", "AI summary & metadata", "Auto summary + fields", "Faster review", "Version · AI", "Live"],
    ["12", "Export", "PDF, Word, Excel, Text", "Standard share formats", "Export menu", "Live"],
    ["13", "RBAC", "Admin / Manager / Viewer", "Least privilege", "Whole app", "Live"],
    ["14", "Audit trail", "Action logging", "Regulatory readiness", "Version panel", "Live"],
    ["15", "Analytics", "Charts + source health", "Leadership visibility", "Feature Analytics", "Live"],
    ["16", "Governance", "Policies + retention", "Compliance program", "Enterprise Gov.", "Live"],
    ["17", "Duplicate detection", "Similar file scan", "Reduce waste", "Governance tab", "Live"],
    ["18", "Notifications", "Approval alerts", "Faster manager action", "Top bar bell", "Live"],
    ["19", "AI insights", "Pending approvals count", "Ops dashboard", "Search sidebar", "Live"],
    ["20", "Themes & settings", "Light/dark, chat, search", "Personalization", "Settings", "Live"],
  ];

  drawTable(
    doc,
    ["#", "Area", "Capability", "Business value", "Location", "Status"],
    features,
    [22, 72, 88, 95, 78, 38]
  );

  sectionTitle(doc, "Role summary");

  drawTable(
    doc,
    ["Role", "User", "Approve", "Delete", "Upload", "Govern"],
    [
      ["Admin", "superadmin", "Yes", "Yes", "Yes", "Yes"],
      ["Manager", "admin", "Yes", "Yes", "Yes", "Yes"],
      ["Viewer", "user", "No", "No", "Yes", "No"],
    ],
    [70, 80, 55, 55, 55, 55]
  );

  sectionTitle(doc, "Typical scenarios");

  drawTable(
    doc,
    ["Scenario", "Modules", "Outcome"],
    [
      ["Find inspection reports", "Search + Local", "Report in < 30 sec"],
      ["Approve contract", "Version + Export", "Signed PDF artifact"],
      ["Define retention", "Governance", "Docs flagged per policy"],
      ["Monitor adoption", "Analytics", "Source counts visible"],
      ["Multilingual HR", "Search + Chat", "Policies summarized"],
    ],
    [140, 130, 130]
  );

  sectionTitle(doc, "Known limitations");
  bodyText(doc, "• Search index and Document Version use separate stores.");
  bodyText(doc, "• Export uses extracted text, not original Word layout.");
  bodyText(doc, "• OCR is text extraction from files, not handwriting OCR.");
  bodyText(doc, "• Governance/analytics show real data only after connect + setup.");
  bodyText(doc, "• OpenAI key optional — fallbacks work without it.");

  doc.moveDown(1);
  doc.fillColor("#94a3b8").font("Helvetica").fontSize(8).text(
    "Full guide: docs/DMS_FEATURES.md  ·  SmorX.ai · Transforming Vision into Intelligent Systems",
    { align: "center", width: CONTENT_W }
  );

  doc.end();
  console.log("Wrote", OUT);
}

generate();
