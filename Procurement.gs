/**
 * Procurement.gs — Procurement & Pending Actions (module 10)
 */

function listProcurement(filters) {
  requirePermission_('procurement', 'read');
  return applyFilters_(readAll_('Procurement'), filters);
}

function saveProcurement(record) {
  requirePermission_('procurement', 'write');
  var user = getCurrentUser();
  if (record._row) {
    if (record.status === 'Approved' && !record.approvalDate) record.approvalDate = new Date();
    updateRecord_('Procurement', record._row, record);
  } else {
    record.id = genId_('PR');
    record.requestedBy = user.email;
    record.requestDate = record.requestDate || new Date();
    record.status = record.status || 'Requested';
    record.createdAt = nowIso_();
    appendRecord_('Procurement', record);
  }
  logAudit_('procurement_saved', 'procurement', record.id, record.title || '');
  return { ok: true, id: record.id };
}

function deleteProcurement(id) {
  requirePermission_('procurement', 'write');
  var rows = readAll_('Procurement');
  var row = rows.filter(function (r) { return r.id === id; })[0];
  if (!row) throw new Error('Procurement request not found: ' + id);
  deleteRow_('Procurement', row._row);
  logAudit_('procurement_deleted', 'procurement', id, '');
  return true;
}

/** Consolidated Pending Actions register: contracts + payments + jobs + procurement
 *  not yet closed, each with an owner and expected completion date, so it can be
 *  reviewed and escalated as a single list rather than four separate ones. */
function getPendingActionsRegister(filters) {
  requirePermission_('procurement', 'read');
  var contracts = readAll_('Contracts').filter(function (c) { return c.stage !== 'closure'; }).map(function (c) {
    return { source: 'Contract', id: c.id, unit: c.unit, department: c.department, title: c.title, owner: c.createdBy, expected: c.executionDate || c.approvalDate || c.requestDate, status: c.stage };
  });
  var payments = readAll_('Payments').filter(function (p) { return p.status !== 'Received' && p.status !== 'Completed'; }).map(function (p) {
    return { source: 'Payment', id: p.id, unit: p.unit, department: p.department, title: p.description, owner: p.createdBy, expected: p.dueDate, status: p.status };
  });
  var jobs = readAll_('Jobs').filter(function (j) { return j.status !== 'Completed'; }).map(function (j) {
    return { source: 'Job', id: j.id, unit: j.unit, department: j.department, title: j.title, owner: j.assignedTo, expected: j.dueDate, status: j.status };
  });
  var procurement = readAll_('Procurement').filter(function (p) { return p.status !== 'Completed'; }).map(function (p) {
    return { source: 'Procurement', id: p.id, unit: p.unit, department: p.department, title: p.title, owner: p.requestedBy, expected: p.expectedCompletion, status: p.status };
  });
  var all = contracts.concat(payments, jobs, procurement);
  var today = new Date();
  all.forEach(function (a) { a.overdue = a.expected && new Date(a.expected) < today; });
  return applyFilters_(all, filters).sort(function (a, b) { return (b.overdue - a.overdue) || (new Date(a.expected || 0) - new Date(b.expected || 0)); });
}
