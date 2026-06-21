# DocSearch — Smart Document Search Engine

Full-stack document search system with an AI chat assistant.

```
docsearch/
├── frontend/
│   └── index.html        ← open in browser (works standalone)
└── backend/
    ├── server.js          ← Express REST API
    ├── package.json
    └── README.md          ← integration guide
```

## Start in 30 seconds

### Frontend only (demo mode)
Open `frontend/index.html` in any browser. Uses demo data — no server needed.

### With backend
```bash
cd backend
npm install
npm start        # → http://localhost:3001
```
Then open `frontend/index.html`.

## Features

| Feature | Details |
|---------|---------|
| 🔍 Full-text search | Scores by title, tags, description — top matches highlighted |
| 🤖 AI chat | Ask in plain English, get relevant doc cards with clickable links |
| 🔗 Open anywhere | Every card has a direct link to Google Drive / OneDrive |
| 📂 Source filters | Google Drive, OneDrive, NeonDB, Manual |
| 📄 Type filters | PDF, DOCX, XLSX, PPTX |
| ➕ Add docs | Paste any share URL with title, tags, type |
| 🔄 Sync ready | Hook to Drive/OneDrive APIs — see backend/README.md |

## How to add your real Google Drive documents

1. Open `backend/server.js`
2. Find the `documents` array
3. Replace `REPLACE_FILE_ID` in each `url` with the actual Google Drive file ID  
   (from the share link: `drive.google.com/file/d/THIS_PART/view`)
4. Or set up the live sync via the API — see `backend/README.md [GDRIVE]`

## How to use NeonDB instead of the array

See `backend/README.md [NEONDB]` — it's a drop-in swap with Postgres full-text search.
