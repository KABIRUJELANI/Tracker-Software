/**
 * Admin.gs — Profile & Administrative Setup (module 1)
 * User profiles, roles, and system-wide lookup lists (units, categories/fields).
 * All write actions require the "admin" permission — see Auth.gs PERMISSIONS.
 */

function listUsers() {
  requirePermission_('admin', 'read');
  return readAll_('Users').map(function (u) {
    var out = Object.assign({}, u);
    out.hasPassword = !!u.passwordHash;
    delete out.passwordHash; delete out.passwordSalt;
    return out;
  });
}

function saveUser(record) {
  requirePermission_('admin', 'write');
  delete record.passwordHash; delete record.passwordSalt; delete record.hasPassword; // passwords only via setUserPassword
  var validRoles = Object.keys(ROLES).map(function (k) { return ROLES[k]; });
  if (validRoles.indexOf(record.role) === -1) throw new Error('Unknown role: ' + record.role);
  if (record._row) {
    updateRecord_('Users', record._row, record);
  } else {
    if (record.active === undefined) record.active = true;
    appendRecord_('Users', record);
  }
  invalidateCache_('staff');
  logAudit_('user_saved', 'admin', record.email, record.role || '');
  return { ok: true };
}

function listUnitsAdmin() {
  requirePermission_('admin', 'read');
  return readAll_('Units');
}

function saveUnit(record) {
  requirePermission_('admin', 'write');
  if (record._row) {
    updateRecord_('Units', record._row, record);
  } else {
    appendRecord_('Units', record);
  }
  invalidateCache_('units');
  return { ok: true };
}

function getAuditLog(filters) {
  requirePermission_('admin', 'read');
  var rows = readAll_('AuditLog');
  return applyFilters_(rows, filters).sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); }).slice(0, 200);
}
