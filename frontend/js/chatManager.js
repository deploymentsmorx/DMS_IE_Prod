const STORAGE_KEY = "docsearch_chat_sessions";
const SETTINGS_KEY = "docsearch_settings";

const WELCOME_BODY = `Ask me anything about your documents.<br><br>
I can search files, metadata, projects, invoices, drawings, reports, and approvals.`;

function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Hello";
}

function getWelcomeHtml(date = new Date()) {
  const greeting = getTimeGreeting(date);
  return `${greeting}! ${WELCOME_BODY}`;
}

const defaultSettings = {
  saveChatHistory: true,
  showWelcomeOnNewChat: true,
  maxSavedChats: 50,
  appearance: "dark",
  accentColor: "indigo",
  language: "auto",
  enableDictation: false,
};

let sessions = [];
let activeId = null;
let undoStack = [];
let redoStack = [];

function loadSettings() {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { ...defaultSettings };
  }
}

function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function loadSessions() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    sessions = Array.isArray(data) ? data : [];
  } catch {
    sessions = [];
  }
  if (!sessions.length) {
    const first = createSessionObject("New Chat");
    sessions.push(first);
    activeId = first.id;
    saveSessions();
  } else if (!activeId || !sessions.find((s) => s.id === activeId)) {
    activeId = sessions[0].id;
  }
}

function saveSessions() {
  const settings = loadSettings();
  if (!settings.saveChatHistory) return;
  let toSave = [...sessions];
  if (toSave.length > settings.maxSavedChats) {
    toSave = toSave
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, settings.maxSavedChats);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

function createSessionObject(title = "New Chat") {
  const now = new Date().toISOString();
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    apiHistory: [],
  };
}

function getActiveSession() {
  return sessions.find((s) => s.id === activeId) || sessions[0];
}

function setActiveSession(id) {
  activeId = id;
  undoStack = [];
  redoStack = [];
}

function newChat() {
  const session = createSessionObject(`Chat ${sessions.length + 1}`);
  sessions.unshift(session);
  setActiveSession(session.id);
  saveSessions();
  return session;
}

function deleteChat(id) {
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  sessions.splice(idx, 1);
  if (!sessions.length) {
    const fresh = createSessionObject("New Chat");
    sessions.push(fresh);
    setActiveSession(fresh.id);
  } else if (activeId === id) {
    setActiveSession(sessions[0].id);
  }
  saveSessions();
  return true;
}

function deleteActiveChat() {
  return deleteChat(activeId);
}

function clearActiveChat() {
  const session = getActiveSession();
  if (!session) return;
  pushUndo({ type: "clear", snapshot: cloneSessionMessages(session) });
  session.messages = [];
  session.apiHistory = [];
  session.title = "New Chat";
  session.updatedAt = new Date().toISOString();
  saveSessions();
}

function cloneSessionMessages(session) {
  return {
    messages: JSON.parse(JSON.stringify(session.messages)),
    apiHistory: JSON.parse(JSON.stringify(session.apiHistory)),
  };
}

function pushUndo(action) {
  undoStack.push(action);
  redoStack = [];
  if (undoStack.length > 30) undoStack.shift();
}

function addMessage(role, content, html) {
  const session = getActiveSession();
  if (!session) return;

  const msg = { role, content, html: html || null, ts: Date.now() };
  session.messages.push(msg);
  if (role === "user" || role === "assistant") {
    session.apiHistory.push({ role: role === "assistant" ? "assistant" : "user", content });
  }
  if (role === "user" && (session.title.startsWith("Chat ") || session.title === "New Chat")) {
    session.title = content.slice(0, 40) + (content.length > 40 ? "…" : "");
  }
  session.updatedAt = new Date().toISOString();
  pushUndo({ type: "add", message: { ...msg } });
  saveSessions();
}

function undo() {
  const session = getActiveSession();
  if (!undoStack.length || !session) return false;

  const action = undoStack.pop();
  redoStack.push({ ...action, snapshot: cloneSessionMessages(session) });

  if (action.type === "add") {
    session.messages.pop();
    if (session.apiHistory.length) session.apiHistory.pop();
  } else if (action.type === "clear") {
    session.messages = action.snapshot.messages;
    session.apiHistory = action.snapshot.apiHistory;
  }

  session.updatedAt = new Date().toISOString();
  saveSessions();
  return true;
}

function redo() {
  const session = getActiveSession();
  if (!redoStack.length || !session) return false;

  const action = redoStack.pop();

  if (action.type === "add") {
    session.messages.push(action.message);
    if (action.message.role === "user" || action.message.role === "assistant") {
      session.apiHistory.push({
        role: action.message.role,
        content: action.message.content,
      });
    }
  } else if (action.type === "clear") {
    session.messages = [];
    session.apiHistory = [];
  }

  undoStack.push(action);
  session.updatedAt = new Date().toISOString();
  saveSessions();
  return true;
}

function getApiHistory() {
  return getActiveSession()?.apiHistory || [];
}

function getAllSessions() {
  return [...sessions].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function clearAllChats() {
  sessions = [];
  const fresh = createSessionObject("New Chat");
  sessions.push(fresh);
  setActiveSession(fresh.id);
  undoStack = [];
  redoStack = [];
  localStorage.removeItem(STORAGE_KEY);
  saveSessions();
}

function exportChats() {
  return JSON.stringify(sessions, null, 2);
}

function canUndo() {
  return undoStack.length > 0;
}

function canRedo() {
  return redoStack.length > 0;
}

export function initChatManager() {
  loadSessions();
  return {
    getActiveSession,
    getAllSessions,
    setActiveSession,
    newChat,
    deleteChat,
    deleteActiveChat,
    clearActiveChat,
    clearAllChats,
    addMessage,
    undo,
    redo,
    canUndo,
    canRedo,
    getApiHistory,
    exportChats,
    loadSettings,
    saveSettings,
    getWelcomeHtml,
    getTimeGreeting,
  };
}
