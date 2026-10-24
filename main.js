'use strict';

const { app, BrowserWindow, Menu, session, shell, dialog } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

app.setAppUserModelId('id.ramsawit.desktop');
const PORT = Number(process.env.RAM_SAWIT_PORT || 37851);
let mainWindow;
let server;
let serverUrl = `http://127.0.0.1:${PORT}`;
const dataDir = () => path.join(app.getPath('userData'), 'shared-data');
const dbPath = () => path.join(dataDir(), 'database.json');
const historyPath = () => path.join(dataDir(), 'history.jsonl');
const freshDB = () => ({ purchases: [], sales: [], expenses: [], settings: { businessName: 'RAM Sawit', businessAddress: '', businessPhone: '', prices: { 'Grade A': 0, 'Grade B': 0, Brondol: 0 }, priceHistory: [] }, _deletedIds: [] });

function ensureStore() {
  fs.mkdirSync(dataDir(), { recursive: true });
  if (!fs.existsSync(dbPath())) fs.writeFileSync(dbPath(), JSON.stringify(freshDB(), null, 2), 'utf8');
}
function readDB() {
  ensureStore();
  try { return normalizeDB(JSON.parse(fs.readFileSync(dbPath(), 'utf8'))); }
  catch { return freshDB(); }
}
function writeDB(db, event = 'update') {
  ensureStore();
  const normalized = normalizeDB(db);
  const tmp = dbPath() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(normalized, null, 2), 'utf8');
  fs.renameSync(tmp, dbPath());
  // Append-only audit trail: each accepted update is retained in a JSONL history file.
  fs.appendFileSync(historyPath(), JSON.stringify({ at: new Date().toISOString(), event, data: normalized }) + '\n', 'utf8');
  return normalized;
}
function normalizeDB(value) {
  const base = freshDB();
  const v = value && typeof value === 'object' ? value : {};
  return { ...base, ...v,
    purchases: Array.isArray(v.purchases) ? v.purchases : [],
    sales: Array.isArray(v.sales) ? v.sales : [],
    expenses: Array.isArray(v.expenses) ? v.expenses : [],
    settings: { ...base.settings, ...(v.settings || {}), prices: { ...base.settings.prices, ...((v.settings || {}).prices || {}) }, priceHistory: Array.isArray(v.settings?.priceHistory) ? v.settings.priceHistory : [] },
    _deletedIds: Array.isArray(v._deletedIds) ? [...new Set(v._deletedIds.map(String))] : []
  };
}
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
function normalizeRecord(raw, kind) {
  const item = { ...(raw || {}) };
  if (!item.id) item.id = `legacy-${kind}-${hash(item.no || canonical(item))}`;
  if (!item.updatedAt) item.updatedAt = item.createdAt || '1970-01-01T00:00:00.000Z';
  return item;
}
function recordTime(x) { return Date.parse(x?.updatedAt || x?.createdAt || '') || 0; }
function mergeLists(local, incoming, kind, deleted) {
  const map = new Map();
  const put = raw => {
    const item = normalizeRecord(raw, kind); const id = String(item.id);
    if (deleted.has(id)) return;
    const old = map.get(id);
    if (!old || recordTime(item) > recordTime(old) || (recordTime(item) === recordTime(old) && canonical(item) > canonical(old))) map.set(id, item);
  };
  (local || []).forEach(put); (incoming || []).forEach(put);
  return [...map.values()].sort((a, b) => String(a.createdAt || a.date || '').localeCompare(String(b.createdAt || b.date || '')) || String(a.id).localeCompare(String(b.id)));
}
function mergeDB(current, incoming) {
  const a = normalizeDB(current); const b = normalizeDB(incoming);
  const deleted = new Set([...(a._deletedIds || []), ...(b._deletedIds || [])]);
  const settingsA = a.settings || {}; const settingsB = b.settings || {};
  const settings = recordTime(settingsB) >= recordTime(settingsA) ? settingsB : settingsA;
  const history = new Map();
  [...(settingsA.priceHistory || []), ...(settingsB.priceHistory || [])].forEach((x, i) => { const key = String(x.id || hash(canonical(x))); if (!history.has(key)) history.set(key, { ...x, id: x.id || `ph-${key}` }); });
  const merged = {
    purchases: mergeLists(a.purchases, b.purchases, 'purchases', deleted),
    sales: mergeLists(a.sales, b.sales, 'sales', deleted),
    expenses: mergeLists(a.expenses, b.expenses, 'expenses', deleted),
    settings: { ...settings, prices: { ...(settingsA.prices || {}), ...(settingsB.prices || {}) }, priceHistory: [...history.values()].sort((x,y) => String(x.changedAt || x.date || '').localeCompare(String(y.changedAt || y.date || ''))) },
    _deletedIds: [...deleted]
  };
  // If settings were newer on the current host, preserve its price values instead of allowing an older client to roll them back.
  if (recordTime(settingsA) > recordTime(settingsB)) merged.settings.prices = { ...(settingsB.prices || {}), ...(settingsA.prices || {}) };
  return normalizeDB(merged);
}
function localIPv4s() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const nic of (list || [])) {
    if (nic.family === 'IPv4' && !nic.internal) out.push(nic.address);
  }
  return [...new Set(out)];
}
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url, serverUrl);
      if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, app: 'RAM Sawit', version: app.getVersion(), port: PORT });
      if (req.method === 'GET' && url.pathname === '/api/db') return send(res, 200, { ok: true, data: readDB() });
      if (req.method === 'POST' && url.pathname === '/api/db') {
        let body = ''; req.setEncoding('utf8');
        req.on('data', chunk => { body += chunk; if (body.length > 20 * 1024 * 1024) { send(res, 413, { ok: false, message: 'Data terlalu besar (maksimum 20 MB).' }); req.destroy(); } });
        req.on('end', () => {
          try {
            const incoming = normalizeDB(JSON.parse(body));
            const current = readDB();
            const merged = mergeDB(current, incoming);
            const saved = writeDB(merged, 'merge');
            send(res, 200, { ok: true, data: saved, counts: { purchases: saved.purchases.length, sales: saved.sales.length, expenses: saved.expenses.length } });
          } catch (e) { send(res, 400, { ok: false, message: 'Data tidak valid: ' + e.message }); }
        });
        return;
      }
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res); return;
      }
      if (req.method === 'GET' && url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
      send(res, 404, { ok: false, message: 'Endpoint tidak ditemukan.' });
    });
    server.on('error', reject);
    server.listen(PORT, '0.0.0.0', () => resolve());
  });
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 940, minWidth: 980, minHeight: 680, show: false,
    autoHideMenuBar: false, backgroundColor: '#f4f7f5', title: 'RAM Sawit — Sistem Informasi Usaha',
    icon: path.join(__dirname, 'assets', 'ram-sawit.ico'),
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL(serverUrl);
  mainWindow.webContents.session.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ title: 'Simpan file RAM Sawit', buttonLabel: 'Simpan', defaultPath: path.join(app.getPath('downloads'), item.getFilename()), filters: [{ name: 'Semua file', extensions: ['*'] }] });
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) shell.openExternal(url); return { action: 'deny' }; });
  mainWindow.on('closed', () => { mainWindow = null; });
}
const template = [
  { label: 'File', submenu: [
    { label: 'Tampilkan alamat berbagi LAN', click: () => showShareInfo() },
    { label: 'Buka folder data bersama', click: () => { ensureStore(); shell.openPath(dataDir()); } },
    { type: 'separator' }, { label: 'Cetak Laporan / Simpan PDF', accelerator: 'CmdOrCtrl+P', click: () => mainWindow?.webContents.executeJavaScript("document.getElementById('dlPrintReport')?.click()") },
    { type: 'separator' }, { role: 'reload', label: 'Muat Ulang Aplikasi' }, { type: 'separator' }, { role: 'quit', label: 'Keluar' }
  ]},
  { label: 'Bantuan', submenu: [{ label: 'Tentang RAM Sawit', click: () => dialog.showMessageBox({ type: 'info', title: 'Tentang RAM Sawit', message: 'RAM Sawit — Sistem Informasi Usaha', detail: `Versi ${app.getVersion()}\nServer lokal aktif di ${serverUrl}.\nPerangkat lain pada jaringan yang sama dapat membuka alamat IP LAN pada menu File.` }) }] }
];
function showShareInfo() {
  const addresses = localIPv4s().map(ip => `http://${ip}:${PORT}`);
  dialog.showMessageBox(mainWindow, { type: 'info', title: 'Berbagi RAM Sawit di jaringan lokal', message: 'Server RAM Sawit aktif.', detail: `Komputer ini: ${serverUrl}\n\nBuka salah satu alamat berikut dari perangkat lain yang terhubung ke Wi-Fi/LAN yang sama:\n${addresses.join('\n') || '(Alamat IP LAN tidak ditemukan)'}\n\nJika tidak dapat dibuka, izinkan RAM Sawit pada Windows Firewall untuk jaringan Private. Jangan bagikan port ini ke internet tanpa VPN/tunnel yang aman.` });
}
Menu.setApplicationMenu(Menu.buildFromTemplate(template));
app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  try { ensureStore(); await startServer(); createWindow(); }
  catch (e) { dialog.showErrorBox('RAM Sawit tidak dapat dijalankan', `Server lokal gagal dimulai pada port ${PORT}. Tutup aplikasi lain yang memakai port tersebut lalu coba lagi.\n\n${e.message}`); app.quit(); }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', () => { if (server) server.close(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
