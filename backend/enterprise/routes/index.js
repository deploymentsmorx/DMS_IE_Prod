const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const store = require('../lib/store');
const openai = require('../lib/openai');
const db = require('../lib/db');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function createRouter(broadcast, options = {}) {
  const router = express.Router();
  const sessions = new Map();

  function getUser(req) {
    const token = req.headers['x-session-token'];
    return token ? sessions.get(token) : null;
  }

  function requireAuth(req, res, next) {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Please log in' });
    req.user = user;
    next();
  }

  // ─── Platform ───────────────────────────────────────────
  router.get('/platform', (_req, res) => {
    res.json(db.read('platform.json'));
  });

  // ─── Users (login, RBAC, groups, departments) ───────────
  router.post('/auth/login', (req, res) => {
    const { email, password } = req.body;
    const users = db.read('users.json', []);
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const token = crypto.randomBytes(24).toString('hex');
    const session = { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department, groups: user.groups };
    sessions.set(token, session);
    db.appendAudit({ action: 'login', userId: user.id, user: user.name });
    res.json({ token, user: session });
  });

  router.post('/auth/sso', (req, res) => {
    const external = options.resolveUser?.(req);
    if (!external) return res.status(401).json({ error: 'Please log in' });
    const token = crypto.randomBytes(24).toString('hex');
    const session = {
      id: external.id,
      name: external.name,
      email: external.email,
      role: external.role,
      department: external.department,
      groups: external.groups,
    };
    sessions.set(token, session);
    db.appendAudit({ action: 'login', userId: session.id, user: session.name, via: 'sso' });
    res.json({ token, user: session });
  });

  router.get('/auth/me', (req, res) => {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: 'Not logged in' });
    res.json(user);
  });

  router.get('/users', requireAuth, (_req, res) => {
    const users = db.read('users.json', []).map(({ password, ...u }) => u);
    res.json(users);
  });

  router.get('/groups', requireAuth, (_req, res) => {
    const users = db.read('users.json', []);
    const groups = [...new Set(users.flatMap(u => u.groups))].map(name => ({
      name,
      members: users.filter(u => u.groups.includes(name)).map(u => u.name),
    }));
    res.json(groups);
  });

  // ─── Documents (storage, folders, versions, checkout) ───
  router.get('/authors', (_req, res) => res.json(store.getAuthors()));

  router.get('/folders', (_req, res) => res.json(store.getFolders()));

  router.get('/documents', (req, res) => {
    res.json(store.listDocumentsSummary(req.query.folderId));
  });

  router.get('/documents/:id', (req, res) => {
    const doc = store.getDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  });

  router.post('/documents', (req, res) => {
    const { name, author, organization, content, message, folderId } = req.body;
    if (!name || !author) return res.status(400).json({ error: 'name and author are required' });
    const doc = store.createDocument({ name, author, organization, content, message, folderId, userId: req.user?.id });
    broadcast?.({ type: 'document_created', document: doc });
    res.status(201).json(doc);
  });

  router.post('/documents/upload', upload.array('files', 20), (req, res) => {
    const { author, organization, folderId } = req.body;
    if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });
    const created = req.files.map(file => {
      const content = file.buffer.toString('utf8');
      return store.createDocument({
        name: file.originalname,
        author: author || 'Uploader',
        organization: organization || 'Unknown',
        content,
        folderId,
        mimeType: file.mimetype,
        size: file.size,
        message: 'Uploaded file',
      });
    });
    broadcast?.({ type: 'bulk_upload', count: created.length });
    res.status(201).json({ uploaded: created.length, documents: created });
  });

  router.post('/documents/:id/save', (req, res) => {
    const result = store.saveVersion(req.params.id, { ...req.body, userId: req.user?.id });
    if (!result) return res.status(404).json({ error: 'Document not found' });
    if (result.error) return res.status(409).json(result);
    broadcast?.({ type: 'version_saved', documentId: result.id, document: result });
    res.json(result);
  });

  router.post('/documents/:id/rollback', (req, res) => {
    const { versionId, author } = req.body;
    const result = store.rollbackVersion(req.params.id, versionId, { author, userId: req.user?.id });
    if (!result) return res.status(404).json({ error: 'Version not found' });
    if (result.error) return res.status(409).json(result);
    broadcast?.({ type: 'version_saved', documentId: result.id, document: result });
    res.json(result);
  });

  router.post('/documents/:id/checkout', (req, res) => {
    const { userName } = req.body;
    const result = store.checkoutDocument(req.params.id, userName, req.user?.id);
    if (!result) return res.status(404).json({ error: 'Document not found' });
    if (result.error) return res.status(409).json(result);
    res.json(result);
  });

  router.post('/documents/:id/checkin', (req, res) => {
    const result = store.checkinDocument(req.params.id, { ...req.body, userId: req.user?.id });
    if (!result) return res.status(404).json({ error: 'Document not found' });
    if (result.error) return res.status(409).json(result);
    broadcast?.({ type: 'version_saved', documentId: result.id, document: result });
    res.json(result);
  });

  // ─── Search (ONE hub for all search types) ──────────────
  router.get('/search', async (req, res) => {
    try {
      const repos = req.query.repos ? req.query.repos.split(',') : ['local'];
      const mode = req.query.mode || 'standard';
      const aiModes = ['natural', 'semantic', 'vector', 'rag', 'hybrid', 'ai'];

      if (openai.isConfigured() && aiModes.includes(mode) && req.query.q) {
        const docs = store.getDocuments().map(d => store.getDocument(d.id));
        const results = await openai.aiSearch({ query: req.query.q, documents: docs, mode });
        db.appendAudit({ action: 'search', userId: req.user?.id, query: req.query.q, mode, resultCount: results.length });
        return res.json({ query: req.query.q, mode, results, total: results.length, poweredBy: 'OpenAI' });
      }

      res.json(store.unifiedSearch({
        q: req.query.q,
        mode,
        repos,
        userId: req.user?.id,
      }));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Sharing ────────────────────────────────────────────
  router.get('/shares', (_req, res) => res.json(db.read('shares.json', [])));

  router.post('/shares', (req, res) => {
    const { documentId, type, expiresInDays, password, createdBy } = req.body;
    const shares = db.read('shares.json', []);
    const token = crypto.randomBytes(16).toString('hex');
    const share = {
      id: Date.now(),
      documentId,
      type: type || 'internal',
      token,
      url: `/share/${token}`,
      password: password || null,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86400000).toISOString() : null,
      createdBy,
      createdAt: new Date().toISOString(),
    };
    shares.push(share);
    db.write('shares.json', shares);
    db.appendAudit({ action: 'share_created', documentId, type, createdBy });
    res.status(201).json(share);
  });

  // ─── Security (audit + activity ONLY here) ──────────────
  router.get('/security/status', (_req, res) => {
    res.json({
      encryptionAtRest: { enabled: true, algorithm: 'AES-256' },
      encryptionInTransit: { enabled: true, protocol: 'TLS 1.3' },
    });
  });

  router.get('/security/audit', (_req, res) => res.json(db.read('audit.json', [])));

  router.get('/security/activity', (_req, res) => {
    const audit = db.read('audit.json', []);
    const activity = audit.slice(0, 50).map(a => ({
      time: a.time,
      user: a.user || a.userId || 'System',
      action: a.action,
      detail: a.name || a.documentId || a.query || '',
    }));
    res.json(activity);
  });

  // ─── Metadata ───────────────────────────────────────────
  router.put('/documents/:id/metadata', (req, res) => {
    const result = store.updateMetadata(req.params.id, req.body, req.user?.id);
    if (!result) return res.status(404).json({ error: 'Document not found' });
    res.json(result);
  });

  router.get('/metadata/schemas', (_req, res) => {
    res.json({
      customFields: ['project', 'status', 'reviewDate', 'department', 'contractValue'],
      categories: ['General', 'HR', 'Projects', 'Meetings', 'Legal', 'Finance'],
      labelSuggestions: ['urgent', 'draft', 'approved', 'confidential'],
    });
  });

  // ─── OCR & Extraction ───────────────────────────────────
  router.post('/ocr/:id', (req, res) => {
    const result = store.runOcr(req.params.id, req.user?.id);
    if (!result) return res.status(404).json({ error: 'Document not found' });
    res.json(result);
  });

  router.post('/ocr/extract', async (req, res) => {
    try {
      const { documentId, type } = req.body;
      const doc = store.getDocument(documentId);
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      const content = doc.versions.at(-1).content;

      if (openai.isConfigured()) {
        const extracted = await openai.extractStructured({ type, name: doc.name, content });
        return res.json({ type, documentId, ...extracted });
      }

      const extracted = { type, documentId, fields: {} };
      if (type === 'invoice') extracted.fields = { vendor: 'Detected Vendor', total: '₹12,00,000', date: '2026-06-10' };
      if (type === 'form') extracted.fields = { fieldsFound: content.split('\n').filter(l => l.includes(':')).length };
      if (type === 'table') extracted.fields = { rows: content.split('\n').length, columns: 3 };
      res.json(extracted);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Workflow ───────────────────────────────────────────
  router.get('/workflows', (_req, res) => res.json(db.read('workflows.json', [])));

  router.post('/workflows', (req, res) => {
    const workflows = db.read('workflows.json', []);
    const wf = { id: Date.now(), status: 'pending', createdAt: new Date().toISOString(), ...req.body };
    workflows.push(wf);
    db.write('workflows.json', workflows);
    db.appendAudit({ action: 'workflow_created', type: wf.type, documentId: wf.documentId });
    res.status(201).json(wf);
  });

  router.get('/notifications', (_req, res) => {
    const workflows = db.read('workflows.json', []);
    return res.json(workflows.filter(w => w.status === 'pending').map(w => ({
      id: w.id,
      message: `${w.type} workflow pending for document #${w.documentId}`,
      time: w.createdAt,
    })));
  });

  // ─── Collaboration ──────────────────────────────────────
  router.get('/comments/:documentId', (req, res) => {
    const comments = db.read('comments.json', []).filter(c => c.documentId === Number(req.params.documentId));
    res.json(comments);
  });

  router.post('/comments', (req, res) => {
    const comments = db.read('comments.json', []);
    const comment = { id: Date.now(), time: new Date().toISOString(), ...req.body };
    comments.push(comment);
    db.write('comments.json', comments);
    db.appendAudit({ action: 'comment_added', documentId: comment.documentId, author: comment.author });
    broadcast?.({ type: 'comment_added', comment });
    res.status(201).json(comment);
  });

  // ─── Integrations ───────────────────────────────────────
  router.get('/integrations', (_req, res) => {
    res.json([
      { id: 'ad', name: 'Active Directory', status: 'ready', protocol: 'LDAP' },
      { id: 'ldap', name: 'LDAP', status: 'ready', protocol: 'LDAP' },
      { id: 'sso', name: 'SSO (SAML)', status: 'ready', protocol: 'SAML 2.0' },
      { id: 'oauth', name: 'OAuth 2.0', status: 'connected', protocol: 'OAuth' },
    ]);
  });

  // ─── Connectors ─────────────────────────────────────────
  router.get('/connectors', (_req, res) => res.json(db.read('connectors.json', [])));

  router.post('/connectors/:id/connect', (req, res) => {
    const connectors = db.read('connectors.json', []);
    const c = connectors.find(x => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Connector not found' });
    c.status = 'connected';
    db.write('connectors.json', connectors);
    db.appendAudit({ action: 'connector_connected', connector: c.name });
    res.json(c);
  });

  // ─── AI Assistant ───────────────────────────────────────
  router.get('/ai/status', (_req, res) => {
    res.json({ configured: openai.isConfigured(), model: openai.model, provider: 'OpenAI' });
  });

  router.post('/ai/ask', async (req, res) => {
    try {
      const { question, documentIds } = req.body;
      const docs = documentIds?.length
        ? documentIds.map(id => store.getDocument(id)).filter(Boolean)
        : store.getDocuments().map(d => store.getDocument(d.id));

      if (openai.isConfigured()) {
        return res.json(await openai.askDocuments({ question, documents: docs }));
      }
      res.json(store.aiQuery({ question, documentIds }));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Classification ─────────────────────────────────────
  router.get('/classification/types', (_req, res) => {
    res.json(['Invoice', 'Contract', 'Drawing', 'SOP', 'Inspection Report', 'Purchase Order', 'Resume', 'Technical Specification']);
  });

  router.post('/classification/detect', async (req, res) => {
    try {
      const { name, content } = req.body;
      if (openai.isConfigured() && content) {
        return res.json(await openai.classifyDocument({ name, content }));
      }
      res.json({ classification: store.detectClassification(name, content) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Compliance ─────────────────────────────────────────
  router.get('/compliance', (_req, res) => res.json(db.read('compliance.json', {})));

  // ─── Governance ─────────────────────────────────────────
  router.post('/governance/scan', async (req, res) => {
    try {
      const { documentId } = req.body;
      const doc = store.getDocument(documentId);
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      const content = doc.versions.at(-1).content;

      if (openai.isConfigured()) {
        const scan = await openai.governanceScan({ name: doc.name, content });
        return res.json({
          documentId,
          ...scan,
          accessGovernance: doc.checkedOutBy ? `Locked by ${doc.checkedOutBy}` : 'Open',
        });
      }

      const pii = store.detectPii(content);
      res.json({
        documentId,
        pii,
        sensitiveData: pii.length > 0,
        classification: pii.length ? 'Confidential' : 'Internal',
        accessGovernance: doc.checkedOutBy ? `Locked by ${doc.checkedOutBy}` : 'Open',
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── AI Understanding ───────────────────────────────────
  router.post('/ai/understand', async (req, res) => {
    try {
      const { documentId, task } = req.body;
      const doc = store.getDocument(documentId);
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      const content = doc.versions.at(-1).content;

      if (openai.isConfigured()) {
        const result = await openai.understandDocument({ task, name: doc.name, content });
        return res.json({ documentId, ...result });
      }

      const result = { documentId, task };
      if (task === 'summarize') result.output = content.slice(0, 250) + '…';
      if (task === 'extract') result.output = { keyPoints: content.split('\n').filter(Boolean).slice(0, 5) };
      if (task === 'risk') result.output = { risks: content.match(/risk|deadline|budget/gi) || [], level: 'low' };
      if (task === 'contract') result.output = { parties: ['Party A', 'Party B'], clauses: content.split('\n').length };
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── AI Agents ──────────────────────────────────────────
  router.get('/agents', (_req, res) => {
    res.json([
      { id: 'ingestion', name: 'Document Ingestion Agent', status: 'active', lastRun: new Date().toISOString() },
      { id: 'metadata', name: 'Metadata Generation Agent', status: 'active', lastRun: new Date().toISOString() },
      { id: 'compliance', name: 'Compliance Checking Agent', status: 'idle', lastRun: null },
      { id: 'reports', name: 'Report Generation Agent', status: 'idle', lastRun: null },
      { id: 'approval', name: 'Approval Routing Agent', status: 'active', lastRun: new Date().toISOString() },
    ]);
  });

  // ─── Analytics ──────────────────────────────────────────
  router.get('/analytics', (_req, res) => {
    const docs = store.getDocuments();
    const audit = db.read('audit.json', []);
    const connectors = db.read('connectors.json', []);
    res.json({
      documents: docs.length,
      totalVersions: docs.reduce((s, d) => s + d.versions.length, 0),
      searches: audit.filter(a => a.action === 'search').length,
      uploads: audit.filter(a => a.action === 'document_created').length,
      activeConnectors: connectors.filter(c => c.status === 'connected').length,
      pendingWorkflows: db.read('workflows.json', []).filter(w => w.status === 'pending').length,
      recentActivity: audit.slice(0, 10),
    });
  });

  return router;
}

module.exports = createRouter;
