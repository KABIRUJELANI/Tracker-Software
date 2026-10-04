/**
 * Auth.gs
 * Role lookup + permission checks, PLUS the platform's login layer.
 *
 * Two auth modes, and either can be active:
 *  1. Google-account mode (default): if the visitor is signed into a Google
 *     account in this Workspace domain, Session.getActiveUser() identifies them —
 *     nothing else to configure.
 *  2. Username/password mode: for staff without a Workspace account tied to this
 *     domain (or if you'd simply rather issue org credentials), Admin can set a
 *     password per user (Admin > Users & Roles > Set Password). The client then
 *     calls loginWithPassword() to get a session token, and every subsequent
 *     server call is routed through rpc_() below, which resolves identity from
 *     that token for the lifetime of the call. Sessions last 6 hours (Apps
 *     Script's CacheService max) before needing to log in again.
 *
 * Every server-side write function MUST call requirePermission_() — never trust
 * the client for authorization.
 */

var ROLES = {
  CEO: 'CEO',
  HEAD_OF_CONTRACT: 'Head of Contract',
  UNIT_HEAD_NDDC: 'Unit Head - NDDC',
  UNIT_HEAD_MDAS: 'Unit Head - MDAs',
  UNIT_HEAD_REVENUE: 'Unit Head - Revenue',
  STAFF: 'Staff/Officer',
  ADMIN: 'Admin',
  // Added for the Contract Office structure (Staff and MDA Register):
  ASSISTANT_HEAD: 'Assistant Head',
  HEAD_PH: 'Head of Port Harcourt Unit',
  DIRECTOR: 'Director'
};

/** New roles start with the same default access as an existing role. Used only when
 *  setup creates missing RolePermissions rows; Admin can change them afterwards. */
var ROLE_DEFAULTS_LIKE = {
  'Assistant Head': 'Head of Contract',
  'Head of Port Harcourt Unit': 'Unit Head - NDDC',
  'Director': 'CEO'
};

/**
 * Default permission matrix — used ONLY to seed the RolePermissions sheet the
 * first time setupAll() runs (see SETUP.gs). After that, Admin > Access Control
 * edits the sheet directly and this object is no longer consulted.
 */
var PERMISSIONS = {
  dashboard:      { read: 'ALL', write: [] },
  attendance:     { read: 'ALL', write: 'ALL' },
  dailyReports:   { read: 'ALL', write: [ROLES.STAFF, ROLES.UNIT_HEAD_NDDC, ROLES.UNIT_HEAD_MDAS, ROLES.UNIT_HEAD_REVENUE, ROLES.ADMIN] },
  incidents:      { read: 'ALL', write: [ROLES.STAFF, ROLES.UNIT_HEAD_NDDC, ROLES.UNIT_HEAD_MDAS, ROLES.UNIT_HEAD_REVENUE, ROLES.HEAD_OF_CONTRACT, ROLES.ADMIN] },
  payments:       { read: 'ALL', write: [ROLES.UNIT_HEAD_NDDC, ROLES.UNIT_HEAD_MDAS, ROLES.UNIT_HEAD_REVENUE, ROLES.HEAD_OF_CONTRACT, ROLES.ADMIN] },
  inflowOutflow:  { read: 'ALL', write: [ROLES.UNIT_HEAD_NDDC, ROLES.UNIT_HEAD_MDAS, ROLES.UNIT_HEAD_REVENUE, ROLES.HEAD_OF_CONTRACT, ROLES.ADMIN] },
  contracts:      { read: 'ALL', write: [ROLES.UNIT_HEAD_NDDC, ROLES.UNIT_HEAD_MDAS, ROLES.UNIT_HEAD_REVENUE, ROLES.HEAD_OF_CONTRACT, ROLES.ADMIN] },
  jobs:           { read: 'ALL', write: [ROLES.STAFF, ROLES.UNIT_HEAD_NDDC, ROLES.UNIT_HEAD_MDAS, ROLES.UNIT_HEAD_REVENUE, ROLES.ADMIN] },
  filePositional: { read: 'ALL', write: [] },
  procurement:    { read: 'ALL', write: [ROLES.UNIT_HEAD_NDDC, ROLES.UNIT_HEAD_MDAS, ROLES.UNIT_HEAD_REVENUE, ROLES.HEAD_OF_CONTRACT, ROLES.ADMIN] },
  companies:      { read: 'ALL', write: [ROLES.HEAD_OF_CONTRACT, ROLES.ADMIN] },
  kpi:            { read: 'ALL', write: [ROLES.ADMIN] },
  escalations:    { read: 'ALL', write: [] },
  projects:       { read: 'ALL', write: [ROLES.UNIT_HEAD_NDDC, ROLES.UNIT_HEAD_MDAS, ROLES.UNIT_HEAD_REVENUE, ROLES.HEAD_OF_CONTRACT, ROLES.ADMIN] },
  admin:          { read: [ROLES.ADMIN, ROLES.CEO], write: [ROLES.ADMIN] },
  register:       { read: [ROLES.HEAD_OF_CONTRACT, ROLES.ASSISTANT_HEAD, ROLES.HEAD_PH, ROLES.CEO, ROLES.DIRECTOR, ROLES.ADMIN],
                    write: [ROLES.HEAD_OF_CONTRACT, ROLES.ASSISTANT_HEAD, ROLES.HEAD_PH, ROLES.ADMIN] }
};

/* ---------------- RPC dispatcher (enables username/password sessions) ---------------- */

var _currentSessionToken_ = null;

/** Single entry point the client calls for EVERY server function (see Scripts.html).
 *  Threading identity this way means only rpc() needs to know about session
 *  tokens — every existing function (getCurrentUser, requirePermission_, etc.)
 *  keeps working unchanged, whether the visitor logged in with a password or is
 *  just signed into Google. */
/** Every function the client is allowed to reach through rpc(). This is a hard
 *  allowlist, not just documentation — rpc() refuses anything not on it. Without
 *  this, a client could call ANY top-level function by name, including private
 *  helpers (deleteRow_, hashPassword_, etc.) that skip permission checks because
 *  they trust their own public wrapper to have called requirePermission_ first. */
var RPC_ALLOWLIST = [
  'acknowledgeEscalation', 'bootstrap', 'clockIn', 'clockOut', 'deleteAllEscalations', 'deleteAllStaff', 'deleteCompany',
  'deleteCompanyDocument', 'deleteContract', 'deleteContractDocument',
  'deleteDailyReport', 'deleteEscalationRecord', 'deleteFile', 'deleteIncident', 'deleteJob',
  'deleteProcurement', 'deleteUser',
  'getAccessMatrix', 'getAllSettings', 'getAuditLog', 'getCompanyAnalysis', 'getCompanyDocumentChecklist',
  'getContractsPipeline', 'getContractDocumentChecklist', 'getDashboardData', 'getFilePositionalAnalysis',
  'generateRecordPdf', 'getInflowOutflowSummary', 'getKpiAnalysis', 'getMyAttendanceToday', 'getPaymentsSummary',
  'getPendingActionsRegister', 'getPendingJobsAnalysis', 'getReportCompliance', 'listAttendanceToday',
  'listContracts', 'listDailyReports', 'listEscalations', 'listFileRegister', 'listIncidents',
  'listInflowOutflow', 'listJobs', 'listPayments', 'listProcurement', 'logPaymentFollowUp',
  'listProjects', 'listUnitsAdmin', 'listUsers', 'loginWithPassword', 'logout',
  'registerFile', 'saveCompany', 'saveCompanyDocumentNote', 'saveContract', 'saveContractDocumentNote', 'saveDailyReport', 'saveIncident',
  'saveInflowOutflow', 'saveJob', 'saveKpiTarget', 'savePayment', 'saveProcurement',
  'saveProject', 'saveRolePermission', 'saveSetting', 'saveUnit', 'saveUser',
  'saveCompanyChecklist', 'getCompanyPersons', 'saveCompanyPerson', 'uploadCompanyPersonImage',
  'getCompanyPersonImage', 'deleteCompanyPersonImage', 'deleteCompanyPerson',
  'getRegister', 'previewStaffChange', 'saveStaff', 'exitStaff', 'saveMda',
  'listStatesAdmin', 'saveState', 'listHolidaysAdmin', 'saveHoliday', 'deleteHoliday',
  'sendDirectEmail', 'setUserPassword', 'uploadCompanyDocument', 'uploadContractDocument', 'uploadDailyReportFile'
];

/** The only functions callable without a session token. Everything else needs a valid login.
 *  Without this gate, a call with no token falls through to Session.getEffectiveUser(),
 *  which for an anonymous web-app visitor is the deploying account (an Admin). */
var RPC_PUBLIC = ['loginWithPassword', 'logout'];

function rpc(token, fnName, args) {
  if (RPC_ALLOWLIST.indexOf(fnName) === -1) throw new Error('Function not permitted via rpc: ' + fnName);
  _currentSessionToken_ = token || null;
  if (!_currentSessionToken_ && RPC_PUBLIC.indexOf(fnName) === -1) throw new Error('SESSION_EXPIRED');
  var fn = globalThis[fnName];
  if (typeof fn !== 'function') throw new Error('Unknown server function: ' + fnName);
  return fn.apply(null, args || []);
}

/* ---------------- Password auth ---------------- */

function genSalt_() {
  return Utilities.getUuid().replace(/-/g, '');
}

function hashPassword_(password, salt) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(password) + ':' + salt);
  return digest.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

/** Admin-only: set or reset a user's password. */
function setUserPassword(email, newPassword) {
  requirePermission_('admin', 'write');
  if (!newPassword || String(newPassword).length < 6) throw new Error('Password must be at least 6 characters.');
  var rows = readAll_('Users');
  var row = rows.filter(function (u) { return String(u.email).toLowerCase() === String(email).toLowerCase(); })[0];
  if (!row) throw new Error('No such user: ' + email);
  var salt = genSalt_();
  updateRecord_('Users', row._row, { passwordHash: hashPassword_(newPassword, salt), passwordSalt: salt });
  invalidateCache_('staff');
  logAudit_('password_set', 'admin', email, '');
  return true;
}

/** Public: exchange email + password for a session token. */
var LOGIN_MAX_FAILS_ = 5;
var LOGIN_LOCK_SECONDS_ = 900; // 15 minutes

function loginWithPassword(email, password) {
  var key = 'loginfail_' + String(email || '').toLowerCase().trim();
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get(key) || 0);
  if (fails >= LOGIN_MAX_FAILS_) throw new Error('Too many failed sign-in attempts. Wait 15 minutes and try again.');
  var failed = function () {
    cache.put(key, String(fails + 1), LOGIN_LOCK_SECONDS_);
    return new Error('Invalid email or password.');
  };
  var rows = readAll_('Users');
  var row = rows.filter(function (u) { return String(u.email).toLowerCase() === String(email).toLowerCase() && u.active !== false && u.active !== 'FALSE'; })[0];
  if (!row || !row.passwordHash) throw failed();
  var computed = hashPassword_(password, row.passwordSalt);
  if (computed !== row.passwordHash) throw failed();
  cache.remove(key);

  var token = Utilities.getUuid();
  CacheService.getUserCache().put('sess_' + token, row.email, 21600); // 6h, CacheService's max
  _currentSessionToken_ = token; // so the audit entry below records WHO logged in
  logAudit_('login', 'admin', row.email, '');
  return { token: token, email: row.email, name: row.name };
}

function logout(token) {
  if (token) CacheService.getUserCache().remove('sess_' + token);
  return true;
}

function resolveSessionEmail_(token) {
  return CacheService.getUserCache().get('sess_' + token);
}

/* ---------------- Identity ---------------- */

function currentUserEmail_() {
  if (_currentSessionToken_) {
    var email = resolveSessionEmail_(_currentSessionToken_);
    if (!email) throw new Error('SESSION_EXPIRED');
    return email;
  }
  var email = Session.getActiveUser().getEmail();
  if (!email) email = Session.getEffectiveUser().getEmail();
  return email;
}

/** Look up the current user's profile row from the Users sheet. */
function getCurrentUser() {
  var email = currentUserEmail_();
  var users = getStaffList();
  var match = users.filter(function (u) { return String(u.email).toLowerCase() === String(email).toLowerCase(); })[0];
  if (!match) {
    return { email: email, name: email, role: ROLES.STAFF, unit: '', active: true, unregistered: true };
  }
  return match;
}

/* ---------------- Permissions (sheet-backed, admin-editable) ---------------- */

function getRolePermissionsTable_() {
  return getCached_('rolePermissions', 300, function () { return readAll_('RolePermissions'); });
}

function hasPermission_(moduleKey, mode) {
  var user = getCurrentUser();
  if (user.role === ROLES.ADMIN) return true; // Admin always has full access, can't be locked out via the matrix
  var table = getRolePermissionsTable_();
  var field = mode === 'write' ? 'canWrite' : 'canRead';
  var rule = table.filter(function (r) { return r.role === user.role && r.module === moduleKey; })[0];
  if (!rule) return false;
  var v = rule[field];
  return v === true || v === 'TRUE' || v === 'true';
}

function requirePermission_(moduleKey, mode) {
  if (!hasPermission_(moduleKey, mode)) {
    var user = getCurrentUser();
    throw new Error('Access denied: role "' + user.role + '" cannot ' + mode + ' module "' + moduleKey + '".');
  }
}

/** Exposed to the client so the Nav/Admin UI can hide actions the user cannot perform. */
function getMyAccess() {
  var user = getCurrentUser();
  var access = {};
  Object.keys(PERMISSIONS).forEach(function (key) {
    access[key] = { read: hasPermission_(key, 'read'), write: hasPermission_(key, 'write') };
  });
  return { user: user, access: access, roles: ROLES };
}

/** Admin > Access Control: full matrix (all roles × all modules) for editing. */
function getAccessMatrix() {
  requirePermission_('admin', 'read');
  return { roles: Object.keys(ROLES).map(function (k) { return ROLES[k]; }), modules: Object.keys(PERMISSIONS), rows: getRolePermissionsTable_() };
}

function saveRolePermission(role, moduleKey, field, value) {
  requirePermission_('admin', 'write');
  var rows = readAll_('RolePermissions');
  var existing = rows.filter(function (r) { return r.role === role && r.module === moduleKey; })[0];
  var patch = {}; patch[field] = value;
  if (existing) {
    updateRecord_('RolePermissions', existing._row, patch);
  } else {
    var rec = { role: role, module: moduleKey, canRead: false, canWrite: false };
    rec[field] = value;
    appendRecord_('RolePermissions', rec);
  }
  invalidateCache_('rolePermissions');
  logAudit_('access_changed', 'admin', role + ':' + moduleKey, field + '=' + value);
  return true;
}

/** Admin-only: hard-remove a staff record (not just deactivate). */
function deleteUser(email) {
  requirePermission_('admin', 'write');
  var rows = readAll_('Users');
  var row = rows.filter(function (u) { return String(u.email).toLowerCase() === String(email).toLowerCase(); })[0];
  if (!row) throw new Error('No such user: ' + email);
  deleteRow_('Users', row._row);
  invalidateCache_('staff');
  logAudit_('user_deleted', 'admin', email, '');
  return true;
}

/** Admin-only: removes every staff record EXCEPT the account making the call, so
 *  an Admin can never lock themselves out by wiping their own row along with
 *  everyone else's. Deletes bottom-to-top so row numbers stay valid mid-loop. */
function deleteAllStaff() {
  requirePermission_('admin', 'write');
  var me = currentUserEmail_().toLowerCase();
  var rows = readAll_('Users').filter(function (u) { return String(u.email).toLowerCase() !== me; });
  rows.sort(function (a, b) { return b._row - a._row; }); // highest row first
  rows.forEach(function (u) { deleteRow_('Users', u._row); });
  invalidateCache_('staff');
  logAudit_('all_staff_deleted', 'admin', me, rows.length + ' record(s) removed');
  return { removed: rows.length };
}
