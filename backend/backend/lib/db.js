const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function filePath(name) {
  return path.join(DATA_DIR, name);
}

function read(name, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath(name), 'utf8'));
  } catch {
    return fallback;
  }
}

function write(name, data) {
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), 'utf8');
}

function appendAudit(entry) {
  const log = read('audit.json', []);
  log.unshift({
    id: Date.now(),
    time: new Date().toISOString(),
    ...entry,
  });
  write('audit.json', log.slice(0, 500));
}

module.exports = { read, write, appendAudit, DATA_DIR };
