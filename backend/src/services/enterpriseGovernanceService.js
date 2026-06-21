const fs = require("fs");
const path = require("path");

const GOV_PATH = path.join(__dirname, "../data/enterprise-governance.json");

const EMPTY_STORE = {
  policies: [],
  retentionRules: [],
  legalHolds: [],
  workflows: [],
  nextId: 1,
};

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(GOV_PATH, "utf8"));
    return {
      ...EMPTY_STORE,
      ...data,
      policies: Array.isArray(data.policies) ? data.policies : [],
      retentionRules: Array.isArray(data.retentionRules) ? data.retentionRules : [],
      legalHolds: Array.isArray(data.legalHolds) ? data.legalHolds : [],
      workflows: Array.isArray(data.workflows) ? data.workflows : [],
      nextId: data.nextId || 1,
    };
  } catch {
    save(EMPTY_STORE);
    return { ...EMPTY_STORE };
  }
}

function save(data) {
  fs.writeFileSync(GOV_PATH, JSON.stringify(data, null, 2), "utf8");
}

function nextId(data, prefix) {
  data.nextId = (data.nextId || 10) + 1;
  return `${prefix}-${data.nextId}`;
}

function getAll() {
  return load();
}

function getPolicies() {
  return load().policies;
}

function addPolicy(payload) {
  const data = load();
  const policy = {
    id: nextId(data, "pol"),
    name: payload.name,
    framework: payload.framework || "Internal",
    description: payload.description || "",
    rules: payload.rules || [],
    enabled: payload.enabled !== false,
    createdAt: new Date().toISOString(),
  };
  data.policies.push(policy);
  save(data);
  return policy;
}

function updatePolicy(id, updates) {
  const data = load();
  const idx = data.policies.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  data.policies[idx] = { ...data.policies[idx], ...updates, id };
  save(data);
  return data.policies[idx];
}

function deletePolicy(id) {
  const data = load();
  const before = data.policies.length;
  data.policies = data.policies.filter((p) => p.id !== id);
  save(data);
  return data.policies.length < before;
}

function getRetentionRules() {
  return load().retentionRules;
}

function addRetentionRule(payload) {
  const data = load();
  const rule = {
    id: nextId(data, "ret"),
    name: payload.name,
    category: payload.category || "other",
    years: Number(payload.years) || 7,
    action: payload.action || "archive",
    legalHold: Boolean(payload.legalHold),
    enabled: payload.enabled !== false,
  };
  data.retentionRules.push(rule);
  save(data);
  return rule;
}

function scanRetention(documents) {
  const data = load();
  const now = Date.now();
  const results = [];

  for (const doc of documents) {
    const cat = doc.category || doc.department || "other";
    const rule = data.retentionRules.find((r) => r.enabled && r.category === cat);
    if (!rule) continue;

    const added = new Date(doc.addedAt || doc.lastTime || now).getTime();
    const ageYears = (now - added) / (365.25 * 24 * 3600 * 1000);
    const remaining = rule.years - ageYears;
    const onHold = data.legalHolds.some((h) => h.documentId === doc.id || h.category === cat);

    results.push({
      documentId: doc.id,
      title: doc.title || doc.name,
      category: cat,
      rule: rule.name,
      ageYears: Math.round(ageYears * 10) / 10,
      yearsAllowed: rule.years,
      daysRemaining: Math.round(remaining * 365.25),
      status: onHold ? "legal_hold" : remaining <= 0 ? "expired" : remaining * 365.25 <= 30 ? "expiring_soon" : "compliant",
      recommendedAction: onHold ? "hold" : rule.action,
    });
  }

  return { scanned: documents.length, results, rules: data.retentionRules.filter((r) => r.enabled) };
}

function getWorkflows() {
  return load().workflows;
}

function addWorkflow(payload) {
  const data = load();
  const wf = {
    id: nextId(data, "wf"),
    name: payload.name,
    trigger: payload.trigger || "document_uploaded",
    condition: payload.condition || {},
    action: payload.action || "notify",
    actionParams: payload.actionParams || {},
    enabled: payload.enabled !== false,
    runs: 0,
  };
  data.workflows.push(wf);
  save(data);
  return wf;
}

function toggleWorkflow(id, enabled) {
  const data = load();
  const wf = data.workflows.find((w) => w.id === id);
  if (!wf) return null;
  wf.enabled = enabled;
  save(data);
  return wf;
}

function runWorkflows(trigger, context, helpers = {}) {
  const data = load();
  const executed = [];

  for (const wf of data.workflows.filter((w) => w.enabled && w.trigger === trigger)) {
    if (!matchesCondition(wf.condition, context)) continue;

    const result = { workflowId: wf.id, name: wf.name, action: wf.action, success: true };
    try {
      if (wf.action === "notify" && helpers.notify) {
        helpers.notify({
          type: "workflow",
          title: wf.name,
          message: `Workflow triggered: ${context.summary || trigger}`,
          meta: context,
        });
      }
      if (wf.action === "submit_approval" && helpers.submitApproval) {
        helpers.submitApproval(context.documentId);
      }
      if (wf.action === "add_tag" && helpers.addTag) {
        helpers.addTag(context.documentId, wf.actionParams?.tag || "automated");
      }
      wf.runs = (wf.runs || 0) + 1;
      executed.push(result);
    } catch (err) {
      executed.push({ ...result, success: false, error: err.message });
    }
  }

  save(data);
  return executed;
}

function matchesCondition(condition, context) {
  if (!condition || !Object.keys(condition).length) return true;
  for (const [key, val] of Object.entries(condition)) {
    if (key === "daysUntilExpiry") {
      if ((context.daysRemaining ?? 999) > val) return false;
    } else if (String(context[key] || "") !== String(val)) {
      return false;
    }
  }
  return true;
}

function addLegalHold(payload) {
  const data = load();
  const hold = {
    id: nextId(data, "hold"),
    documentId: payload.documentId || null,
    category: payload.category || null,
    reason: payload.reason || "Legal hold",
    createdAt: new Date().toISOString(),
  };
  data.legalHolds.push(hold);
  save(data);
  return hold;
}

module.exports = {
  getAll,
  getPolicies,
  addPolicy,
  updatePolicy,
  deletePolicy,
  getRetentionRules,
  addRetentionRule,
  scanRetention,
  getWorkflows,
  addWorkflow,
  toggleWorkflow,
  runWorkflows,
  addLegalHold,
};
