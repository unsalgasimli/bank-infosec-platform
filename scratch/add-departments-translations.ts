import * as fs from 'fs';

const dict: Record<string, string> = {
  'Departments & Governance Hub': 'Departamentlər və İdarəetmə Mərkəzi',
  'Banking structure, security perimeter, departmental SLAs and governance settings': 'Bank strukturu, təhlükəsizlik perimetri, departament SLA-ları və idarəetmə parametrləri',
  'Cross-department workflows': 'Departamentlərarası iş axınları',
  'New Department': 'Yeni Departament',
  'Search by department name, code or function...': 'Departament adı, kodu və ya funksiyası ilə axtarın...',
  'Cross-Department Task Orchestration Hub': 'Departamentlərarası Tapşırıq Orkestrləşdirmə Mərkəzi',
  'Multi-Dept Pipeline Engine': 'Çoxşöbəli Konveyer Mühərriki',
  'Orchestrate end-to-end tasks spanning HR, IT Operations, Infosec, Core Banking, and GRC with dependency tracking.': 'HR, IT Əməliyyatları, İnformasiya Təhlükəsizliyi, Əsas Bankçılıq və GRC üzrə asılılıq izlənməsi ilə uçdan-uca tapşırıqları orkestrləşdirin.',
  'Launch Cross-Task Pipeline': 'Şöbələrarası Konveyeri İşə Sal',
  'Turnkey Cross-Department Pipelines (1-Click Orchestration)': 'Açar Təhvili Departamentlərarası Konveyerlər (1 Kliklə Orkestrləşdirmə)',
  'Automated dependency chains connecting multiple bank departments.': 'Bir neçə bank departamentini birləşdirən avtomatlaşdırılmış asılılıq zəncirləri.',
  'Active Multi-Department Pipelines & Handoffs': 'Aktiv Çoxşöbəli Konveyerlər və Təhvildüzəlişlər',
  'Live status across participating banking squads.': 'İştirak edən bank komandaları üzrə canlı status.',
  'No active cross-department pipelines yet': 'Hələ heç bir aktiv departamentlərarası konveyer yoxdur',
  'Click "Launch Cross-Task Pipeline" to orchestrate your first multi-dept workflow.': 'İlk çoxşöbəli iş axınınızı orkestrləşdirmək üçün "Şöbələrarası Konveyeri İşə Sal" düyməsini sıxın.',
  'Departments': 'Departament'
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
console.log('Successfully added Departments & Governance translations to I18nContext.tsx!');
