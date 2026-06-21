# DocSearch Backend

Production Express API for document search, GPT chat, and multi-source sync.

## Start

```bash
npm install
cp .env.example .env   # add OPENAI_API_KEY
npm start              # http://localhost:3001
npm run dev            # nodemon
```

## Search Engine

The search service scores documents across:

- Title (exact + partial)
- Tags
- Category (engineering, finance, hr, logistics)
- Description
- OCR / full-text `content` field
- File type and source

Results include `matchPercent` (0–100%) and `matchedTerms`.

## GPT Chat

`POST /api/chat`

```json
{
  "message": "Find inspection reports for bridge sites",
  "history": [{ "role": "user", "content": "..." }]
}
```

Response includes `reply` and `references[]` with match percentages and URLs.

Requires `OPENAI_API_KEY` in `.env`. Falls back to rule-based answers if unset.

## NeonDB

```bash
# .env
DATABASE_URL=postgres://user:pass@ep-xxx.neon.tech/neondb?sslmode=require

npm run db:init
npm start
```

Schema auto-creates on startup. Seed data loads on first run.

## Google Drive Sync

1. Create a Google Cloud project, enable Drive API
2. Create a service account, download JSON key
3. Share your Drive folder with the service account email

```env
GOOGLE_SERVICE_ACCOUNT_PATH=./service-account.json
GOOGLE_DRIVE_FOLDER_ID=your_folder_id
```

`POST /api/sync` to pull files.

## OneDrive Sync

Register an app in Azure AD with `Files.Read.All`. Add to `.env`:

```env
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_TENANT_ID=
```

Extend `src/services/sync/oneDrive.js` for your tenant setup.

## Add Documents via API

```json
POST /api/documents
{
  "title": "Vendor Invoice INV-2025-099",
  "description": "Steel fabrication invoice",
  "content": "OCR extracted text for full-text search…",
  "url": "https://drive.google.com/file/d/…/view",
  "source": "google_drive",
  "fileType": "pdf",
  "category": "finance",
  "tags": ["invoice", "vendor", "2025"]
}
```
