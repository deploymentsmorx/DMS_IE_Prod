const store = require("./relationalStore");

function tokenSet(text) {
  return new Set((text || "").toLowerCase().split(/\W+/).filter((w) => w.length > 2));
}

function jaccard(a, b) {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (!setA.size && !setB.size) return 0;
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter++;
  const union = setA.size + setB.size - inter;
  return union ? Math.round((inter / union) * 100) : 0;
}

function compareDrawings(docIdA, docIdB) {
  const a = store.getDocumentById(docIdA);
  const b = store.getDocumentById(docIdB);
  if (!a || !b) throw new Error("One or both documents not found");

  const textSim = jaccard(`${a.title} ${a.content} ${a.description}`, `${b.title} ${b.content} ${b.description}`);
  const metaDiff = [];

  if (a.fileType !== b.fileType) metaDiff.push({ field: "fileType", a: a.fileType, b: b.fileType });
  if (a.department !== b.department) metaDiff.push({ field: "department", a: a.department, b: b.department });
  if (a.revision !== b.revision) metaDiff.push({ field: "revision", a: a.revision, b: b.revision });
  if (a.size !== b.size) metaDiff.push({ field: "size", a: a.size, b: b.size });

  const isDrawing = (d) => ["dwg", "dxf", "pdf"].includes(d.fileType);
  const drawingTypes = isDrawing(a) && isDrawing(b);

  return {
    docA: { id: a.id, title: a.title, fileType: a.fileType, revision: a.revision },
    docB: { id: b.id, title: b.title, fileType: b.fileType, revision: b.revision },
    similarityPercent: textSim,
    metadataDifferences: metaDiff,
    isDrawingComparison: drawingTypes,
    analysis: drawingTypes
      ? `Drawing comparison: ${textSim}% content similarity. ${metaDiff.length} metadata field(s) differ.`
      : `Document comparison: ${textSim}% text similarity across ${metaDiff.length} differing metadata fields.`,
    recommendation:
      textSim >= 80
        ? "Documents are highly similar — likely same drawing revision or duplicate."
        : textSim >= 40
          ? "Moderate similarity — review metadata differences for revision changes."
          : "Low similarity — different drawings or unrelated documents.",
  };
}

module.exports = { compareDrawings };
