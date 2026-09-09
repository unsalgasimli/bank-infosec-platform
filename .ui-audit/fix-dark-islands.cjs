const fs = require('fs');

// Convert light-theme surfaces to theme tokens so components render correctly
// on both Classic (light) and Alive (dark). bg-white -> bg-semantic-panel etc.
const FILES = [
  'src/client/components/workflows/UniversalWorkflowWorkspace.tsx',
  'src/client/components/assets/CMDBExplorerView.tsx',
  'src/client/components/views/ServiceCatalogView.tsx',
  'src/client/components/tickets/TicketSplitDetail.tsx',
  'src/client/components/tickets/tabs/ActivityTab.tsx',
  'src/client/components/tickets/tabs/ApprovalsTab.tsx',
  'src/client/components/tickets/tabs/AuditTab.tsx',
  'src/client/components/tickets/tabs/CommentsTab.tsx',
  'src/client/components/tickets/tabs/EvidenceTab.tsx',
  'src/client/components/tickets/tabs/LifecycleTab.tsx',
  'src/client/components/tickets/tabs/OverviewTab.tsx',
];

// ordered longest-first to avoid partial overlaps
const SWAPS = [
  ['bg-white/95 backdrop-blur', 'bg-semantic-panel/95 backdrop-blur'],
  ['bg-white/80 backdrop-blur', 'bg-semantic-panel/80 backdrop-blur'],
  ['bg-white/70 backdrop-blur', 'bg-semantic-panel/70 backdrop-blur'],
  ['bg-white/60', 'bg-semantic-panel/60'],
  ['hover:bg-slate-50', 'hover:bg-semantic-hover'],
  ['hover:bg-slate-100', 'hover:bg-semantic-hover'],
  ['bg-white', 'bg-semantic-panel'],
];

for (const file of FILES) {
  let text = fs.readFileSync(file, 'utf8');
  let changed = 0;
  for (const [from, to] of SWAPS) {
    const n = text.split(from).length - 1;
    if (!n) continue;
    text = text.split(from).join(to);
    changed += n;
  }
  if (changed) {
    fs.writeFileSync(file, text);
    console.log(changed + ' swaps in ' + file);
  }
}
console.log('DONE');
