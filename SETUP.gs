/**
 * SETUP.gs
 * Run setupAll() once (from a blank Google Sheet, via Extensions > Apps Script)
 * to create and header every sheet the platform needs. Idempotent — safe to
 * re-run; it will not wipe existing data, only add missing sheets/headers.
 *
 * Also adds a custom "Rumbu Admin" menu to the spreadsheet UI for non-technical
 * re-runs (setup, reseed, reinstall triggers).
 */

var SHEET_SCHEMAS = {
  Users:            ['email', 'name', 'role', 'unit', 'department', 'active', 'passwordHash', 'passwordSalt'],
  Units:            ['unitId', 'name', 'location', 'scope'],
  Settings:         ['key', 'value', 'updatedAt', 'updatedBy'],

  DailyReports:     ['id', 'date', 'unit', 'department', 'staffEmail', 'staffName', 'siteVisited',
                      'activitySummary', 'isEmergency', 'emergencyDetails', 'evidenceLink', 'status', 'createdAt'],

  Incidents:        ['id', 'date', 'unit', 'department', 'reportedBy', 'category', 'description', 'severity',
                      'status', 'escalatedTo', 'escalatedAt', 'resolvedAt', 'followUpNotes', 'evidenceLink', 'createdAt'],

  Files:            ['fileRef', 'title', 'unit', 'department', 'contractId', 'companyId', 'createdAt'],
  FileMovements:    ['id', 'date', 'unit', 'fileRef', 'location', 'reportedBy', 'dailyReportId', 'createdAt'],

  Contracts:        ['id', 'unit', 'department', 'companyId', 'title', 'type', 'stage', 'requestDate',
                      'approvalDate', 'executionDate', 'closureDate', 'driveLink', 'status', 'notes', 'createdAt', 'createdBy'],

  Jobs:             ['id', 'unit', 'department', 'title', 'description', 'assignedTo', 'priority', 'status',
                      'startDate', 'dueDate', 'completedDate', 'createdAt', 'createdBy'],

  Payments:         ['id', 'unit', 'department', 'contractId', 'companyId', 'description', 'amount', 'status',
                      'dueDate', 'receivedDate', 'followUpCount', 'lastFollowUpAt', 'createdAt', 'createdBy'],

  InflowOutflow:    ['id', 'unit', 'department', 'contractId', 'companyId', 'type', 'amount', 'date',
                      'description', 'createdAt', 'createdBy'],

  Procurement:      ['id', 'unit', 'department', 'title', 'description', 'requestedBy', 'status',
                      'requestDate', 'approvalDate', 'expectedCompletion', 'createdAt'],

  Companies:        ['id', 'name', 'accountNumber', 'gifmisLinked', 'ownership', 'status', 'unit',
                      'contactPerson', 'contactPhone', 'notes', 'createdAt',
                      'serialNo', 'rcNumber', 'incorporationYear',
                      'chkTCC', 'chkPEN', 'chkITF', 'chkNSITF', 'chkBPP', 'chkAFS3', 'chkProfile'],

  CompanyPersons:   ['id', 'companyId', 'role', 'name', 'bvn', 'nin', 'address', 'email', 'phone',
                      'signatureFileId', 'passportFileId', 'updatedAt', 'updatedBy'],

  CompanyDocuments: ['id', 'companyId', 'docType', 'driveLink', 'filename', 'notes', 'uploadedAt', 'uploadedBy'],

  ContractDocuments:['id', 'contractId', 'docType', 'driveLink', 'filename', 'notes', 'uploadedAt', 'uploadedBy'],

  Projects:         ['id', 'unit', 'department', 'name', 'description', 'startDate', 'endDate',
                      'milestonesJson', 'progressPercent', 'status', 'createdAt', 'createdBy'],

  KpiTargets:       ['metric', 'unit', 'target', 'period', 'updatedAt'],

  Escalations:      ['id', 'date', 'module', 'refId', 'unit', 'reason', 'severity', 'escalatedTo',
                      'sentAt', 'acknowledged', 'acknowledgedBy', 'acknowledgedAt', 'emailStatus', 'subject', 'body'],

  RolePermissions:  ['role', 'module', 'canRead', 'canWrite'],

  // Staff and MDA Register (Contract Office specification, modules 2, 5 and 10)
  Mdas:             ['id', 'name', 'teamLeadStaffId', 'status', 'notes', 'createdAt', 'updatedAt', 'updatedBy'],
  StaffRegister:    ['staffId', 'fullName', 'jobTitle', 'systemRole', 'office', 'team', 'teamLeadStaffId', 'status',
                      'phone', 'email', 'startDate', 'exitDate', 'exitReason', 'notes', 'createdAt', 'updatedAt', 'updatedBy'],
  StaffMdaAssignments: ['id', 'staffId', 'mdaId', 'effectiveFrom', 'effectiveTo', 'reason', 'createdAt', 'createdBy'],
  HandoverNotes:    ['id', 'outgoingStaffId', 'incomingStaffId', 'mdaId', 'trigger', 'status', 'dueDate', 'createdAt', 'createdBy', 'notes'],
  States:           ['name', 'active'],
  PublicHolidays:   ['date', 'name', 'notes'],


  Attendance:       ['id', 'unit', 'staffEmail', 'staffName', 'date', 'clockInAt', 'clockOutAt', 'createdAt', 'email', 'name'],

  AuditLog:         ['id', 'timestamp', 'actor', 'action', 'module', 'refId', 'details']
};

var DEFAULT_UNITS = [
  { unitId: 'NDDC', name: 'NDDC Unit', location: 'Port Harcourt', scope: 'Niger Delta Development Commission contract & documentation activity' },
  { unitId: 'MDAS', name: 'MDAS/ Appropriation Unit', location: 'Abuja', scope: 'Ministries, Departments and Agencies contract & documentation activity' },
  { unitId: 'REVENUE', name: 'Revenue-Generating Agencies Unit', location: 'Abuja', scope: 'Agencies settled directly by the Federal Executive Council (FEC)' }
];

var DEFAULT_SETTINGS = [
  { key: 'fileStuckDaysThreshold', value: 5 },
  { key: 'jobUntouchedDaysThreshold', value: 3 },
  { key: 'jobDelayedDaysThreshold', value: 7 },
  { key: 'paymentOverdueDaysThreshold', value: 14 },
  { key: 'escalationCeoEmail', value: 'ceo@example.com' },
  { key: 'dailyReportComplianceCutoffHour', value: 17 },
  { key: 'kpiJobCompletionTargetPct', value: 85 },
  { key: 'kpiAvgTurnaroundDaysTarget', value: 10 },
  // Contract Office specification (configuration section). Stalled-file days and the
  // daily report cut-off reuse fileStuckDaysThreshold and dailyReportComplianceCutoffHour.
  { key: 'archivedReportRecoveryDays', value: 30 },
  { key: 'contactReviewDays', value: 90 },
  { key: 'locationRecordRetentionDays', value: 90 },
  { key: 'documentReminderStartDays', value: 60 },
  { key: 'documentReminderRepeatDays', value: 10 },
  { key: 'workingHoursStartHour', value: 8 },
  { key: 'workingHoursEndHour', value: 17 },
  { key: 'dailyEmailLimit', value: 90 }
];

/** Section metadata behind the Dashboard tabs, per the meeting-minutes table.
 *  Kept as data (Settings-style) so frequency/escalation targets are tunable later,
 *  not hardcoded strings in the UI. */
var DASHBOARD_SECTIONS = [
  { key: 'dailyOps',    label: 'Daily Operations',        info: 'Daily checks, site visits, activities, incidents', frequency: 'Daily',         escalatesTo: 'Department Head' },
  { key: 'jobsMon',     label: 'Jobs Monitoring',         info: 'Open, in progress, completed jobs',                frequency: 'Daily/Weekly',  escalatesTo: 'Relevant Head' },
  { key: 'payments',    label: 'Payments',                info: 'Pending, received, overdue',                       frequency: 'Daily/Weekly',  escalatesTo: 'Finance/Management' },
  { key: 'contracts',   label: 'Contracts',               info: 'Pending, active, completed',                       frequency: 'Weekly',        escalatesTo: 'Head of Contract/CEO' },
  { key: 'docs',        label: 'Documentation',           info: 'Lease & contract files, supporting docs',          frequency: 'Continuous',    escalatesTo: 'Admin/Management' },
  { key: 'procurement', label: 'Procurement',             info: 'Requests, approvals, pending',                     frequency: 'Weekly',        escalatesTo: 'Relevant Head' },
  { key: 'kpi',         label: 'KPIs',                    info: 'Performance indicators & exceptions',              frequency: 'Weekly/Monthly',escalatesTo: 'CEO/Management' },
  { key: 'complaints',  label: 'Complaints & Emergencies',info: 'Issues, incidents, actions, resolution',           frequency: 'As required',   escalatesTo: 'Immediate' }
];

function getDashboardSections() { return DASHBOARD_SECTIONS; }

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Rumbu Admin')
    .addItem('1) Run full setup (safe to re-run)', 'setupAll')
    .addItem('2) Seed sample data (optional)', 'seedSampleData')
    .addItem('3) Install daily triggers', 'installTriggers')
    .addItem('4) Register me as Admin', 'registerCurrentUserAsAdmin')
    .addItem('5) Reset my password', 'resetMyPasswordFromEditor')
    .addItem('6) Debug my login', 'debugMyLogin')
    .addItem('7) Clear caches (after editing sheets directly)', 'clearAllCaches')
    .addItem('8) Load company register (277 companies)', 'loadCompanyRegisterFromMenu')
    .addToUi();
}

function setupAll() {
  Object.keys(SHEET_SCHEMAS).forEach(function (name) {
    ensureSheet_(name, SHEET_SCHEMAS[name]);
  });
  seedDefaultsIfEmpty_();
  registerCurrentUserAsAdmin();
  SpreadsheetApp.getActive().toast('Setup complete. Sheets created/verified: ' + Object.keys(SHEET_SCHEMAS).length, 'Rumbu Contract Dept', 6);
  return 'Setup complete.';
}

function ensureSheet_(name, headers) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  var currentHeaders = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  var needsHeader = currentHeaders.join('') === '';
  if (needsHeader) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1F3864').setFontColor('#FFFFFF');
  } else {
    // Migration: this sheet already exists from an earlier run of setupAll().
    // Add any NEW columns the schema has gained since then, at the end, without
    // touching existing data. Never removes or reorders existing columns.
    var missing = headers.filter(function (h) { return currentHeaders.indexOf(h) === -1; });
    if (missing.length) {
      var startCol = sh.getLastColumn() + 1;
      sh.getRange(1, startCol, 1, missing.length).setValues([missing])
        .setFontWeight('bold').setBackground('#1F3864').setFontColor('#FFFFFF');
    }
  }
  return sh;
}

function seedDefaultsIfEmpty_() {
  if (readAll_('Units').length === 0) {
    DEFAULT_UNITS.forEach(function (u) { appendRecord_('Units', u); });
  }
  // Settings: add any key that does not exist yet. Values an Admin has set are never overwritten.
  var existingSettings = {};
  readAll_('Settings').forEach(function (r) { existingSettings[r.key] = r; });
  DEFAULT_SETTINGS.forEach(function (s) {
    if (!existingSettings[s.key]) appendRecord_('Settings', { key: s.key, value: s.value, updatedAt: nowIso_(), updatedBy: 'system' });
  });
  applySpecSettingsOnce_();
  invalidateCache_('settings');
  // RolePermissions: backfill any (role, module) pair that doesn't exist yet.
  // Deliberately NOT gated on "sheet is empty" — this makes it safe to re-run
  // setupAll() after adding a brand new module later (like Attendance) on a
  // spreadsheet that already has RolePermissions rows, without ever touching a
  // pair an Admin has since edited from Access Control.
  var existingPerms = readAll_('RolePermissions');
  var existingKeys = {};
  existingPerms.forEach(function (r) { existingKeys[r.role + '|' + r.module] = true; });
  Object.keys(PERMISSIONS).forEach(function (moduleKey) {
    Object.keys(ROLES).forEach(function (roleKey) {
      var role = ROLES[roleKey];
      if (existingKeys[role + '|' + moduleKey]) return;
      var rule = PERMISSIONS[moduleKey];
      var base = ROLE_DEFAULTS_LIKE[role] || role; // new roles start like an existing role
      var listed = function (list) { return list && (list.indexOf(role) !== -1 || list.indexOf(base) !== -1); };
      var canRead = rule.read === 'ALL' || listed(rule.read) || role === ROLES.CEO || base === ROLES.CEO || role === ROLES.ADMIN;
      var canWrite = rule.write === 'ALL' || listed(rule.write) || role === ROLES.ADMIN;
      appendRecord_('RolePermissions', { role: role, module: moduleKey, canRead: canRead, canWrite: canWrite });
    });
  });
  invalidateCache_('rolePermissions');
  seedReferenceDataIfEmpty_();
  seedRegisterIfEmpty_();
}

/** One time only: apply the specification's values to two existing settings, but only
 *  where they still hold the original defaults (5 days, 17:00). A value an Admin chose
 *  is left alone. */
function applySpecSettingsOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('specSettingsApplied_v1')) return;
  var rows = readAll_('Settings');
  var change = function (key, from, to) {
    var r = rows.filter(function (x) { return x.key === key; })[0];
    if (r && Number(r.value) === from) {
      updateRecord_('Settings', r._row, { key: key, value: to, updatedAt: nowIso_(), updatedBy: 'specification' });
    }
  };
  change('fileStuckDaysThreshold', 5, 14);           // stalled file trigger: 14 days
  change('dailyReportComplianceCutoffHour', 17, 18); // daily report cut-off: 6:00 pm WAT
  props.setProperty('specSettingsApplied_v1', nowIso_());
}

function registerCurrentUserAsAdmin() {
  var email = currentUserEmail_();
  var users = readAll_('Users');
  var existing = users.filter(function (u) { return String(u.email).toLowerCase() === email.toLowerCase(); })[0];
  if (existing) return 'Already registered as ' + existing.role;
  var salt = genSalt_();
  var tempPassword = 'rumbu' + Math.floor(1000 + Math.random() * 9000);
  appendRecord_('Users', {
    email: email, name: email.split('@')[0], role: 'Admin', unit: '', department: '', active: true,
    passwordHash: hashPassword_(tempPassword, salt), passwordSalt: salt
  });
  invalidateCache_('staff');
  try {
    SpreadsheetApp.getUi().alert('Admin account created', email + '\n\nTemporary password: ' + tempPassword + '\n\nChange it now from Admin > Users & Roles once you\'re in the app.', SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { /* running from the script editor, not the sheet UI — no dialog available, that's fine */ }
  return 'Registered ' + email + ' as Admin. Temporary password: ' + tempPassword;
}

/** Run this any time you need your own login password (new admin, or an existing
 *  admin/staff account created before passwords existed, or you just forgot it).
 *  Works whether or not you already have a Users row — creates one as Admin if
 *  you don't, otherwise resets the password on your existing row and keeps your
 *  existing role/unit/department as they are. Always shows the new password in a
 *  dialog box since you can't be "logged in" to see it any other way. */
function resetMyPasswordFromEditor() {
  var email = currentUserEmail_();
  var users = readAll_('Users');
  var existing = users.filter(function (u) { return String(u.email).toLowerCase() === email.toLowerCase(); })[0];
  var salt = genSalt_();
  var tempPassword = 'rumbu' + Math.floor(1000 + Math.random() * 9000);
  if (existing) {
    updateRecord_('Users', existing._row, { passwordHash: hashPassword_(tempPassword, salt), passwordSalt: salt, active: true });
  } else {
    appendRecord_('Users', { email: email, name: email.split('@')[0], role: 'Admin', unit: '', department: '', active: true, passwordHash: hashPassword_(tempPassword, salt), passwordSalt: salt });
  }
  invalidateCache_('staff');
  var message = email + '\n\nNew password: ' + tempPassword + '\n\nUse this on the login screen, then change it from Admin > Users & Roles once you\'re in.';
  try {
    SpreadsheetApp.getUi().alert('Password reset', message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    Logger.log(message); // running from the Apps Script editor's Run button — check View > Logs (Ctrl+Enter) for the password
  }
  return 'New password for ' + email + ': ' + tempPassword;
}

/** Shows exactly what's stored for your account, with zero dependency on the web
 *  app, deployments, or caching — for when login keeps failing and you need to
 *  see the raw truth instead of guessing. Never shows the password or hash
 *  itself, only whether the fields are populated. */
function debugMyLogin() {
  var email = currentUserEmail_();
  var users = readAll_('Users');
  var row = users.filter(function (u) { return String(u.email).toLowerCase() === email.toLowerCase(); })[0];
  var lines;
  if (!row) {
    lines = 'No row found for "' + email + '" in the Users sheet at all.\n\n' +
      'Run "5) Reset my password" — it will create one for you.';
  } else {
    lines =
      'Row found for: ' + row.email + ' (row ' + row._row + ')\n' +
      'Exact stored email: "' + row.email + '"  ← check this matches what you type EXACTLY (case, spaces, domain)\n' +
      'Role: ' + row.role + '\n' +
      'Active: ' + row.active + '  ← must not be FALSE\n' +
      'passwordHash set: ' + (row.passwordHash ? 'YES (' + String(row.passwordHash).length + ' chars — should be 64)' : 'NO — this is why login fails') + '\n' +
      'passwordSalt set: ' + (row.passwordSalt ? 'YES' : 'NO — this is why login fails, even if passwordHash looks set') + '\n\n' +
      (row.passwordHash && row.passwordSalt
        ? 'Both are set. If login still fails: (1) you may be testing an old deployment — use Deploy > Test deployments, or redeploy a new version; (2) retype the password manually instead of trusting browser autofill; (3) run "5) Reset my password" again for a fresh one and use it immediately.'
        : 'Run "5) Reset my password" now — that sets both fields correctly.');
  }
  try {
    SpreadsheetApp.getUi().alert('Login debug — ' + email, lines, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    Logger.log(lines);
  }
  return lines;
}

/** For whenever you edit Units, Users, Settings, or RolePermissions directly
 *  in the spreadsheet instead of through the app — those reads are cached
 *  for speed (up to 10 minutes), so a direct sheet edit can take a while to
 *  show up otherwise. Run this to make it show up immediately. Nothing here
 *  touches your data — it only clears the app's temporary memory of it. */
function clearAllCaches() {
  ['units', 'staff', 'settings', 'rolePermissions'].forEach(function (key) { invalidateCache_(key); });
  var message = 'Caches cleared. Reload the web app — any direct sheet edits (unit names, staff, settings, access control) will show up immediately now.';
  try {
    SpreadsheetApp.getUi().alert('Caches cleared', message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    Logger.log(message);
  }
  return message;
}

/** Optional: populate every sheet with a handful of realistic rows so the
 *  dashboard is never empty on first run. Safe to run multiple times; it
 *  only adds rows, it does not dedupe, so avoid running it repeatedly in production. */
function seedSampleData() {
  var units = ['NDDC', 'MDAS', 'REVENUE'];
  var depts = { NDDC: ['Dredging', 'Erosion Control', 'Roads'], MDAS: ['Ministry of Works', 'Ministry of Health', 'FCTA'], REVENUE: ['NIMASA', 'NPA', 'FIRS'] };
  var staff = ['a.bello@rumbu.example', 'c.okafor@rumbu.example', 'f.suleiman@rumbu.example'];
  var staffRoles = ['Unit Head - NDDC', 'Unit Head - MDAs', 'Staff/Officer'];
  var existingEmails = readAll_('Users').map(function (u) { return String(u.email).toLowerCase(); });
  staff.forEach(function (email, i) {
    if (existingEmails.indexOf(email.toLowerCase()) !== -1) return;
    var salt = genSalt_();
    appendRecord_('Users', {
      email: email, name: email.split('@')[0].replace('.', ' '), role: staffRoles[i], unit: units[i], department: '',
      active: true, passwordHash: hashPassword_('password123', salt), passwordSalt: salt
    });
  });
  invalidateCache_('staff');
  var companies = [];
  for (var i = 1; i <= 6; i++) {
    var cid = genId_('CO');
    companies.push(cid);
    appendRecord_('Companies', {
      id: cid, name: 'Contractor Nigeria Ltd ' + i, accountNumber: (i % 2 === 0) ? ('00' + i + '1122334') : '',
      gifmisLinked: i % 3 !== 0, ownership: 'Private', status: i % 4 === 0 ? 'Pending' : 'Active',
      unit: units[i % 3], contactPerson: 'Contact Person ' + i, contactPhone: '080' + (10000000 + i),
      notes: '', createdAt: nowIso_()
    });
  }
  var contractIds = [];
  for (var j = 1; j <= 8; j++) {
    var unit = units[j % 3];
    var stageOptions = ['request', 'approval', 'execution', 'reporting', 'closure'];
    var cid2 = genId_('CT');
    contractIds.push(cid2);
    appendRecord_('Contracts', {
      id: cid2, unit: unit, department: depts[unit][j % 3], companyId: companies[j % companies.length],
      title: 'Contract for ' + depts[unit][j % 3] + ' Project ' + j, type: j % 5 === 0 ? 'lease' : 'contract',
      stage: stageOptions[j % 5], requestDate: daysAgoDate_(30 - j), approvalDate: j % 5 >= 1 ? daysAgoDate_(25 - j) : '',
      executionDate: j % 5 >= 2 ? daysAgoDate_(18 - j) : '', closureDate: j % 5 === 4 ? daysAgoDate_(2) : '',
      driveLink: '', status: j % 5 === 4 ? 'Closed' : 'Active', notes: '', createdAt: nowIso_(), createdBy: staff[j % 3]
    });
    appendRecord_('Files', { fileRef: 'FILE-' + cid2, title: 'File for ' + cid2, unit: unit, department: depts[unit][j % 3], contractId: cid2, companyId: companies[j % companies.length], createdAt: nowIso_() });
  }
  var locations = ['With Officer', 'MDA Registry', 'Head of Contract Desk', 'Filed', 'In Transit'];
  for (var k = 1; k <= 8; k++) {
    var fr = 'FILE-' + contractIds[k - 1];
    appendRecord_('FileMovements', { id: genId_('FM'), date: daysAgoDate_(k), unit: units[k % 3], fileRef: fr, location: locations[k % locations.length], reportedBy: staff[k % 3], dailyReportId: '', createdAt: nowIso_() });
  }
  for (var m = 0; m < 10; m++) {
    var u2 = units[m % 3];
    var isEmergency = m === 9;
    appendRecord_('DailyReports', {
      id: genId_('DR'), date: daysAgoDate_(m), unit: u2, department: depts[u2][m % 3], staffEmail: staff[m % 3], staffName: staff[m % 3].split('@')[0],
      siteVisited: depts[u2][m % 3] + ' Site', activitySummary: 'Routine monitoring and file review completed.',
      isEmergency: isEmergency, emergencyDetails: isEmergency ? 'Flooding reported at site, escalated to unit head.' : '',
      evidenceLink: '', status: 'Submitted', createdAt: nowIso_()
    });
  }
  appendRecord_('Incidents', { id: genId_('INC'), date: daysAgoDate_(0), unit: 'NDDC', department: 'Erosion Control', reportedBy: staff[0], category: 'Emergency', description: 'Flooding at project site threatening completed works.', severity: 'High', status: 'Open', escalatedTo: '', escalatedAt: '', resolvedAt: '', followUpNotes: '', evidenceLink: '', createdAt: nowIso_() });
  appendRecord_('Incidents', { id: genId_('INC'), date: daysAgoDate_(4), unit: 'MDAS', department: 'Ministry of Works', reportedBy: staff[1], category: 'Complaint', description: 'Contractor delay complaint from MDA liaison.', severity: 'Medium', status: 'In Review', escalatedTo: '', escalatedAt: '', resolvedAt: '', followUpNotes: 'Follow-up call scheduled.', evidenceLink: '', createdAt: nowIso_() });

  for (var p = 1; p <= 10; p++) {
    var u3 = units[p % 3];
    var status = ['Untouched', 'In Progress', 'In Progress', 'Completed'][p % 4];
    appendRecord_('Jobs', {
      id: genId_('JOB'), unit: u3, department: depts[u3][p % 3], title: 'Job ' + p + ': ' + depts[u3][p % 3] + ' follow-up',
      description: 'Standard job description for job ' + p, assignedTo: staff[p % 3], priority: p % 5 === 0 ? 'High' : 'Normal',
      status: status, startDate: status === 'Untouched' ? '' : daysAgoDate_(10 - p), dueDate: daysAgoDate_(-5 + p),
      completedDate: status === 'Completed' ? daysAgoDate_(1) : '', createdAt: nowIso_(), createdBy: staff[p % 3]
    });
  }

  for (var q = 1; q <= 8; q++) {
    var u4 = units[q % 3];
    var pstatus = ['Pending', 'Received', 'Completed', 'Pending'][q % 4];
    appendRecord_('Payments', {
      id: genId_('PAY'), unit: u4, department: depts[u4][q % 3], contractId: contractIds[q % contractIds.length], companyId: companies[q % companies.length],
      description: 'Payment tranche ' + q, amount: 500000 * q, status: pstatus,
      dueDate: daysAgoDate_(20 - q * 2), receivedDate: pstatus === 'Received' || pstatus === 'Completed' ? daysAgoDate_(2) : '',
      followUpCount: pstatus === 'Pending' ? q % 3 : 0, lastFollowUpAt: '', createdAt: nowIso_(), createdBy: staff[q % 3]
    });
  }

  for (var r = 1; r <= 6; r++) {
    var u5 = units[r % 3];
    appendRecord_('InflowOutflow', { id: genId_('IO'), unit: u5, department: depts[u5][r % 3], contractId: contractIds[r % contractIds.length], companyId: companies[r % companies.length], type: r % 2 === 0 ? 'Inflow' : 'Outflow', amount: 250000 * r, date: daysAgoDate_(r * 2), description: 'Transaction ' + r, createdAt: nowIso_(), createdBy: staff[r % 3] });
  }

  for (var s = 1; s <= 5; s++) {
    var u6 = units[s % 3];
    appendRecord_('Procurement', { id: genId_('PR'), unit: u6, department: depts[u6][s % 3], title: 'Procurement request ' + s, description: 'Office/field equipment request ' + s, requestedBy: staff[s % 3], status: ['Requested', 'Approved', 'Pending', 'Completed'][s % 4], requestDate: daysAgoDate_(15 - s), approvalDate: s % 4 >= 1 ? daysAgoDate_(10 - s) : '', expectedCompletion: daysAgoDate_(-5), createdAt: nowIso_() });
  }

  for (var t = 1; t <= 4; t++) {
    var u7 = units[t % 3];
    appendRecord_('Projects', { id: genId_('PRJ'), unit: u7, department: depts[u7][t % 3], name: 'Project Plan ' + t, description: 'Multi-phase project plan ' + t, startDate: daysAgoDate_(60), endDate: daysAgoDate_(-60), milestonesJson: JSON.stringify([{ name: 'Kickoff', done: true }, { name: 'Mid-review', done: t % 2 === 0 }, { name: 'Closeout', done: false }]), progressPercent: 30 * t > 100 ? 100 : 30 * t, status: 'Active', createdAt: nowIso_(), createdBy: staff[t % 3] });
  }

  KPI_METRICS.forEach(function (metric) {
    units.forEach(function (u) {
      var existing = readAll_('KpiTargets').filter(function (k) { return k.metric === metric.key && k.unit === u; });
      if (!existing.length) appendRecord_('KpiTargets', { metric: metric.key, unit: u, target: metric.defaultTarget, period: 'Monthly', updatedAt: nowIso_() });
    });
  });

  SpreadsheetApp.getActive().toast('Sample data seeded.', 'Rumbu Contract Dept', 5);
  return 'Sample data seeded.';
}

function daysAgoDate_(n) {
  var d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
