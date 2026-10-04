/**
 * Utils.gs
 * Shared helpers: sheet access, formatting (NGN / DD MMM YYYY / WAT), id generation,
 * caching for reference data, and generic batch read/write helpers.
 * Rumbu Industries Group — Contract Department Platform
 */

var APP_TZ = 'Africa/Lagos'; // WAT (UTC+1, no DST)

/** Per-execution memoization: Apps Script spins up a fresh execution context for
 *  every google.script.run call, so this cache can never leak stale data across
 *  requests — it only prevents the SAME request (e.g. one getDashboardData() call)
 *  from reading the same sheet off the network more than once. */
var _sheetCache_ = {};

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/** Get a sheet by name, throwing a clear error if SETUP has not been run. */
function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) {
    throw new Error('Sheet "' + name + '" not found. Run SETUP.gs > setupAll() first (Extensions > Apps Script > run setupAll, or use the "Rumbu Admin" spreadsheet menu).');
  }
  return sh;
}

/** Read all rows of a sheet as an array of objects keyed by header row.
 *  Memoized per-execution (see _sheetCache_) — safe because writes below
 *  invalidate the entry they touch immediately.
 *
 *  Date-typed cells are converted to ISO strings here, at the source. This
 *  matters more than it looks: google.script.run silently returns null to
 *  the browser (no error at all) when a server function's response contains
 *  a native Date object nested inside an array of objects. Every list-style
 *  function in this app reads through readAll_(), so fixing it here fixes
 *  every module at once instead of patching each one individually. Nothing
 *  downstream breaks from this — every date comparison elsewhere already
 *  wraps values in new Date(...), which parses these ISO strings the same
 *  way it would parse a real Date object. */
function readAll_(sheetName) {
  if (_sheetCache_.hasOwnProperty(sheetName)) return _sheetCache_[sheetName];
  var sh = sheet_(sheetName);
  var values = sh.getDataRange().getValues();
  var out = [];
  if (values.length >= 2) {
    var headers = values[0];
    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      if (row.join('') === '') continue; // skip fully blank rows
      var obj = {};
      for (var c = 0; c < headers.length; c++) {
        var val = row[c];
        obj[headers[c]] = (val instanceof Date) ? val.toISOString() : val;
      }
      obj._row = r + 1; // 1-based sheet row, for updates
      out.push(obj);
    }
  }
  _sheetCache_[sheetName] = out;
  return out;
}

/** Append a record (object) to a sheet, matching column order to the header row. */
function appendRecord_(sheetName, record) {
  var sh = sheet_(sheetName);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var row = headers.map(function (h) { return (record[h] !== undefined && record[h] !== null) ? record[h] : ''; });
  sh.appendRow(row);
  delete _sheetCache_[sheetName];
  return sh.getLastRow();
}

/** Update an existing record by its sheet row number. Only supplied fields are changed. */
function updateRecord_(sheetName, rowNum, patch) {
  // Row 1 is the header row: writing there would corrupt the whole sheet.
  if (!(Number(rowNum) >= 2)) throw new Error('Invalid row number (' + rowNum + '). Refresh the page and try again.');
  var sh = sheet_(sheetName);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var current = sh.getRange(rowNum, 1, 1, headers.length).getValues()[0];
  // If the row now holds a DIFFERENT record (rows shifted after a delete, or a
  // tampered row number), refuse instead of overwriting someone else's record.
  var idCol = headers.indexOf('id');
  if (idCol !== -1 && patch.id && current[idCol] !== '' && String(current[idCol]) !== String(patch.id)) {
    throw new Error('This record has moved in the sheet since the page loaded. Refresh the page and try again.');
  }
  for (var c = 0; c < headers.length; c++) {
    if (patch.hasOwnProperty(headers[c])) current[c] = patch[headers[c]];
  }
  sh.getRange(rowNum, 1, 1, headers.length).setValues([current]);
  delete _sheetCache_[sheetName];
  return true;
}

/** Simple incrementing/collision-safe ID generator: PREFIX-YYYYMMDD-XXXX */
function genId_(prefix) {
  // 6 random characters (about 2 billion combinations per day). The old 4-digit
  // number could repeat once a few dozen records were created on the same day.
  var stamp = Utilities.formatDate(new Date(), APP_TZ, 'yyyyMMdd');
  var rand = Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  return prefix + '-' + stamp + '-' + rand;
}

/** Normalises any date value (Date, ISO text, 'yyyy-MM-dd') to a WAT day key 'yyyy-MM-dd'.
 *  Needed because Google Sheets turns typed dates into Date cells, which readAll_
 *  then returns as UTC text, so a plain string comparison of dates fails. */
function dateKey_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return Utilities.formatDate(v, APP_TZ, 'yyyy-MM-dd');
  var s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var d = new Date(s);
  return isNaN(d.getTime()) ? s : Utilities.formatDate(d, APP_TZ, 'yyyy-MM-dd');
}

/** Saturday, Sunday and dates listed in the PublicHolidays sheet are not working days. */
function isWorkingDay_(date) {
  var d = date || new Date();
  var dow = Number(Utilities.formatDate(d, APP_TZ, 'u')); // 1 = Monday ... 7 = Sunday
  if (dow >= 6) return false;
  var key = dateKey_(d);
  var holidays = getCached_('holidays', 600, function () {
    try { return readAll_('PublicHolidays').map(function (h) { return dateKey_(h.date); }); } catch (e) { return []; }
  });
  return holidays.indexOf(key) === -1;
}

function nowIso_() {
  return Utilities.formatDate(new Date(), APP_TZ, "yyyy-MM-dd'T'HH:mm:ss");
}

/** Format helpers used both server-side (emails, PDFs) and passed to client for display. */
function fmtDate_(d) {
  if (!d) return '';
  var date = (d instanceof Date) ? d : new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return Utilities.formatDate(date, APP_TZ, 'dd MMM yyyy');
}

function fmtCurrency_(n) {
  var num = Number(n) || 0;
  return 'NGN ' + num.toLocaleString('en-NG', { maximumFractionDigits: 2 });
}

function daysBetween_(a, b) {
  var d1 = (a instanceof Date) ? a : new Date(a);
  var d2 = (b instanceof Date) ? b : new Date(b);
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

/** Cached reference-data lookups (units, staff, companies) to avoid repeated sheet reads. */
function getCached_(key, ttlSeconds, loaderFn) {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var value = loaderFn();
  try { cache.put(key, JSON.stringify(value), ttlSeconds || 300); } catch (e) { /* value too large for cache; ignore */ }
  return value;
}

function invalidateCache_(key) {
  CacheService.getScriptCache().remove(key);
}

function getUnits() {
  return getCached_('units', 600, function () { return readAll_('Units'); });
}

function getStaffList() {
  return getCached_('staff', 600, function () { return readAll_('Users'); });
}

function getSettings() {
  return getCached_('settings', 300, function () {
    var rows = readAll_('Settings');
    var out = {};
    rows.forEach(function (r) { out[r.key] = r.value; });
    return out;
  });
}

function getSetting(key, fallback) {
  var s = getSettings();
  return s.hasOwnProperty(key) ? s[key] : fallback;
}

/** Generic filter engine used by every module's list function.
 *  filters: { unit, department, responsiblePerson, status, dateField, dateFrom, dateTo, q }
 */
function applyFilters_(rows, filters) {
  if (!filters) return rows;
  return rows.filter(function (r) {
    if (filters.unit && r.unit && r.unit !== filters.unit) return false;
    if (filters.department && r.department && r.department !== filters.department) return false;
    if (filters.status && r.status && r.status !== filters.status) return false;
    if (filters.responsiblePerson) {
      var person = r.assignedTo || r.staffEmail || r.createdBy || r.requestedBy || r.reportedBy || r.owner || '';
      if (String(person).toLowerCase().indexOf(String(filters.responsiblePerson).toLowerCase()) === -1) return false;
    }
    if (filters.dateFrom || filters.dateTo) {
      var dateField = filters.dateField || 'date';
      var raw = r[dateField] || r.date || r.createdAt;
      if (raw) {
        var d = new Date(raw);
        if (filters.dateFrom && d < new Date(filters.dateFrom)) return false;
        if (filters.dateTo && d > new Date(filters.dateTo)) return false;
      }
    }
    if (filters.q) {
      var haystack = JSON.stringify(r).toLowerCase();
      if (haystack.indexOf(String(filters.q).toLowerCase()) === -1) return false;
    }
    return true;
  });
}

function logAudit_(action, module, refId, details) {
  appendRecord_('AuditLog', {
    id: genId_('LOG'), timestamp: nowIso_(), actor: currentUserEmail_(),
    action: action, module: module, refId: refId, details: details || ''
  });
}

/** Delete a single row from a sheet by its 1-based row number (from readAll_'s _row). */
function deleteRow_(sheetName, rowNum) {
  var sh = sheet_(sheetName);
  sh.deleteRow(rowNum);
  delete _sheetCache_[sheetName];
  return true;
}
