/**
 * Attendance.gs
 * Lightweight clock-in/out tracking, separate from Daily Reports (which is
 * about what work happened, not when someone was present). One row per
 * person per calendar day (WAT). Any signed-in staff member can clock
 * themselves in/out — there's no separate permission gate here, since it's
 * a personal, low-sensitivity self-action, and everyone can already see the
 * dashboard where this lives.
 */

function todayKey_() {
  return Utilities.formatDate(new Date(), APP_TZ, 'yyyy-MM-dd');
}

function myAttendanceRow_() {
  var user = getCurrentUser();
  var today = todayKey_();
  var rows = readAll_('Attendance');
  // Works with both column layouts used historically (email/name and staffEmail/staffName),
  // and with dates that Google Sheets has converted into Date cells.
  return rows.filter(function (r) {
    return String(r.email || r.staffEmail || '').toLowerCase() === String(user.email).toLowerCase() && dateKey_(r.date) === today;
  })[0] || null;
}

function clockIn() {
  requirePermission_('attendance', 'write');
  var user = getCurrentUser();
  var existing = myAttendanceRow_();
  if (existing) return existing; // already clocked in today — idempotent, not an error
  var record = { id: genId_('ATT'), email: user.email, staffEmail: user.email, name: user.name, staffName: user.name,
    unit: user.unit || '', date: todayKey_(), clockInAt: nowIso_(), clockOutAt: '', createdAt: nowIso_() };
  appendRecord_('Attendance', record);
  logAudit_('clock_in', 'dashboard', user.email, '');
  return record;
}

function clockOut() {
  requirePermission_('attendance', 'write');
  var existing = myAttendanceRow_();
  if (!existing) throw new Error('You have not clocked in today yet.');
  if (existing.clockOutAt) return existing; // already clocked out — idempotent
  updateRecord_('Attendance', existing._row, { clockOutAt: nowIso_() });
  logAudit_('clock_out', 'dashboard', getCurrentUser().email, '');
  return myAttendanceRow_();
}

function getMyAttendanceToday() {
  return myAttendanceRow_();
}

/** Everyone's status for today, for the dashboard's "who's in" view under each
 *  unit. Includes staff with no attendance row yet (shown as "Not clocked in"). */
function listAttendanceToday() {
  var today = todayKey_();
  var attendance = readAll_('Attendance').filter(function (r) { return dateKey_(r.date) === today; });
  var byEmail = {};
  attendance.forEach(function (a) { byEmail[String(a.email || a.staffEmail || '').toLowerCase()] = a; });
  var staff = getStaffList().filter(function (u) { return u.active !== false; });
  return staff.map(function (u) {
    var a = byEmail[String(u.email).toLowerCase()];
    return {
      email: u.email, name: u.name, role: u.role, unit: u.unit,
      clockInAt: a ? a.clockInAt : '', clockOutAt: a ? a.clockOutAt : '',
      status: !a ? 'Pending' : (a.clockOutAt ? 'Clocked Out' : 'Present')
    };
  });
}
