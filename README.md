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

## Deploy on Render

**Build command** (do **not** run `db:init` here — schema is created automatically when the server starts):

```bash
cd backend && npm install
```

**Start command:**

```bash
cd backend && npm start
```

### Required environment variables (Render → Environment)

| Variable | Example / notes |
|----------|-----------------|
| `DATABASE_URL` | Full Neon URL from [Neon console](https://console.neon.tech) → **Pooled connection**. Must **not** contain literal `username` or `password` placeholders. |
| `AUTH_SECRET` | Long random string (Render can generate) |
| `OPENAI_API_KEY` | Optional — AI chat/summaries |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional — Google Drive |
| `GOOGLE_REDIRECT_URI` | `https://YOUR-SERVICE.onrender.com/api/sources/google/callback` |

**Render dashboard — copy these exactly:**

| Field | Value |
|-------|--------|
| **Build Command** | `cd backend && npm install` |
| **Start Command** | `cd backend && npm start` |

Do **not** add `npm run db:init` to the build command. If you still have it, remove `&& npm run db:init` from Build Command in Render Settings and save.

If build logs show `password authentication failed for user 'username'`, your `DATABASE_URL` on Render is still a placeholder — paste the real Neon string and redeploy.

Optional: use [`render.yaml`](render.yaml) in this repo for one-click Blueprint deploy.

## Optional configuration

Copy `backend/.env.example` to `backend/.env` (if present) and set:

- `OPENAI_API_KEY` — enhanced AI summaries and chat
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google Drive OAuth

---

*SmorX.ai · Transforming Vision into Intelligent Systems*
