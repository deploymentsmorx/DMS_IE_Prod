const AI_SEARCH_EXAMPLES = [
  "Find contracts signed in 2025",
  "Show inspection reports for Site A",
  "Find vendor invoices above ₹1,00,000",
  "Show approved drawings for Project Alpha",
  "List HR policy documents",
  "Find pending approval invoices",
];

const CHAT_EXAMPLES = [
  "What documents belong to Project Alpha?",
  "Show all contracts expiring next month",
  "Find the latest approved drawing",
  "Which invoices are pending approval?",
  "Summarize this contract",
  "Give key points of this report",
  "What are the risks mentioned?",
];

const SUMMARY_PROMPTS = [
  "Summarize this document",
  "Give key points",
  "What are the risks mentioned?",
];

const APPROVAL_STATUSES = ["draft", "under_review", "approved", "rejected"];

const ROLES = {
  superadmin: { label: "Admin", canApprove: true, canDelete: true, canGovern: true, canUpload: true },
  admin: { label: "Manager", canApprove: true, canDelete: true, canGovern: true, canUpload: true },
  user: { label: "Viewer", canApprove: false, canDelete: false, canGovern: false, canUpload: true },
};

module.exports = {
  AI_SEARCH_EXAMPLES,
  CHAT_EXAMPLES,
  SUMMARY_PROMPTS,
  APPROVAL_STATUSES,
  ROLES,
};
