import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export type AppLanguage = 'az' | 'en';

const STORAGE_KEY = 'bank-grc.language';
const LOCALES: Record<AppLanguage, string> = { az: 'az-AZ', en: 'en-US' };

/**
 * The UI was built before localization was introduced and contains labels in a
 * number of independent feature modules.  This catalog is deliberately keyed
 * by the English source text so legacy JSX, modal portals, and dynamically
 * mounted drawers share one translation boundary while modules are migrated to
 * `t()` over time.  Product data (ticket titles, evidence names and comments)
 * is intentionally never translated or mutated.
 */
const az: Record<string, string> = {
  'Azerbaijani': 'Azərbaycan dili',
  'English': 'İngilis dili',
  'Language': 'Dil',
  'Switch language': 'Dili dəyiş',
  'Search': 'Axtar',
  'Search tasks, systems, assets, CVEs, SOPs...': 'Tapşırıqları, sistemləri, aktivləri, CVE-ləri, SOP-ları axtarın...',
  'Create': 'Yarat',
  'Create ticket': 'Tapşırıq yarat',
  'New ticket': 'Yeni tapşırıq',
  'Save': 'Yadda saxla',
  'Save changes': 'Dəyişiklikləri yadda saxla',
  'Cancel': 'Ləğv et',
  'Close': 'Bağla',
  'Delete': 'Sil',
  'Edit': 'Redaktə et',
  'Update': 'Yenilə',
  'Submit': 'Göndər',
  'Apply': 'Tətbiq et',
  'Reset': 'Sıfırla',
  'Back': 'Geri',
  'Next': 'Növbəti',
  'Previous': 'Əvvəlki',
  'View': 'Bax',
  'View all': 'Hamısına bax',
  'View Ticket': 'Tapşırığa bax',
  'Open': 'Aç',
  'Download': 'Yüklə',
  'Upload': 'Yüklə',
  'Add': 'Əlavə et',
  'Remove': 'Sil',
  'Confirm': 'Təsdiqlə',
  'Continue': 'Davam et',
  'Loading...': 'Yüklənir...',
  'Saving...': 'Yadda saxlanılır...',
  'Processing...': 'Emal edilir...',
  'No data available': 'Məlumat yoxdur',
  'No results found': 'Nəticə tapılmadı',
  'No items found': 'Element tapılmadı',
  'Required': 'Məcburidir',
  'Optional': 'İstəyə bağlı',
  'Status': 'Status',
  'Priority': 'Prioritet',
  'Type': 'Növ',
  'Category': 'Kateqoriya',
  'Owner': 'Sahib',
  'Assignee': 'İcraçı',
  'Reporter': 'Müraciət edən',
  'Description': 'Təsvir',
  'Details': 'Təfərrüatlar',
  'Comments': 'Şərhlər',
  'Comment': 'Şərh',
  'Activity': 'Fəaliyyət',
  'Audit': 'Audit',
  'Evidence': 'Sübutlar',
  'Attachments': 'Əlavələr',
  'Approvals': 'Təsdiqlər',
  'Overview': 'İcmal',
  'History': 'Tarixçə',
  'Settings': 'Parametrlər',
  'Administration': 'İdarəetmə',
  'Dashboard': 'İdarəetmə paneli',
  'My work': 'İşlərim',
  'My tasks': 'Tapşırıqlarım',
  'Projects & Tasks': 'Layihələr və tapşırıqlar',
  'Service Management': 'Xidmətlərin idarə edilməsi',
  'Security Operations': 'Təhlükəsizlik əməliyyatları',
  'Governance & Compliance': 'İdarəetmə və uyğunluq',
  'Asset Management': 'Aktivlərin idarə edilməsi',
  'Knowledge Base': 'Bilik bazası',
  'Notifications': 'Bildirişlər',
  'Live Security Alerts': 'Canlı təhlükəsizlik xəbərdarlıqları',
  'Mark all read': 'Hamısını oxunmuş qeyd et',
  'All caught up!': 'Bütün bildirişlər oxunub!',
  'No pending alerts or notifications.': 'Gözləyən xəbərdarlıq və ya bildiriş yoxdur.',
  'new': 'yeni',
  'AI Copilot': 'Süni intellekt köməkçisi',
  'Authenticated user': 'Doğrulanmış istifadəçi',
  'Department': 'Şöbə',
  'Bank Unit': 'Bank bölməsi',
  'Active Directory LDAP Auth': 'Active Directory LDAP giriş',
  'Secure sign out': 'Təhlükəsiz çıxış',
  'Sign out': 'Çıxış',
  'Sign in': 'Daxil ol',
  'Username': 'İstifadəçi adı',
  'Password': 'Şifrə',
  'Remember me': 'Məni xatırla',
  'Authentication required': 'Doğrulama tələb olunur',
  'Access denied': 'Giriş qadağandır',
  'Access Denied': 'Giriş qadağandır',
  'Return to safety': 'Təhlükəsiz səhifəyə qayıt',
  'Unauthorized': 'İcazəsiz giriş',
  'Critical': 'Kritik',
  'High': 'Yüksək',
  'Medium': 'Orta',
  'Low': 'Aşağı',
  'Info': 'Məlumat',
  'In Progress': 'İcradadır',
  'Pending': 'Gözləyir',
  'Approved': 'Təsdiqlənib',
  'Rejected': 'Rədd edilib',
  'Resolved': 'Həll edilib',
  'Closed': 'Bağlanıb',
  'Draft': 'Qaralama',
  'Active': 'Aktiv',
  'Inactive': 'Qeyri-aktiv',
  'Yes': 'Bəli',
  'No': 'Xeyr',
  'Today': 'Bu gün',
  'Yesterday': 'Dünən',
  'Date': 'Tarix',
  'From': 'Başlanğıc',
  'To': 'Son',
  'Filter': 'Filtr',
  'Filters': 'Filtrlər',
  'Clear filters': 'Filtrləri təmizlə',
  'Sort by': 'Sırala',
  'Actions': 'Əməliyyatlar',
  'More actions': 'Daha çox əməliyyat',
  'Refresh': 'Yenilə',
  'Export': 'İxrac et',
  'Import': 'İdxal et',
  'Error': 'Xəta',
  'Success': 'Uğurlu',
  'Warning': 'Xəbərdarlıq',
  'Immutable Audit Log': 'Dəyişdirilməz audit jurnalı',
  'Append-only chronological log of all state transitions, approvals, field changes, and access records.': 'Bütün status keçidlərinin, təsdiqlərin, sahə dəyişikliklərinin və giriş qeydlərinin əlavə-yazılı xronoloji jurnalı.',
  'Events': 'Hadisə',
  'No audit events are available for this ticket yet.': 'Bu tapşırıq üçün hələ audit hadisəsi yoxdur.',
  'Field Changes:': 'Sahə dəyişiklikləri:',
  'Metadata:': 'Metaməlumat:',
  'Service Incidents': 'Xidmət insidentləri',
  'Report Incident': 'İnsident bildir',
  'Change Management (CAB)': 'Dəyişikliklərin idarə edilməsi (CAB)',
  'Problem Management & RCA': 'Problem idarəetməsi və kök səbəb analizi',
  'Dual-Control Sign Off': 'İkili nəzarət təsdiqi',
  'CISO Approved': 'CISO tərəfindən təsdiqlənib',
  'Feedback Pins': 'Rəy nişanları',
  'Live DB Sync': 'Canlı verilənlər bazası sinxronizasiyası',
  'Add pin annotation to database...': 'Verilənlər bazasına nişan qeydi əlavə edin...',
  'Saving Pin...': 'Nişan yadda saxlanılır...',
  'Pin Markup Comment': 'Nişan şərhini əlavə et',
  'No comments yet.': 'Hələ şərh yoxdur.',
  'Add a comment...': 'Şərh əlavə edin...',
  'Post comment': 'Şərhi göndər',
  'Select an option': 'Seçim edin',
  'Select a department': 'Şöbə seçin',
  'Select a user': 'İstifadəçi seçin',
  'Search users...': 'İstifadəçiləri axtarın...',
  'Search tickets...': 'Tapşırıqları axtarın...',
  'Search assets...': 'Aktivləri axtarın...',
  'Search knowledge base...': 'Bilik bazasını axtarın...',
  'Export Audit CSV': 'Audit CSV-ni ixrac et',
  'Add User Persona': 'İstifadəçi profili əlavə et',
  'Trigger Rule Engine': 'Qayda mühərrikini işə sal',
  'No audit events matched your search query.': 'Axtarış sorğunuza uyğun audit hadisəsi tapılmadı.',
  'Confidentiality Tiers': 'Məxfilik səviyyələri',
  'Technical Severity Levels': 'Texniki ciddilik səviyyələri',
  'Core Categories': 'Əsas kateqoriyalar',
  'Scheduled Daily Run': 'Planlaşdırılmış gündəlik icra',
  'Next Scheduled Check': 'Növbəti planlaşdırılmış yoxlama',
  'Last Synchronization': 'Son sinxronizasiya',
  'Account State Stats': 'Hesab statusu statistikası',
  'All Departments': 'Bütün şöbələr',
  'All Statuses': 'Bütün statuslar',
  'Active Users Only': 'Yalnız aktiv istifadəçilər',
  'Disabled in AD': 'AD-də deaktiv edilib',
  'AD Connection': 'AD bağlantısı',
  'Employee Name & sAMAccountName': 'Əməkdaş adı və sAMAccountName',
  'Roles': 'Rollar',
  'Clearance Level': 'Giriş icazəsi səviyyəsi',
  'AD Status': 'AD statusu',
  'Full Name:': 'Tam ad:',
  'Corporate Email:': 'Korporativ e-poçt:',
  'Role Assignment:': 'Rol təyinatı:',
  'Department:': 'Şöbə:',
  'LDAPS Server URL:': 'LDAPS server URL-i:',
  'Search Base DN:': 'Axtarış əsas DN-i:',
  'Bind Password:': 'Bağlama şifrəsi:',
  'Sync Real Active Directory Users': 'Real Active Directory istifadəçilərini sinxronlaşdır',
  'CMDB Service & Asset Relationship Topology': 'CMDB xidmət və aktiv əlaqələri topologiyası',
  'Tier-1 Banking Business Services': '1-ci səviyyə bank biznes xidmətləri',
  'Applications & Microservices': 'Tətbiqlər və mikroxidmətlər',
  'Physical & Virtual CIs': 'Fiziki və virtual konfiqurasiya vahidləri',
  'CI Inspector': 'Konfiqurasiya vahidi yoxlayıcısı',
  'Criticality Tier:': 'Kritiklik səviyyəsi:',
  'Data Classification:': 'Məlumat təsnifatı:',
  'Tech Stack:': 'Texnologiya dəsti:',
  'Connected DBs:': 'Qoşulmuş verilənlər bazaları:',
  'No active tickets linked to this CI.': 'Bu konfiqurasiya vahidi ilə əlaqəli aktiv tapşırıq yoxdur.',
  'Banking Business Services Registry': 'Bank biznes xidmətləri reyestri',
  'All Core Services Online': 'Bütün əsas xidmətlər aktivdir',
  'SLA Target:': 'SLA hədəfi:',
  'Current 30d Uptime:': 'Cari 30 günlük əlçatanlıq:',
  'Owner:': 'Sahib:',
  'Rebalance Analyst Workload': 'Analitik iş yükünü yenidən bölüşdür',
  'Live Sync': 'Canlı sinxronizasiya',
  'Select source analyst...': 'Mənbə analitikini seçin...',
  'Select target analyst...': 'Hədəf analitikini seçin...',
  'Export Briefing': 'Brifinqi ixrac et',
  'Edit layout': 'Düzülüşü redaktə et',
  'No matching issues found for filter:': 'Filtrə uyğun problem tapılmadı:',
  'SLA Met Rate': 'SLA yerinə yetirmə faizi',
  'Exceptions': 'İstisnalar',
  'Active & Validated': 'Aktiv və təsdiqlənmiş',
  'SLA Escalation Timeline:': 'SLA eskalasiya zaman xətti:',
  'Total Active Infrastructure': 'Cəmi aktiv infrastruktur',
  'Key Executive Recommendations:': 'Rəhbərlik üçün əsas tövsiyələr:',
  'Export / Print PDF': 'PDF ixrac et / çap et',
  'My Open Load': 'Mənim açıq iş yüküm',
  'SLA Urgent': 'Təcili SLA',
  'Issues currently waiting on your action.': 'Hazırda sizin əməliyyatınızı gözləyən problemlər.',
  'Governance & exception gates requiring approval.': 'Təsdiq tələb edən idarəetmə və istisna mərhələləri.',
  'Tickets near breach needing fast turnaround.': 'Sürətli icra tələb edən SLA pozuntusuna yaxın tapşırıqlar.',
  'Add Asset': 'Aktiv əlavə et',
  'Asset Name & CMDB Ref': 'Aktiv adı və CMDB istinadı',
  'Hostname / IP': 'Host adı / IP',
  'Operating System': 'Əməliyyat sistemi',
  'Environment': 'Mühit',
  'Owner Squad': 'Məsul komanda',
  'Critical Findings': 'Kritik tapıntılar',
  'Add CMDB Infrastructure Asset': 'CMDB infrastruktur aktivi əlavə et',
  'Asset Name:': 'Aktiv adı:',
  'Hostname (FQDN):': 'Host adı (FQDN):',
  'IP Address:': 'IP ünvanı:',
  'Asset Type:': 'Aktiv növü:',
  'Criticality:': 'Kritiklik:',
  'Operating System & Runtime:': 'Əməliyyat sistemi və iş mühiti:',
  'Owner Team / Squad:': 'Məsul komanda:',
  'Register Application': 'Tətbiqi qeydiyyata al',
  'Databases:': 'Verilənlər bazaları:',
  'Git Repos:': 'Git repozitoriyaları:',
  'Open Findings:': 'Açıq tapıntılar:',
  'Internet Exposed:': 'İnternetə açıq:',
  'Register Banking Application': 'Bank tətbiqini qeydiyyata al',
  'Application Name:': 'Tətbiq adı:',
  'Application Code:': 'Tətbiq kodu:',
  'Description & Business Purpose:': 'Təsvir və biznes məqsədi:',
  'Tier Criticality:': 'Səviyyə kritikliyi:',
  'Tech Stack (comma separated):': 'Texnologiya dəsti (vergüllə ayrılmış):',
  'Databases (comma separated):': 'Verilənlər bazaları (vergüllə ayrılmış):',
  'Add Sticky Note': 'Yapışqan qeyd əlavə et',
  'No sticky notes in this category': 'Bu kateqoriyada yapışqan qeyd yoxdur',
  'Create First Note': 'İlk qeydi yarat',
  'Convert to Task': 'Tapşırığa çevir',
  'Ideate Inspector': 'İdeya yoxlayıcısı',
  'Idea Title': 'İdeya başlığı',
  'Brainstorming Notes': 'Beyin həmləsi qeydləri',
  'Domain Category': 'Domen kateqoriyası',
  'Business Priority': 'Biznes prioriteti',
  'Idea Tags': 'İdeya etiketləri',
  'Workflow Catalog': 'İş axını kataloqu',
  'Stages': 'Mərhələlər',
  'Select…': 'Seçin…',
  'Node configuration': 'Düyün konfiqurasiyası',
  'Description / instructions': 'Təsvir / təlimatlar',
  'Assignment strategy': 'Təyinat strategiyası',
  'Unassigned team queue': 'Təyin edilməmiş komanda növbəsi',
  'Role based': 'Rola əsaslanan',
  'Requester manager': 'Müraciət edənin rəhbəri',
  'Employee manager': 'Əməkdaşın rəhbəri',
  'Department owner': 'Şöbə sahibi',
  'Service owner': 'Xidmət sahibi',
  'Application owner': 'Tətbiq sahibi',
  'Configuration item owner': 'Konfiqurasiya vahidinin sahibi',
};

const catalog: Record<AppLanguage, Record<string, string>> = { az, en: {} };

// Reserved terminology for future source-level translations. The runtime only
// applies exact catalog entries: ticket titles, comments, file names and other
// user-provided data must never be machine-translated in place.
const azTerms: Record<string, string> = {
  account: 'hesab', active: 'aktiv', add: 'əlavə et', admin: 'inzibatçı', administration: 'idarəetmə',
  alert: 'xəbərdarlıq', alerts: 'xəbərdarlıqlar', all: 'bütün', analysis: 'analiz', analyst: 'analitik',
  application: 'tətbiq', applications: 'tətbiqlər', approval: 'təsdiq', approvals: 'təsdiqlər', asset: 'aktiv', assets: 'aktivlər',
  audit: 'audit', available: 'mövcud', backlog: 'növbə', banking: 'bankçılıq', base: 'əsas', board: 'şura',
  business: 'biznes', category: 'kateqoriya', certificate: 'sertifikat', change: 'dəyişiklik', changes: 'dəyişikliklər',
  classification: 'təsnifat', clear: 'təmizlə', comment: 'şərh', comments: 'şərhlər', compliance: 'uyğunluq',
  configuration: 'konfiqurasiya', confidential: 'məxfi', connection: 'bağlantı', control: 'nəzarət',
  core: 'əsas', create: 'yarat', critical: 'kritik', current: 'cari', data: 'məlumat', database: 'verilənlər bazası',
  date: 'tarix', department: 'şöbə', description: 'təsvir', details: 'təfərrüatlar', disabled: 'deaktiv',
  document: 'sənəd', documents: 'sənədlər', domain: 'domen', download: 'yüklə', edit: 'redaktə et',
  employee: 'əməkdaş', environment: 'mühit', error: 'xəta', event: 'hadisə', events: 'hadisələr',
  evidence: 'sübut', export: 'ixrac et', filter: 'filtr', findings: 'tapıntılar', full: 'tam',
  governance: 'idarəetmə', high: 'yüksək', history: 'tarixçə', idea: 'ideya', incident: 'insident', incidents: 'insidentlər',
  information: 'məlumat', integration: 'inteqrasiya', inventory: 'inventar', issue: 'problem', issues: 'problemlər',
  knowledge: 'bilik', last: 'son', level: 'səviyyə', live: 'canlı', low: 'aşağı', management: 'idarəetmə',
  name: 'ad', new: 'yeni', next: 'növbəti', node: 'düyün', notification: 'bildiriş', notifications: 'bildirişlər',
  open: 'açıq', operating: 'əməliyyat', owner: 'sahib', password: 'şifrə', pending: 'gözləyir',
  policy: 'siyasət', priority: 'prioritet', problem: 'problem', process: 'proses', projects: 'layihələr',
  register: 'qeydiyyat', report: 'hesabat', requester: 'müraciət edən', required: 'məcburi',
  risk: 'risk', risks: 'risklər', role: 'rol', roles: 'rollar', save: 'yadda saxla', search: 'axtar',
  security: 'təhlükəsizlik', service: 'xidmət', services: 'xidmətlər', settings: 'parametrlər',
  severity: 'ciddilik', sign: 'imzala', status: 'status', system: 'sistem', systems: 'sistemlər',
  task: 'tapşırıq', tasks: 'tapşırıqlar', technical: 'texniki', ticket: 'tapşırıq', tickets: 'tapşırıqlar',
  time: 'vaxt', title: 'başlıq', total: 'cəmi', type: 'növ', update: 'yenilə', upload: 'yüklə',
  user: 'istifadəçi', users: 'istifadəçilər', view: 'bax', vulnerability: 'zəiflik', vulnerabilities: 'zəifliklər',
  warning: 'xəbərdarlıq', workflow: 'iş axını', workflows: 'iş axınları', work: 'iş',
};

export const localizationGlossary = azTerms;

export const translate = (text: string, language: AppLanguage): string => {
  if (language === 'en') return text;
  return catalog[language][text.trim()] ?? text;
};

interface I18nContextValue {
  language: AppLanguage;
  locale: string;
  setLanguage: (language: AppLanguage) => void;
  t: (text: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const localizableAttributes = ['placeholder', 'title', 'aria-label', 'alt'] as const;

/** Applies the catalog to legacy JSX text, portal content and subsequent modal renders. */
const LocalizedDocument: React.FC<{ language: AppLanguage }> = ({ language }) => {
  const originalsRef = useRef(new WeakMap<Text, string>());
  useLayoutEffect(() => {
    const originals = originalsRef.current;
    let translating = false;

    const localizeElement = (element: Element) => {
      if (element.closest('[data-i18n-skip]') || ['SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(element.tagName)) return;
      localizableAttributes.forEach((attribute) => {
        const originalAttribute = `data-i18n-${attribute}`;
        const original = element.getAttribute(originalAttribute) ?? element.getAttribute(attribute);
        if (!original) return;
        if (!element.hasAttribute(originalAttribute)) element.setAttribute(originalAttribute, original);
        const value = translate(original, language);
        if (element.getAttribute(attribute) !== value) element.setAttribute(attribute, value);
      });
    };

    const localizeText = (node: Text) => {
      const parent = node.parentElement;
      if (!parent || parent.closest('[data-i18n-skip]') || ['SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(parent.tagName)) return;
      const original = originals.get(node) ?? node.data;
      if (!original.trim() || /[{}]/.test(original)) return;
      if (!originals.has(node)) originals.set(node, original);
      const value = translate(original, language);
      if (node.data !== value) node.data = value;
    };

    const localize = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) localizeText(root as Text);
      if (root.nodeType === Node.ELEMENT_NODE) localizeElement(root as Element);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE) localizeText(node as Text);
        else localizeElement(node as Element);
      }
    };

    localize(document.body);
    const observer = new MutationObserver((mutations) => {
      if (translating) return;
      translating = true;
      mutations.forEach((mutation) => mutation.addedNodes.forEach(localize));
      translating = false;
    });
    observer.observe(document.body, { attributes: true, attributeFilter: [...localizableAttributes], characterData: true, childList: true, subtree: true });
    return () => observer.disconnect();
  }, [language]);

  return null;
};

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'az' || stored === 'en' ? stored : 'az';
  });

  const setLanguage = useCallback((next: AppLanguage) => {
    setLanguageState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = 'ltr';
    document.title = language === 'az'
      ? 'BankGRC | İnformasiya Təhlükəsizliyi və İdarəetmə Platforması'
      : 'BankGRC | Information Security & Governance Platform';
  }, [language]);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    locale: LOCALES[language],
    setLanguage,
    t: (text) => translate(text, language),
  }), [language, setLanguage]);

  return <I18nContext.Provider value={value}><LocalizedDocument language={language} />{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within an I18nProvider');
  return context;
};
