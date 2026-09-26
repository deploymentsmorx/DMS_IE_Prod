# SmorX.ai DMS

Document Management System — **frontend** + **backend** only.

## Folders

```
Docuemts_Search_engine/
├── frontend/          # Web UI (search, chat, modules, enterprise suite UI)
│   └── enterprise/    # Enterprise Suite screens
├── backend/           # API server
│   ├── src/           # Search, auth, sources, chat
│   └── enterprise/    # Enterprise Suite API + document store
└── docs/              # Feature documentation
```

## Run

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
