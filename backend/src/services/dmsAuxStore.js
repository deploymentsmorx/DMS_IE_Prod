let data = { savedSearches: [], notifications: [], nextId: 1 };

function load() { return data; }
function save(next) { data = next; }

function nextId(data) {
  const id = data.nextId || 1;
  data.nextId = id + 1;
  return String(id);
}

function getSavedSearches(userId) {
  const data = load();
  return data.savedSearches.filter((s) => s.userId === userId);
}

function addSavedSearch(userId, payload) {
  const data = load();
  const entry = {
    id: nextId(data),
    userId,
    name: payload.name || payload.query || "Saved search",
    query: payload.query || "",
    source: payload.source || "all",
    category: payload.category || "all",
    fileType: payload.fileType || "all",
    createdAt: new Date().toISOString(),
  };
  data.savedSearches.unshift(entry);
  save(data);
  return entry;
}

function deleteSavedSearch(userId, id) {
  const data = load();
  const before = data.savedSearches.length;
  data.savedSearches = data.savedSearches.filter(
    (s) => !(String(s.id) === String(id) && s.userId === userId)
  );
  save(data);
  return data.savedSearches.length < before;
}

function getNotifications(userId, limit = 30) {
  const data = load();
  return data.notifications
    .filter((n) => !n.userId || n.userId === userId || n.userId === "all")
    .slice(0, limit);
}

function pushNotification({ userId = "all", type, title, message, meta = {} }) {
  const data = load();
  const note = {
    id: nextId(data),
    userId,
    type,
    title,
    message,
    meta,
    read: false,
    createdAt: new Date().toISOString(),
  };
  data.notifications.unshift(note);
  data.notifications = data.notifications.slice(0, 200);
  save(data);
  return note;
}

function markNotificationRead(userId, id) {
  const data = load();
  const note = data.notifications.find((n) => String(n.id) === String(id));
  if (!note) return false;
  if (note.userId !== "all" && note.userId !== userId) return false;
  note.read = true;
  save(data);
  return true;
}

function markAllNotificationsRead(userId) {
  const data = load();
  for (const n of data.notifications) {
    if (n.userId === "all" || n.userId === userId) n.read = true;
  }
  save(data);
  return true;
}

function getUsageCounts() {
  const data = load();
  const notifications = data.notifications || [];
  return {
    savedSearches: (data.savedSearches || []).length,
    notifications: notifications.length,
    unreadNotifications: notifications.filter((n) => !n.read).length,
  };
}

module.exports = {
  getSavedSearches,
  addSavedSearch,
  deleteSavedSearch,
  getNotifications,
  pushNotification,
  markNotificationRead,
  markAllNotificationsRead,
  getUsageCounts,
};
