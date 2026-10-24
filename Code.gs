/**
 * RAM Sawit — backend append-only dengan merge konflik.
 * Struktur spreadsheet: Pembelian, Penjualan, Pengeluaran, Pengaturan.
 * A:B tetap JSON_DATA dan UPDATED_AT. Setiap versi baru ditambahkan sebagai baris baru.
 * Baris lama tidak dihapus atau ditimpa oleh sinkronisasi.
 */
const RAM_SAWIT_CONFIG_ = {
  headers: ['JSON_DATA', 'UPDATED_AT'],
  sheets: { purchases: 'Pembelian', sales: 'Penjualan', expenses: 'Pengeluaran', settings: 'Pengaturan' },
  propertySpreadsheetId: 'RAM_SAWIT_SPREADSHEET_ID',
  propertyLastSync: 'RAM_SAWIT_LAST_SYNC',
  syncResultPrefix: 'RAM_SAWIT_SYNC_RESULT_',
  maxSyncResults: 80
};

function doGet(e) {
  const p = e && e.parameter ? e.parameter : {};
  const action = String(p.action || 'read').toLowerCase();
  const callback = String(p.callback || '');
  let result;
  try {
    if (action === 'test') {
      const ss = getSpreadsheet_();
      validateDatabaseSheets_(ss);
      result = { ok: true, message: 'Koneksi RAM Sawit berhasil.', spreadsheetName: ss.getName(), sheets: Object.keys(RAM_SAWIT_CONFIG_.sheets).map(k => RAM_SAWIT_CONFIG_.sheets[k]), lastSync: PropertiesService.getScriptProperties().getProperty(RAM_SAWIT_CONFIG_.propertyLastSync) || null, updatedAt: new Date().toISOString() };
    } else if (action === 'read') {
      const lock = LockService.getScriptLock(); lock.waitLock(20000);
      try { result = { ok: true, message: 'Data berhasil dibaca; riwayat versi tetap tersimpan.', data: readAll_(), updatedAt: new Date().toISOString() }; }
      finally { lock.releaseLock(); }
    } else if (action === 'syncstatus') {
      const syncId = String(p.syncId || '');
      const status = syncId ? getSyncStatus_(syncId) : null;
      result = status || { ok: true, done: false, syncId: syncId, message: 'Sinkronisasi belum tercatat.' };
    } else {
      result = { ok: false, message: 'Action GET tidak dikenal: ' + action };
    }
  } catch (err) { result = { ok: false, message: errorMessage_(err) }; }
  const json = JSON.stringify(result);
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) return ContentService.createTextOutput(callback + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock(); let locked = false; let syncId = '';
  try {
    lock.waitLock(25000); locked = true;
    const raw = e && e.postData && e.postData.contents;
    if (!raw) throw new Error('Payload kosong. Tidak ada data yang diterima.');
    let body; try { body = JSON.parse(raw); } catch (_) { throw new Error('Payload bukan JSON yang valid.'); }
    syncId = String(body.syncId || '');
    if (body.action !== 'write' || !body.data) throw new Error('Payload harus memuat action "write" dan objek data.');
    if (syncId) {
      const old = getSyncStatus_(syncId);
      if (old && old.done && old.ok) return jsonOutput_(old);
    }
    validatePayload_(body.data);
    const stats = appendMergeAll_(body.data);
    const result = { ok: true, done: true, syncId: syncId, message: 'Data berhasil digabung. Riwayat lama dipertahankan.', stats: stats, updatedAt: new Date().toISOString() };
    PropertiesService.getScriptProperties().setProperty(RAM_SAWIT_CONFIG_.propertyLastSync, result.updatedAt);
    if (syncId) saveSyncStatus_(syncId, result);
    return jsonOutput_(result);
  } catch (err) {
    const failure = { ok: false, done: true, syncId: syncId, message: errorMessage_(err), updatedAt: new Date().toISOString() };
    if (syncId) { try { saveSyncStatus_(syncId, failure); } catch (_) {} }
    return jsonOutput_(failure);
  } finally { if (locked) lock.releaseLock(); }
}

function readAll_() {
  const ss = getSpreadsheet_(); validateDatabaseSheets_(ss);
  const out = { purchases: [], sales: [], expenses: [], settings: {} };
  ['purchases', 'sales', 'expenses'].forEach(function(key) {
    const sheet = ss.getSheetByName(RAM_SAWIT_CONFIG_.sheets[key]);
    const entries = readEntries_(sheet, key);
    const latest = Object.create(null);
    entries.forEach(function(entry) {
      const rec = entry.record; const id = String(rec.id);
      if (!latest[id] || compareVersions_(entry, latest[id]) > 0) latest[id] = entry;
    });
    out[key] = Object.keys(latest).map(id => latest[id].record).sort(function(a,b) {
      return String(a.date || '').localeCompare(String(b.date || '')) || String(a.no || '').localeCompare(String(b.no || '')) || String(a.id).localeCompare(String(b.id));
    });
  });
  const settingSheet = ss.getSheetByName(RAM_SAWIT_CONFIG_.sheets.settings);
  const settingsEntries = readEntries_(settingSheet, 'settings');
  if (settingsEntries.length) {
    settingsEntries.sort(compareVersions_);
    out.settings = mergeSettingsHistory_(settingsEntries[settingsEntries.length - 1].record, settingsEntries.map(x => x.record));
  }
  return out;
}

function appendMergeAll_(data) {
  const ss = getSpreadsheet_(); validatePayload_(data); validateDatabaseSheets_(ss);
  const stats = { purchasesAdded: 0, salesAdded: 0, expensesAdded: 0, settingsVersionsAdded: 0, duplicatesSkipped: 0, ignoredStaleSettings: 0 };
  ['purchases', 'sales', 'expenses'].forEach(function(key) {
    const sheet = ss.getSheetByName(RAM_SAWIT_CONFIG_.sheets[key]);
    const result = appendRecordVersions_(sheet, key, data[key]);
    stats[key + 'Added'] = result.added; stats.duplicatesSkipped += result.skipped;
  });
  const settingsSheet = ss.getSheetByName(RAM_SAWIT_CONFIG_.sheets.settings);
  const settingsResult = appendSettingsVersion_(settingsSheet, data.settings);
  stats.settingsVersionsAdded = settingsResult.added;
  stats.ignoredStaleSettings = settingsResult.ignoredStale ? 1 : 0;
  return stats;
}

function appendRecordVersions_(sheet, kind, records) {
  const existing = readEntries_(sheet, kind);
  const known = Object.create(null);
  existing.forEach(e => { known[canonicalJson_(e.record)] = true; });
  const rows = []; let skipped = 0;
  records.forEach(function(item, i) {
    const record = normalizeRecord_(item, kind, i);
    const sig = canonicalJson_(record);
    if (known[sig]) { skipped++; return; }
    known[sig] = true;
    rows.push([JSON.stringify(record), new Date()]);
  });
  appendRows_(sheet, rows);
  return { added: rows.length, skipped: skipped };
}

function appendSettingsVersion_(sheet, incoming) {
  const history = readEntries_(sheet, 'settings');
  const orderedHistory = history.slice().sort(compareVersions_);
  const currentEntry = orderedHistory.length ? orderedHistory[orderedHistory.length - 1] : null;
  const current = currentEntry ? currentEntry.record : null;
  const mergedHistory = mergePriceHistory_(current && current.priceHistory, incoming && incoming.priceHistory);
  const incomingObj = isPlainObject_(incoming) ? clone_(incoming) : {};
  const currentTime = current ? timestampOf_(current, currentEntry.rowAt || 0) : 0;
  const incomingTime = timestampOf_(incomingObj, 0);
  let merged;
  let ignoredStale = false;
  if (current && incomingTime < currentTime) {
    // Data pengaturan lama tidak boleh menurunkan pengaturan terbaru; riwayat harga tetap digabung.
    merged = clone_(current); ignoredStale = true;
  } else {
    merged = clone_(incomingObj);
  }
  merged.priceHistory = mergedHistory;
  if (!merged.updatedAt) merged.updatedAt = new Date().toISOString();
  const signature = canonicalJson_(merged);
  if (history.some(e => canonicalJson_(e.record) === signature)) return { added: 0, ignoredStale: ignoredStale };
  if (current && incomingTime === 0 && currentTime > 0) {
    merged = clone_(current); merged.priceHistory = mergedHistory;
    if (canonicalJson_(merged) === canonicalJson_(current)) return { added: 0, ignoredStale: true };
    ignoredStale = true;
  }
  appendRows_(sheet, [[JSON.stringify(merged), new Date()]]);
  return { added: 1, ignoredStale: ignoredStale };
}

function readEntries_(sheet, kind) {
  const lastRow = sheet.getLastRow(); if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const entries = [];
  values.forEach(function(row, index) {
    if (row[0] === '' || row[0] === null || typeof row[0] === 'undefined') return;
    let parsed;
    try { parsed = typeof row[0] === 'string' ? JSON.parse(row[0]) : row[0]; }
    catch (_) { throw new Error('JSON_DATA rusak pada tab "' + sheet.getName() + '", baris ' + (index + 2) + '. Data lama tidak dihapus.'); }
    if (!isPlainObject_(parsed)) return;
    const record = kind === 'settings' ? parsed : normalizeRecord_(parsed, kind, index);
    entries.push({ record: record, rowAt: toMillis_(row[1]) || 0, rowNumber: index + 2 });
  });
  return entries;
}

function normalizeRecord_(item, kind, index) {
  const rec = clone_(item);
  if (!rec.id) {
    const stable = [rec.no || '', rec.date || '', rec.supplier || rec.company || rec.category || '', rec.description || ''].join('|');
    rec.id = 'legacy-' + kind + '-' + hash_(stable !== '|||' ? stable : canonicalJson_(rec));
  }
  return rec;
}

function compareVersions_(a, b) {
  const ta = timestampOf_(a.record, a.rowAt || 0), tb = timestampOf_(b.record, b.rowAt || 0);
  if (ta !== tb) return ta > tb ? 1 : -1;
  return (a.rowNumber || 0) - (b.rowNumber || 0);
}

function timestampOf_(obj, fallback) {
  const vals = [obj && obj.updatedAt, obj && obj.createdAt];
  for (let i = 0; i < vals.length; i++) { const n = toMillis_(vals[i]); if (n) return n; }
  return fallback || 0;
}

function mergeSettingsHistory_(current, all) {
  const merged = clone_(current || {});
  merged.priceHistory = mergePriceHistory_((current || {}).priceHistory, [].concat.apply([], all.map(x => Array.isArray(x.priceHistory) ? x.priceHistory : [])));
  return merged;
}
function mergePriceHistory_(a, b) {
  const result = []; const seen = Object.create(null);
  [].concat(Array.isArray(a) ? a : [], Array.isArray(b) ? b : []).forEach(function(item, i) {
    if (!isPlainObject_(item)) return;
    const id = item.id || ('legacy-price-' + hash_(canonicalJson_(item)));
    const sig = String(id) + '|' + canonicalJson_(item);
    if (!seen[sig]) { seen[sig] = true; result.push(item); }
  });
  result.sort((x,y) => String(x.changedAt || x.date || '').localeCompare(String(y.changedAt || y.date || '')) || String(x.id || '').localeCompare(String(y.id || '')));
  return result;
}
function stripHistory_(obj) { const copy = clone_(obj); delete copy.priceHistory; return copy; }
function appendRows_(sheet, rows) {
  if (!rows.length) return;
  const start = Math.max(2, sheet.getLastRow() + 1);
  sheet.getRange(start, 1, rows.length, 2).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 560); sheet.setColumnWidth(2, 175);
  sheet.getRange(start, 2, rows.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
}
function validatePayload_(data) {
  if (!isPlainObject_(data)) throw new Error('Objek data RAM Sawit tidak valid.');
  ['purchases','sales','expenses'].forEach(function(key) {
    if (!Array.isArray(data[key])) throw new Error('Bagian data "' + key + '" harus berupa daftar transaksi.');
    data[key].forEach((item, index) => { if (!isPlainObject_(item)) throw new Error('Data ' + key + ' pada urutan ' + (index + 1) + ' tidak valid.'); });
  });
  if (!isPlainObject_(data.settings)) throw new Error('Objek pengaturan/harga tidak valid.');
}
function validateDatabaseSheets_(ss) {
  Object.keys(RAM_SAWIT_CONFIG_.sheets).forEach(function(key) {
    const name = RAM_SAWIT_CONFIG_.sheets[key]; const sheet = ss.getSheetByName(name);
    if (!sheet) throw new Error('Tab "' + name + '" tidak ditemukan. Buka template RAM Sawit sebagai Google Sheets lalu jalankan setupRamSawit().');
    const headers = sheet.getRange(1,1,1,2).getDisplayValues()[0];
    if (headers[0] !== RAM_SAWIT_CONFIG_.headers[0] || headers[1] !== RAM_SAWIT_CONFIG_.headers[1]) throw new Error('Header pada tab "' + name + '" harus JSON_DATA dan UPDATED_AT di kolom A:B. Data yang ada tidak dihapus.');
  });
}
function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties(); const id = props.getProperty(RAM_SAWIT_CONFIG_.propertySpreadsheetId);
  if (id) return SpreadsheetApp.openById(id);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('Spreadsheet belum dihubungkan. Buka Apps Script dari Google Sheets tujuan lalu jalankan setupRamSawit().');
}
function setupRamSawit() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Buka Google Sheets RAM Sawit lalu pilih Ekstensi → Apps Script.');
  PropertiesService.getScriptProperties().setProperty(RAM_SAWIT_CONFIG_.propertySpreadsheetId, ss.getId());
  Object.keys(RAM_SAWIT_CONFIG_.sheets).forEach(function(key) {
    const name = RAM_SAWIT_CONFIG_.sheets[key]; let sheet = ss.getSheetByName(name); if (!sheet) sheet = ss.insertSheet(name);
    const headers = sheet.getRange(1,1,1,2).getDisplayValues()[0];
    if (sheet.getLastRow() === 0 || (headers[0] === '' && headers[1] === '')) sheet.getRange(1,1,1,2).setValues([RAM_SAWIT_CONFIG_.headers]);
    else if (headers[0] !== RAM_SAWIT_CONFIG_.headers[0] || headers[1] !== RAM_SAWIT_CONFIG_.headers[1]) throw new Error('Header tab "' + name + '" tidak cocok. Tidak ada data yang dihapus.');
    sheet.setFrozenRows(1); sheet.setColumnWidth(1,560); sheet.setColumnWidth(2,175);
  });
  validateDatabaseSheets_(ss);
  return 'RAM Sawit siap: ' + ss.getName() + '. Sinkronisasi hanya menambah versi baru; data lama tidak dihapus.';
}
function saveSyncStatus_(syncId, value) {
  const props = PropertiesService.getScriptProperties(); const key = syncResultKey_(syncId);
  props.setProperty(key, JSON.stringify(value));
  const all = props.getProperties();
  const entries = Object.keys(all).filter(k => k.indexOf(RAM_SAWIT_CONFIG_.syncResultPrefix) === 0).map(k => {
    let t = 0; try { t = Date.parse(JSON.parse(all[k]).updatedAt || '') || 0; } catch (_) {} return { key:k, time:t };
  }).sort((a,b) => b.time - a.time);
  entries.slice(RAM_SAWIT_CONFIG_.maxSyncResults).forEach(x => props.deleteProperty(x.key));
}
function getSyncStatus_(syncId) {
  const raw = PropertiesService.getScriptProperties().getProperty(syncResultKey_(syncId));
  if (!raw) return null; try { return JSON.parse(raw); } catch (_) { return null; }
}
function syncResultKey_(id) { return RAM_SAWIT_CONFIG_.syncResultPrefix + String(id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 90); }
function jsonOutput_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function canonicalJson_(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson_).join(',') + ']';
  if (isPlainObject_(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalJson_(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function clone_(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
function hash_(s) { let h = 2166136261; for (let i=0;i<String(s).length;i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
function toMillis_(v) { if (v instanceof Date) return v.getTime(); if (typeof v === 'number') return v; if (v === null || v === undefined || v === '') return 0; const n = Date.parse(v); return isNaN(n) ? 0 : n; }
function isPlainObject_(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function errorMessage_(err) { return String(err && err.message ? err.message : err || 'Kesalahan tidak diketahui.'); }
