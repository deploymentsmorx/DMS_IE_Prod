const store = require("./relationalStore");
const { searchDocuments } = require("./searchService");
const { filterAccessibleDocuments, filterAccessibleGraph } = require("./sourceAccessService");

let openai = null;

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openai) {
    const OpenAI = require("openai");
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

function getAccessibleDefects(user) {
  const visibleIds = new Set(
    filterAccessibleDocuments(store.getDocuments(), user).map((doc) => String(doc.id))
  );
  return store.getDefects().filter(
    (defect) => !defect.documentId || visibleIds.has(String(defect.documentId))
  );
}

function findRelatedChain(issue, user) {
  const q = issue.toLowerCase();
  const visibleDocs = filterAccessibleDocuments(store.getDocuments(), user);
  const docs = searchDocuments(visibleDocs, { q: issue, limit: 8 });
  const defects = getAccessibleDefects(user).filter(
    (d) =>
      d.title.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      (d.project || "").toLowerCase().includes(q)
  );

  const graph = filterAccessibleGraph(store.getGraph(), visibleDocs);
  const relatedNodes = graph.nodes.filter((n) => n.label.toLowerCase().includes(q));
  const nodeIds = new Set(relatedNodes.map((n) => n.id));
  for (const d of docs) nodeIds.add(`doc-${d.id}`);
  for (const def of defects) {
    if (def.documentId) nodeIds.add(`doc-${def.documentId}`);
  }

  const edges = graph.edges.filter((e) => nodeIds.has(e.fromId) || nodeIds.has(e.toId));

  const timeline = [
    ...defects.map((d) => ({
      type: "defect",
      date: d.detectedAt,
      label: d.title,
      severity: d.severity,
    })),
    ...docs.map((d) => ({
      type: "document",
      date: d.addedAt?.slice(0, 10),
      label: d.title,
      department: d.department,
    })),
  ].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  return { docs, defects, relatedNodes, edges, timeline };
}

async function analyzeRootCause(issue, defectId, user) {
  let targetIssue = issue;
  if (defectId) {
    const defect = getAccessibleDefects(user).find((d) => String(d.id) === String(defectId));
    if (!defect) throw new Error("Defect not found");
    if (defect) targetIssue = `${defect.title} — ${defect.description}`;
  }

  const chain = findRelatedChain(targetIssue, user);
  const client = getOpenAI();

  const evidence = {
    documents: chain.docs.slice(0, 5).map((d) => ({ title: d.title, department: d.department, match: d.matchPercent })),
    defects: chain.defects.map((d) => ({ title: d.title, severity: d.severity, status: d.status, location: d.location })),
    graphRelations: chain.edges.map((e) => `${e.fromId} --${e.relation}--> ${e.toId}`),
    timeline: chain.timeline,
  };

  let analysis = "";
  let rootCauses = [];
  let recommendations = [];

  if (client) {
    try {
      const res = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an engineering root cause analyst. Analyze defects and related documents.
Return JSON: { "summary": "...", "rootCauses": ["cause1","cause2"], "recommendations": ["rec1","rec2"], "confidence": 0-100 }`,
          },
          { role: "user", content: `Issue: ${targetIssue}\n\nEvidence:\n${JSON.stringify(evidence, null, 2)}` },
        ],
        max_tokens: 700,
        temperature: 0.2,
        response_format: { type: "json_object" },
      });
      const parsed = JSON.parse(res.choices[0]?.message?.content || "{}");
      analysis = parsed.summary || "";
      rootCauses = parsed.rootCauses || [];
      recommendations = parsed.recommendations || [];
    } catch {
      analysis = `Analysis based on ${chain.defects.length} defects and ${chain.docs.length} related documents.`;
      rootCauses = chain.defects.map((d) => d.description);
      recommendations = ["Review linked inspection reports", "Compare drawing revisions", "Schedule follow-up inspection"];
    }
  } else {
    analysis = `Found ${chain.defects.length} related defects and ${chain.docs.length} documents for: ${targetIssue}`;
    rootCauses = chain.defects.map((d) => `${d.title} (${d.severity})`);
    recommendations = ["Review inspection report", "Check drawing revision history", "Escalate high-severity defects"];
  }

  return {
    issue: targetIssue,
    analysis,
    rootCauses,
    recommendations,
    evidence,
    chain: {
      documentCount: chain.docs.length,
      defectCount: chain.defects.length,
      graphEdgeCount: chain.edges.length,
    },
  };
}

module.exports = { analyzeRootCause, findRelatedChain };
