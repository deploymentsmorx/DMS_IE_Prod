# SmorX.ai DMS — Stakeholder Feature Matrix (One Page)

**Product:** SmorX.ai Document Management System  
**Modules:** Search · Version · Analytics · Governance  
**Access:** http://localhost:3001 · Login: `superadmin` / `SuperAdmin@123`

| # | Feature area | Capability | Business value | Module / location | Status |
|---|--------------|------------|----------------|-------------------|--------|
| 1 | **Unified search** | Full-text search with match % across all connected sources | Find any document in seconds instead of browsing folders | Document Search Engine · top search bar | Live |
| 2 | **Multi-source connect** | Google Drive, OneDrive, Local, SMB, Dropbox, FTP, SAP, Teams | One portal for scattered enterprise files | Sidebar · Connect a source | Live |
| 3 | **AI search & chat** | Natural-language queries; document Q&A with references | Non-technical users ask questions in plain English | Search bar + right AI chat panel | Live |
| 4 | **Multilingual** | English, Hindi, Kannada, Tamil, Telugu, Punjabi, French, Spanish, Arabic | Global / regional teams search in preferred language | Search filters · Settings | Live |
| 5 | **Smart filters** | Department, file type, source, saved searches | Faster, repeatable discovery for finance, HR, engineering | Search filter chips | Live |
| 6 | **OCR / text index** | Indexes extracted text + OCR fields for search | Scanned PDFs and uploads become searchable | Backend index (on connect/upload) | Live |
| 7 | **Version control** | Upload, edit, save versions, rollback, diff view | Controlled document changes with full history | Document Version module | Live |
| 8 | **Check-out / check-in** | Edit locks prevent concurrent changes | Avoid conflicting edits on policies and contracts | Document Version · toolbar | Live |
| 9 | **Approval workflow** | Draft → submit → approve/reject with role gates | Compliance-ready review before publication | Document Version · Admin/Manager roles | Live |
| 10 | **E-signatures** | Sign and audit who signed which version | Lightweight sign-off trail without external tool | Document Version · E-Sign | Live |
| 11 | **AI summary & metadata** | Auto summary; extract type, project, vendor, date | Faster review; less manual tagging | Document Version · AI buttons | Live |
| 12 | **Export** | PDF, Word, Excel, Text from document content | Share approved outputs in standard formats | Document Version · Export menu | Live |
| 13 | **RBAC** | Super Admin, Manager, Viewer permissions | Least-privilege access (view vs approve vs delete) | Whole app · role badge | Live |
| 14 | **Audit trail** | Logs save, checkout, approve, sign, delete actions | Regulatory and internal audit readiness | Document Version · side panel | Live |
| 15 | **Analytics dashboard** | Counts, charts, source health, recent documents | Leadership visibility into adoption and volume | Feature Analytics module | Live |
| 16 | **Enterprise governance** | Policies, retention rules, workflow automation | Data lifecycle and compliance program support | Enterprise Governance module | Live |
| 17 | **Duplicate detection** | Find similar / duplicate indexed documents | Reduce storage waste and version confusion | Governance · Duplicates tab | Live |
| 18 | **Notifications** | Alerts for approvals and system events | Managers act on pending items quickly | Top bar · bell icon | Live |
| 19 | **AI insights** | Pending approvals, drafts, approved counts at a glance | Operational dashboard for document workflow | Search sidebar · AI Insights | Live |
| 20 | **Themes & settings** | Light/dark theme, chat history, search defaults | Enterprise UX and personalization | Settings (top bar) | Live |

---

## Role summary

| Role | Username (demo) | Approve | Delete | Upload | Govern |
|------|-----------------|---------|--------|--------|--------|
| Admin | `superadmin` | Yes | Yes | Yes | Yes |
| Manager | `admin` | Yes | Yes | Yes | Yes |
| Viewer | `user` | No | No | Yes | No |

---

## Typical stakeholder scenarios

| Scenario | Modules used | Outcome |
|----------|--------------|---------|
| Operations finds inspection reports | Search + Local source | Report opened in under 30 seconds |
| Legal approves a contract | Version + Approve + Export PDF | Approved, signed, exported artifact |
| Compliance defines retention | Governance + Retention scan | Documents flagged per policy |
| IT monitors adoption | Analytics + source sync status | Connected sources and doc counts visible |
| Multilingual HR team | Search + Language + Chat | Policies found and summarized in preferred language |

---

## Known limitations (set expectations)

- Search index and Document Version use **separate stores** (connect sources for search; upload in Version for lifecycle).
- Export uses **extracted text**, not original Word layout.
- OCR is **text extraction** from PDFs/files, not dedicated handwriting OCR.
- Governance and analytics show **real data only** after sources are connected and rules are created.
- Optional **OpenAI** key improves AI summaries/chat; fallbacks work without it.

---

**Full documentation:** [DMS_FEATURES.md](./DMS_FEATURES.md)  
**PDF:** Run `npm run docs:pdf` from the `backend` folder → `docs/STAKEHOLDER_FEATURE_MATRIX.pdf`

*SmorX.ai · Transforming Vision into Intelligent Systems*
