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

## Document storage

Document files, extracted search text, license records, connected sources, and folder rules are held in server memory only. The app does not use AWS S3 or Neon. Browser uploads and FTP/SFTP files are not written to disk; local and network folders are read in place. These in-memory records clear when the server restarts, so reconnect and sync sources after restarting. Local user account credential records are the only application records persisted to disk.

## Folder access

Newly connected folders start locked. Admins and Super Admins can use **Access** beside each folder in the sidebar to grant access by role or by individual account, or unlock the folder for everyone. Documents in a locked folder are removed from search, chat, suggestions, and file opening for accounts without access. Sync can continue while the folder is locked. Admins and Super Admins retain access.

Open **Administration → Team access** to add and remove team logins. A client Admin can create User, Engineer, Team Lead, and Manager accounts for their own customer. Only the Super Admin can provision licensed customers or create another Admin account.

After creating users, open **Access** on a connected folder. Grant access to one or more team roles or specific accounts. A role grant applies to every user with that role. Admins and Super Admins can manage accounts and folders and retain access to all folders.

| Role | Username | Password |
|------|----------|----------|
| Super Admin | `superadmin` | `SuperAdmin@123` |
| Admin | `admin` | `Admin@123` |
| User | `user` | `User@123` |
