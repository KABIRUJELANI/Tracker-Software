/**
 * Contracts.gs — Contract Documentation & Filing (module 7)
 * Traceable trail: request -> approval -> execution -> reporting -> closure.
 */

var CONTRACT_STAGES = ['request', 'approval', 'execution', 'reporting', 'closure'];

/** The Contracts filter offers stage names (request ... closure) in its Status box.
 *  Records keep the stage in "stage", so match on that instead of "status". */
function contractRowsFiltered_(filters) {
  var f = filters ? Object.assign({}, filters) : filters;
  var stage = '';
  if (f && CONTRACT_STAGES.indexOf(f.status) !== -1) { stage = f.status; delete f.status; }
  var rows = applyFilters_(readAll_('Contracts'), f);
  return stage ? rows.filter(function (r) { return r.stage === stage; }) : rows;
}

function listContracts(filters) {
  requirePermission_('contracts', 'read');
  return contractRowsFiltered_(filters);
}

function saveContract(record) {
  requirePermission_('contracts', 'write');
  var user = getCurrentUser();
  var stampField = { approval: 'approvalDate', execution: 'executionDate', closure: 'closureDate' }[record.stage];
  if (record._row) {
    if (stampField && !record[stampField]) record[stampField] = new Date();
    updateRecord_('Contracts', record._row, record);
    logAudit_('contract_stage_' + record.stage, 'contracts', record.id, '');
  } else {
    record.id = genId_('CT');
    record.createdBy = user.email;
    record.createdAt = nowIso_();
    record.stage = record.stage || 'request';
    record.requestDate = record.requestDate || new Date();
    appendRecord_('Contracts', record);
    logAudit_('contract_created', 'contracts', record.id, record.title || '');
  }
  return { ok: true, id: record.id };
}

function getContractsPipeline(filters) {
  requirePermission_('contracts', 'read');
  var rows = contractRowsFiltered_(filters);
  var byStage = {};
  CONTRACT_STAGES.forEach(function (s) { byStage[s] = rows.filter(function (r) { return r.stage === s; }); });
  return byStage;
}

function deleteContract(id) {
  requirePermission_('contracts', 'write');
  var rows = readAll_('Contracts');
  var row = rows.filter(function (r) { return r.id === id; })[0];
  if (!row) throw new Error('Contract not found: ' + id);
  deleteRow_('Contracts', row._row);
  logAudit_('contract_deleted', 'contracts', id, '');
  return true;
}

/** The fixed 10-item document checklist requested for every contract. Each
 *  contract can have at most one uploaded file per doc type — re-uploading
 *  replaces the previous one. */
var CONTRACT_DOC_TYPES = [
  'Copy of Original Award', 'Acceptance Acknowledgement', 'Request for 30% Mobilization Acknowledgement',
  'Invoice & Delivery Note Acknowledgement', 'Request of Extension Acknowledgement', 'Pictures',
  'Job Completion Certificate', 'Request for Payment Acknowledgement', 'Submission of Account Details Acknowledgement',
  'Bill of Quantities (BOQ)'
];

function getContractDocumentChecklist(contractId) {
  requirePermission_('contracts', 'read');
  var existing = readAll_('ContractDocuments').filter(function (d) { return d.contractId === contractId; });
  return CONTRACT_DOC_TYPES.map(function (docType) {
    var match = existing.filter(function (d) { return d.docType === docType; })[0];
    return { docType: docType, id: match ? match.id : null, driveLink: match ? match.driveLink : '', filename: match ? match.filename : '', notes: match ? match.notes : '', uploadedAt: match ? match.uploadedAt : '' };
  });
}

function uploadContractDocument(contractId, docType, base64Data, mimeType, filename) {
  requirePermission_('contracts', 'write');
  if (CONTRACT_DOC_TYPES.indexOf(docType) === -1) throw new Error('Unknown document type: ' + docType);
  var user = getCurrentUser();
  var uploaded = uploadEvidence(base64Data, mimeType, filename, 'Contracts', 'contractDocuments');
  var existing = readAll_('ContractDocuments').filter(function (d) { return d.contractId === contractId && d.docType === docType; })[0];
  if (existing) {
    updateRecord_('ContractDocuments', existing._row, { driveLink: uploaded.url, filename: filename, uploadedAt: nowIso_(), uploadedBy: user.email });
  } else {
    appendRecord_('ContractDocuments', { id: genId_('CD'), contractId: contractId, docType: docType, driveLink: uploaded.url, filename: filename, uploadedAt: nowIso_(), uploadedBy: user.email });
  }
  logAudit_('contract_document_uploaded', 'contracts', contractId, docType);
  return true;
}

/** The "Manual Entry" counterpart to uploadContractDocument — typed
 *  information instead of a file, for a checklist item that doesn't have an
 *  actual document to attach (e.g. a note on status rather than a scan).
 *  Sits in the same one-slot-per-doc-type row; entering manual text does not
 *  require or replace a file, and uploading a file does not clear manual text. */
function saveContractDocumentNote(contractId, docType, notes) {
  requirePermission_('contracts', 'write');
  if (CONTRACT_DOC_TYPES.indexOf(docType) === -1) throw new Error('Unknown document type: ' + docType);
  var user = getCurrentUser();
  var existing = readAll_('ContractDocuments').filter(function (d) { return d.contractId === contractId && d.docType === docType; })[0];
  if (existing) {
    updateRecord_('ContractDocuments', existing._row, { notes: notes, uploadedAt: nowIso_(), uploadedBy: user.email });
  } else {
    appendRecord_('ContractDocuments', { id: genId_('CD'), contractId: contractId, docType: docType, driveLink: '', filename: '', notes: notes, uploadedAt: nowIso_(), uploadedBy: user.email });
  }
  logAudit_('contract_document_note_saved', 'contracts', contractId, docType);
  return true;
}

function deleteContractDocument(id) {
  requirePermission_('contracts', 'write');
  var rows = readAll_('ContractDocuments');
  var row = rows.filter(function (r) { return r.id === id; })[0];
  if (!row) throw new Error('Document not found: ' + id);
  deleteRow_('ContractDocuments', row._row);
  logAudit_('contract_document_deleted', 'contracts', id, '');
  return true;
}
