const express = require("express");
const router = express.Router();
const store = require("../services/relationalStore");
const { filterAccessibleDocuments, filterAccessibleGraph } = require("../services/sourceAccessService");

router.get("/", (req, res) => {
  const docs = filterAccessibleDocuments(store.getDocuments(), req.user);
  res.json(filterAccessibleGraph(store.getGraph(), docs));
});

router.post("/edges", (req, res) => {
  try {
    const { fromId, toId, relation, fromType, toType } = req.body;
    if (!fromId || !toId || !relation) {
      return res.status(400).json({ error: "fromId, toId, relation required" });
    }
    const edge = store.addGraphEdge({ fromId, toId, relation, fromType, toType });
    res.status(201).json(edge);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
