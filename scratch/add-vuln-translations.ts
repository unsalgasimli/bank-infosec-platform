import * as fs from 'fs';

const dict: Record<string, string> = {
  'Vulnerability & AST Pipeline Command': 'Zəiflik və AST Konveyer Komandası',
  'Continuous AST pipeline integration (SAST, SCA, DAST, Container) with automated fingerprint deduplication.': 'Avtomatlaşdırılmış barmaq izi təkrar təmizləməsi ilə fasiləsiz AST konveyer inteqrasiyası (SAST, SCA, DAST, Konteyner).',
  'Total Findings': 'Ümumi Tapıntı',
  'Scanner ingestion': 'Skaner Qəbulu',
  'AST CI/CD Pipeline': 'AST CI/CD Konveyeri',
  'Findings appear here only after an approved scanner integration submits an authenticated payload to the ingestion API. Demo scanner payloads are disabled.': 'Tapıntılar yalnız təsdiqlənmiş skaner inteqrasiyası qəbul API-nə autentifikasiya edilmiş məlumat göndərdikdən sonra burada görünür. Demo skaner məlumatları deaktivdir.',
  'All Findings': 'Bütün tapıntılar',
  'SAST (Source Code)': 'SAST (Mənbə kodu)',
  'SCA (Dependencies)': 'SCA (Asılılıqlar)',
  'DAST (Web API)': 'DAST (Veb API)',
  'Container & Cloud': 'Konteyner və bulud',
  'Search CVE, CWE, Package...': 'CVE, CWE, Paket axtarın...',
  'Active Findings Inventory': 'Aktiv Tapıntılar İnventarı',
  'Deduplicated Pipeline': 'Təkrarlanması təmizlənmiş konveyer',
  'No vulnerabilities matched the active filter or search query.': 'Aktiv filtrə və ya axtarış sorğusuna uyğun heç bir zəiflik tapılmadı.'
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
console.log('Successfully added vulnerability translations to I18nContext.tsx!');
