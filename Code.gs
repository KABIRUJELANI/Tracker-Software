/**
 * Code.gs
 * Entry point. Single-page app: one doGet() serves Index.html, which does
 * client-side view-swapping between modules based on the `page` query param
 * (kept in the URL hash so the browser back button works inside the sidebar).
 */

function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) || 'dashboard';
  var template = HtmlService.createTemplateFromFile('Index');
  template.initialPage = page;
  return template.evaluate()
    .setTitle('Rumbu Industries Group — Contract Department')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Used by HTML templates to include partials: <?!= include('Nav') ?> */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Central module registry consumed by the generic list/detail engine on the client.
 *  Adding a module = adding one entry here + one sheet in SETUP.gs. */
function getModuleRegistry() {
  return [
    { key: 'dashboard',      label: 'Dashboard',                         icon: '📊', group: 'Overview' },
    { key: 'dailyReports',   label: 'Daily Reporting & Monitoring',      icon: '📝', group: 'Operations' },
    { key: 'incidents',      label: 'Complaints & Emergencies',          icon: '🚨', group: 'Operations' },
    { key: 'filePositional', label: 'File Positional Analysis',          icon: '🗂️', group: 'Documentation' },
    { key: 'contracts',      label: 'Contract Documentation & Filing',   icon: '📄', group: 'Documentation' },
    { key: 'jobs',           label: 'Jobs / Tasks Monitoring',           icon: '✅', group: 'Operations' },
    { key: 'payments',       label: 'Payment & Financial Analysis',      icon: '💰', group: 'Finance' },
    { key: 'inflowOutflow',  label: 'Inflow / Outflow Tracking',         icon: '🔁', group: 'Finance' },
    { key: 'procurement',    label: 'Procurement & Pending Actions',     icon: '📦', group: 'Operations' },
    { key: 'companies',      label: 'Company Analysis',                 icon: '🏢', group: 'Registers' },
    { key: 'projects',       label: 'Project Management Plan',          icon: '🗓️', group: 'Registers' },
    { key: 'register',       label: 'Staff & MDA Register',             icon: '👥', group: 'Registers' },
    { key: 'kpi',            label: 'KPI Analysis',                     icon: '📈', group: 'Management' },
    { key: 'escalations',    label: 'Escalation Reports to CEO',        icon: '⛔', group: 'Management' },
    { key: 'admin',          label: 'Profile & Admin Setup',            icon: '⚙️', group: 'System' }
  ];
}

/** One bootstrap call the client makes on load: who am I, what can I see, what's the config. */
function bootstrap() {
  return {
    access: getMyAccess(),
    modules: getModuleRegistry(),
    settings: getSettings(),
    units: getUnits(),
    staff: getStaffList().map(function (u) { return { email: u.email, name: u.name, role: u.role, unit: u.unit, active: u.active }; }),
    org: { name: 'RUMBU INDUSTRIES GROUP', entity: 'Agriwatts Nigeria Limited', dept: 'Contract Office', classification: 'CONFIDENTIAL' }
  };
}
