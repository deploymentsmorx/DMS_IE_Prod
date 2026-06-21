const express = require("express");
const router = express.Router();
const gov = require("../services/enterpriseGovernanceService");
const db = require("../services/dbService");
const aux = require("../services/dmsAuxStore");
const { filterAccessibleDocuments } = require("../services/sourceAccessService");

function notify(payload) {
  aux.pushNotification({
    userId: "all",
    type: payload.type || "governance",
    title: payload.title,
    message: payload.message,
    meta: payload.meta || {},
  });
}

router.get("/", (_req, res) => {
  res.json(gov.getAll());
});

router.get("/policies", (_req, res) => {
  res.json(gov.getPolicies());
});

router.post("/policies", (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: "Policy name is required" });
  res.status(201).json(gov.addPolicy(req.body));
});

router.put("/policies/:id", (req, res) => {
  const updated = gov.updatePolicy(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: "Policy not found" });
  res.json(updated);
});

router.delete("/policies/:id", (req, res) => {
  if (!gov.deletePolicy(req.params.id)) return res.status(404).json({ error: "Policy not found" });
  res.json({ success: true });
});

router.get("/retention", (_req, res) => {
  res.json(gov.getRetentionRules());
});

router.post("/retention", (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: "Rule name is required" });
  res.status(201).json(gov.addRetentionRule(req.body));
});

router.post("/retention/scan", async (_req, res) => {
  try {
    const docs = filterAccessibleDocuments(await db.getAllDocuments());
    const scan = gov.scanRetention(docs);
    const executed = [];
    for (const row of scan.results || []) {
      if (row.status === "expiring_soon" || row.status === "expired") {
        executed.push(
          ...gov.runWorkflows(
            "retention_scan",
            { ...row, summary: `Retention alert: ${row.title}` },
            { notify }
          )
        );
      }
    }
    if (!executed.length) {
      executed.push(...gov.runWorkflows("retention_scan", { summary: "Retention scan completed", results: scan.results }, { notify }));
    }
    res.json({ ...scan, workflowsExecuted: executed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/legal-hold", (req, res) => {
  res.status(201).json(gov.addLegalHold(req.body));
});

router.get("/workflows", (_req, res) => {
  res.json(gov.getWorkflows());
});

router.post("/workflows", (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: "Workflow name is required" });
  res.status(201).json(gov.addWorkflow(req.body));
});

router.post("/workflows/:id/toggle", (req, res) => {
  const wf = gov.toggleWorkflow(req.params.id, req.body.enabled !== false);
  if (!wf) return res.status(404).json({ error: "Workflow not found" });
  res.json(wf);
});

router.post("/workflows/run", (req, res) => {
  const { trigger, context } = req.body;
  if (!trigger) return res.status(400).json({ error: "trigger is required" });
  const executed = gov.runWorkflows(trigger, context || {}, { notify });
  res.json({ executed });
});

module.exports = router;
