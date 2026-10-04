/**
 * InflowOutflow.gs — Company / Contract Inflow & Outflow Tracking (module 6)
 * Structured capture linked to project/department/contract, feeding financial
 * visibility. Reuses the "payments" permission scope (same financial-control audience).
 */

function listInflowOutflow(filters) {
  requirePermission_('inflowOutflow', 'read');
  var f = filters ? Object.assign({}, filters) : filters;
  var type = '';
  if (f && (f.status === 'Inflow' || f.status === 'Outflow')) { type = f.status; delete f.status; }
  var rows = applyFilters_(readAll_('InflowOutflow'), f);
  return type ? rows.filter(function (r) { return r.type === type; }) : rows;
}

function saveInflowOutflow(record) {
  requirePermission_('inflowOutflow', 'write');
  var user = getCurrentUser();
  if (record._row) {
    updateRecord_('InflowOutflow', record._row, record);
  } else {
    record.id = genId_('IO');
    record.createdBy = user.email;
    record.createdAt = nowIso_();
    appendRecord_('InflowOutflow', record);
  }
  logAudit_('inflow_outflow_saved', 'inflowOutflow', record.id, record.type || '');
  return { ok: true, id: record.id };
}

function getInflowOutflowSummary(filters) {
  requirePermission_('inflowOutflow', 'read');
  var rows = listInflowOutflow(filters);
  var inflow = rows.filter(function (r) { return r.type === 'Inflow'; });
  var outflow = rows.filter(function (r) { return r.type === 'Outflow'; });
  var sum = function (arr) { return arr.reduce(function (a, b) { return a + (Number(b.amount) || 0); }, 0); };
  return { inflowTotal: sum(inflow), outflowTotal: sum(outflow), net: sum(inflow) - sum(outflow) };
}
