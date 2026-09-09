const fs = require('fs');

// [file, [[old, new], ...]] — exact string replacements, user-facing branding only.
// i18n keys mirror the component EN source strings, so keys are renamed in lockstep.
const EDITS = [
  ['src/client/components/dashboards/AnalystDashboard.tsx', [
    ['Atlassian Jira • Personal Workspace', 'FIUUU • Personal Workspace'],
  ]],
  ['src/client/components/dashboards/CISODashboard.tsx', [
    ['Loading Jira Dashboard Gadgets...', 'Loading FIUUU Dashboard Gadgets...'],
    ['View all tickets in Jira', 'View all tickets in FIUUU'],
  ]],
  ['src/client/components/dashboards/LeadDashboard.tsx', [
    ['Jira Service Management • Operations Lead', 'FIUUU Service Management • Operations Lead'],
    ['Jira Operational Queues (', 'FIUUU Operational Queues ('],
    ['Open in Jira', 'Open in FIUUU'],
  ]],
  ['src/client/components/layout/FeedbackModal.tsx', [
    ['Give feedback on Jira Navigation', 'Give feedback on FIUUU Navigation'],
    ['Your input has been recorded and helps shape future Atlassian Jira platform updates.', 'Your input has been recorded and helps shape future FIUUU platform updates.'],
    ['What did you like or what can we improve in the new Jira layout?', 'What did you like or what can we improve in the new FIUUU layout?'],
  ]],
  ['src/client/components/layout/KeyboardShortcutsModal.tsx', [
    ['Jira standard keyboard hotkeys & quick navigation', 'FIUUU standard keyboard hotkeys & quick navigation'],
  ]],
  ['src/client/components/layout/CustomizeSidebarModal.tsx', [
    ["'Jira Essentials'", "'FIUUU Essentials'"],
  ]],
  ['src/client/components/tickets/TicketListView.tsx', [
    ["t('Jira Table / List View')", "t('FIUUU Table / List View')"],
    ["t('Jira Kanban Board View')", "t('FIUUU Kanban Board View')"],
    ['No Jira issues match your query or active filters.', 'No FIUUU issues match your query or active filters.'],
    ['AegisSec_Jira_Export_', 'AegisSec_FIUUU_Export_'],
  ]],
  ['src/client/components/ideate/IdeateCanvasView.tsx', [
    ['Wrike Ideate: Cyber Threat & Strategy Canvas', 'FIUUU Ideate: Cyber Threat & Strategy Canvas'],
    ['Convert this idea into a real Wrike Task', 'Convert this idea into a real FIUUU Task'],
    ['<span>Wrike Work Intelligence</span>', '<span>FIUUU Work Intelligence</span>'],
    ['Wrike Blue (Architecture)', 'FIUUU Blue (Architecture)'],
  ]],
  ['src/client/components/views/WrikeAutomationsView.tsx', [
    ['Wrike Automation Engine & Project Blueprints', 'FIUUU Automation Engine & Project Blueprints'],
  ]],
  ['src/client/components/views/WrikeRequestFormsView.tsx', [
    ['Wrike Dynamic Request Forms & Work Intake', 'FIUUU Dynamic Request Forms & Work Intake'],
    ['Wrike Work Intake routes this request directly to active pipelines.', 'FIUUU Work Intake routes this request directly to active pipelines.'],
  ]],
  ['src/client/components/views/WrikeWorkloadView.tsx', [
    ['Wrike Workload & Resource Capacity', 'FIUUU Workload & Resource Capacity'],
  ]],
  ['src/client/components/proofing/DocumentProofingModal.tsx', [
    ['Wrike Proofing v', 'FIUUU Proofing v'],
  ]],
  ['src/client/components/views/WrikeTableView.tsx', [
    ['wrike_secops_table_', 'fiuuu_secops_table_'],
  ]],
  // i18n keys renamed to match the new EN source strings (AZ values carry no brand and stay)
  ['src/client/context/I18nContext.tsx', [
    ["'Give feedback on Jira Navigation':", "'Give feedback on FIUUU Navigation':"],
    ["'What did you like or what can we improve in the new Jira layout?':", "'What did you like or what can we improve in the new FIUUU layout?':"],
    ["'Jira standard keyboard hotkeys & quick navigation':", "'FIUUU standard keyboard hotkeys & quick navigation':"],
    ["'Jira Kanban Board View':", "'FIUUU Kanban Board View':"],
    ["'Jira Table / List View':", "'FIUUU Table / List View':"],
    ["'Wrike Blue (Architecture)':", "'FIUUU Blue (Architecture)':"],
    ["'Wrike Work Intake routes this request directly to active pipelines.':", "'FIUUU Work Intake routes this request directly to active pipelines.':"],
    ["'Wrike Work Intelligence':", "'FIUUU Work Intelligence':"],
    ['"Convert this idea into a real Wrike Task":', '"Convert this idea into a real FIUUU Task":'],
  ]],
  // Server-generated text that lands inside ticket descriptions (user-visible)
  ['src/server/controllers/wrike.controller.ts', [
    ['Converted from Wrike Ideate Canvas', 'Converted from FIUUU Ideate Canvas'],
    ['Submitted via Wrike Request Portal', 'Submitted via FIUUU Request Portal'],
  ]],
];

let totalReplacements = 0;
let failed = [];
for (const [file, pairs] of EDITS) {
  let text = fs.readFileSync(file, 'utf8');
  for (const [oldStr, newStr] of pairs) {
    const count = text.split(oldStr).length - 1;
    if (count === 0) { failed.push(file + ' :: NOT FOUND :: ' + oldStr.slice(0, 70)); continue; }
    text = text.split(oldStr).join(newStr);
    totalReplacements += count;
    console.log(`${count}x  ${file}  "${oldStr.slice(0, 60)}"`);
  }
  fs.writeFileSync(file, text);
}
console.log('\nTOTAL REPLACEMENTS:', totalReplacements);
if (failed.length) { console.log('\nFAILED (need manual attention):'); failed.forEach(f => console.log('  ' + f)); process.exit(1); }
console.log('ALL OK');
