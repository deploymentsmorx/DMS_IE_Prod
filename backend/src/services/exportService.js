const JSZip = require("jszip");
const XLSX = require("xlsx");

function safeName(name = "document") {
  return String(name).replace(/[<>:"/\\|?*]+/g, "-").replace(/\s+/g, "_").slice(0, 80) || "document";
}

function xmlEscape(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildDocxBuffer(title, content) {
  const paragraphs = String(content || "")
    .split(/\n/)
    .map((line) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`)
    .join("");

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${xmlEscape(title)}</w:t></w:r></w:p>
    ${paragraphs}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.folder("word")?.file("document.xml", documentXml);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function buildPdfBuffer(title, content) {
  const PDFDocument = require("pdfkit");
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(16).text(title || "Document", { underline: true });
    doc.moveDown();
    doc.fontSize(11).text(String(content || ""), { align: "left" });
    doc.end();
  });
}

function buildXlsxBuffer(doc, content) {
  const meta = doc.metadata || {};
  const contentSheet = XLSX.utils.aoa_to_sheet([
    ["Document", doc.name],
    ["Content"],
    ...String(content || "").split(/\n/).map((line) => [line]),
  ]);
  const metaSheet = XLSX.utils.json_to_sheet([
    {
      documentType: meta.documentType || doc.classification,
      projectName: meta.projectName || "",
      vendor: meta.vendor || "",
      date: meta.date || "",
      department: meta.department || doc.category,
      status: meta.status || doc.approvalStatus,
      version: doc.versions?.length || 1,
      fileType: doc.fileType,
    },
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, contentSheet, "Content");
  XLSX.utils.book_append_sheet(wb, metaSheet, "Metadata");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

async function exportDocument(doc, format = "txt", versionId) {
  const ver = doc.versions.find((v) => v.id === versionId) || doc.versions.at(-1);
  const content = ver?.content || "";
  const base = safeName(doc.name.replace(/\.[^.]+$/, ""));

  if (format === "txt") {
    return {
      buffer: Buffer.from(`${doc.name}\n\n${content}`, "utf8"),
      mime: "text/plain",
      filename: `${base}.txt`,
    };
  }
  if (format === "docx") {
    return {
      buffer: await buildDocxBuffer(doc.name, content),
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename: `${base}.docx`,
    };
  }
  if (format === "pdf") {
    return {
      buffer: await buildPdfBuffer(doc.name, content),
      mime: "application/pdf",
      filename: `${base}.pdf`,
    };
  }
  if (format === "xlsx" || format === "excel") {
    return {
      buffer: buildXlsxBuffer(doc, content),
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: `${base}.xlsx`,
    };
  }
  throw new Error("Unsupported export format. Use pdf, docx, xlsx, or txt.");
}

module.exports = { exportDocument, safeName };
