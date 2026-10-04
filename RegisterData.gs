/**
 * RegisterData.gs
 * INITIAL LOAD ONLY. Loaded by setup only when the StaffRegister / Mdas / States /
 * PublicHolidays sheets are empty. After the first load, the sheets are the only
 * source of truth: editing this file later changes nothing on a live system.
 *
 * Staff and MDA rows are exactly as supplied by the Contract Office. Emails and
 * phone numbers were not supplied: Admin enters them from the Register screen.
 */

var SEED_MDAS = [
  // id (short code) | Team Lead (full name as in SEED_STAFF, '' = none)
  ['FERMA', 'Hamza Gali Hamza'],
  ['NADF', 'Yazid Muhammad Lawan'],
  ['SMEDAN', 'Hamza Gali Hamza'],
  ['NALDA', 'Hamza Gali Hamza'],
  ['YOUTH', 'Hamza Gali Hamza'],
  ['PTF', 'Kabiru Umar Abdullahi'],
  ['AKTH', 'Hamza Gali Hamza'],
  ['CITIZENSHIP', 'Tukur Ahmed'],
  ['SORA/FINANCE', '']
];

var SEED_STAFF = [
  // Full name | Role (job title) | Unit | Assigned MDAs ('' = not assigned)
  ['Hamza Gali Hamza', 'Head, Contract Office', 'Head Office', 'FERMA, AKTH'],
  ['Sadiq Aminu Boyi', 'Assistant Head', 'Head Office', ''],
  ['Kabiru Umar Abdullahi', 'Contracts and Records Management Officer', 'Head Office', 'PTF'],
  ['Tukur Ahmed', 'Contracts Monitoring and Reporting Officer', 'Head Office', 'CITIZENSHIP'],
  ['Yazid Muhammad Lawan', 'MDA Follow-Up Officer', 'Head Office', 'NADF'],
  ['Abdul Abdullahi', 'MDA Follow-Up Officer', 'Head Office', 'SORA/FINANCE'],
  ['Oyeniyi Asimiyu Yinka', 'MDA Follow-Up Officer', 'Head Office', 'NADF'],
  ['Hussainu Tijjani Yunusa', 'MDA Follow-Up Officer', 'Head Office', 'AKTH'],
  ['Farouk Umar Muhammed', 'MDA Follow-Up Officer', 'Head Office', 'YOUTH'],
  ['Deborah O. Shogbesan', 'MDA Follow-Up Officer', 'Head Office', 'YOUTH'],
  ['Daniel Reuben', 'MDA Follow-Up Officer', 'Head Office', 'SMEDAN'],
  ['Olanrewaju Hammed Adewale', 'MDA Follow-Up Officer', 'Head Office', 'SMEDAN'],
  ['Musa Yaro', 'MDA Follow-Up Officer', 'Head Office', 'NALDA'],
  ['Peace O. Shogbesan', 'MDA Follow-Up Officer', 'Head Office', 'NALDA'],
  ['Ibrahim Abdulazeez Yunusa', 'MDA Follow-Up Officer', 'Head Office', ''],
  ['Gideon Yakubu Magason', 'MDA Follow-Up Officer', 'Head Office', 'PTF'],
  ['Sani Umar Ahmad', 'MDA Follow-Up Officer', 'Head Office', ''],
  ['Richard Inyang', 'Head, Port Harcourt Unit', 'Port Harcourt', ''],
  ['Francis Dirusu', 'Head, Documentation Team', 'Port Harcourt', ''],
  ['Yazid Abubakar Aliyu', 'Head, Follow-Up Team', 'Port Harcourt', ''],
  ['Gabriel Adah', 'Head, Emergency Team', 'Port Harcourt', ''],
  ['Yusuf Muhammed', 'Head, Project Analysis Team', 'Port Harcourt', ''],
  ['Auwal Alhaji Mudassir', 'Project Analysis Team', 'Port Harcourt', 'FERMA (Abuja)'],
  ['Muhammed Jiya Muhammed', 'Project Analysis Team', 'Port Harcourt', 'SORA/FINANCE (Abuja)'],
  ['Abdulshakur Suleiman', 'MDA Follow-Up Officer', 'Port Harcourt', 'CITIZENSHIP'],
  ['Abdulkadir Ahmad Ghazali', 'MDA Follow-Up Officer', 'Port Harcourt', ''],
  ['Ezekiel Isek Oday', 'MDA Follow-Up Officer', 'Port Harcourt', ''],
  ['Abdulaziz Ibrahim Dabo', 'Documentation Team', 'Port Harcourt', ''],
  ['Cletus Agbodor Ebokotv', 'Emergency Team', 'Port Harcourt', ''],
  ['Etim Stasley Ebi', 'Project Analysis Team', 'Port Harcourt', ''],
  ['VACANT (from E.D Hamza)', 'Project Analysis Team', 'Port Harcourt', ''],
  ['VACANT (from E.D Hamza)', 'Documentation Team', 'Port Harcourt', '']
];

/** Nigeria's 36 States and the FCT. Admin can deactivate or add entries. */
var SEED_STATES = ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River',
  'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi',
  'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto',
  'Taraba', 'Yobe', 'Zamfara'];

/** Fixed-date and Easter holidays only. Eid-el-Fitr, Eid-el-Kabir and Eid-el-Maulud
 *  depend on moon sighting, and weekend holidays are often moved to a Monday by the
 *  Federal Government: Admin adds those dates when they are announced. */
var SEED_HOLIDAYS = [
  ['2026-01-01', "New Year's Day"], ['2026-04-03', 'Good Friday'], ['2026-04-06', 'Easter Monday'],
  ['2026-05-01', "Workers' Day"], ['2026-06-12', 'Democracy Day'], ['2026-10-01', 'Independence Day'],
  ['2026-12-25', 'Christmas Day'], ['2026-12-26', 'Boxing Day'],
  ['2027-01-01', "New Year's Day"], ['2027-03-26', 'Good Friday'], ['2027-03-29', 'Easter Monday'],
  ['2027-05-01', "Workers' Day"], ['2027-06-12', 'Democracy Day'], ['2027-10-01', 'Independence Day'],
  ['2027-12-25', 'Christmas Day'], ['2027-12-26', 'Boxing Day']
];

function seedSystemRoleFor_(jobTitle) {
  if (jobTitle === 'Head, Contract Office') return ROLES.HEAD_OF_CONTRACT;
  if (jobTitle === 'Assistant Head') return ROLES.ASSISTANT_HEAD;
  if (jobTitle === 'Head, Port Harcourt Unit') return ROLES.HEAD_PH;
  return ROLES.STAFF;
}

function seedTeamFor_(jobTitle, office) {
  if (office === 'Head Office') return 'Head Office';
  var teams = ['Documentation', 'Follow-Up', 'Emergency', 'Project Analysis'];
  for (var i = 0; i < teams.length; i++) if (jobTitle.indexOf(teams[i]) !== -1) return teams[i];
  return ''; // e.g. Head, Port Harcourt Unit: Admin sets the team
}

/** Loads MDAs, staff and current MDA assignments. Runs only when StaffRegister is empty. */
function seedRegisterIfEmpty_() {
  if (readAll_('StaffRegister').length > 0 || readAll_('Mdas').length > 0) return 'Register already loaded. Nothing changed.';
  var now = nowIso_(); var today = dateKey_(new Date());

  var staff = SEED_STAFF.map(function (s, i) {
    var mdas = s[3] ? s[3].split(',').map(function (m) { return m.trim(); }) : [];
    var notes = mdas.some(function (m) { return /\(Abuja\)/.test(m); }) ? 'Covers MDA work in Abuja.' : '';
    var isVacant = /^VACANT/i.test(s[0]);
    return {
      staffId: 'STF-' + ('00' + (i + 1)).slice(-3), fullName: s[0], jobTitle: s[1], office: s[2],
      systemRole: isVacant ? '' : seedSystemRoleFor_(s[1]), team: seedTeamFor_(s[1], s[2]),
      status: isVacant ? 'Vacant' : 'Active', mdas: mdas.map(function (m) { return m.replace(/\s*\(Abuja\)\s*/i, ''); }),
      phone: '', email: '', startDate: '', notes: notes, createdAt: now, updatedAt: now, updatedBy: 'initial load'
    };
  });
  var byName = {}; staff.forEach(function (s) { if (s.status !== 'Vacant') byName[s.fullName] = s; });
  var hoco = staff.filter(function (s) { return s.systemRole === ROLES.HEAD_OF_CONTRACT; })[0];
  var ah = staff.filter(function (s) { return s.systemRole === ROLES.ASSISTANT_HEAD; })[0];
  var headPh = staff.filter(function (s) { return s.systemRole === ROLES.HEAD_PH; })[0];
  var mdaLead = {}; SEED_MDAS.forEach(function (m) { mdaLead[m[0]] = m[1] && byName[m[1]] ? byName[m[1]].staffId : ''; });

  // Team Lead rules (Admin can change any of them afterwards):
  //  Head of Contract Office: none (reports to the Directors). Assistant Head and Head of PH Unit: Head of Contract Office.
  //  PH team heads: Head of PH Unit. PH team members: the head of their team.
  //  Head Office officers: Team Lead of their first MDA, or the Assistant Head when that is themselves or there is none.
  staff.forEach(function (s) {
    var lead = '';
    if (s.systemRole === ROLES.HEAD_OF_CONTRACT) lead = '';
    else if (s.systemRole === ROLES.ASSISTANT_HEAD || s.systemRole === ROLES.HEAD_PH) lead = hoco ? hoco.staffId : '';
    else if (s.office === 'Port Harcourt') {
      if (/^Head, /.test(s.jobTitle)) lead = headPh ? headPh.staffId : '';
      else {
        var teamHead = staff.filter(function (x) { return x.jobTitle === 'Head, ' + s.team + ' Team'; })[0];
        lead = teamHead ? teamHead.staffId : (headPh ? headPh.staffId : '');
      }
    } else {
      var first = s.mdas[0];
      lead = first && mdaLead[first] && mdaLead[first] !== s.staffId ? mdaLead[first] : (ah ? ah.staffId : '');
    }
    s.teamLeadStaffId = lead;
  });

  staff.forEach(function (s) {
    var rec = Object.assign({}, s); delete rec.mdas;
    appendRecord_('StaffRegister', rec);
  });
  SEED_MDAS.forEach(function (m) {
    appendRecord_('Mdas', { id: m[0], name: m[0], teamLeadStaffId: mdaLead[m[0]], status: 'Active', notes: m[1] ? '' : 'No Team Lead: reviews and alerts go to the Assistant Head.', createdAt: now, updatedAt: now, updatedBy: 'initial load' });
  });
  staff.forEach(function (s) {
    s.mdas.forEach(function (m) {
      appendRecord_('StaffMdaAssignments', { id: genId_('ASG'), staffId: s.staffId, mdaId: m, effectiveFrom: today, effectiveTo: '', reason: 'Initial load', createdAt: now, createdBy: 'initial load' });
    });
  });
  return 'Loaded ' + SEED_MDAS.length + ' MDAs and ' + staff.length + ' staff/vacancy records.';
}

function seedReferenceDataIfEmpty_() {
  if (readAll_('States').length === 0) SEED_STATES.forEach(function (n) { appendRecord_('States', { name: n, active: true }); });
  if (readAll_('PublicHolidays').length === 0) SEED_HOLIDAYS.forEach(function (h) { appendRecord_('PublicHolidays', { date: h[0], name: h[1], notes: '' }); });
}
