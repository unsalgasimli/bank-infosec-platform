import * as fs from 'fs';

const dict: Record<string, string> = {
  'SLA Policy Configuration': 'SLA Siyasəti Konfiqurasiyası',
  'Persisted PostgreSQL configuration with server-side validation and audit history.': 'Server tərəfli yoxlama və audit tarixçəsi ilə saxlanılan PostgreSQL konfiqurasiyası.',
  'New SLA Policy': 'Yeni SLA Siyasəti',
  'Loading persisted SLA policies...': 'Saxlanılan SLA siyasətləri yüklənir...',
  'No SLA policies are configured in the database.': 'Verilənlər bazasında heç bir SLA siyasəti konfiqurasiya edilməyib.',
  'No description provided.': 'Heç bir təsvir qeyd edilməyib.',
  'State Machine Lifecycle & Validated Transitions': 'Vəziyyət Maşınının Həyat Dövrü və Təsdiqlənmiş Keçidlər',
  'Banking Ticket Taxonomy & Classification Scheme': 'Bank Bilet Taksonomiyası və Təsnifat Sxemi',
  'Standardized categories, severity metrics, and confidentiality clearance tiers.': 'Standartlaşdırılmış kateqoriyalar, ciddilik metrikləri və məxfilik dərəcələri.',
  'Confidentiality Tiers': 'Məxfilik Dərəcələri',
  'Technical Severity Levels': 'Texniki Ciddilik Səviyyələri',
  'Core Categories': 'Əsas Kateqoriyalar',
  'All': 'Hamısı',
};

let i18nContent = fs.readFileSync('src/client/context/I18nContext.tsx', 'utf-8');
const marker = "  'Quick Shortcuts': 'Sürətli keçidlər',";
const index = i18nContent.indexOf(marker);
if (index === -1) {
  console.error("Marker not found");
  process.exit(1);
}

let newLines = '\n';
for (const [k, v] of Object.entries(dict)) {
  const checkKey = `  '${k}':`;
  const checkKeyDbl = `  "${k}":`;
  if (!i18nContent.includes(checkKey) && !i18nContent.includes(checkKeyDbl)) {
    newLines += `  ${JSON.stringify(k)}: ${JSON.stringify(v)},\n`;
  }
}

i18nContent = i18nContent.slice(0, index + marker.length) + newLines + i18nContent.slice(index + marker.length);
fs.writeFileSync('src/client/context/I18nContext.tsx', i18nContent, 'utf-8');
console.log('Successfully added SLA & Taxonomy translations to I18nContext.tsx!');
