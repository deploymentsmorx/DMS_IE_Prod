# SmorX.ai DMS — Complete Feature Guide

Enterprise Document Management System: **Search · Version Control · Analytics · Governance · AI**

| Item | Detail |
|------|--------|
| **Run locally** | `cd backend && npm start` |
| **URL** | http://localhost:3001 |
| **Demo logins** | `superadmin` / `SuperAdmin@123` (Admin) · `admin` / `Admin@123` (Manager) · `user` / `User@123` (Viewer) |
| **Stakeholder summary** | [STAKEHOLDER_FEATURE_MATRIX.md](./STAKEHOLDER_FEATURE_MATRIX.md) |
| **PDF download** | `npm run docs:pdf` → `docs/STAKEHOLDER_FEATURE_MATRIX.pdf` |

---

## Table of contents

1. [Application structure](#1-application-structure)
2. [Authentication & roles](#2-authentication--roles)
3. [Document Search Engine](#3-document-search-engine)
4. [Document Version module](#4-document-version-module)
5. [Feature Analytics](#5-feature-analytics)
6. [Enterprise Governance](#6-enterprise-governance)
7. [Cross-cutting platform features](#7-cross-cutting-platform-features)
8. [How modules work together](#8-how-modules-work-together)
9. [API reference (summary)](#9-api-reference-summary)
10. [Limitations & configuration](#10-limitations--configuration)

---

## 1. Application structure

The left sidebar **DMS · Document Management** switches between four modules:

| Module | Sidebar button | Primary purpose |
|--------|----------------|-----------------|
| **Document Search Engine** | Default on login | Find documents from connected sources |
| **Document Version** | Document Version | Upload, edit, approve, export with version history |
| **Feature Analytics** | Feature Analytics | Dashboards and usage metrics |
| **Enterprise Governance** | Enterprise Governance | Policies, retention, workflows, duplicates |

**Search-only UI** (hidden in other modules): data-source sidebar, global search bar, AI chat panel.

**Key files:**

| Area | Path |
|------|------|
| Frontend shell | `frontend/index.html` |
| Module navigation | `frontend/js/modules/dms-nav.js` |
| Search UI | `frontend/js/app.js` |
| Version UI | `frontend/js/modules/document-version.js` |
| Analytics UI | `frontend/js/modules/dms-analytics.js` |
| Governance UI | `frontend/js/modules/enterprise-governance.js` |
| Backend server | `backend/src/server.js` |

---

## 2. Authentication & roles

### Sign-in

- **What:** Username/password gate before using the app.
- **How:** `POST /api/auth/login` returns a JWT-style token stored in the browser.
- **Where:** Login overlay on first load.
- **Use case:** Only authorized staff access company documents.

### Role-based access (RBAC)

| Role | Demo user | Label | Approve | Delete | Upload | Governance |
|------|-----------|-------|---------|--------|--------|------------|
| `superadmin` | superadmin | Admin | ✓ | ✓ | ✓ | ✓ |
| `admin` | admin | Manager | ✓ | ✓ | ✓ | ✓ |
| `user` | user | Viewer | ✗ | ✗ | ✓ | ✗ |

- **Where:** User badge (top bar); approve/delete buttons in Document Version; governance actions.
- **Use case:** Viewers search and upload; managers approve contracts and policies.

### Logout

- **Where:** Top bar → **Logout**
- **Use case:** Shared workstation security.

---

## 3. Document Search Engine

Default module after login. Title: **Advance Directory Search Engine**.

### 3.1 Data sources & sync

| Feature | What it is | How it works | Where | Use case |
|---------|------------|--------------|-------|----------|
| Connect a source | Link external stores | Wizard modal; backend indexes files (background sync for folders) | Sidebar **Connect a source** | Import Google Drive or local folder |
| Supported sources | Multi-platform connectors | Google Drive (OAuth), OneDrive, Local, SMB/NAS, Dropbox, FTP/SFTP, SAP, Teams | Sidebar **Data Sources** | Unified search across departments |
| Source filter | Limit to one connector | Filters by `source` field | Sidebar source buttons + counts | “Local inspection reports only” |
| Sync all | Refresh all indexes | Re-scans connected sources | Top bar **⟳ Sync** | After bulk upload to Drive |
| Disconnect | Remove source + docs | Batch delete from index | Source modal / API | Offboard vendor folder |
| Background sync | Non-blocking folder scan | Runs after local connect without timeout | Backend `sourceService` | Large directories (10k+ files) |

### 3.2 Search & discovery

| Feature | What it is | How it works | Where | Use case |
|---------|------------|--------------|-------|----------|
| Global AI search | Main search | Weighted full-text on title, tags, description, content, OCR, metadata; match % | Top search bar (`⌘K`) | “Find contracts signed in 2025” |
| Department filter | Category scope | finance, hr, project, admin, engineering | Filter chips | HR-only policy search |
| File type filter | Format scope | PDF, CAD/DWG, Excel | Type chips | Engineering drawings |
| Quick Find | Preset queries | One-click searches | Sidebar Quick Find | Inspection, CAD, Invoices, etc. |
| Match scoring | Relevance rank | Weighted token score → % badge + bar | Result cards; KPI strip | Pick best match |
| Multilingual search | 10 languages | Query expansion + detection | Language dropdown; badge | Hindi/English mixed corpus |
| Saved searches | Reuse queries | Save/load filter + query combo | **Save search** / **Saved ▾** | Weekly invoice search |
| Similar documents | Related docs | Content/metadata similarity API | Panel above results | Find related contracts |
| KPI strip | Workspace stats | Total docs, departments, top match % | Above result list | Index health at a glance |
| Empty states | No demo data | Prompts to connect source when empty | Main doc list | Honest UX |

**Supported search languages:** Auto-detect, English, Hindi, Kannada, Tamil, Telugu, Punjabi, French, Spanish, Arabic.

### 3.3 AI & chat (Search module only)

| Feature | What it is | How it works | Where | Use case |
|---------|------------|--------------|-------|----------|
| Document AI Assistant | Chat over docs | `POST /api/chat` with doc context + references | Right chat panel | “What belongs to Project Alpha?” |
| Time-based greeting | Welcome message | Good morning/afternoon/evening | New chat | Friendly onboarding |
| Example prompts | Suggested questions | From `/api/intelligence/capabilities` | Chips below chat | Guide new users |
| Chat history | Multiple sessions | localStorage; History dropdown | Chat toolbar | Continue prior research |
| AI autocomplete | Type-ahead suggestions | `/api/intelligence/suggest` | Search bar, chat, editor | Faster typing |
| AI Insights | Workflow snapshot | Pending approvals, drafts, notifications | Sidebar panel | Manager dashboard |

### 3.4 Manual document entry

| Feature | What it is | How it works | Where | Use case |
|---------|------------|--------------|-------|----------|
| Add document | Manual index row | Title, description, OCR text, URL, source | Top **+ Add** | Add Drive link + pasted OCR |
| Open document | Open original | Opens URL or resolves path | **Open** on card | Jump to source file |

---

## 4. Document Version module

Full document lifecycle. Uses a **separate store** from the search index (`backend/backend/lib/store.js`).

### Supported upload formats

Word (.docx), PDF, Text, CSV, Excel (.xlsx/.xls), PowerPoint (.pptx/.ppt)

### Core features

| Feature | What it is | How it works | Where | Use case |
|---------|------------|--------------|-------|----------|
| Bulk upload | Import with versioning | Drag-drop; text extraction on upload | Drop zone | Upload contract pack |
| Text extraction | Readable preview | mammoth, pdf-parse, xlsx, pptx | Preview panel | See contract text, not binary |
| Folder navigation | Organize docs | Folder bar filters list | Folder buttons | Legal vs Engineering |
| Version history | Immutable versions | Each save creates version with author/time | Change history + Restore | Roll back to approved text |
| Check out / in | Edit lock | Only checkout user edits | Toolbar buttons | Prevent dual editing |
| Inline edit | Edit extracted text | Edit → textarea → Save changes | Edit + Save | Fix typos pre-approval |
| Changes (diff) | Compare versions | Line add/delete diff | Changes tab | Review v1 vs v2 |
| Submit for approval | Review workflow | draft → pending | Submit button | Send policy to manager |
| Approve / Reject | Manager gate | Role-gated status change | Approve/Reject (Admin/Manager) | Legal sign-off |
| E-Sign | Signature record | Signer + time + version | E-Sign; E-Signatures panel | Audit trail |
| AI Summary | Auto summary | `/api/intelligence/summary` | AI Summary button | Executive summary |
| Extract metadata | Auto fields | type, project, vendor, date, dept | Extract metadata panel | Tag invoices |
| Export | Download formats | PDF, Word, Excel, Text (extracted content) | Export ▾ menu | Share approved PDF |
| Delete | Remove document | Role-gated delete | Delete buttons | Remove wrong upload |
| Audit trail | Action log | save, checkout, approve, sign, etc. | Side panel | Compliance audit |

### Typical workflow

```
Upload → Extract metadata → Edit → Check in → Submit for approval
→ Manager approves → E-Sign → Export PDF
```

---

## 5. Feature Analytics

| Feature | What it is | How it works | Where | Use case |
|---------|------------|--------------|-------|----------|
| Summary cards | Key counts | Indexed docs, sources, folders, revisions, saved searches | Top of module | Executive snapshot |
| Donut / bar charts | Distribution | By source, file type, category, department | Chart area | “80% PDF from Drive” |
| Connected sources | Sync health | Status, doc count, last sync | Table section | IT monitoring |
| Recent documents | Latest imports | Last 10 indexed files | Table section | What arrived today |
| Empty honest state | No fake data | Zeros until sources connected | When disconnected | Trustworthy metrics |

**Entry points:** Sidebar **Feature Analytics** · Search bar **Analytics** · Version header **Analytics**

---

## 6. Enterprise Governance

Starts **empty** — no seeded demo policies. Create rules after connecting sources.

| Tab | Feature | What it does | Use case |
|-----|---------|--------------|----------|
| **Policy Management** | Compliance catalog | Name, framework, rules, enable/disable | ISO/GDPR rule mapping |
| **Retention Management** | Keep/archive rules | Category, years, action; run scan | “Finance invoices 7 years” |
| **Workflow Automation** | Trigger → action | On upload, retention scan, connect; toggle | Auto-notify on HR upload |
| **Duplicate Detection** | Similar files | Scan indexed docs | Dedupe invoice PDFs |

**Legal hold:** API support via `POST /governance/legal-hold` for litigation freezes.

---

## 7. Cross-cutting platform features

| Feature | Where | Use case |
|---------|-------|----------|
| Notifications | Top bar 🔔 | Approval and sync alerts |
| Settings → General | Theme, accent, language | Light mode + Hindi search |
| Settings → Chat | History, welcome, dictation, max chats | Chat preferences |
| Settings → Search | Default dept, match threshold | Startup filters |
| Settings → Data | Export/clear chat history | Privacy / backup |
| Status badge | Top bar Online/Offline | Server health |
| Connect Source modal | Sidebar / top actions | OAuth, OTP, path entry |

---

## 8. How modules work together

```
[Sources: Drive, Local, OneDrive, …]
        ↓ index
[Document Search Engine] ←→ [AI Chat]
        ↓ metrics
[Feature Analytics]

[Document Version: Upload → Edit → Approve → Export]
        ↓ audit / approvals
[AI Insights] + [Notifications]

[Enterprise Governance: Policies → Retention → Workflows]
```

**Example scenarios:**

1. **Operations:** Connect local folder → Quick Find “inspection” → Open report.
2. **Legal:** Upload contract in Version → AI Summary → Approve → Export PDF.
3. **Compliance:** Create retention rule → Run scan → Archive candidates.
4. **Multilingual HR:** Set Hindi language → Search policies → Chat summarize.
5. **IT:** Analytics → verify source sync counts and errors.

---

## 9. API reference (summary)

| Endpoint prefix | Purpose |
|-----------------|---------|
| `/api/auth/*` | Login, logout, me, users |
| `/api/documents/*` | Search index CRUD, stats, similar, duplicates |
| `/api/sources/*` | Connect, sync, disconnect sources |
| `/api/intelligence/*` | Suggest, AI search, summary, metadata, insights |
| `/api/dms/version/*` | Version module: upload, save, approve, export, audit |
| `/api/governance/*` | Policies, retention, workflows, legal hold |
| `/api/analytics/dashboard` | Analytics dashboard data |
| `/api/chat` | Document AI chat |
| `/api/notifications/*` | Notification list and read state |
| `/api/saved-searches/*` | Saved search CRUD |

---

## 10. Limitations & configuration

| Topic | Detail |
|-------|--------|
| Two document stores | Search index (connected sources) ≠ Document Version uploads — not fully unified |
| Export | Extracted text only; not original Word formatting |
| OCR | PDF/text extraction; not dedicated handwriting OCR |
| OpenAI | Optional `OPENAI_API_KEY` in `backend/.env` — enhances AI; fallbacks without it |
| Google Drive | Requires `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env` |
| Database | In-memory JSON by default; NeonDB if configured |
| Scale | Designed for connected enterprise sources; not “millions” out of box on JSON store |

---

*SmorX.ai · Transforming Vision into Intelligent Systems · Document Search Engine · Version Control · AI*
