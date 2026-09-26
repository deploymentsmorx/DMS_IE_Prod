# Documents folder

Each document has its own subfolder named by ID (e.g. `1/`, `2/`).

Inside each folder, every saved version is stored as a plain text file:

```
documents/
  1/              ← Document ID 1 (Project Proposal)
    v1.txt        ← First version
    v2.txt        ← Second version
    v3.txt        ← Third version
```

Metadata (name, authors, timestamps, commit messages) is in `backend/data/documents.json`.

Do not rename files manually — use the DocShare app to save new copies.
