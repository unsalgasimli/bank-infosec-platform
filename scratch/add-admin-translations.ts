import * as fs from 'fs';

const dict: Record<string, string> = {
  'Enterprise Administration & Configuration Engine': 'Müəssisə İnzibatçılığı və Konfiqurasiya Mühərriki',
  'RBAC directory, state machines, SLA policies, automation rules, taxonomies, integrations, and immutable audit logs.': 'RBAC kataloqu, vəziyyət maşınları, SLA siyasətləri, avtomatlaşdırma qaydaları, taksonomiyalar, inteqrasiyalar və dəyişdirilməz audit qeydləri.',
  'Settings & Audit Log': 'Parametrlər və Audit Jurnalı',
  'User Directory': 'İstifadəçi Kataloqu',
  'Active Directory / LDAP Daily User Synchronization': 'Active Directory / LDAP Gündəlik İstifadəçi Sinxronizasiyası',
  'DAILY 13:30 GMT+4': 'GÜNDƏLİK 13:30 GMT+4',
  'Automatically pulls all domain users, categorizes by Department/Şöbə, synchronizes added/disabled status, and cleans duplicate records.': 'Bütün domen istifadəçilərini avtomatik çəkir, Departament/Şöbə üzrə kateqoriyalara ayırır, əlavə edilmiş/deaktiv edilmiş statusları sinxronlaşdırır və təkrarlanan qeydləri təmizləyir.',
  'Trigger Daily Check Now': 'Gündəlik Yoxlamanı İndi İşə Sal',
  'Syncing Directory...': 'Kataloq Sinxronlaşdırılır...',
  'Scheduled Daily Run': 'Planlaşdırılmış Gündəlik İcra',
  'UTC+4 Precision Scheduler': 'UTC+4 Dəqiq Planlaşdırıcı',
  'Next Scheduled Check': 'Növbəti Planlaşdırılmış Yoxlama',
  'Today at 13:30 GMT+4': 'Bu gün saat 13:30 GMT+4-də',
  'Armed & active': 'Hazır və aktiv',
  'in ~': '~',
  'minutes': 'dəqiqəyə',
  'Last Synchronization': 'Son Sinxronizasiya',
  'Synchronized on boot': 'Sistem başladıqda sinxronlaşdırıldı',
  'users processed': 'istifadəçi emal edildi',
  'total users': 'ümumi istifadəçi',
  'Account State Stats': 'Hesab Statusu Statistikası',
  '0 Duplicates (Cleaned)': '0 Təkrar (Təmizləndi)',
  'Synchronized Departments (Şöbələr):': 'Sinxronlaşdırılmış Departamentlər (Şöbələr):',
  'active': 'aktiv',
  'Security Operations & Ingestion Listeners': 'Təhlükəsizlik Əməliyyatları və Qəbul Dinləyiciləri',
  'SIEM ingestion listeners, vulnerability scanners, and automated deduplication.': 'SIEM qəbul dinləyiciləri, zəiflik skanerləri və avtomatlaşdırılmış təkrar təmizləmə.',
  'Splunk / QRadar SIEM Ingestion': 'Splunk / QRadar SIEM Qəbulu',
  'LISTENING': 'DİNLƏNİLİR',
  'Endpoint: /api/findings/ingest • Fingerprint Deduplication Active': 'Son nöqtə: /api/findings/ingest • Barmaq İzi ilə Təkrar Aşkar Etmə Aktivdir',
  'Tenable Nessus / Qualys VM • Auto-Triage Severity & Ticket Creation': 'Tenable Nessus / Qualys VM • Avtomatik Ciddilik Təyini və Tapşırıq Yaradılması',
  'Export Audit CSV': 'Audit CSV İxrac Et',
  'Trigger Rule Engine': 'Qayda Mühərrikini İşə Sal',
  'Project operations workspace with Active Directory access boundaries, delivery tracking, and milestone governance.': 'Active Directory giriş sərhədləri, çatdırılmanın izlənməsi və mərhələlərin idarə edilməsi ilə layihə əməliyyatları iş sahəsi.',
  'My Projects': 'Mənim layihələrim',
  'Search project or key...': 'Layihə və ya açar söz axtarın...',
  'Loading authorized projects...': 'Səlahiyyətli layihələr yüklənir...',
  'Search risk code, title, owner...': 'Risk kodu, başlıq, sahib axtarın...',
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
console.log('Successfully added admin & project translations to I18nContext.tsx!');
