/**
 * Incidents.gs
 * Complaints / incidents / emergencies log, with escalation and follow-up tracking.
 */

function listIncidents(filters) {
  requirePermission_('incidents', 'read');
  return applyFilters_(readAll_('Incidents'), filters);
}

function saveIncident(record) {
  requirePermission_('incidents', 'write');
  var user = getCurrentUser();
  if (record._row) {
    if (record.status === 'Resolved' && !record.resolvedAt) record.resolvedAt = nowIso_();
    updateRecord_('Incidents', record._row, record);
    logAudit_('incident_updated', 'incidents', record.id, record.status || '');
  } else {
    record.id = genId_('INC');
    record.reportedBy = user.email;
    record.createdAt = nowIso_();
    if (!record.status) record.status = 'Open';
    if (!record.date) record.date = new Date();
    appendRecord_('Incidents', record);
    if (record.severity === 'High' || record.category === 'Emergency') {
      escalateNow_('incidents', record.id, record.unit, record.description, record.severity || 'High');
    }
    logAudit_('incident_created', 'incidents', record.id, record.category);
  }
  return { ok: true, id: record.id };
}

function resolveIncident(id, notes) {
  requirePermission_('incidents', 'write');
  var rows = readAll_('Incidents');
  var row = rows.filter(function (r) { return r.id === id; })[0];
  if (!row) throw new Error('Incident not found: ' + id);
  updateRecord_('Incidents', row._row, { status: 'Resolved', resolvedAt: nowIso_(), followUpNotes: notes || row.followUpNotes });
  logAudit_('incident_resolved', 'incidents', id, notes || '');
  return true;
}

function deleteIncident(id) {
  requirePermission_('incidents', 'write');
  var rows = readAll_('Incidents');
  var row = rows.filter(function (r) { return r.id === id; })[0];
  if (!row) throw new Error('Incident not found: ' + id);
  deleteRow_('Incidents', row._row);
  logAudit_('incident_deleted', 'incidents', id, '');
  return true;
}
