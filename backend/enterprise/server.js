const fs = require('fs');
const path = require('path');

// Load backend/.env
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) process.env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
}

const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const createRouter = require('./routes');

const PORT = process.env.PORT || 4000;
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const clients = new Set();

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === 1) client.send(data);
  }
}

app.use('/api', createRouter(broadcast));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'connected', message: 'Connected — receiving live updates' }));
  ws.on('close', () => clients.delete(ws));
});

server.listen(PORT, () => {
  const ai = process.env.OPENAI_API_KEY ? 'OpenAI connected' : 'OpenAI not configured';
  console.log(`DocShare Enterprise running at http://localhost:${PORT} (${ai})`);
});
