/**
 * Register.gs  Staff and MDA Register (Contract Office modules 2 and 5)
 *
 * Sheets: StaffRegister (one row per person or vacancy), Mdas, StaffMdaAssignments
 * (dated MDA assignments: active on day D when effectiveFrom <= D < effectiveTo),
 * HandoverNotes (opened automatically; the full handover form is a later phase).
 *
 * Login accounts stay in the existing Users sheet. A register record with an email
 * creates or updates its Users row automatically; exiting a staff member disables
 * that login. Existing Admin accounts are never downgraded by the register.
 */

var STAFF_OFFICES = ['Head Office', 'Port Harcourt'];
var STAFF_TEAMS = ['Head Office', 'Documentation', 'Follow-Up', 'Emergency', 'Project Analysis'];
var STAFF_EDIT_STATUSES = ['Active', 'On leave'];          // set from the edit form; Exited only via exitStaff
var REGISTER_PHONE_COLS_ = ['phone'];

function ensureRegisterSchema_() {
  var cache = CacheService.getScriptCache();
  if (cache.get('registerSchemaOk')) return;
  ['Mdas', 'StaffRegister', 'StaffMdaAssignments', 'HandoverNotes', 'States', 'PublicHolidays'].forEach(function (n) {
    ensureSheet_(n, SHEET_SCHEMAS[n]);
  });
  var sh = sheet_('StaffRegister');
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  REGISTER_PHONE_COLS_.forEach(function (c) {
    var col = headers.indexOf(c);
    if (col !== -1) sh.getRange(2, col + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  });
  cache.put('registerSchemaOk', '1', 3600);
}

/* ---------------- who is acting ---------------- */

function registerActor_() {
  var user = getCurrentUser();
  var email = String(user.email || '').toLowerCase();
  var me = readAll_('StaffRegister').filter(function (s) { return email && String(s.email).toLowerCase() === email; })[0] || null;
  var role = user.role;
  return {
    user: user, staff: me,
    isAdmin: role === ROLES.ADMIN,
    isHoco: role === ROLES.HEAD_OF_CONTRACT,
    isAH: role === ROLES.ASSISTANT_HEAD,
    isHeadPh: role === ROLES.HEAD_PH
  };
}

/** Module 5: Head of Contract Office and Assistant Head for all staff; Head of PH Unit for PH staff only. */
function canManageStaff_(actor, office) {
  if (actor.isAdmin || actor.isHoco || actor.isAH) return true;
  return actor.isHeadPh && office === 'Port Harcourt';
}
function canManageMdas_(actor) { return actor.isAdmin || actor.isHoco || actor.isAH; }
/** Only Admin and the Head of Contract Office may give anyone a role other than Staff/Officer. */
function canAssignRole_(actor, role) { return role === ROLES.STAFF || actor.isAdmin || actor.isHoco; }

/* ---------------- helpers ---------------- */

function todayKey_register_() { return dateKey_(new Date()); }

function isActiveOn_(a, day) {
  var from = dateKey_(a.effectiveFrom), to = dateKey_(a.effectiveTo);
  return from <= day && (!to || day < to);
}

function validDateKey_(v) {
  var k = dateKey_(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(k) && !isNaN(new Date(k + 'T12:00:00').getTime()) ? k : '';
}

function normName_(s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); }
function normPhone_(s) { var d = String(s || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : d; }

function nextStaffId_(rows) {
  var max = rows.reduce(function (m, r) { var n = Number(String(r.staffId).replace(/\D/g, '')); return n > m ? n : m; }, 0);
  return 'STF-' + ('00' + (max + 1)).slice(-3);
}

function staffWorking_(s) { return s && (s.status === 'Active' || s.status === 'On leave'); }

/** Writes a StaffRegister row with the phone column forced to plain text (keeps the leading 0). */
function writeStaffRow_(rowNum, record) {
  var sh = sheet_('StaffRegister');
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  if (!rowNum) {
    rowNum = Math.max(sh.getLastRow(), 1) + 1;
    if (rowNum > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 20);
  }
  headers.forEach(function (h, i) { if (REGISTER_PHONE_COLS_.indexOf(h) !== -1) sh.getRange(rowNum, i + 1).setNumberFormat('@'); });
  updateRecord_('StaffRegister', rowNum, record);
  return rowNum;
}

/* ---------------- read ---------------- */

function getRegister() {
  requirePermission_('register', 'read');
  ensureRegisterSchema_();
  var actor = registerActor_();
  var today = todayKey_register_();
  var staff = readAll_('StaffRegister');
  var mdas = readAll_('Mdas');
  var asg = readAll_('StaffMdaAssignments');
  var handovers = readAll_('HandoverNotes');
  var byId = {}; staff.forEach(function (s) { byId[s.staffId] = s; });
  var nameOf = function (id) { return id && byId[id] ? byId[id].fullName : ''; };

  var staffOut = staff.map(function (s) {
    var mine = asg.filter(function (a) { return a.staffId === s.staffId; });
    var current = mine.filter(function (a) { return isActiveOn_(a, today); }).map(function (a) { return a.mdaId; });
    var scheduled = mine.filter(function (a) { return dateKey_(a.effectiveFrom) > today; })
      .map(function (a) { return { mdaId: a.mdaId, from: dateKey_(a.effectiveFrom) }; });
    var missing = [];
    if (s.status !== 'Vacant' && s.status !== 'Exited') {
      [['jobTitle', 'Role'], ['office', 'Unit'], ['team', 'Team'], ['teamLeadStaffId', 'Team Lead'], ['phone', 'Phone'], ['email', 'Email'], ['startDate', 'Start date']]
        .forEach(function (p) { if (!s[p[0]] && !(p[0] === 'teamLeadStaffId' && s.systemRole === ROLES.HEAD_OF_CONTRACT)) missing.push(p[1]); });
      if (!current.length) missing.push('Assigned MDAs');
    }
    return Object.assign({}, s, {
      phone: s.phone === undefined || s.phone === null ? '' : String(s.phone),
      startDate: dateKey_(s.startDate), exitDate: dateKey_(s.exitDate),
      teamLeadName: nameOf(s.teamLeadStaffId), currentMdas: current, scheduledMdas: scheduled,
      history: mine.map(function (a) { return { mdaId: a.mdaId, from: dateKey_(a.effectiveFrom), to: dateKey_(a.effectiveTo), reason: a.reason }; }),
      missing: missing, canManage: s.status !== 'Exited' ? canManageStaff_(actor, s.office) : (actor.isAdmin || actor.isHoco)
    });
  });

  var mdaOut = mdas.map(function (m) {
    var officers = asg.filter(function (a) { return a.mdaId === m.id && isActiveOn_(a, today) && staffWorking_(byId[a.staffId]); })
      .map(function (a) { return { staffId: a.staffId, name: nameOf(a.staffId), office: byId[a.staffId].office }; });
    return Object.assign({}, m, { teamLeadName: nameOf(m.teamLeadStaffId), officers: officers, noOfficer: officers.length === 0, noTeamLead: !m.teamLeadStaffId });
  });

  return {
    staff: staffOut, mdas: mdaOut,
    handovers: handovers.map(function (h) { return Object.assign({}, h, { dueDate: dateKey_(h.dueDate), outgoingName: nameOf(h.outgoingStaffId), incomingName: nameOf(h.incomingStaffId) }); }),
    options: {
      offices: STAFF_OFFICES, teams: STAFF_TEAMS, editStatuses: STAFF_EDIT_STATUSES,
      systemRoles: Object.keys(ROLES).map(function (k) { return ROLES[k]; }).filter(function (r) { return r !== ROLES.ADMIN; })
    },
    actor: {
      canAdd: actor.isAdmin || actor.isHoco || actor.isAH || actor.isHeadPh,
      phOnly: !(actor.isAdmin || actor.isHoco || actor.isAH) && actor.isHeadPh,
      canManageMdas: canManageMdas_(actor),
      canAssignRoles: actor.isAdmin || actor.isHoco
    },
    today: today
  };
}

/* ---------------- plan a change (shared by preview and save) ---------------- */

/**
 * mode: 'add' | 'edit' | 'exit'
 * record (add/edit): staffId (edit), fullName, jobTitle, systemRole, office, team, teamLeadStaffId,
 *                    status (edit), phone, email, startDate, notes, mdaIds [..]
 * opts: effectiveDate, covers {mdaId: staffId}, fillVacancyId, exitDate, exitReason, confirmed
 */
function planStaffChange_(mode, record, opts) {
  ensureRegisterSchema_();
  opts = opts || {}; record = record || {};
  var actor = registerActor_();
  var staff = readAll_('StaffRegister');
  var mdas = readAll_('Mdas');
  var asg = readAll_('StaffMdaAssignments');
  var byId = {}; staff.forEach(function (s) { byId[s.staffId] = s; });
  var mdaById = {}; mdas.forEach(function (m) { mdaById[m.id] = m; });
  var errors = [], warnings = [], duplicates = [];
  var plan = { mode: mode, errors: errors, warnings: warnings, duplicates: duplicates, orphanedMdas: [], removedMdas: [], addedMdas: [], summary: [] };

  var target = null;
  if (mode === 'edit' || mode === 'exit') {
    target = byId[record.staffId];
    if (!target) { errors.push('Staff record not found: ' + record.staffId); return plan; }
    if (target.status === 'Vacant') { errors.push('This is a vacant position. Use "Fill vacancy" instead.'); return plan; }
    if (target.status === 'Exited' && !(actor.isAdmin || actor.isHoco)) { errors.push('This staff member has exited. Only Admin or the Head of Contract Office can change the record.'); return plan; }
  }
  if (mode === 'add' && opts.fillVacancyId) {
    var vac = byId[opts.fillVacancyId];
    if (!vac || vac.status !== 'Vacant') { errors.push('Vacancy not found or already filled.'); return plan; }
    plan.vacancy = vac;
  }
  plan.target = target;

  if (mode === 'exit') {
    if (!canManageStaff_(actor, target.office)) { errors.push('You cannot exit staff of the ' + target.office + ' unit.'); return plan; }
    if (target.status === 'Exited') { errors.push(target.fullName + ' has already exited.'); return plan; }
    var exitDate = validDateKey_(opts.exitDate);
    if (!exitDate) errors.push('Exit date is required.');
    if (!String(opts.exitReason || '').trim()) errors.push('Exit reason is required.');
    plan.effectiveDate = exitDate;
    var curr = asg.filter(function (a) { return a.staffId === target.staffId && (!a.effectiveTo || dateKey_(a.effectiveTo) > exitDate); });
    plan.removedMdas = curr.map(function (a) { return a.mdaId; }).filter(function (v, i, arr) { return arr.indexOf(v) === i; });
    plan.clean = { staffId: target.staffId };
  } else {
    // ---- clean and validate fields ----
    var c = {
      fullName: String(record.fullName || '').replace(/\s+/g, ' ').trim(),
      jobTitle: String(record.jobTitle || '').trim(),
      systemRole: record.systemRole || ROLES.STAFF,
      office: record.office || '', team: record.team || '',
      teamLeadStaffId: record.teamLeadStaffId || '',
      phone: String(record.phone || '').trim(),
      email: String(record.email || '').trim().toLowerCase(),
      startDate: record.startDate ? validDateKey_(record.startDate) : '',
      notes: String(record.notes || '').trim(),
      status: mode === 'add' ? 'Active' : (STAFF_EDIT_STATUSES.indexOf(record.status) !== -1 ? record.status : (target.status === 'Exited' ? 'Exited' : 'Active'))
    };
    var mdaIds = (record.mdaIds || []).filter(function (v, i, arr) { return v && arr.indexOf(v) === i; });

    if (STAFF_OFFICES.indexOf(c.office) === -1) errors.push('Unit must be Head Office or Port Harcourt.');
    if (c.team && STAFF_TEAMS.indexOf(c.team) === -1) errors.push('Unknown team: ' + c.team);
    if (!canManageStaff_(actor, c.office) || (target && !canManageStaff_(actor, target.office))) {
      errors.push('You can only add or edit staff of the Port Harcourt unit.');
    }
    var validRoles = Object.keys(ROLES).map(function (k) { return ROLES[k]; }).filter(function (r) { return r !== ROLES.ADMIN; });
    if (validRoles.indexOf(c.systemRole) === -1) errors.push('Unknown system role: ' + c.systemRole);
    var roleChanged = !target || target.systemRole !== c.systemRole;
    if (roleChanged && !canAssignRole_(actor, c.systemRole)) errors.push('Only Admin or the Head of Contract Office can give the role "' + c.systemRole + '".');
    if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) errors.push('Email address is not valid.');
    if (c.phone && !/^[+]?[\d\s-]{7,20}$/.test(c.phone)) errors.push('Phone number is not valid.');
    if (record.startDate && !c.startDate) errors.push('Start date is not a valid date.');
    mdaIds.forEach(function (m) {
      if (!mdaById[m]) errors.push('Unknown MDA: ' + m);
      else if (mdaById[m].status === 'Inactive') errors.push('MDA ' + m + ' is inactive.');
    });
    if (c.teamLeadStaffId) {
      var tl = byId[c.teamLeadStaffId];
      if (!tl || !staffWorking_(tl)) errors.push('Team Lead must be an active staff member.');
      else if (target && tl.staffId === target.staffId) errors.push('A staff member cannot be their own Team Lead.');
    }
    if (mode === 'add') {
      var missing = [];
      [['fullName', 'Full name'], ['jobTitle', 'Role'], ['office', 'Unit'], ['team', 'Team'], ['teamLeadStaffId', 'Team Lead'],
       ['phone', 'Phone'], ['email', 'Email'], ['startDate', 'Start date']].forEach(function (p) { if (!c[p[0]]) missing.push(p[1]); });
      if (!mdaIds.length) missing.push('Assigned MDAs (at least one)');
      if (missing.length) errors.push('Required: ' + missing.join(', ') + '.');
    } else if (!c.fullName) {
      errors.push('Full name is required.');
    }

    // ---- duplicates: email blocks (it is the login); name or phone only warns ----
    var selfId = target ? target.staffId : (plan.vacancy ? plan.vacancy.staffId : '');
    staff.forEach(function (s) {
      if (s.staffId === selfId || s.status === 'Vacant') return;
      if (c.email && String(s.email).toLowerCase() === c.email) errors.push('Email ' + c.email + ' is already used by ' + s.fullName + ' (' + s.staffId + ').');
      var why = [];
      if (c.fullName && normName_(s.fullName) === normName_(c.fullName)) why.push('same name');
      if (c.phone && normPhone_(s.phone) && normPhone_(s.phone) === normPhone_(c.phone)) why.push('same phone');
      if (why.length) duplicates.push({ staffId: s.staffId, fullName: s.fullName, status: s.status, why: why.join(', ') });
    });
    if (c.email) {
      var u = readAll_('Users').filter(function (x) { return String(x.email).toLowerCase() === c.email; })[0];
      var linked = staff.filter(function (s) { return String(s.email).toLowerCase() === c.email; })[0];
      if (u && !linked && u.role === ROLES.ADMIN) warnings.push(c.email + ' is an existing Admin login. It will stay Admin.');
    }

    // ---- MDA changes ----
    var eff = mode === 'add' ? (c.startDate || todayKey_register_()) : validDateKey_(opts.effectiveDate || todayKey_register_());
    if (!eff) errors.push('Effective date is not a valid date.');
    plan.effectiveDate = eff;
    var currentIds = [];
    if (target) {
      currentIds = asg.filter(function (a) { return a.staffId === target.staffId && (!a.effectiveTo || dateKey_(a.effectiveTo) > eff); })
        .map(function (a) { return a.mdaId; }).filter(function (v, i, arr) { return arr.indexOf(v) === i; });
    }
    plan.addedMdas = mdaIds.filter(function (m) { return currentIds.indexOf(m) === -1; });
    plan.removedMdas = currentIds.filter(function (m) { return mdaIds.indexOf(m) === -1; });
    if (target && target.status === 'Exited' && plan.addedMdas.length) errors.push('An exited staff member cannot be given MDAs.');
    plan.clean = c; plan.mdaIds = mdaIds;
  }

  // ---- MDAs left with no officer need a cover officer (module 5c) ----
  var covers = opts.covers || {};
  var leavingId = target ? target.staffId : '';
  plan.removedMdas.forEach(function (m) {
    var others = asg.filter(function (a) {
      return a.mdaId === m && a.staffId !== leavingId && staffWorking_(byId[a.staffId]) && isActiveOn_(a, plan.effectiveDate || todayKey_register_());
    });
    if (others.length) return;
    var cov = covers[m];
    if (!cov) { plan.orphanedMdas.push({ id: m, name: mdaById[m] ? mdaById[m].name : m }); return; }
    if (!byId[cov] || !staffWorking_(byId[cov]) || cov === leavingId) errors.push('Cover officer for ' + m + ' must be another active staff member.');
  });
  if (plan.orphanedMdas.length) errors.push('Choose a cover officer for: ' + plan.orphanedMdas.map(function (o) { return o.id; }).join(', ') + '. Each would have no assigned officer.');

  // ---- consequences worth warning about ----
  if (target && (mode === 'exit' || (plan.clean && plan.clean.status !== 'Active'))) {
    var leadOf = mdas.filter(function (m) { return m.teamLeadStaffId === target.staffId; }).map(function (m) { return m.id; });
    if (mode === 'exit' && leadOf.length) warnings.push(target.fullName + ' is Team Lead of ' + leadOf.join(', ') + '. The Team Lead will be cleared, so reviews go to the Assistant Head until a new one is set.');
    var reports = staff.filter(function (s) { return s.teamLeadStaffId === target.staffId && staffWorking_(s); });
    if (mode === 'exit' && reports.length) warnings.push(reports.length + ' staff have ' + target.fullName + ' as their Team Lead. Update them after this exit.');
  }
  if (plan.removedMdas.length) warnings.push('A handover note will be opened for: ' + plan.removedMdas.join(', ') + '.');

  // ---- confirmation summary (module 5b) ----
  var s = plan.summary;
  if (mode === 'exit') {
    s.push(['Action', 'Exit staff member'], ['Staff', target.fullName + ' (' + target.staffId + ')'], ['Exit date', plan.effectiveDate || ''],
      ['Reason', String(opts.exitReason || '')], ['MDAs ended', plan.removedMdas.join(', ') || 'None'], ['Login', target.email ? 'Disabled' : 'No login']);
  } else {
    var c2 = plan.clean;
    s.push(['Action', mode === 'add' ? (plan.vacancy ? 'Fill vacancy ' + plan.vacancy.staffId : 'Add staff member') : 'Update ' + target.staffId],
      ['Full name', c2.fullName], ['Role', c2.jobTitle], ['System role', c2.systemRole], ['Unit', c2.office], ['Team', c2.team],
      ['Team Lead', c2.teamLeadStaffId && byId[c2.teamLeadStaffId] ? byId[c2.teamLeadStaffId].fullName : 'None'],
      ['Phone', c2.phone], ['Email', c2.email], ['Start date', c2.startDate], ['Status', c2.status],
      ['Assigned MDAs', (plan.mdaIds || []).join(', ') || 'None']);
    if (mode === 'edit' && (plan.addedMdas.length || plan.removedMdas.length)) {
      s.push(['MDA change effective', plan.effectiveDate], ['MDAs added', plan.addedMdas.join(', ') || 'None'], ['MDAs removed', plan.removedMdas.join(', ') || 'None']);
    }
  }
  Object.keys(covers).forEach(function (m) { if (covers[m] && byId[covers[m]]) s.push(['Cover for ' + m, byId[covers[m]].fullName]); });
  return plan;
}

function publicPlan_(p) {
  return { errors: p.errors, warnings: p.warnings, duplicates: p.duplicates, orphanedMdas: p.orphanedMdas, summary: p.summary,
    addedMdas: p.addedMdas, removedMdas: p.removedMdas, effectiveDate: p.effectiveDate };
}

/** Step 1 of every add/edit/exit: shows the summary, duplicates and warnings. Writes nothing. */
function previewStaffChange(mode, record, opts) {
  requirePermission_('register', 'write');
  if (['add', 'edit', 'exit'].indexOf(mode) === -1) throw new Error('Unknown action: ' + mode);
  return publicPlan_(planStaffChange_(mode, record, opts));
}

/* ---------------- write ---------------- */

function applyPlan_(plan, opts) {
  var now = nowIso_(); var actorEmail = currentUserEmail_();
  var eff = plan.effectiveDate;
  var covers = opts.covers || {};
  var staffId;

  if (plan.mode === 'exit') {
    staffId = plan.target.staffId;
    writeStaffRow_(plan.target._row, { status: 'Exited', exitDate: eff, exitReason: String(opts.exitReason).trim(), updatedAt: now, updatedBy: actorEmail });
    readAll_('Mdas').filter(function (m) { return m.teamLeadStaffId === staffId; }).forEach(function (m) {
      updateRecord_('Mdas', m._row, { teamLeadStaffId: '', updatedAt: now, updatedBy: actorEmail });
    });
  } else if (plan.mode === 'add') {
    var c = plan.clean;
    var rec = Object.assign({}, c, { updatedAt: now, updatedBy: actorEmail });
    if (plan.vacancy) {
      staffId = plan.vacancy.staffId;
      rec.notes = (rec.notes ? rec.notes + ' ' : '') + 'Filled vacancy on ' + dateKey_(new Date()) + '.';
      writeStaffRow_(plan.vacancy._row, rec);
    } else {
      staffId = nextStaffId_(readAll_('StaffRegister'));
      rec.staffId = staffId; rec.createdAt = now;
      writeStaffRow_(null, rec);
    }
  } else {
    staffId = plan.target.staffId;
    writeStaffRow_(plan.target._row, Object.assign({}, plan.clean, { updatedAt: now, updatedBy: actorEmail }));
  }

  // end removed assignments on the effective date; drop ones that had not started yet
  readAll_('StaffMdaAssignments').filter(function (a) {
    return a.staffId === staffId && plan.removedMdas.indexOf(a.mdaId) !== -1 && (!a.effectiveTo || dateKey_(a.effectiveTo) > eff);
  }).forEach(function (a) {
    var from = dateKey_(a.effectiveFrom);
    updateRecord_('StaffMdaAssignments', a._row, { id: a.id, effectiveTo: from > eff ? from : eff, reason: (a.reason ? a.reason + '; ' : '') + (plan.mode === 'exit' ? 'Exit' : 'Removed') + ' ' + eff });
  });
  plan.addedMdas.forEach(function (m) {
    appendRecord_('StaffMdaAssignments', { id: genId_('ASG'), staffId: staffId, mdaId: m, effectiveFrom: eff, effectiveTo: '', reason: plan.mode === 'add' ? 'Start' : 'Assigned', createdAt: now, createdBy: actorEmail });
  });
  plan.removedMdas.forEach(function (m) {
    var cov = covers[m];
    if (cov) appendRecord_('StaffMdaAssignments', { id: genId_('ASG'), staffId: cov, mdaId: m, effectiveFrom: eff, effectiveTo: '', reason: 'Cover for ' + staffId, createdAt: now, createdBy: actorEmail });
    appendRecord_('HandoverNotes', { id: genId_('HND'), outgoingStaffId: staffId, incomingStaffId: cov || '', mdaId: m,
      trigger: plan.mode === 'exit' ? 'Exit' : 'MDA change', status: 'Open', dueDate: eff, createdAt: now, createdBy: actorEmail, notes: '' });
  });

  var fresh = readAll_('StaffRegister').filter(function (s) { return s.staffId === staffId; })[0];
  syncUserAccount_(fresh, plan.target ? plan.target.email : '');
  logAudit_(plan.mode === 'add' ? 'staff_added' : plan.mode === 'exit' ? 'staff_exited' : 'staff_updated', 'register', staffId,
    (plan.addedMdas.length ? 'MDAs added: ' + plan.addedMdas.join(', ') + '. ' : '') + (plan.removedMdas.length ? 'MDAs removed: ' + plan.removedMdas.join(', ') + ' from ' + eff + '. ' : '') +
    (plan.mode === 'exit' ? 'Reason: ' + opts.exitReason : ''));
  return staffId;
}

/** Step 2: saves an add or edit. Re-checks everything; duplicates need confirmed = true. */
function saveStaff(mode, record, opts) {
  requirePermission_('register', 'write');
  if (mode !== 'add' && mode !== 'edit') throw new Error('Unknown action: ' + mode);
  opts = opts || {};
  return withLock_(function () {
    var plan = planStaffChange_(mode, record, opts);
    if (plan.errors.length) throw new Error(plan.errors.join(' '));
    if (plan.duplicates.length && !opts.confirmed) throw new Error('Possible duplicate: ' + plan.duplicates.map(function (d) { return d.fullName + ' (' + d.why + ')'; }).join('; ') + '. Confirm to continue.');
    var id = applyPlan_(plan, opts);
    return { ok: true, staffId: id };
  });
}

/** Module 5 exit: status Exited, never deleted. Past records stay. Handover notes are opened. */
function exitStaff(staffId, opts) {
  requirePermission_('register', 'write');
  opts = opts || {};
  return withLock_(function () {
    var plan = planStaffChange_('exit', { staffId: staffId }, opts);
    if (plan.errors.length) throw new Error(plan.errors.join(' '));
    applyPlan_(plan, opts);
    return { ok: true };
  });
}

/** Creates or updates the login for a register record. Admin logins are never downgraded. */
function syncUserAccount_(s, previousEmail) {
  if (!s) return;
  var users = readAll_('Users');
  var email = String(s.email || '').toLowerCase();
  var active = staffWorking_(s);
  if (previousEmail && String(previousEmail).toLowerCase() !== email) {
    var old = users.filter(function (u) { return String(u.email).toLowerCase() === String(previousEmail).toLowerCase(); })[0];
    if (old && old.role !== ROLES.ADMIN) updateRecord_('Users', old._row, { active: false });
  }
  if (email) {
    var u = users.filter(function (x) { return String(x.email).toLowerCase() === email; })[0];
    if (u) {
      var patch = { name: s.fullName, active: u.role === ROLES.ADMIN ? true : active };
      if (u.role !== ROLES.ADMIN && s.systemRole) patch.role = s.systemRole;
      updateRecord_('Users', u._row, patch);
    } else if (active) {
      appendRecord_('Users', { email: email, name: s.fullName, role: s.systemRole || ROLES.STAFF, unit: '', department: s.team || '', active: true });
    }
  }
  invalidateCache_('staff');
}

/* ---------------- MDAs ---------------- */

function saveMda(record) {
  requirePermission_('register', 'write');
  ensureRegisterSchema_();
  var actor = registerActor_();
  if (!canManageMdas_(actor)) throw new Error('Only the Assistant Head, the Head of Contract Office or Admin can add or edit MDAs.');
  var id = String(record.id || '').trim().toUpperCase();
  var name = String(record.name || '').trim() || id;
  if (!id) throw new Error('MDA code is required (for example FERMA).');
  if (!/^[A-Z0-9 &\/().-]{2,40}$/.test(id)) throw new Error('MDA code may contain letters, numbers, spaces and / & ( ) . - only.');
  var status = record.status === 'Inactive' ? 'Inactive' : 'Active';
  var lead = record.teamLeadStaffId || '';
  return withLock_(function () {
    var staff = readAll_('StaffRegister');
    if (lead) {
      var tl = staff.filter(function (s) { return s.staffId === lead; })[0];
      if (!tl || !staffWorking_(tl)) throw new Error('Team Lead must be an active staff member.');
    }
    var rows = readAll_('Mdas');
    var existing = rows.filter(function (m) { return m.id === id; })[0];
    var now = nowIso_();
    var rec = { id: id, name: name, teamLeadStaffId: lead, status: status, notes: String(record.notes || '').trim(), updatedAt: now, updatedBy: currentUserEmail_() };
    if (record.isNew && existing) throw new Error('MDA ' + id + ' already exists.');
    if (existing) {
      if (status === 'Inactive' && existing.status !== 'Inactive') {
        var day = todayKey_register_();
        var active = readAll_('StaffMdaAssignments').filter(function (a) { return a.mdaId === id && isActiveOn_(a, day); });
        if (active.length) throw new Error('Remove the ' + active.length + ' officer(s) assigned to ' + id + ' before making it inactive.');
      }
      updateRecord_('Mdas', existing._row, rec);
    } else {
      rec.createdAt = now;
      appendRecord_('Mdas', rec);
    }
    logAudit_(existing ? 'mda_updated' : 'mda_added', 'register', id, 'Team Lead: ' + (lead || 'none') + '; status: ' + status);
    return { ok: true, id: id };
  });
}

/* ---------------- Approved States and public holidays (Admin) ---------------- */

function listStatesAdmin() {
  requirePermission_('admin', 'read');
  ensureRegisterSchema_();
  return readAll_('States');
}

function saveState(record) {
  requirePermission_('admin', 'write');
  ensureRegisterSchema_();
  var name = String(record.name || '').replace(/\s+/g, ' ').trim();
  if (!name) throw new Error('State name is required.');
  var active = record.active === true || record.active === 'true';
  var rows = readAll_('States');
  var existing = rows.filter(function (s) { return String(s.name).toLowerCase() === name.toLowerCase(); })[0];
  if (record._row && !existing) {
    var byRow = rows.filter(function (s) { return s._row === record._row; })[0];
    if (byRow) existing = byRow;
  }
  if (existing) updateRecord_('States', existing._row, { name: name, active: active });
  else appendRecord_('States', { name: name, active: active });
  invalidateCache_('states');
  logAudit_('state_saved', 'admin', name, active ? 'active' : 'inactive');
  return true;
}

/** Approved State names, for contract validation in a later phase. */
function getApprovedStates_() {
  return getCached_('states', 600, function () {
    return readAll_('States').filter(function (s) { return s.active === true || s.active === 'TRUE'; }).map(function (s) { return String(s.name); });
  });
}

function listHolidaysAdmin() {
  requirePermission_('admin', 'read');
  ensureRegisterSchema_();
  return readAll_('PublicHolidays').map(function (h) { return Object.assign({}, h, { date: dateKey_(h.date) }); })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
}

function saveHoliday(record) {
  requirePermission_('admin', 'write');
  ensureRegisterSchema_();
  var date = validDateKey_(record.date);
  var name = String(record.name || '').trim();
  if (!date) throw new Error('A valid date is required.');
  if (!name) throw new Error('Holiday name is required.');
  var existing = readAll_('PublicHolidays').filter(function (h) { return dateKey_(h.date) === date; })[0];
  if (existing) updateRecord_('PublicHolidays', existing._row, { date: date, name: name, notes: String(record.notes || '') });
  else appendRecord_('PublicHolidays', { date: date, name: name, notes: String(record.notes || '') });
  invalidateCache_('holidays');
  logAudit_('holiday_saved', 'admin', date, name);
  return true;
}

function deleteHoliday(date) {
  requirePermission_('admin', 'write');
  var key = validDateKey_(date);
  var row = readAll_('PublicHolidays').filter(function (h) { return dateKey_(h.date) === key; })[0];
  if (!row) throw new Error('No holiday on ' + date + '.');
  deleteRow_('PublicHolidays', row._row);
  invalidateCache_('holidays');
  logAudit_('holiday_deleted', 'admin', key, row.name);
  return true;
}
