const path = require("path");
const store = require(path.join(__dirname, "../../enterprise/lib/store"));
const aux = require("./dmsAuxStore");
const { ROLES } = require("../config/aiExamples");

function buildInsights(searchDocs = [], user = {}) {
  const versionDocs = store.getDocuments();
  const notifications = aux.getNotifications("all", 100);

  const pendingApprovals = versionDocs
    .filter((d) => d.approvalStatus === "pending")
    .map((d) => ({ id: d.id, name: d.name, status: d.approvalStatus, type: "version" }));

  const draftDocs = versionDocs.filter((d) => (d.approvalStatus || "draft") === "draft");
  const approvedDocs = versionDocs.filter((d) => d.approvalStatus === "approved");

  const frequentDocs = [...searchDocs]
    .slice(0, 20)
    .map((d) => ({ id: d.id, title: d.title || d.name, source: d.source, fileType: d.fileType }));

  const expiringSoon = versionDocs
    .filter((d) => {
      const meta = d.metadata || {};
      if (!meta.expiryDate && !meta.date) return false;
      const expiry = new Date(meta.expiryDate || meta.date);
      if (Number.isNaN(expiry.getTime())) return false;
      const days = (expiry - Date.now()) / (86400000);
      return days >= 0 && days <= 30;
    })
    .map((d) => ({ id: d.id, name: d.name, expiryDate: d.metadata?.expiryDate || d.metadata?.date }));

  const missingMandatory = [];
  if (!searchDocs.length && !versionDocs.length) {
    missingMandatory.push("No documents indexed — connect a source or upload files");
  }

  return {
    role: user.role || "user",
    permissions: ROLES[user.role] || ROLES.user,
    pendingApprovals,
    expiringSoon,
    frequentlyAccessed: frequentDocs.slice(0, 5),
    draftCount: draftDocs.length,
    approvedCount: approvedDocs.length,
    unreadNotifications: notifications.filter((n) => !n.read).length,
    missingMandatory,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { buildInsights };
