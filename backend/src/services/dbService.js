const relationalStore = require("./relationalStore");
let useNeon = false;
let sql = null;

async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS documents (
      id            SERIAL PRIMARY KEY,
      title         TEXT NOT NULL,
      description   TEXT,
      content       TEXT,
      tags          TEXT[],
      category      TEXT DEFAULT 'other',
      department    TEXT DEFAULT 'other',
      source        TEXT DEFAULT 'manual',
      url           TEXT,
      file_type     TEXT,
      size          TEXT,
      folder_path   TEXT,
      file_path     TEXT,
      connection_id TEXT,
      ocr_text      TEXT,
      revision      INT DEFAULT 1,
      parent_doc_id TEXT,
      added_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_documents_connection ON documents(connection_id)`;
  await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'other'`;
  await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder_path TEXT`;
  await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_path TEXT`;
  await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS connection_id TEXT`;
  await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS ocr_text TEXT`;
  await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS revision INT DEFAULT 1`;
  await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS parent_doc_id TEXT`;
}

async function initDb() {
  relationalStore.initStore();

  if (!process.env.DATABASE_URL) {
    console.log("ℹ️  No DATABASE_URL — using JSON relational store");
    return;
  }

  try {
    const { neon } = require("@neondatabase/serverless");
    sql = neon(process.env.DATABASE_URL);
    await ensureSchema();
    useNeon = true;
    console.log("✅  Connected to NeonDB (PostgreSQL)");
  } catch (err) {
    console.warn("⚠️  NeonDB unavailable — using JSON store:", err.message);
    useNeon = false;
    sql = null;
  }
}

function mapRow(row) {
  return {
    id: String(row.id),
    title: row.title,
    description: row.description || "",
    content: row.content || "",
    ocrText: row.ocr_text || "",
    tags: row.tags || [],
    category: row.category || row.department || "other",
    department: row.department || row.category || "other",
    source: row.source || "manual",
    url: row.url || "",
    fileType: row.file_type || row.fileType || "other",
    size: row.size || "",
    folderPath: row.folder_path || row.folderPath || "",
    filePath: row.file_path || row.filePath || null,
    connectionId: row.connection_id || null,
    revision: row.revision || 1,
    parentDocId: row.parent_doc_id || row.parentDocId || null,
    addedAt: row.added_at || row.addedAt || new Date().toISOString(),
  };
}

async function getAllDocuments() {
  if (useNeon) {
    const rows = await sql`SELECT * FROM documents ORDER BY added_at DESC`;
    return rows.map(mapRow);
  }
  return relationalStore.getDocuments();
}

async function getDocumentById(id) {
  if (useNeon) {
    const rows = await sql`SELECT * FROM documents WHERE id = ${Number(id)}`;
    return rows[0] ? mapRow(rows[0]) : null;
  }
  return relationalStore.getDocumentById(id);
}

async function insertDocument(data) {
  if (useNeon) {
    const rows = await sql`
      INSERT INTO documents (
        title, description, content, tags, category, department, source, url,
        file_type, size, folder_path, file_path, connection_id, ocr_text, revision
      )
      VALUES (
        ${data.title}, ${data.description || ""}, ${data.content || ""},
        ${Array.isArray(data.tags) ? data.tags : []},
        ${data.category || data.department || "other"},
        ${data.department || data.category || "other"},
        ${data.source || "manual"}, ${data.url || ""},
        ${data.fileType || "other"}, ${data.size || ""},
        ${data.folderPath || ""}, ${data.filePath || null},
        ${data.connectionId ? String(data.connectionId) : null},
        ${data.ocrText || ""},
        ${data.revision || 1}
      ) RETURNING *
    `;
    return mapRow(rows[0]);
  }
  return relationalStore.addDocument(data);
}

async function persistDocument(data, options = {}) {
  if (useNeon) {
    return insertDocument(data);
  }
  return relationalStore.addDocument(data, options);
}

async function updateDocument(id, data) {
  if (useNeon) {
    const existing = await getDocumentById(id);
    if (!existing) return null;
    const u = { ...existing, ...data };
    const rows = await sql`
      UPDATE documents SET
        title=${u.title}, description=${u.description}, content=${u.content},
        tags=${u.tags}, category=${u.category}, department=${u.department},
        source=${u.source}, url=${u.url}, file_type=${u.fileType}, size=${u.size},
        folder_path=${u.folderPath}, file_path=${u.filePath}, revision=${u.revision}
      WHERE id=${Number(id)} RETURNING *
    `;
    return mapRow(rows[0]);
  }
  return relationalStore.updateDocument(id, data);
}

async function deleteDocument(id) {
  if (useNeon) {
    const rows = await sql`DELETE FROM documents WHERE id = ${Number(id)} RETURNING id`;
    return rows.length > 0;
  }
  return relationalStore.deleteDocument(id);
}

async function deleteByConnectionId(connectionId) {
  if (!useNeon || !connectionId) return 0;
  const rows = await sql`
    DELETE FROM documents WHERE connection_id = ${String(connectionId)} RETURNING id
  `;
  return rows.length;
}

async function deleteBySource(source) {
  if (!useNeon || !source) return 0;
  const rows = await sql`
    DELETE FROM documents
    WHERE source = ${source} AND (connection_id IS NULL OR connection_id = '')
    RETURNING id
  `;
  return rows.length;
}

async function upsertMany(docs) {
  const results = [];
  for (const doc of docs) {
    const all = await getAllDocuments();
    const existing = all.find((d) => d.url === doc.url || d.title === doc.title);
    if (existing) results.push(await updateDocument(existing.id, doc));
    else results.push(await insertDocument(doc));
  }
  return results;
}

function isUsingNeon() {
  return useNeon;
}

module.exports = {
  initDb,
  getAllDocuments,
  getDocumentById,
  insertDocument,
  persistDocument,
  updateDocument,
  deleteDocument,
  deleteByConnectionId,
  deleteBySource,
  upsertMany,
  isUsingNeon,
};
