const { searchDocuments } = require("./searchService");
const store = require("./relationalStore");
const { filterAccessibleDocuments } = require("./sourceAccessService");

let openai = null;

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openai) {
    const OpenAI = require("openai");
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

const TOOLS = {
  search_documents(query, filters = {}) {
    const docs = filterAccessibleDocuments(store.getDocuments());
    return searchDocuments(docs, { q: query, ...filters, limit: 10 });
  },

  query_knowledge_graph(entity) {
    const graph = store.getGraph();
    const q = (entity || "").toLowerCase();
    const nodes = graph.nodes.filter((n) => n.label.toLowerCase().includes(q));
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = graph.edges.filter((e) => nodeIds.has(e.fromId) || nodeIds.has(e.toId));
    return { nodes: nodes.slice(0, 15), edges: edges.slice(0, 20) };
  },

  get_defects(filter = {}) {
    let defects = store.getDefects();
    if (filter.severity) defects = defects.filter((d) => d.severity === filter.severity);
    if (filter.status) defects = defects.filter((d) => d.status === filter.status);
    if (filter.project) {
      const p = filter.project.toLowerCase();
      defects = defects.filter((d) => (d.project || "").toLowerCase().includes(p));
    }
    return defects.slice(0, 10);
  },

  get_revisions(docId) {
    return store.getRevisions(docId);
  },

  list_departments() {
    const docs = store.getDocuments();
    const counts = {};
    for (const d of docs) {
      counts[d.department] = (counts[d.department] || 0) + 1;
    }
    return counts;
  },
};

async function agenticSearch(query) {
  const steps = [];
  const allDocs = store.getDocuments();

  steps.push({ step: 1, action: "search_documents", input: query });
  const searchResults = TOOLS.search_documents(query);
  steps.push({ step: 1, action: "search_documents", resultCount: searchResults.length });

  const dept = store.guessDepartment(query);
  if (dept !== "other") {
    steps.push({ step: 2, action: "list_departments", department: dept });
  }

  steps.push({ step: 3, action: "query_knowledge_graph", input: query });
  const graph = TOOLS.query_knowledge_graph(query);

  let defects = [];
  if (/defect|corrosion|leak|failure|damage|issue/i.test(query)) {
    steps.push({ step: 4, action: "get_defects", input: query });
    defects = TOOLS.get_defects({ project: query });
  }

  const client = getOpenAI();
  let synthesis = "";

  const context = {
    searchResults: searchResults.slice(0, 6).map((d) => ({
      title: d.title,
      department: d.department,
      matchPercent: d.matchPercent,
      url: d.url,
    })),
    graphNodes: graph.nodes.slice(0, 5).map((n) => n.label),
    defects: defects.map((d) => ({ title: d.title, severity: d.severity, project: d.project })),
    departments: TOOLS.list_departments(),
  };

  if (client) {
    try {
      const res = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an agentic document search assistant. Synthesize multi-step search results into a clear answer with next actions. Reference specific documents and defects found. Plain text only: use \"• \" bullets when listing; never use \"-\", \"*\", **, __, # headings, backticks, or markdown.",
          },
          {
            role: "user",
            content: `Query: ${query}\n\nAgent steps completed:\n${JSON.stringify(context, null, 2)}`,
          },
        ],
        max_tokens: 600,
        temperature: 0.2,
      });
      synthesis = String(res.choices[0]?.message?.content || "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/__([^_]+)__/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/_([^_]+)_/g, "$1")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/^[\t ]*[-*•]\s+/gm, "• ")
        .trim();
    } catch (err) {
      synthesis = `Agentic search found ${searchResults.length} documents, ${graph.nodes.length} graph nodes, ${defects.length} defects.`;
    }
  } else {
    synthesis = `Agentic search: ${searchResults.length} docs (${searchResults[0]?.title || "none"} top), ${graph.nodes.length} related entities, ${defects.length} defects.`;
  }

  return {
    query,
    steps,
    results: searchResults,
    graph,
    defects,
    departments: context.departments,
    synthesis,
    model: client ? process.env.OPENAI_MODEL || "gpt-4o" : "gpt-4o",
  };
}

module.exports = { agenticSearch, TOOLS };
