import * as fs from 'fs';

const dict: Record<string, string> = {
  'Live service outage tickets, SLA countdown timers, and resolution tracking.': 'Canlı xidmət kəsintisi biletləri, SLA geri sayım taymerləri və həllin izlənməsi.',
  'General IT, SecOps, and access fulfillment tickets.': 'Ümumi İT, SecOps və giriş icrası biletləri.',
  'Production change authorizations, release windows, and rollback plans.': 'İstehsalat dəyişikliyi avtorizasiyaları, buraxılış pəncərələri və geri qaytarma planları.',
  'Root Cause Analysis (RCA) records and Known Error Database (KEDB).': 'Kök Səbəb Analizi (RCA) qeydləri və Məlum Xətalar Verilənlər Bazası (KEDB).',
  'Report Incident': 'İnsident bildir',
  'Request Change': 'Dəyişiklik tələb et',
  'Log Problem': 'Problem qeyd et',
  'No matching tasks found.': 'Uyğun tapşırıq tapılmadı.',
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
console.log('Successfully added service route translations to I18nContext.tsx!');
