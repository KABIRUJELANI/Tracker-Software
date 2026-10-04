/**
 * Files.gs — File Positional Analysis
 * Read-only, derived module. Never hand-edit a file's "current status" —
 * status is always computed from the latest FileMovements row logged against
 * that file (which is itself populated from Daily Reports and the file
 * register). This satisfies the requirement that positional status reflects
 * reality on the ground, not a stale manual field.
 */

function listFileRegister(filters) {
  requirePermission_('filePositional', 'read');
  return applyFilters_(readAll_('Files'), filters);
}

function registerFile(record) {
  requirePermission_('contracts', 'write'); // filing a new physical file is a documentation action
  record.fileRef = record.fileRef || genId_('FILE');
  record.createdAt = nowIso_();
  appendRecord_('Files', record);
  logAudit_('file_registered', 'filePositional', record.fileRef, record.title || '');
  return { ok: true, fileRef: record.fileRef };
}

/** The core positional view: every registered file, joined to its latest movement. */
function getFilePositionalAnalysis(filters) {
  requirePermission_('filePositional', 'read');
  var files = readAll_('Files');
  var movements = readAll_('FileMovements');
  var latestByFile = {};
  movements.forEach(function (m) {
    var existing = latestByFile[m.fileRef];
    if (!existing || new Date(m.date) > new Date(existing.date)) latestByFile[m.fileRef] = m;
  });

  var stuckThreshold = Number(getSetting('fileStuckDaysThreshold', 5));
  var today = new Date();

  var result = files.map(function (f) {
    var latest = latestByFile[f.fileRef];
    var daysSinceMovement = latest ? daysBetween_(new Date(latest.date), today) : null;
    return {
      fileRef: f.fileRef, title: f.title, unit: f.unit, department: f.department,
      contractId: f.contractId, companyId: f.companyId,
      currentLocation: latest ? latest.location : 'Not yet reported',
      lastSeenDate: latest ? latest.date : '', lastReportedBy: latest ? latest.reportedBy : '',
      daysSinceMovement: daysSinceMovement,
      isStuck: daysSinceMovement !== null && daysSinceMovement >= stuckThreshold
    };
  });
  return applyFilters_(result, filters);
}

/** Scheduled scan: escalate any file with no movement recorded past the threshold. Called by Triggers.gs. */
function runFilePositionalScan_() {
  var analysis = getFilePositionalAnalysis();
  analysis.filter(function (f) { return f.isStuck; }).forEach(function (f) {
    escalateIfNew_('filePositional', f.fileRef, f.unit,
      'File "' + f.title + '" has shown no movement for ' + f.daysSinceMovement + ' day(s) — currently at "' + f.currentLocation + '".',
      f.daysSinceMovement > 10 ? 'High' : 'Medium');
  });
}

/** Removes a registered physical file from the register. Its movement history is
 *  kept in FileMovements for the audit trail. Same permission as registering it. */
function deleteFile(fileRef) {
  requirePermission_('contracts', 'write');
  var row = readAll_('Files').filter(function (f) { return f.fileRef === fileRef; })[0];
  if (!row) throw new Error('File not found: ' + fileRef);
  deleteRow_('Files', row._row);
  logAudit_('file_deleted', 'filePositional', fileRef, row.title || '');
  return true;
}
