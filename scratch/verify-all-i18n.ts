import { az } from '../src/client/context/I18nContext.js';

const azKeys = Object.keys(az);
console.log(`\n========================================`);
console.log(`🌟 APEX BANK AZERBAIJANI i18n AUDIT 🌟`);
console.log(`========================================`);
console.log(`Total active Azerbaijani keys in dictionary: ${azKeys.length}`);

// Test critical terms
const criticalKeys = [
  'Overview',
  'Projects & Tasks',
  'Universal Workflow Operations Workspace',
  'Dual-Control Approvals & Governance Gates',
  'Enterprise Risk Register & Heat Matrix',
  'Enterprise Administration & Configuration Engine',
  'Active Directory / LDAP Daily User Synchronization',
  'Vulnerability & AST Pipeline Command',
  'Assets & CMDB',
  'Asset Inventory',
  'Knowledge & Playbooks',
  'SLA Policy Configuration',
  'Locale Settings',
  'Dark mode',
  'Light mode',
  'AI Assistant'
];

let missing = 0;
for (const key of criticalKeys) {
  const tr = az[key];
  if (tr) {
    console.log(`  ✅ "${key}" -> "${tr}"`);
  } else {
    console.log(`  ❌ Missing: "${key}"`);
    missing++;
  }
}

if (missing === 0) {
  console.log(`\n🎉 All critical banking and platform keys successfully verified in Azerbaijani!`);
} else {
  console.error(`\n⚠️ ${missing} critical keys missing!`);
  process.exit(1);
}
