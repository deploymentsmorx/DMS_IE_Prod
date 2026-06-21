const store = require("./relationalStore");

function build3DModel(doc) {
  const isDrawing = ["dwg", "dxf"].includes(doc.fileType);
  const hash = doc.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);

  const layers = isDrawing
    ? [
        { name: "Structure", color: "#6366f1", visible: true },
        { name: "Piping", color: "#10b981", visible: true },
        { name: "Equipment", color: "#f59e0b", visible: true },
        { name: "Annotations", color: "#94a3b8", visible: false },
      ]
    : [{ name: "Document", color: "#6366f1", visible: true }];

  const primitives = isDrawing
    ? [
        { type: "box", position: [0, 0, 0], scale: [2, 0.3, 4], color: "#4f46e5", label: "Foundation" },
        { type: "cylinder", position: [0, 1.5, 0], scale: [0.5, 2, 0.5], color: "#10b981", label: "Column" },
        { type: "box", position: [1.2, 2.5, 0], scale: [1, 0.8, 1.5], color: "#f59e0b", label: "Equipment" },
        { type: "pipe", position: [-1, 1, 1], scale: [0.15, 2, 0.15], color: "#38bdf8", label: "Pipe run" },
      ]
    : [
        { type: "box", position: [0, 0, 0], scale: [1.5, 2, 0.1], color: "#6366f1", label: doc.title },
      ];

  return {
    documentId: doc.id,
    title: doc.title,
    fileType: doc.fileType,
    department: doc.department,
    revision: doc.revision,
    isDrawing,
    viewerType: isDrawing ? "drawing-3d-extrapolation" : "document-preview-3d",
    note: isDrawing
      ? "3D view extrapolated from drawing metadata. Connect a CAD converter for exact geometry."
      : "Simplified 3D preview for document reference.",
    layers,
    primitives,
    camera: { position: [5, 4, 5], target: [0, 1, 0] },
    seed: hash,
  };
}

function get3DViewerData(docId) {
  const doc = store.getDocumentById(docId);
  if (!doc) throw new Error("Document not found");
  return build3DModel(doc);
}

module.exports = { get3DViewerData, build3DModel };
