const express = require("express");
const multer = require("multer");
const path = require("path");

const store = require(path.join(__dirname, "../../../enterprise/lib/store"));
const aux = require("../../services/dmsAuxStore");
const gov = require("../../services/enterpriseGovernanceService");
const { requireApprove } = require("../../middleware/auth");
const { extractMetadataHeuristic } = require("../../services/documentIntelligenceService");
const { extractTextFromBuffer, isSupportedUpload } = require("../../services/textExtractService");
const { exportDocument } = require("../../services/exportService");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = express.Router();

function mapUser(req) {
  const u = req.user || {};
  return {
    id: u.username || u.id || "user",
    name: u.displayName || u.name || u.username || "User",
    role: u.role || "user",
    department: u.department || "General",
  };
}

function notifyRevision(user, doc, action, detail) {
  aux.pushNotification({
    userId: "all",
    type: "revision",
    title: `Document ${action}`,
    message: `${doc.name} — ${detail}`,
    meta: { documentId: doc.id, action },
  });
}

function inferWorkflowCategory(doc, content = "") {
  const text = `${doc.name || ""} ${content || ""} ${(doc.tags || []).join(" ")}`.toLowerCase();
  const org = String(doc.organization || doc.lastOrganization || "").toLowerCase();
  if (org.includes("finance") || /invoice|budget|purchase|po-|rechnung|facture|financial/.test(text)) return "finance";
  if (org.includes("hr") || /employee|handbook|onboarding/.test(text)) return "hr";
  if (/engineer|drawing|inspection|cad/.test(text)) return "engineering";
  return "other";
}

function runUploadWorkflows(doc, content) {
  const category = inferWorkflowCategory(doc, content);
  gov.runWorkflows(
    "document_uploaded",
    {
      documentId: doc.id,
      category,
      name: doc.name,
      summary: `Document uploaded: ${doc.name}`,
    },
    {
      notify: (p) =>
        aux.pushNotification({
          userId: "all",
          type: "workflow",
          title: p.title,
          message: p.message,
          meta: p.meta,
        }),
      submitApproval: (docId) => {
        const result = store.submitForApproval(docId, {
          userId: "system",
          userName: "Workflow Bot",
          comment: "Auto-submitted by finance approval workflow",
        });
        if (result && !result.error) {
          notifyRevision({ name: "Workflow Bot" }, result, "submitted for approval", "Finance auto-approval workflow");
        }
      },
    }
  );
}

router.get("/platform", (_req, res) => {
  res.json({
    name: "Document Version",
    module: "dms-version",
    description: "Version history, approvals, e-signatures, audit trail, and bulk upload",
    supportedFormats: ["Word (.docx)", "PDF", "Text (.txt)", "CSV", "Excel (.xlsx, .xls)", "PowerPoint (.pptx)"],
    features: [
      "Instant search across connected documents",
      "AI-powered document summaries",
      "OCR-based content search (PDF/images)",
      "Smart approvals and workflows",
      "Version tracking and audit logs",
      "Export to PDF, Word, Excel",
      "Automatic versioning",
      "Check-in / Check-out",
      "Version comparison",
      "Rollback / Restore",
      "Approval workflow",
      "E-signature support",
      "Audit trail",
      "Revision notifications",
    ],
  });
});

router.get("/audit", (_req, res) => {
  res.json({ entries: store.getAuditLog(100) });
});

router.get("/audit/:docId", (req, res) => {
  res.json({ documentId: req.params.docId, entries: store.getAuditForDocument(req.params.docId) });
});

router.get("/folders", (_req, res) => {
  res.json(store.getFolders());
});

router.get("/documents", (req, res) => {
  res.json(store.listDocumentsSummary(req.query.folderId));
});

router.get("/documents/:id/metadata", (req, res) => {
  const doc = store.getDocument(req.params.id);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  res.json({
    id: doc.id,
    name: doc.name,
    metadata: doc.metadata || {},
    classification: doc.classification,
    tags: doc.tags || [],
    approvalStatus: doc.approvalStatus || "draft",
    versionCount: doc.versions.length,
  });
});

router.get("/permissions", (req, res) => {
  const authService = require("../../services/authService");
  res.json({ user: mapUser(req), permissions: authService.getRolePermissions(req.user) });
});

router.get("/documents/:id/export", async (req, res) => {
  try {
    const doc = store.getDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    const format = String(req.query.format || "pdf").toLowerCase();
    const file = await exportDocument(doc, format, req.query.versionId);
    res.setHeader("Content-Type", file.mime);
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.send(file.buffer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/documents/:id", (req, res) => {
  const doc = store.getDocument(req.params.id);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  res.json(doc);
});

router.post("/documents", (req, res) => {
  const { name, author, organization, content, message, folderId } = req.body;
  if (!name || !author) return res.status(400).json({ error: "name and author are required" });
  const user = mapUser(req);
  const doc = store.createDocument({
    name,
    author: author || user.name,
    organization: organization || user.department,
    content,
    message,
    folderId,
    userId: user.id,
  });
  notifyRevision(user, doc, "created", "New document uploaded");
  runUploadWorkflows(doc, content);
  res.status(201).json(doc);
});

router.delete("/documents/:id", (req, res) => {
  const user = mapUser(req);
  const result = store.deleteDocument(req.params.id, user.id);
  if (!result) return res.status(404).json({ error: "Document not found" });
  notifyRevision(user, result, "deleted", "Document removed");
  res.json(result);
});

router.post("/documents/upload", upload.array("files", 20), async (req, res) => {
  const user = mapUser(req);
  const { author, organization, folderId } = req.body;
  if (!req.files?.length) return res.status(400).json({ error: "No files uploaded" });
  try {
    const rejected = [];
    const created = [];
    for (const file of req.files) {
      if (!isSupportedUpload(file.originalname, file.mimetype)) {
        rejected.push(file.originalname);
        continue;
      }
      const content = await extractTextFromBuffer(file.buffer, file.originalname, file.mimetype);
      const metadata = extractMetadataHeuristic(file.originalname, content);
      const doc = store.createDocument({
        name: file.originalname,
        author: author || user.name,
        organization: organization || user.department,
        content,
        folderId,
        mimeType: file.mimetype,
        size: file.size,
        message: "Uploaded file",
        userId: user.id,
        metadata,
        ocrText: /\.(pdf|png|jpg|jpeg)$/i.test(file.originalname) ? content.slice(0, 50000) : "",
      });
      store.saveOriginalFile(doc.id, file.buffer, file.originalname);
      notifyRevision(user, doc, "uploaded", "Bulk upload");
      runUploadWorkflows(doc, content);
      created.push(doc);
    }
    if (!created.length) {
      return res.status(400).json({
        error: "No supported files uploaded",
        rejected,
        supported: ["Word (.docx)", "PDF", "Text (.txt)", "CSV", "Excel (.xlsx, .xls)", "PowerPoint (.pptx)"],
      });
    }
    res.status(201).json({ uploaded: created.length, documents: created, rejected });
  } catch (err) {
    res.status(500).json({ error: err.message || "Upload failed" });
  }
});

router.post("/documents/:id/save", (req, res) => {
  const user = mapUser(req);
  const result = store.saveVersion(req.params.id, { ...req.body, userId: user.id });
  if (!result) return res.status(404).json({ error: "Document not found" });
  if (result.error) return res.status(409).json(result);
  notifyRevision(user, result, "updated", req.body.message || "New version saved");
  res.json(result);
});

router.post("/documents/:id/rollback", (req, res) => {
  const user = mapUser(req);
  const { versionId, author } = req.body;
  const result = store.rollbackVersion(req.params.id, versionId, {
    author: author || user.name,
    userId: user.id,
  });
  if (!result) return res.status(404).json({ error: "Version not found" });
  if (result.error) return res.status(409).json(result);
  notifyRevision(user, result, "restored", `Restored from ${versionId}`);
  res.json(result);
});

router.post("/documents/:id/checkout", (req, res) => {
  const user = mapUser(req);
  const { userName } = req.body;
  const result = store.checkoutDocument(req.params.id, userName || user.name, user.id);
  if (!result) return res.status(404).json({ error: "Document not found" });
  if (result.error) return res.status(409).json(result);
  res.json(result);
});

router.post("/documents/:id/checkin", (req, res) => {
  const user = mapUser(req);
  const result = store.checkinDocument(req.params.id, { ...req.body, userId: user.id });
  if (!result) return res.status(404).json({ error: "Document not found" });
  if (result.error) return res.status(409).json(result);
  notifyRevision(user, result, "checked in", "Document checked in");
  res.json(result);
});

router.post("/documents/:id/submit-approval", (req, res) => {
  const user = mapUser(req);
  const result = store.submitForApproval(req.params.id, {
    userId: user.id,
    userName: user.name,
    comment: req.body.comment,
  });
  if (!result) return res.status(404).json({ error: "Document not found" });
  if (result.error) return res.status(409).json(result);
  notifyRevision(user, result, "submitted for approval", req.body.comment || "Awaiting reviewer");
  res.json(result);
});

router.post("/documents/:id/approve", requireApprove, (req, res) => {
  const user = mapUser(req);
  const result = store.resolveApproval(req.params.id, {
    decision: "approve",
    userId: user.id,
    userName: user.name,
    comment: req.body.comment,
  });
  if (!result) return res.status(404).json({ error: "Document not found" });
  if (result.error) return res.status(409).json(result);
  notifyRevision(user, result, "approved", req.body.comment || "Approved");
  res.json(result);
});

router.post("/documents/:id/reject", requireApprove, (req, res) => {
  const user = mapUser(req);
  const result = store.resolveApproval(req.params.id, {
    decision: "reject",
    userId: user.id,
    userName: user.name,
    comment: req.body.comment,
  });
  if (!result) return res.status(404).json({ error: "Document not found" });
  if (result.error) return res.status(409).json(result);
  notifyRevision(user, result, "rejected", req.body.comment || "Rejected");
  res.json(result);
});

router.post("/documents/:id/sign", (req, res) => {
  const user = mapUser(req);
  const result = store.signVersion(req.params.id, {
    versionId: req.body.versionId,
    signedBy: req.body.signedBy || user.name,
    signatureText: req.body.signatureText,
    userId: user.id,
  });
  if (!result) return res.status(404).json({ error: "Document not found" });
  notifyRevision(user, result, "signed", `E-signed by ${req.body.signedBy || user.name}`);
  res.json(result);
});

module.exports = router;
