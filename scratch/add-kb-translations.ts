import * as fs from 'fs';

const dict: Record<string, string> = {
  'Knowledge & Playbooks': 'Bilik Bazası və Təlimatlar',
  'Create Playbook': 'Təlimat Yarat',
  'Search playbooks, SOPs...': 'Təlimatları, SOP-ları axtarın...',
  'IR Playbooks': 'İnsident Təlimatları',
  'AppSec': 'Tətbiq Təhlükəsizliyi',
  'GRC SOPs': 'GRC SOP-ları',
  'Approved Standard': 'Təsdiqlənmiş Standart',
  'Author': 'Müəllif',
  'Reviewed': 'Yoxlanılıb',
  'Copied': 'Kopyalandı',
  'Copy Content': 'Məzmunu Kopyala',
  'Print Playbook': 'Təlimatı Çap Et',
  'Tags:': 'Teqlər:',
  'Select a playbook from the left sidebar to view procedures.': 'Prosedurlara baxmaq üçün sol paneldən təlimat seçin.',
  'Create Security Playbook / SOP': 'Təhlükəsizlik Təlimatı / SOP Yarat'
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
console.log('Successfully added KB translations to I18nContext.tsx!');
