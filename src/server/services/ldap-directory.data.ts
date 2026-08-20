import { BankRole, SecurityClearanceLevel } from '../../shared/types/auth.js';

export interface LDAPRawEntry {
  sAMAccountName?: string;
  userPrincipalName?: string;
  mail?: string;
  displayName?: string;
  givenName?: string;
  sn?: string;
  title?: string;
  department?: string;
  company?: string;
  distinguishedName?: string;
  memberOf?: string[] | string;
  userAccountControl?: number | string;
  accountExpires?: string | number;
  whenCreated?: string;
  whenChanged?: string;
}

export interface DepartmentMappingResult {
  departmentId: string;
  divisionId: string;
  teamIds: string[];
  departmentName: string;
  departmentCode: string;
  roles: BankRole[];
  securityClearance: SecurityClearanceLevel;
}

/**
 * Safely converts any LDAP attribute value (string, string[], Buffer, or primitive) to clean string
 */
export function toSafeString(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (Array.isArray(val)) return toSafeString(val[0]);
  if (Buffer.isBuffer(val)) return val.toString('utf8').trim();
  return String(val).trim();
}

export function slugifyDept(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/ə/g, 'e')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ç/g, 'c')
      .replace(/ğ/g, 'g')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'general'
  );
}

export function generateDeptCode(text: string): string {
  const words = text
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['və', 'va', 've', 'and', 'the', 'departamenti', 'sobesi', 'şöbəsi'].includes(w.toLowerCase()));
  if (words.length >= 2) {
    return words.slice(0, 3).map((w) => w[0].toUpperCase()).join('') + '_DEPT';
  }
  const clean = slugifyDept(text).toUpperCase().replace(/-/g, '_');
  return clean.slice(0, 12);
}

export function getDepartmentColor(deptName: string): string {
  const norm = deptName.toLowerCase();
  if (norm.includes('təhlükəsiz') || norm.includes('security') || norm.includes('kiber')) return '#0052CC';
  if (norm.includes('it') || norm.includes('infrastruktur') || norm.includes('texnologiya')) return '#00875A';
  if (norm.includes('kredit')) return '#FFAB00';
  if (norm.includes('maliyyə') || norm.includes('mühasibat') || norm.includes('finance')) return '#6554C0';
  if (norm.includes('xəzinə') || norm.includes('treasury')) return '#36B37E';
  if (norm.includes('audit')) return '#FF5630';
  if (norm.includes('risk') || norm.includes('grc') || norm.includes('komplayens')) return '#FF8B00';
  if (norm.includes('hr') || norm.includes('kadr') || norm.includes('insan')) return '#00B8D9';
  if (norm.includes('hüquq') || norm.includes('legal')) return '#403294';
  if (norm.includes('filial') || norm.includes('branch')) return '#2684FF';
  if (norm.includes('marketinq') || norm.includes('pr')) return '#E34935';
  if (norm.includes('müştəri') || norm.includes('call')) return '#57D9A3';
  return '#5E6C84';
}

export function getDepartmentIcon(deptName: string): string {
  const norm = deptName.toLowerCase();
  if (norm.includes('təhlükəsiz') || norm.includes('security') || norm.includes('kiber')) return 'Shield';
  if (norm.includes('it') || norm.includes('infrastruktur') || norm.includes('texnologiya')) return 'Server';
  if (norm.includes('kredit')) return 'CreditCard';
  if (norm.includes('maliyyə') || norm.includes('mühasibat') || norm.includes('finance') || norm.includes('xəzinə')) return 'DollarSign';
  if (norm.includes('audit')) return 'CheckSquare';
  if (norm.includes('risk') || norm.includes('grc')) return 'AlertTriangle';
  if (norm.includes('hr') || norm.includes('kadr') || norm.includes('insan')) return 'Users';
  if (norm.includes('hüquq') || norm.includes('legal')) return 'BookOpen';
  if (norm.includes('filial') || norm.includes('branch')) return 'Building';
  if (norm.includes('marketinq')) return 'TrendingUp';
  if (norm.includes('müştəri') || norm.includes('call')) return 'PhoneCall';
  return 'Briefcase';
}

export function normalizeAzerbaijani(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .replace(/ə/g, 'e')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g');
}

/**
 * Returns OU components in most-specific-first order from an Active Directory DN.
 * Escaped separators (for example `OU=Platform\, DevOps`) are preserved correctly.
 */
export function extractOrganizationalUnits(distinguishedName: any = ''): string[] {
  const dn = toSafeString(distinguishedName);
  if (!dn) return [];

  const organizationalUnits: string[] = [];
  const ouPattern = /(?:^|,)\s*OU=((?:\\.|[^,])*)/gi;
  let match: RegExpExecArray | null;

  while ((match = ouPattern.exec(dn)) !== null) {
    const value = match[1]
      .replace(/\\([,=+<>#;"\\])/g, '$1')
      .replace(/\\([0-9a-f]{2})/gi, (_full, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
      .trim();
    if (value) organizationalUnits.push(value);
  }

  return organizationalUnits;
}

function getSpecificItOrganizationalUnit(distinguishedName: any, adDepartment: string): string | undefined {
  const parentDepartment = normalizeAzerbaijani(adDepartment).replace(/\s+/g, ' ').trim();
  const technicalContainers = new Set([
    'bank users',
    'ho users',
    'branch users',
    'users',
    'bosses',
  ]);

  return extractOrganizationalUnits(distinguishedName).find((ou) => {
    const normalizedOu = normalizeAzerbaijani(ou).replace(/\s+/g, ' ').trim();
    if (!normalizedOu || technicalContainers.has(normalizedOu)) return false;
    if (/^(ie\s+)?test$/.test(normalizedOu)) return false;
    return normalizedOu !== parentDepartment && !normalizedOu.includes('informasiya texnologiyalari departamenti');
  });
}

/**
 * Intelligently maps Active Directory department/şöbə and security groups to BankDepartment and assigns appropriate roles
 */
export function mapDepartment(
  adDepartment: any = '',
  adTitle: any = '',
  groups: any = [],
  distinguishedName: any = ''
): DepartmentMappingResult {
  const deptStr = toSafeString(adDepartment);
  const titleStr = toSafeString(adTitle);
  const deptNorm = normalizeAzerbaijani(deptStr);
  const titleNorm = normalizeAzerbaijani(titleStr);

  const groupArr = Array.isArray(groups) ? groups : groups ? [groups] : [];
  const groupNorms = groupArr.map((g) => normalizeAzerbaijani(toSafeString(g))).filter(Boolean);

  let result: DepartmentMappingResult;

  // 1. Information Security & Cyber Defense (İnformasiya Təhlükəsizliyi)
  if (
    deptNorm.includes('infosec') ||
    deptNorm.includes('tehlukesizliyi') ||
    deptNorm.includes('tehlukesizlik') ||
    deptNorm.includes('cyber') ||
    deptNorm.includes('kiber') ||
    deptNorm.includes('soc') ||
    deptNorm.includes('appsec') ||
    deptNorm === 'dept-secops'
  ) {
    let roles: BankRole[] = ['SECURITY_ANALYST', 'APPROVER', 'REQUESTER'];
    let teamIds = ['team-soc'];

    if (
      titleNorm.includes('ciso') ||
      titleNorm.includes('chief information security') ||
      titleNorm.includes('departament direktoru') ||
      titleNorm.includes('sobe reisi')
    ) {
      roles = ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'APPROVER', 'REQUESTER'];
      teamIds = ['team-soc', 'team-grc'];
    } else if (titleNorm.includes('soc') || titleNorm.includes('incident') || titleNorm.includes('triage')) {
      roles = ['DEPARTMENT_ADMIN', 'INFOSEC_ADMIN', 'SECURITY_ANALYST', 'SOC_ANALYST', 'APPROVER', 'REQUESTER'];
      teamIds = ['team-soc'];
    } else if (titleNorm.includes('appsec') || titleNorm.includes('pentest') || titleNorm.includes('vulnerability')) {
      roles = ['APPSEC_ANALYST', 'SECURITY_ANALYST', 'REQUESTER'];
      teamIds = ['team-appsec'];
    }

    result = {
      departmentId: 'dept-secops',
      divisionId: 'div-sec',
      teamIds,
      departmentName: deptStr || 'İnformasiya Təhlükəsizliyi & Kiber Müdafiə',
      departmentCode: 'INFOSEC',
      roles,
      securityClearance: 'CONFIDENTIAL_SECURITY_ONLY',
    };
  }

  // 2. IT Infrastructure, Cloud & Operations (İT İnfrastruktur)
  else if (
    deptNorm.includes('infrastruktur') ||
    deptNorm.includes('infrastructure') ||
    deptNorm.includes('texnologiya') ||
    deptNorm.includes('technology') ||
    deptNorm.includes('sebeke') ||
    deptNorm.includes('helpdesk') ||
    deptNorm.includes('texniki destek') ||
    deptNorm.includes('sistem inzibat') ||
    deptNorm.includes('ikt') ||
    deptNorm.includes('it_ops') ||
    deptNorm.includes('it ') ||
    deptNorm === 'dept-it' ||
    deptNorm === 'it'
  ) {
    let roles: BankRole[] = ['IT_ADMIN', 'APPROVER', 'REQUESTER'];
    if (titleNorm.includes('head') || titleNorm.includes('reis') || titleNorm.includes('lead') || titleNorm.includes('direktor')) {
      roles = ['DEPARTMENT_ADMIN', 'IT_ADMIN', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-it',
      divisionId: 'div-it',
      teamIds: ['team-it-infra'],
      departmentName: deptStr || 'İT İnfrastruktur və Bulud Əməliyyatları',
      departmentCode: 'IT_OPS',
      roles,
      securityClearance: 'CONFIDENTIAL_SECURITY_ONLY',
    };
  }

  // 3. Software Development & Engineering (Proqram Təminatı)
  else if (
    deptNorm.includes('proqram') ||
    deptNorm.includes('software') ||
    deptNorm.includes('development') ||
    deptNorm.includes('proqramlasdirma') ||
    deptNorm.includes('inteqrasiya') ||
    deptNorm.includes('reqemsal hell')
  ) {
    let roles: BankRole[] = ['APPLICATION_OWNER', 'REQUESTER'];
    if (titleNorm.includes('head') || titleNorm.includes('reis') || titleNorm.includes('lead') || titleNorm.includes('direktor')) {
      roles = ['DEPARTMENT_ADMIN', 'TEAM_LEAD', 'APPLICATION_OWNER', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-software-eng',
      divisionId: 'div-it',
      teamIds: ['team-devsecops'],
      departmentName: deptStr || 'Proqram Təminatı və Rəqəmsal Həllər',
      departmentCode: 'DEV_ENG',
      roles,
      securityClearance: 'CONFIDENTIAL_SECURITY_ONLY',
    };
  }

  // 4. Human Resources & Personnel (İnsan Resursları)
  else if (
    deptNorm.includes('hr') ||
    deptNorm.includes('human') ||
    deptNorm.includes('insan') ||
    deptNorm.includes('resurs') ||
    deptNorm.includes('kadr') ||
    deptNorm.includes('personnel') ||
    deptNorm.includes('telim') ||
    deptNorm === 'dept-hr'
  ) {
    let roles: BankRole[] = ['HR_ADMIN', 'REQUESTER'];
    if (titleNorm.includes('head') || titleNorm.includes('reis') || titleNorm.includes('lead') || titleNorm.includes('direktor')) {
      roles = ['DEPARTMENT_ADMIN', 'HR_ADMIN', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-hr',
      divisionId: 'div-hr',
      teamIds: ['team-hr-ops'],
      departmentName: deptStr || 'İnsan Resursları və Kadrlar',
      departmentCode: 'HR_LEGAL',
      roles,
      securityClearance: 'HIGHLY_RESTRICTED_HR_LEGAL',
    };
  }

  // 5. Core Banking & SWIFT Systems (Bank Əməliyyat Sistemləri)
  else if (
    deptNorm.includes('swift') ||
    deptNorm.includes('plastik kart') ||
    deptNorm.includes('kartlar') ||
    deptNorm.includes('prosessinq') ||
    deptNorm.includes('klirinq') ||
    deptNorm.includes('core bank') ||
    deptNorm.includes('bank sistem') ||
    deptNorm.includes('emeliyyat') ||
    deptNorm === 'dept-core'
  ) {
    let roles: BankRole[] = ['CORE_BANK_ADMIN', 'APPLICATION_OWNER', 'APPROVER', 'REQUESTER'];
    if (titleNorm.includes('head') || titleNorm.includes('reis') || titleNorm.includes('lead') || titleNorm.includes('direktor')) {
      roles = ['DEPARTMENT_ADMIN', 'CORE_BANK_ADMIN', 'APPLICATION_OWNER', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-core',
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: deptStr || 'Bank Əməliyyat Sistemləri və SWIFT',
      departmentCode: 'CORE_BANK',
      roles,
      securityClearance: 'CONFIDENTIAL_SECURITY_ONLY',
    };
  }

  // 6. GRC & Risk Management (Risklərin İdarə Edilməsi və Komplayens)
  else if (
    deptNorm.includes('risk') ||
    deptNorm.includes('grc') ||
    deptNorm.includes('compliance') ||
    deptNorm.includes('komplayens') ||
    deptNorm.includes('aml') ||
    deptNorm.includes('maliyye monitorinq') ||
    deptNorm === 'dept-grc'
  ) {
    let roles: BankRole[] = ['AUDITOR', 'REQUESTER'];
    if (titleNorm.includes('head') || titleNorm.includes('reis') || titleNorm.includes('lead') || titleNorm.includes('officer') || titleNorm.includes('direktor')) {
      roles = ['DEPARTMENT_ADMIN', 'AUDITOR', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-grc',
      divisionId: 'div-sec',
      teamIds: ['team-grc'],
      departmentName: deptStr || 'İdarəetmə, Risk və Komplayens (GRC)',
      departmentCode: 'GRC',
      roles,
      securityClearance: 'RESTRICTED',
    };
  }

  // 7. Internal Audit (Daxili Audit)
  else if (deptNorm.includes('audit') || deptNorm.includes('daxili nezaret')) {
    let roles: BankRole[] = ['AUDITOR', 'REQUESTER'];
    if (titleNorm.includes('head') || titleNorm.includes('reis') || titleNorm.includes('direktor')) {
      roles = ['DEPARTMENT_ADMIN', 'AUDITOR', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-audit',
      divisionId: 'div-sec',
      teamIds: ['team-grc'],
      departmentName: deptStr || 'Daxili Audit Departamenti',
      departmentCode: 'AUDIT',
      roles,
      securityClearance: 'RESTRICTED',
    };
  }

  // 8. Legal Department (Hüquq Departamenti)
  else if (deptNorm.includes('huquq') || deptNorm.includes('legal') || deptNorm.includes('mehkeme') || deptNorm.includes('muqavile')) {
    let roles: BankRole[] = ['REQUESTER', 'APPROVER'];
    if (titleNorm.includes('head') || titleNorm.includes('reis') || titleNorm.includes('direktor')) {
      roles = ['DEPARTMENT_ADMIN', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-legal',
      divisionId: 'div-hr',
      teamIds: ['team-hr-ops'],
      departmentName: deptStr || 'Hüquq Departamenti',
      departmentCode: 'LEGAL',
      roles,
      securityClearance: 'HIGHLY_RESTRICTED_HR_LEGAL',
    };
  }

  // 9. Finance & Accounting (Maliyyə və Mühasibatlıq)
  else if (
    deptNorm.includes('maliyye') ||
    deptNorm.includes('muhasibat') ||
    deptNorm.includes('finance') ||
    deptNorm.includes('accounting') ||
    deptNorm.includes('budce')
  ) {
    let roles: BankRole[] = ['REQUESTER', 'APPROVER'];
    if (titleNorm.includes('head') || titleNorm.includes('reis') || titleNorm.includes('bas muhasib') || titleNorm.includes('direktor')) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-finance',
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: deptStr || 'Maliyyə və Mühasibatlıq Departamenti',
      departmentCode: 'FINANCE',
      roles,
      securityClearance: 'RESTRICTED',
    };
  }

  // 10. Treasury & Financial Markets (Xəzinədarlıq)
  else if (deptNorm.includes('xezine') || deptNorm.includes('treasury') || deptNorm.includes('valyuta')) {
    let roles: BankRole[] = ['REQUESTER', 'APPROVER'];
    if (titleNorm.includes('head') || titleNorm.includes('reis') || titleNorm.includes('direktor')) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-treasury',
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: deptStr || 'Xəzinədarlıq Departamenti',
      departmentCode: 'TREASURY',
      roles,
      securityClearance: 'RESTRICTED',
    };
  }

  // 11. Credit & Underwriting (Kredit Departamenti)
  else if (
    deptNorm.includes('kredit') ||
    deptNorm.includes('credit') ||
    deptNorm.includes('andrraytinq') ||
    deptNorm.includes('ipoteka') ||
    deptNorm.includes('lizinq')
  ) {
    let roles: BankRole[] = ['REQUESTER', 'APPROVER'];
    if (titleNorm.includes('head') || titleNorm.includes('reis') || titleNorm.includes('direktor') || titleNorm.includes('komite')) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-credit',
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: deptStr || 'Kredit Departamenti',
      departmentCode: 'CREDIT',
      roles,
      securityClearance: 'RESTRICTED',
    };
  }

  // 12. Retail Banking (Pərakəndə Bankçılıq)
  else if (deptNorm.includes('perakende') || deptNorm.includes('retail') || deptNorm.includes('ferdi musteri')) {
    let roles: BankRole[] = ['REQUESTER', 'APPROVER'];
    if (titleNorm.includes('head') || titleNorm.includes('reis') || titleNorm.includes('direktor')) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-retail',
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: deptStr || 'Pərakəndə Bankçılıq Departamenti',
      departmentCode: 'RETAIL',
      roles,
      securityClearance: 'INTERNAL',
    };
  }

  // 13. Corporate Banking (Korporativ Bankçılıq)
  else if (deptNorm.includes('korporativ') || deptNorm.includes('corporate') || deptNorm.includes('kombank') || deptNorm.includes('biznes bank')) {
    let roles: BankRole[] = ['REQUESTER', 'APPROVER'];
    if (titleNorm.includes('head') || titleNorm.includes('reis') || titleNorm.includes('direktor')) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-corporate',
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: deptStr || 'Korporativ Bankçılıq Departamenti',
      departmentCode: 'CORP_BANK',
      roles,
      securityClearance: 'INTERNAL',
    };
  }

  // 14. Customer Care & Call Center (Müştəri Xidmətləri və Çağrı Mərkəzi)
  else if (
    deptNorm.includes('musteri') ||
    deptNorm.includes('call') ||
    deptNorm.includes('elaqe merkez') ||
    deptNorm.includes('132')
  ) {
    let roles: BankRole[] = ['REQUESTER', 'ASSIGNEE'];
    if (titleNorm.includes('head') || titleNorm.includes('reis') || titleNorm.includes('supervayzer') || titleNorm.includes('mudir')) {
      roles = ['DEPARTMENT_ADMIN', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-customer-care',
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: deptStr || 'Müştəri Xidmətləri və Çağrı Mərkəzi',
      departmentCode: 'CALL_CENTER',
      roles,
      securityClearance: 'INTERNAL',
    };
  }

  // 15. Marketing & PR (Marketinq və İctimaiyyətlə Əlaqələr)
  else if (deptNorm.includes('marketinq') || deptNorm.includes('marketing') || deptNorm.includes('pr') || deptNorm.includes('ictimaiyyet') || deptNorm.includes('brend')) {
    let roles: BankRole[] = ['REQUESTER'];
    if (titleNorm.includes('head') || titleNorm.includes('reis') || titleNorm.includes('direktor')) {
      roles = ['DEPARTMENT_ADMIN', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-marketing',
      divisionId: 'div-hr',
      teamIds: ['team-hr-ops'],
      departmentName: deptStr || 'Marketinq və İctimaiyyətlə Əlaqələr',
      departmentCode: 'MARKETING',
      roles,
      securityClearance: 'INTERNAL',
    };
  }

  // 16. Procurement & Administrative Support (İnzibati Təsərrüfat və Satınalmalar)
  else if (
    deptNorm.includes('satinalma') ||
    deptNorm.includes('teserrufat') ||
    deptNorm.includes('procurement') ||
    deptNorm.includes('techizat') ||
    deptNorm.includes('inzibati') ||
    deptNorm.includes('logistika')
  ) {
    let roles: BankRole[] = ['REQUESTER'];
    if (titleNorm.includes('head') || titleNorm.includes('reis') || titleNorm.includes('direktor')) {
      roles = ['DEPARTMENT_ADMIN', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-procurement',
      divisionId: 'div-hr',
      teamIds: ['team-hr-ops'],
      departmentName: deptStr || 'İnzibati Təsərrüfat və Satınalmalar',
      departmentCode: 'PROCUREMENT',
      roles,
      securityClearance: 'INTERNAL',
    };
  }

  // 17. Bank Branches & Branch Network (Filiallar və Şöbələr)
  else if (
    deptNorm.includes('filial') ||
    deptNorm.includes('branch') ||
    deptNorm.includes('menteqe') ||
    deptNorm.includes('sobe')
  ) {
    const branchName = deptStr || 'Bank Filialı';
    const branchSlug = slugifyDept(branchName);
    let roles: BankRole[] = ['REQUESTER', 'ASSIGNEE'];
    if (titleNorm.includes('mudir') || titleNorm.includes('reis') || titleNorm.includes('direktor') || titleNorm.includes('manager')) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'APPROVER', 'REQUESTER'];
    } else if (titleNorm.includes('bas') || titleNorm.includes('aparici') || titleNorm.includes('lead')) {
      roles = ['TEAM_LEAD', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: `dept-${branchSlug}`,
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: branchName,
      departmentCode: 'BRANCH_' + branchSlug.replace(/[^a-z0-9]/g, '').slice(0, 8).toUpperCase(),
      roles,
      securityClearance: 'INTERNAL',
    };
  }

  // 18. Strategy & PMO (Strateji İdarəetmə və Layihələr)
  else if (deptNorm.includes('strategiya') || deptNorm.includes('layihe') || deptNorm.includes('pmo')) {
    let roles: BankRole[] = ['REQUESTER'];
    if (titleNorm.includes('head') || titleNorm.includes('reis') || titleNorm.includes('direktor')) {
      roles = ['DEPARTMENT_ADMIN', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-pmo',
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: deptStr || 'Strateji Planlaşdırma və Layihələr',
      departmentCode: 'PMO',
      roles,
      securityClearance: 'INTERNAL',
    };
  }

  // 19. Physical Security & Guarding (Fiziki Mühafizə)
  else if (deptNorm.includes('muhafize') || deptNorm.includes('inkassasiya')) {
    let roles: BankRole[] = ['REQUESTER'];
    if (titleNorm.includes('reis') || titleNorm.includes('mudir') || titleNorm.includes('komandir')) {
      roles = ['DEPARTMENT_ADMIN', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-phys-sec',
      divisionId: 'div-sec',
      teamIds: ['team-soc'],
      departmentName: deptStr || 'Fiziki Təhlükəsizlik və Mühafizə',
      departmentCode: 'PHYS_SEC',
      roles,
      securityClearance: 'INTERNAL',
    };
  }

  // 20. ANY OTHER REAL ACTIVE DIRECTORY DEPARTMENT (Dynamic Auto-Discovery!)
  else if (deptStr && deptStr.length > 1) {
    const rawSlug = slugifyDept(deptStr);
    let roles: BankRole[] = ['REQUESTER', 'ASSIGNEE'];
    if (titleNorm.includes('direktor') || titleNorm.includes('müdir') || titleNorm.includes('rəis') || titleNorm.includes('head') || titleNorm.includes('manager')) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'APPROVER', 'REQUESTER'];
    } else if (titleNorm.includes('baş') || titleNorm.includes('aparıcı') || titleNorm.includes('lead') || titleNorm.includes('senior')) {
      roles = ['TEAM_LEAD', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: `dept-${rawSlug}`,
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: deptStr,
      departmentCode: generateDeptCode(deptStr),
      roles,
      securityClearance: 'INTERNAL',
    };
  }

  // 21. Total Fallback (Empty department attribute)
  else {
    result = {
      departmentId: 'dept-general-banking',
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: 'Ümumi Bank Xidmətləri və Əməliyyatlar',
      departmentCode: 'GENERAL_BANK',
      roles: ['REQUESTER'],
      securityClearance: 'INTERNAL',
    };
  }

  // AD's department attribute often contains the broad IT department while the
  // user's actual şöbə lives in the leaf OU (for example OU=DevOps). Keep the
  // parent IT division/RBAC, but route users and their tickets to that exact OU.
  if (result.departmentId === 'dept-it') {
    const specificOu = getSpecificItOrganizationalUnit(distinguishedName, deptStr);
    if (specificOu) {
      result.departmentId = `dept-${slugifyDept(specificOu)}`;
      result.departmentName = specificOu;
      result.departmentCode = generateDeptCode(specificOu);
    }
  }

  // Dynamic Group-Based RBAC Resolution (Active Directory Security Groups)
  const isEnterpriseSecurityAdmin = groupNorms.some(
    (g) =>
      g.includes('enterprise_security_admins') ||
      g.includes('domain admins') ||
      g.includes('enterprise admins') ||
      g.includes('ciso_executive') ||
      g.includes('platform_admins')
  );
  const isSocIncidentResponder = groupNorms.some((g) => g.includes('soc_incident_responders') || g.includes('soc_leads'));
  const isAppSecReviewer = groupNorms.some((g) => g.includes('appsec_reviewers') || g.includes('appsec_admins'));
  const isItOperationsAdmin = groupNorms.some((g) => g.includes('it_operations_admins') || g.includes('it_admins'));
  const isHrAdminGroup = groupNorms.some((g) => g.includes('hr_managers') || g.includes('hr_admins'));
  const isCoreBankAdminGroup = groupNorms.some((g) => g.includes('core_banking_admins') || g.includes('swift_admins'));
  const isAuditComplianceGroup = groupNorms.some((g) => g.includes('audit_compliance_group') || g.includes('auditors'));

  if (isEnterpriseSecurityAdmin) {
    result.departmentId = 'dept-secops';
    result.divisionId = 'div-sec';
    result.teamIds = ['team-soc', 'team-grc'];
    result.roles = ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'APPROVER', 'REQUESTER'];
    result.securityClearance = 'HIGHLY_RESTRICTED_HR_LEGAL';
  } else {
    if (isSocIncidentResponder) {
      result.roles = Array.from(new Set([...result.roles, 'DEPARTMENT_ADMIN', 'INFOSEC_ADMIN', 'SECURITY_ANALYST', 'SOC_ANALYST', 'APPROVER']));
    }
    if (isAppSecReviewer) {
      result.roles = Array.from(new Set([...result.roles, 'APPSEC_ANALYST', 'SECURITY_ANALYST', 'REQUESTER']));
    }
    if (isItOperationsAdmin) {
      result.roles = Array.from(new Set([...result.roles, 'DEPARTMENT_ADMIN', 'IT_ADMIN', 'APPROVER']));
    }
    if (isHrAdminGroup) {
      result.roles = Array.from(new Set([...result.roles, 'DEPARTMENT_ADMIN', 'HR_ADMIN', 'APPROVER']));
    }
    if (isCoreBankAdminGroup) {
      result.roles = Array.from(new Set([...result.roles, 'DEPARTMENT_ADMIN', 'CORE_BANK_ADMIN', 'APPLICATION_OWNER', 'APPROVER']));
    }
    if (isAuditComplianceGroup) {
      result.roles = Array.from(new Set([...result.roles, 'DEPARTMENT_ADMIN', 'AUDITOR']));
    }
  }

  return result;
}

/**
 * Checks if an Active Directory user account is disabled, locked out, or expired
 */
export function isAccountDisabled(entry: LDAPRawEntry): boolean {
  // 1. Bitwise check on userAccountControl
  if (entry.userAccountControl !== undefined && entry.userAccountControl !== null) {
    const rawUac = Array.isArray(entry.userAccountControl) ? entry.userAccountControl[0] : entry.userAccountControl;
    const uac = Number(rawUac);
    if (!isNaN(uac)) {
      // Bit 2: ACCOUNTDISABLE (0x0002), Bit 4: LOCKOUT (0x0010)
      if ((uac & 0x0002) !== 0 || (uac & 0x0010) !== 0) {
        return true;
      }
    }
  }

  // 2. Windows FileTime expiration check on accountExpires
  if (entry.accountExpires !== undefined && entry.accountExpires !== null) {
    const rawExp = Array.isArray(entry.accountExpires) ? entry.accountExpires[0] : entry.accountExpires;
    const val = toSafeString(rawExp);
    // 0 and 9223372036854775807 (0x7FFFFFFFFFFFFFFF) mean "never expires"
    if (val && val !== '0' && val !== '9223372036854775807' && val !== '-1') {
      const fileTime = Number(val);
      if (!isNaN(fileTime) && fileTime > 0) {
        // Windows FileTime: 100-nanosecond intervals since January 1, 1601 UTC
        const unixMs = (fileTime - 116444736000000000) / 10000;
        if (unixMs > 0 && unixMs <= Date.now()) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Normalizes memberOf strings into pure group names
 */
export function parseMemberOfGroups(rawMemberOf?: string[] | string): string[] {
  if (!rawMemberOf) return [];
  const arr = Array.isArray(rawMemberOf) ? rawMemberOf : [rawMemberOf];
  return arr
    .map((item) => {
      const str = toSafeString(item);
      const match = str.match(/^CN=([^,]+)/i);
      return match ? match[1].trim() : str.trim();
    })
    .filter(Boolean);
}

/**
 * Privileged AD shadow accounts are intentionally excluded from the business
 * directory. Their base employee account is the only identity that may appear
 * in tickets, assignments, or department member lists.
 */
export function isExcludedPrivilegedAccount(sAMAccountName: string): boolean {
  return /\.(?:rdp|si|sec|sh)$/i.test(toSafeString(sAMAccountName));
}

/**
 * Filters out service users, generic system accounts, and non-employee objects.
 * Guarantees that ONLY genuine employees from exact 'all' group and interns from 'Tecrubechiler' groups are synchronized.
 */
export function isGenuineEmployeeOrIntern(
  entry: LDAPRawEntry,
  parsedGroups: string[] = [],
  sAMAccountName: string = ''
): boolean {
  const username = (sAMAccountName || toSafeString(entry.sAMAccountName) || '').toLowerCase().trim();
  if (!username) return false;

  // 1. Privileged shadow accounts must never enter the business directory,
  // even if they are members of the otherwise valid `all` group.
  if (isExcludedPrivilegedAccount(username)) return false;

  // 2. Reject obvious machine, system, technical, or generic accounts.
  if (
    username.endsWith('$') ||
    username === 'krbtgt' ||
    username === 'guest' ||
    username === 'defaultaccount'
  ) {
    return false;
  }

  // 3. Reject conventional service, machine, VPN, and secondary-admin accounts.
  if (
    /^(svc[_\-\.]|sql[_\-\.]|service[_\-\.]|backup[_\-\.]|test[_\-\.]|scanner[_\-\.]|scan[_\-\.]|exch[_\-\.]|app[_\-\.]|iis[_\-\.]|exb[_\-\.])/i.test(
      username
    ) ||
    username.endsWith('.vpn') ||
    username.endsWith('.adm') ||
    username.endsWith('.admin') ||
    username.endsWith('.service')
  ) {
    return false;
  }

  // Group allow-listing, when needed, belongs in the AD search base/filter.
  // This function deliberately makes no person- or bank-specific membership
  // assumptions: every active human account returned by that configured query
  // is eligible for synchronization.
  return true;
}
