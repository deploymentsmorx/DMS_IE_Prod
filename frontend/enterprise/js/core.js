const ON_UNIFIED_APP = window.location.pathname.startsWith("/enterprise");
const API = ON_UNIFIED_APP
  ? `${window.location.origin}/enterprise-api`
  : `${window.location.origin}/api`;
const WS_URL = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;

const COLOR_PALETTE = [
  { bg: '#1e1830', text: '#a899ff', dot: '#7c6dfa' },
  { bg: '#1e1525', text: '#e87eb0', dot: '#c4537e' },
  { bg: '#0d1e1a', text: '#4ecfa0', dot: '#1d9e75' },
  { bg: '#1e1a0a', text: '#f0b84e', dot: '#ba7517' },
  { bg: '#0d1625', text: '#68b0f5', dot: '#378add' },
  { bg: '#0f1e0a', text: '#89c93d', dot: '#639922' },
];

const state = {
  token: localStorage.getItem('ds-token'),
  user: null,
  module: 'documents',
  platform: null,
  selectedDocId: null,
  selectedVersionId: null,
  viewMode: 'document',
  currentFolder: 'root',
};

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (state.token) headers['X-Session-Token'] = state.token;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatVersionLabel(id) {
  return `Version ${String(id).replace(/^v/i, '')}`;
}

function authorColor(name) {
  const idx = Math.abs([...name].reduce((s,c)=>s+c.charCodeAt(0),0)) % COLOR_PALETTE.length;
  return COLOR_PALETTE[idx];
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.style.display = 'none', 4000);
}

function showModal(html) {
  document.getElementById('modal').innerHTML = html;
  document.getElementById('modalOverlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
}

function computeLineChanges(a, b) {
  const lcs = (x, y) => {
    const m = x.length, n = y.length;
    const dp = Array.from({length:m+1},()=>Array(n+1).fill(0));
    for (let i=1;i<=m;i++) for (let j=1;j<=n;j++)
      dp[i][j] = x[i-1]===y[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j],dp[i][j-1]);
    const seq=[]; let i=m,j=n;
    while(i>0&&j>0){
      if(x[i-1]===y[j-1]){seq.push({type:'ctx',line:x[i-1]});i--;j--;}
      else if(dp[i-1][j]>dp[i][j-1]){seq.push({type:'del',line:x[i-1]});i--;}
      else{seq.push({type:'add',line:y[j-1]});j--;}
    }
    while(i>0){seq.push({type:'del',line:x[i-1]});i--;}
    while(j>0){seq.push({type:'add',line:y[j-1]});j--;}
    return seq.reverse();
  };
  return lcs(a,b);
}

window.api = api;
window.state = state;
window.esc = esc;
window.formatTime = formatTime;
window.formatVersionLabel = formatVersionLabel;
window.authorColor = authorColor;
window.showToast = showToast;
window.showModal = showModal;
window.closeModal = closeModal;
window.computeLineChanges = computeLineChanges;
