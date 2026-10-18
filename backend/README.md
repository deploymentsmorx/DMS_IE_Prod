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

## Document privacy and storage

Document files, extracted search content, license records, connected sources, and folder rules are processed in memory only. The DMS does not connect to Neon or AWS S3, and uploaded document bytes are not written to disk. Local and network folders are read in place; browser and FTP/SFTP uploads are held in memory while the server is running. Only local user account credential records are persisted to disk. The in-memory index and source sessions clear when the server restarts; reconnect and sync sources afterward.

The index, folder connections, folder access rules, and license records are cleared when the server restarts, so reconnect and sync sources after a restart. Local user account credential records are the only application data written to the backend data directory.

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
