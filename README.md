# SmorX.ai DMS — Document Management System

Enterprise document platform: **Search · Version Control · Analytics · Governance · AI**

## Quick start

```bash
cd backend
npm install
npm start
```

Open **http://localhost:3001**

| Role | Username | Password |
|------|----------|----------|
| Admin | `superadmin` | `SuperAdmin@123` |
| Manager | `admin` | `Admin@123` |
| Viewer | `user` | `User@123` |

## Documentation

| Document | Audience | Description |
|----------|----------|-------------|
| [**docs/DMS_FEATURES.md**](docs/DMS_FEATURES.md) | Developers & power users | Complete feature guide with workflows and API summary |
| [**docs/STAKEHOLDER_FEATURE_MATRIX.md**](docs/STAKEHOLDER_FEATURE_MATRIX.md) | Executives & stakeholders | One-page feature matrix with business value |
| [**docs/STAKEHOLDER_FEATURE_MATRIX.pdf**](docs/STAKEHOLDER_FEATURE_MATRIX.pdf) | Printable / email | PDF export of the stakeholder matrix |

### Generate PDF

From the `backend` folder:

```bash
npm run docs:pdf
```

Output: `docs/STAKEHOLDER_FEATURE_MATRIX.pdf`

You can also open `docs/STAKEHOLDER_FEATURE_MATRIX.md` in VS Code or GitHub and use **Print → Save as PDF**.

## Four DMS modules

1. **Document Search Engine** — unified search across Google Drive, OneDrive, local folders, and more
2. **Document Version** — upload, edit, approve, e-sign, export with full version history
3. **Feature Analytics** — dashboards, charts, source health
4. **Enterprise Governance** — policies, retention, workflows, duplicate detection

## Project layout

```
Docuemts_Search_engine/
├── frontend/          # Web UI (HTML, CSS, JS modules)
├── backend/           # Node.js API (Express)
├── docs/              # Feature documentation + PDF
└── README.md          # This file
```

## Optional configuration

Copy `backend/.env.example` to `backend/.env` (if present) and set:

- `OPENAI_API_KEY` — enhanced AI summaries and chat
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google Drive OAuth

---

*SmorX.ai · Transforming Vision into Intelligent Systems*
