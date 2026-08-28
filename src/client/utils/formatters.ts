/**
 * Enterprise Banking UI/UX Formatters & Display Helpers
 */

const DEPARTMENT_NAMES: Record<string, { az: string; en: string }> = {
  'dept-informasiya-tehlukesizliyinin-temin-edilmesi-departamenti': {
    az: 'İnformasiya Təhlükəsizliyinin Təmin Edilməsi Departamenti',
    en: 'Information Security Assurance Department',
  },
  'dept-secops': {
    az: 'Təhlükəsizlik Əməliyyatları Mərkəzi (SOC)',
    en: 'Security Operations Center (SOC)',
  },
  'dept-it-infrastruktur': {
    az: 'İT və İnfrastruktur Departamenti',
    en: 'IT & Infrastructure Department',
  },
  'dept-daxili-audit-departamenti': {
    az: 'Daxili Audit Departamenti',
    en: 'Internal Audit Department',
  },
  'dept-komplayens-departamenti': {
    az: 'Komplayens Departamenti',
    en: 'Compliance & Regulatory Department',
  },
  'dept-risklerin-idare-edilmesi-departamenti': {
    az: 'Risklərin İdarə Edilməsi Departamenti',
    en: 'Risk Management Department',
  },
  'dept-korporativ-huquq-sobesi': {
    az: 'Korporativ Hüquq Şöbəsi',
    en: 'Corporate Legal Section',
  },
  'dept-istehlakcilarin-huquqlarinin-mudafiesi-sobesi': {
    az: 'İstehlakçıların Hüquqlarının Müdafiəsi Şöbəsi',
    en: 'Consumer Rights Protection Section',
  },
  'dept-ehmedli-filiali': {
    az: 'Əhmədli Filialı',
    en: 'Ahmedli Branch Operations',
  },
  'dept-insan-resurslari-departamenti': {
    az: 'İnsan Resursları Departamenti',
    en: 'Human Resources Department',
  },
};

export function formatDepartmentName(deptIdOrName?: string | null, lang: 'az' | 'en' = 'az'): string {
  if (!deptIdOrName) return lang === 'az' ? 'Departament təyin edilməyib' : 'No department assigned';

  if (DEPARTMENT_NAMES[deptIdOrName]) {
    return DEPARTMENT_NAMES[deptIdOrName][lang];
  }

  // Clean raw slug: dept-informasiya-tehlukesizliyi -> Informasiya Tehlukesizliyi
  const cleaned = deptIdOrName
    .replace(/^dept-/, '')
    .replace(/^sec-/, '')
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .trim();

  if (!cleaned) return deptIdOrName;

  return cleaned
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export interface SecurityClearanceBadge {
  label: string;
  badgeClass: string;
  dotClass: string;
  tier: string;
}

export function formatSecurityClearance(level?: string | null, lang: 'az' | 'en' = 'az'): SecurityClearanceBadge {
  switch (level) {
    case 'HIGHLY_RESTRICTED_HR_LEGAL':
      return {
        label: lang === 'az' ? 'Xüsusilə Məhdudlaşdırılmış (Səviyyə 5 - HR/Hüquq)' : 'Highly Restricted (Tier 5 - HR/Legal)',
        badgeClass: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
        dotClass: 'bg-purple-500',
        tier: lang === 'az' ? 'Səviyyə 5' : 'Tier 5',
      };
    case 'CONFIDENTIAL_SECURITY_ONLY':
      return {
        label: lang === 'az' ? 'Məxfi (Səviyyə 4 - Yalnız Təhlükəsizlik)' : 'Confidential (Tier 4 - SecOps Only)',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
        dotClass: 'bg-rose-500',
        tier: lang === 'az' ? 'Səviyyə 4' : 'Tier 4',
      };
    case 'RESTRICTED':
    case 'CONFIDENTIAL':
      return {
        label: lang === 'az' ? 'Məhdud Giriş (Səviyyə 3 - Bank Daxili)' : 'Restricted (Tier 3 - Banking Internal)',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
        dotClass: 'bg-amber-500',
        tier: lang === 'az' ? 'Səviyyə 3' : 'Tier 3',
      };
    case 'INTERNAL':
      return {
        label: lang === 'az' ? 'Daxili Giriş (Səviyyə 2 - Ümumi Heyət)' : 'Internal (Tier 2 - General Staff)',
        badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
        dotClass: 'bg-blue-500',
        tier: lang === 'az' ? 'Səviyyə 2' : 'Tier 2',
      };
    case 'PUBLIC':
      return {
        label: lang === 'az' ? 'Açıq (Səviyyə 1 - İctimai)' : 'Public (Tier 1 - Open)',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
        dotClass: 'bg-emerald-500',
        tier: lang === 'az' ? 'Səviyyə 1' : 'Tier 1',
      };
    default:
      return {
        label: level || (lang === 'az' ? 'Standart Bank İcazəsi' : 'Standard Banking Clearance'),
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        dotClass: 'bg-slate-400',
        tier: lang === 'az' ? 'Səviyyə 2' : 'Tier 2',
      };
  }
}

const ROLE_DISPLAY_NAMES: Record<string, { az: string; en: string }> = {
  PLATFORM_ADMIN: { az: 'Platforma Administratoru', en: 'Platform Administrator' },
  CISO: { az: 'Baş İnformasiya Təhlükəsizliyi İnzibatçısı (CISO)', en: 'Chief Information Security Officer (CISO)' },
  INFOSEC_ADMIN: { az: 'İnformasiya Təhlükəsizliyi Admini', en: 'InfoSec Administrator' },
  DEPARTMENT_ADMIN: { az: 'Departament Administratoru', en: 'Department Administrator' },
  INFOSEC_MANAGER: { az: 'İnformasiya Təhlükəsizliyi Meneceri', en: 'InfoSec Manager' },
  SECURITY_ANALYST: { az: 'Təhlükəsizlik Analitiki', en: 'Security Analyst' },
  SOC_ANALYST: { az: 'SOC Analitiki (L1/L2)', en: 'SOC Analyst (L1/L2)' },
  APPSEC_ANALYST: { az: 'Tətbiq Təhlükəsizliyi (AppSec) Mütəxəssisi', en: 'AppSec Engineer' },
  VULN_ANALYST: { az: 'Zəifliklərin İdarə Edilməsi Mütəxəssisi', en: 'Vulnerability Management Analyst' },
  GRC_ANALYST: { az: 'GRC və Uyğunluq Analitiki', en: 'GRC & Compliance Analyst' },
  DLP_ANALYST: { az: 'DLP / Məlumat Sızması Analitiki', en: 'DLP Security Analyst' },
  AUDITOR: { az: 'Daxili / Xarici Auditor', en: 'Lead Auditor' },
  IT_ADMIN: { az: 'İT Sistem Administratoru', en: 'IT Systems Administrator' },
  CORE_BANK_ADMIN: { az: 'Əsas Bank Sistemləri Admini', en: 'Core Banking Administrator' },
  DEPARTMENT_MANAGER: { az: 'Departament Müdiri', en: 'Department Manager' },
  TEAM_LEAD: { az: 'Qrup / Şöbə Rəhbəri', en: 'Team Lead / Section Head' },
  REQUESTER: { az: 'Müraciətçi / Əməkdaş', en: 'Requester / Employee' },
  APPROVER: { az: 'Təsdiqləyici Şəxs', en: 'Maker-Checker Approver' },
  ASSIGNEE: { az: 'İcraçı', en: 'Assignee' },
};

export function formatRoleTitle(role?: string | null, lang: 'az' | 'en' = 'az'): string {
  if (!role) return lang === 'az' ? 'Əməkdaş' : 'Employee';
  if (ROLE_DISPLAY_NAMES[role]) return ROLE_DISPLAY_NAMES[role][lang];
  return role.replace(/_/g, ' ');
}
