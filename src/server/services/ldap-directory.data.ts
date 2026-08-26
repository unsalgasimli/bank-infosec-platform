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
  /** Active Directory distinguished name of the employee's direct manager. */
  manager?: string;
  directReports?: string[] | string;
  memberOf?: string[] | string;
  description?: string;
  employeeType?: string;
  objectClass?: string[] | string;
  servicePrincipalName?: string[] | string;
  userAccountControl?: number | string;
  accountExpires?: string | number;
  whenCreated?: string;
  whenChanged?: string;
  /** Present on the persisted projection and accepted as a display-name alias. */
  fullName?: string;
}

export interface DepartmentMappingResult {
  departmentId: string;
  divisionId: string;
  departmentName: string;
  departmentCode: string;
  /** Section (Şöbə) - has Section Head (Şöbə Müdiri) */
  sectionId?: string;
  sectionName?: string;
  sectionCode?: string;
  /** Sub-unit (Bölmə / Sektor) - under Section, has NO separate manager */
  unitId?: string;
  unitName?: string;
  unitCode?: string;
  /** Cleaned position title */
  positionTitle?: string;
  /** Whether the title indicates Department Head / CISO / Director */
  isDepartmentHead?: boolean;
  /** Whether the title indicates Section Head / Şöbə Müdiri */
  isSectionHead?: boolean;
  teamIds: string[];
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

/**
 * Normalizes directory text at the boundary so LDAP aliases cannot create
 * duplicate identities through Unicode variants, zero-width characters, or
 * inconsistent whitespace.
 */
export function normalizeDirectoryText(val: any): string {
  return toSafeString(val)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Canonical, case-insensitive key used for AD usernames, email, and DNs. */
export function normalizeDirectoryKey(val: any): string {
  return normalizeDirectoryText(val).toLowerCase();
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

/** Parsed department, section and unit information derived from authoritative AD fields. */
export interface ParsedHierarchy {
  departmentCandidate?: string;
  sectionCandidate?: string;   // Şöbə (has manager)
  unitCandidate?: string;      // Bölmə / Sektor (under Şöbə, NO separate manager)
  positionTitle: string;       // Cleaned job position title
  isDepartmentHead: boolean;
  isSectionHead: boolean;
}

/**
 * Parses AD Job Title (e.g. "Şöbə / Bölmə / Vəzifə" or "Şöbə / Vəzifə") and OUs into
 * structured 3-tier hierarchy: Departament -> Şöbə (Section) -> Bölmə (Unit).
 * Enforces rule: Bölmə has NO separate manager; approvals route to parent Şöbə manager.
 */
export function parseJobTitleAndHierarchy(
  title: any = '',
  department: any = '',
  relevantOUs: string[] = []
): ParsedHierarchy {
  const cleanTitle = normalizeDirectoryText(title);
  const cleanDept = normalizeDirectoryText(department);
  let deptCand: string | undefined;
  let sectionCand: string | undefined;
  let unitCand: string | undefined;
  let posTitle = cleanTitle;

  if (cleanTitle.includes('/')) {
    const parts = cleanTitle.split('/').map((p) => p.trim()).filter(Boolean);
    posTitle = parts[parts.length - 1] || cleanTitle;

    const upperSegments = parts.slice(0, -1);
    for (const seg of upperSegments) {
      const normSeg = normalizeAzerbaijani(seg);
      if (normSeg.includes('departament') || normSeg.includes('department')) {
        deptCand = seg;
      } else if (normSeg.includes('şöbə') || normSeg.includes('sobe') || normSeg.includes('section')) {
        sectionCand = seg;
      } else if (
        normSeg.includes('bölmə') ||
        normSeg.includes('bolme') ||
        normSeg.includes('sektor') ||
        normSeg.includes('qrup') ||
        normSeg.includes('unit')
      ) {
        unitCand = seg;
      } else {
        if (!sectionCand) sectionCand = seg;
        else if (!unitCand) unitCand = seg;
      }
    }
  }

  // Also extract candidates from OUs if not already found in title
  for (const ou of relevantOUs) {
    const normOu = normalizeAzerbaijani(ou);
    if (normOu.includes('tarcuba') || normOu.includes('tercume')) {
      if (!sectionCand) sectionCand = 'Katiblik və Tərcümə şöbəsi';
      if (!unitCand) unitCand = 'Tərcümə bölməsi';
    } else if (normOu.includes('satinalma')) {
      if (!sectionCand) sectionCand = 'Satınalma bölməsi';
      if (!unitCand) unitCand = 'Satınalma bölməsi';
    } else if (normOu.includes('anbar')) {
      if (!sectionCand) sectionCand = 'Anbar bölməsi';
      if (!unitCand) unitCand = 'Anbar bölməsi';
    } else if (normOu.includes('umumi') && (normOu.includes('bolme') || normOu.includes('teserrufat'))) {
      if (!sectionCand) sectionCand = 'Ümumi bölmə';
      if (!unitCand) unitCand = 'Ümumi bölmə';
    } else if (normOu.includes('ekvayrinq')) {
      if (!sectionCand) sectionCand = 'Ekvayrinq bölməsi';
      if (!unitCand) unitCand = 'Ekvayrinq bölməsi';
    } else if (normOu.includes('terefdas')) {
      if (!sectionCand) sectionCand = 'Tərəfdaşlarla iş şöbəsi';
    } else if (normOu.includes('icra') || normOu.includes('mehkeme')) {
      if (!sectionCand) sectionCand = 'Məhkəmə və icra işlərinə nəzarət şöbəsi';
    } else if (!sectionCand && (normOu.includes('şöbə') || normOu.includes('sobe') || normOu.includes('section') || normOu.includes('devops') || normOu.includes('soc') || normOu.includes('appsec'))) {
      sectionCand = ou;
    } else if (!unitCand && (normOu.includes('bölmə') || normOu.includes('bolme') || normOu.includes('sektor') || normOu.includes('qrup'))) {
      unitCand = ou;
    }
  }

  // If department string itself specifies a section/unit
  if (cleanDept) {
    const normDept = normalizeAzerbaijani(cleanDept);
    if (!sectionCand && (normDept.includes('şöbə') || normDept.includes('sobe') || normDept.includes('section'))) {
      sectionCand = cleanDept;
    } else if (!unitCand && (normDept.includes('bölmə') || normDept.includes('bolme') || normDept.includes('sektor'))) {
      unitCand = cleanDept;
    }
  }

  const normPos = normalizeAzerbaijani(posTitle);
  const normCleanTitle = normalizeAzerbaijani(cleanTitle);

  const isDeptHead =
    normPos.includes('departament müdiri') ||
    normPos.includes('departament mudiri') ||
    normPos.includes('departament rəisi') ||
    normPos.includes('departament reisi') ||
    normPos.includes('ciso') ||
    normPos.includes('direktor') ||
    normPos.includes('director') ||
    normCleanTitle.includes('chief information security officer') ||
    normCleanTitle.includes('departament müdiri') ||
    normCleanTitle.includes('departament mudiri');

  const isSecHead =
    !isDeptHead &&
    (normPos.includes('şöbə müdiri') ||
      normPos.includes('sobe mudiri') ||
      normPos.includes('şöbə rəisi') ||
      normPos.includes('sobe reisi') ||
      normPos.includes('head of section') ||
      normPos.includes('section head') ||
      normCleanTitle.includes('şöbə müdiri') ||
      normCleanTitle.includes('sobe mudiri') ||
      (normPos.includes('müdir') && !normPos.includes('departament') && !normPos.includes('bölmə')) ||
      (normPos.includes('mudir') && !normPos.includes('departament') && !normPos.includes('bolme')) ||
      (normPos.includes('rəis') && !normPos.includes('departament') && !normPos.includes('bölmə')) ||
      (normPos.includes('reis') && !normPos.includes('departament') && !normPos.includes('bolme')));

  return {
    departmentCandidate: deptCand,
    sectionCandidate: sectionCand,
    unitCandidate: unitCand,
    positionTitle: posTitle || cleanTitle || 'Bank Specialist',
    isDepartmentHead: isDeptHead,
    isSectionHead: isSecHead,
  };
}

/**
 * Intelligently maps Active Directory department/şöbə, title, distinguishedName OUs,
 * and security groups to BankDepartment with precise 3-tier hierarchy & leadership.
 */
export function mapDepartment(
  adDepartment: any = '',
  adTitle: any = '',
  groups: any = [],
  distinguishedName: any = ''
): DepartmentMappingResult {
  const deptStr = toSafeString(adDepartment);
  const titleStr = toSafeString(adTitle);
  const dnStr = toSafeString(distinguishedName);

  const ous = extractOrganizationalUnits(dnStr);
  const relevantOUs = ous.filter((ou) => {
    const n = normalizeAzerbaijani(ou);
    return ![
      'bank users',
      'ho users',
      'branch users',
      'users',
      'service',
      'service accounts',
      'disabled',
      'disable',
      'outlook',
      'no policy',
      'ie test',
      'qmatic user',
      'qmatic users',
      'mailbanking clients',
      'mailbanking',
      'clients',
      'test',
      'temp',
    ].includes(n) &&
    !n.includes('branch') &&
    !n.includes('filial') &&
    !/filialı$/i.test(n) &&
    !/filiali$/i.test(n);
  });

  // Parse 3-tier hierarchy from title and OUs
  const hierarchy = parseJobTitleAndHierarchy(titleStr, deptStr, relevantOUs);

  // Combined context string for searching across all signals
  const combinedContext = [deptStr, titleStr, ...relevantOUs].join(' ');
  const norm = normalizeAzerbaijani(combinedContext);
  const titleNorm = normalizeAzerbaijani(titleStr);

  const groupArr = Array.isArray(groups) ? groups : groups ? [groups] : [];
  const groupNorms = groupArr.map((g) => normalizeAzerbaijani(toSafeString(g))).filter(Boolean);

  // Check if position indicates leadership (Müdir / Head / Direktor / Sədr / Rəis / Lead / Manager)
  const isManagerTitle =
    hierarchy.isDepartmentHead ||
    hierarchy.isSectionHead ||
    titleNorm.includes('mudir') ||
    titleNorm.includes('reis') ||
    titleNorm.includes('direktor') ||
    titleNorm.includes('director') ||
    titleNorm.includes('head') ||
    titleNorm.includes('sedr') ||
    titleNorm.includes('rehber') ||
    titleNorm.includes('menecer') ||
    titleNorm.includes('manager') ||
    titleNorm.includes('ciso');

  let result: DepartmentMappingResult;

  // 1. Executive Board & Leadership (BOSSES, İdarə Heyəti, Müşahidə Şurası)
  if (
    norm.includes('bosses') ||
    titleNorm.includes('idare heyet') ||
    titleNorm.includes('musahide surasi') ||
    norm.includes('idare heyeti') ||
    norm.includes('musahide surasi')
  ) {
    result = {
      departmentId: 'dept-executive',
      divisionId: 'div-banking',
      teamIds: ['team-executive'],
      departmentName: 'İdarə Heyəti və Rəhbərlik',
      departmentCode: 'EXECUTIVE',
      roles: isManagerTitle
        ? ['PLATFORM_ADMIN', 'CISO', 'DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'APPROVER', 'REQUESTER']
        : ['DEPARTMENT_ADMIN', 'APPROVER', 'REQUESTER'],
      securityClearance: 'HIGHLY_RESTRICTED_HR_LEGAL',
    };
  }

  // 2. Information Security & Cyber Defense (İnformasiya Təhlükəsizliyi)
  else if (
    norm.includes('infosec') ||
    norm.includes('information security') ||
    norm.includes('security') ||
    norm.includes('tehlukesizliyi') ||
    norm.includes('tehlukesizlik') ||
    norm.includes('cyber') ||
    norm.includes('kiber') ||
    norm.includes('soc') ||
    norm.includes('appsec') ||
    norm === 'dept-secops'
  ) {
    let roles: BankRole[] = ['SECURITY_ANALYST', 'APPROVER', 'REQUESTER'];
    let teamIds = ['team-soc'];

    const isCisoOrDirector =
      titleNorm.includes('ciso') ||
      titleNorm.includes('chief information security') ||
      titleNorm.includes('direktor') ||
      titleNorm.includes('director');

    const isInfosecHead =
      isCisoOrDirector ||
      titleNorm.includes('mudir') ||
      titleNorm.includes('reis') ||
      titleNorm.includes('head') ||
      titleNorm.includes('rehber');

    if (isCisoOrDirector) {
      roles = [
        'PLATFORM_ADMIN',
        'CISO',
        'INFOSEC_ADMIN',
        'DEPARTMENT_ADMIN',
        'DEPARTMENT_MANAGER',
        'TEAM_LEAD',
        'SECURITY_ANALYST',
        'APPROVER',
        'REQUESTER',
      ];
      teamIds = ['team-soc', 'team-grc'];
    } else if (isInfosecHead) {
      roles = [
        'INFOSEC_ADMIN',
        'INFOSEC_MANAGER',
        'DEPARTMENT_ADMIN',
        'DEPARTMENT_MANAGER',
        'TEAM_LEAD',
        'SECURITY_ANALYST',
        'APPROVER',
        'REQUESTER',
      ];
      teamIds = ['team-soc'];
    } else if (titleNorm.includes('tecrube') || titleNorm.includes('intern')) {
      roles = ['SECURITY_ANALYST', 'REQUESTER'];
      teamIds = ['team-soc'];
    } else if (titleNorm.includes('appsec') || titleNorm.includes('pentest') || titleNorm.includes('vulnerability')) {
      roles = ['APPSEC_ANALYST', 'SECURITY_ANALYST', 'REQUESTER'];
      teamIds = ['team-appsec'];
    } else {
      roles = ['SECURITY_ANALYST', 'SOC_ANALYST', 'APPROVER', 'REQUESTER'];
      teamIds = ['team-soc'];
    }

    result = {
      departmentId: 'dept-secops',
      divisionId: 'div-sec',
      teamIds,
      departmentName: 'İnformasiya Təhlükəsizliyi Departamenti',
      departmentCode: 'INFOSEC',
      roles,
      securityClearance: isInfosecHead ? 'HIGHLY_RESTRICTED_HR_LEGAL' : 'CONFIDENTIAL_SECURITY_ONLY',
    };
  }

  // 3. Technical & Physical Security (Fiziki Mühafizə & Təhlükəsizlik)
  else if (
    norm.includes('texniki ve fiziki tehlukesizlik') ||
    norm.includes('muhafize') ||
    norm.includes('inkassasiya') ||
    norm.includes('inkasasiya')
  ) {
    let roles: BankRole[] = ['REQUESTER', 'ASSIGNEE'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'SECURITY_ANALYST', 'APPROVER', 'REQUESTER'];
    } else {
      roles = ['SECURITY_ANALYST', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-phys-sec',
      divisionId: 'div-sec',
      teamIds: ['team-soc'],
      departmentName: 'Texniki və Fiziki Təhlükəsizlik Şöbəsi',
      departmentCode: 'PHYS_SEC',
      roles,
      securityClearance: 'INTERNAL',
    };
  }

  // 4. Marketing & Public Relations (Reklam və Marketinq)
  else if (
    norm.includes('reklam') ||
    norm.includes('marketinq') ||
    norm.includes('marketing') ||
    norm.includes('ictimaiyyet') ||
    /\bpr\b/.test(norm) ||
    norm.includes('dizayn') ||
    norm.includes('brend')
  ) {
    let roles: BankRole[] = ['REQUESTER'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-marketing',
      divisionId: 'div-hr',
      teamIds: ['team-hr-ops'],
      departmentName: 'Reklam və Marketinq Departamenti',
      departmentCode: 'MARKETING',
      roles,
      securityClearance: 'INTERNAL',
    };
  }

  // 5. PMO & Business Process Optimization (Biznes Prosesləri və Layihələr)
  else if (
    norm.includes('biznes proses') ||
    norm.includes('optimallasdir') ||
    norm.includes('pmo') ||
    norm.includes('strategiya') ||
    norm.includes('layihe')
  ) {
    let roles: BankRole[] = ['REQUESTER', 'APPROVER'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-pmo',
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: 'Biznes Proseslərin Təhlili və Optimallaşdırılması Şöbəsi',
      departmentCode: 'PMO',
      roles,
      securityClearance: 'INTERNAL',
    };
  }

  // 6. IT Infrastructure, Cloud & Operations (İT İnfrastruktur və Sistemlər)
  else if (
    norm.includes('infrastruktur') ||
    norm.includes('infrastructure') ||
    norm.includes('texnologiya') ||
    norm.includes('technology') ||
    norm.includes('sebeke') ||
    norm.includes('sistem inzibat') ||
    norm.includes('helpdesk') ||
    norm.includes('texniki destek') ||
    norm.includes('devops') ||
    norm.includes('ikt') ||
    norm.includes('proqram') ||
    norm.includes('software') ||
    norm.includes('reqemsal') ||
    norm.includes('innovasiya') ||
    norm.includes('melumatlarin idare') ||
    norm.includes('abs-in idare') ||
    norm === 'dept-it' ||
    norm === 'it'
  ) {
    let roles: BankRole[] = ['IT_ADMIN', 'APPROVER', 'REQUESTER'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'IT_ADMIN', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'];
    }

    // Keep the AD child OU as a section under the IT department. It must not
    // become a second top-level department, otherwise parent queues and
    // reporting are split by OU.
    let deptId = 'dept-it';
    let deptName = 'İnformasiya Texnologiyaları Departamenti';
    let deptCode = 'IT_DEPT';

    result = {
      departmentId: deptId,
      divisionId: 'div-it',
      teamIds: ['team-it-infra'],
      departmentName: deptName,
      departmentCode: deptCode,
      roles,
      securityClearance: 'CONFIDENTIAL_SECURITY_ONLY',
    };
  }

  // 7. Human Resources & Personnel (İnsan Resursları)
  else if (
    norm.includes('hr') ||
    norm.includes('human') ||
    norm.includes('insan resurs') ||
    norm.includes('insan') ||
    norm.includes('kadr') ||
    norm.includes('personnel') ||
    norm.includes('telim') ||
    norm.includes('tedris') ||
    norm.includes('senedlesdirme') ||
    norm.includes('ise celb') ||
    norm === 'dept-hr'
  ) {
    let roles: BankRole[] = ['HR_ADMIN', 'REQUESTER'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'HR_ADMIN', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-hr',
      divisionId: 'div-hr',
      teamIds: ['team-hr-ops'],
      departmentName: 'İnsan Resursları Departamenti',
      departmentCode: 'HR_DEPT',
      roles,
      securityClearance: 'HIGHLY_RESTRICTED_HR_LEGAL',
    };
  }

  // 8. Legal Department (Hüquq Departamenti)
  else if (
    norm.includes('huquq') ||
    norm.includes('legal') ||
    norm.includes('mehkeme') ||
    norm.includes('muqavile') ||
    norm.includes('istehlakci') ||
    norm.includes('icra') ||
    titleNorm.includes('icra') ||
    norm === 'dept-legal'
  ) {
    let roles: BankRole[] = ['REQUESTER', 'APPROVER'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'LEGAL_ADMIN', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-legal',
      divisionId: 'div-hr',
      teamIds: ['team-hr-ops'],
      departmentName: 'Hüquq Departamenti',
      departmentCode: 'LEGAL',
      roles,
      securityClearance: 'HIGHLY_RESTRICTED_HR_LEGAL',
    };
  }

  // 8b. Secretariat & Translation (Katiblik və Tərcümə Şöbəsi)
  else if (
    norm.includes('katiblik') ||
    norm.includes('katib') ||
    norm.includes('tarcuba') ||
    norm.includes('tercume') ||
    norm.includes('translator') ||
    norm === 'dept-katiblik-sobesi'
  ) {
    let roles: BankRole[] = ['REQUESTER', 'APPROVER'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-katiblik-sobesi',
      divisionId: 'div-hr',
      teamIds: ['team-hr-ops'],
      departmentName: 'Katiblik və Tərcümə Şöbəsi',
      departmentCode: 'KATIB_DEPT',
      roles,
      securityClearance: 'HIGHLY_RESTRICTED_HR_LEGAL',
    };
  }

  // 9. Finance & Accounting (Maliyyə və Mühasibatlıq)
  else if (
    norm.includes('maliyye') ||
    norm.includes('muhasibat') ||
    norm.includes('finance') ||
    norm.includes('accounting') ||
    norm.includes('budce') ||
    norm === 'dept-finance'
  ) {
    let roles: BankRole[] = ['REQUESTER', 'APPROVER'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-finance',
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: 'Maliyyə və Mühasibatlıq Departamenti',
      departmentCode: 'FINANCE',
      roles,
      securityClearance: 'RESTRICTED',
    };
  }

  // 10. Treasury & Financial Markets (Xəzinədarlıq)
  else if (norm.includes('xezine') || norm.includes('treasury') || norm.includes('valyuta') || norm === 'dept-treasury') {
    let roles: BankRole[] = ['REQUESTER', 'APPROVER'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-treasury',
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: 'Xəzinədarlıq Departamenti',
      departmentCode: 'TREASURY',
      roles,
      securityClearance: 'RESTRICTED',
    };
  }

  // 11. Core Banking & SWIFT Systems (Bank Əməliyyat Sistemləri və SWIFT)
  else if (
    norm.includes('swift') ||
    norm.includes('core bank') ||
    norm.includes('bank sistem') ||
    norm === 'dept-core'
  ) {
    let roles: BankRole[] = ['CORE_BANK_ADMIN', 'APPLICATION_OWNER', 'APPROVER', 'REQUESTER'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'CORE_BANK_ADMIN', 'APPLICATION_OWNER', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-core',
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: 'Bank Əməliyyat Sistemləri və SWIFT',
      departmentCode: 'CORE_BANK',
      roles,
      securityClearance: 'CONFIDENTIAL_SECURITY_ONLY',
    };
  }

  // 12. Settlements, Cards & Cash Management (Hesablaşmalar Departamenti)
  else if (
    norm.includes('hesablas') ||
    norm.includes('klirinq') ||
    norm.includes('kartlar') ||
    norm.includes('prosessinq') ||
    norm.includes('kassa') ||
    norm.includes('nagd vesait') ||
    norm.includes('emeliyyat') ||
    norm === 'dept-hesablasmalar-departamenti'
  ) {
    let roles: BankRole[] = ['REQUESTER', 'ASSIGNEE'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-hesablasmalar-departamenti',
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: 'Hesablaşmalar Departamenti',
      departmentCode: 'HESAB_DEPT',
      roles,
      securityClearance: 'RESTRICTED',
    };
  }

  // 12b. Payment Systems & Acquiring (Ödəniş Sistemlərinin İdarə Edilməsi Departamenti)
  else if (
    norm.includes('odenis sistem') ||
    norm.includes('expresspay') ||
    norm.includes('ekvayrinq') ||
    norm.includes('acquiring')
  ) {
    let roles: BankRole[] = ['REQUESTER', 'ASSIGNEE'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-odenis-sistemlerin-idare-edilmesi-departamenti',
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: 'Ödəniş Sistemlərinin İdarə Edilməsi Departamenti',
      departmentCode: 'ODENIS_DEPT',
      roles,
      securityClearance: 'RESTRICTED',
    };
  }

  // 13. Risk Management & Compliance (GRC, Komplayens, Daxili Nəzarət)
  else if (
    norm.includes('risk') ||
    norm.includes('grc') ||
    norm.includes('compliance') ||
    norm.includes('komplayens') ||
    norm.includes('aml') ||
    norm.includes('el-tmm') ||
    norm.includes('sanksiya') ||
    norm.includes('daxili nezaret') ||
    norm.includes('dnd') ||
    norm === 'dept-grc'
  ) {
    let roles: BankRole[] = ['AUDITOR', 'REQUESTER'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'AUDITOR', 'APPROVER', 'REQUESTER'];
    }
    const isDnd = norm.includes('daxili nezaret') || norm.includes('dnd');
    result = {
      departmentId: isDnd ? 'dept-daxili-nezaret-departamenti' : 'dept-grc',
      divisionId: 'div-sec',
      teamIds: ['team-grc'],
      departmentName: isDnd ? 'Daxili Nəzarət Departamenti' : 'Komplayens və Risk Departamenti',
      departmentCode: isDnd ? 'DND_DEPT' : 'GRC',
      roles,
      securityClearance: 'RESTRICTED',
    };
  }

  // 14. Internal Audit (Daxili Audit Departamenti)
  else if (norm.includes('audit') || titleNorm.includes('auditor')) {
    let roles: BankRole[] = ['AUDITOR', 'REQUESTER'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'AUDITOR', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-audit',
      divisionId: 'div-sec',
      teamIds: ['team-grc'],
      departmentName: 'Daxili Audit Departamenti',
      departmentCode: 'AUDIT',
      roles,
      securityClearance: 'RESTRICTED',
    };
  }

  // 15. Customer Care & Call Center (Müştəri Xidmətləri və Çağrı Mərkəzi)
  else if (
    norm.includes('musteri') ||
    norm.includes('call') ||
    norm.includes('melumat merkez') ||
    norm.includes('elaqe merkez') ||
    norm.includes('mxd') ||
    norm.includes('132')
  ) {
    let roles: BankRole[] = ['REQUESTER', 'ASSIGNEE'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-customer-care',
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: 'Müştəri Xidmətləri və Çağrı Mərkəzi',
      departmentCode: 'CALL_CENTER',
      roles,
      securityClearance: 'INTERNAL',
    };
  }

  // 16. Credit & Underwriting (Kredit Departamenti)
  else if (
    norm.includes('kredit') ||
    norm.includes('credit') ||
    norm.includes('andrraytinq') ||
    norm.includes('anderraytinq') ||
    norm.includes('ipoteka') ||
    norm.includes('lizinq')
  ) {
    let roles: BankRole[] = ['REQUESTER', 'APPROVER'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-credit',
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: 'Kredit və Anderraytinq Departamenti',
      departmentCode: 'CREDIT',
      roles,
      securityClearance: 'RESTRICTED',
    };
  }

  // 17. Corporate / Business Banking & Partnerships (Biznes Bankçılıq Departamenti)
  else if (
    norm.includes('biznes bank') ||
    norm.includes('korporativ') ||
    norm.includes('bbd') ||
    norm.includes('biznessatish') ||
    norm.includes('kombank') ||
    norm.includes('terefdas') ||
    norm.includes('partner')
  ) {
    let roles: BankRole[] = ['REQUESTER', 'APPROVER'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-corporate',
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: 'Biznes Bankçılıq Departamenti',
      departmentCode: 'CORP_BANK',
      roles,
      securityClearance: 'INTERNAL',
    };
  }

  // 18. Retail Banking (Pərakəndə Bankçılıq)
  else if (norm.includes('perakende') || norm.includes('retail') || norm.includes('pbd') || norm.includes('ferdi musteri')) {
    let roles: BankRole[] = ['REQUESTER', 'APPROVER'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-retail',
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: 'Pərakəndə Bankçılıq Departamenti',
      departmentCode: 'RETAIL',
      roles,
      securityClearance: 'INTERNAL',
    };
  }

  // 19. Administrative, Procurement, Warehouse & General Services (İnzibati Təsərrüfat və Satınalma Departamenti)
  else if (
    norm.includes('inzibati') ||
    norm.includes('satinalma') ||
    norm.includes('anbar') ||
    norm.includes('teserrufat') ||
    norm.includes('təsərrüfat') ||
    norm.includes('umumi bolme') ||
    norm.includes('umumi') ||
    norm.includes('procurement') ||
    norm.includes('administrative') ||
    norm === 'dept-procurement'
  ) {
    let roles: BankRole[] = ['REQUESTER', 'ASSIGNEE'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-procurement',
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: 'İnzibati Təsərrüfat və Satınalma Departamenti',
      departmentCode: 'INZIBATI_DEPT',
      roles,
      securityClearance: 'INTERNAL',
    };
  }

  // 20. Bank Branches & Branch Network (Filial əməkdaşları vəzifə və funksiyasına görə aidiyyəti departamentlərə təyin edilir)
  else if (norm.includes('branch') || norm.includes('filial') || norm.includes('menteqe')) {
    if (norm.includes('kassa') || norm.includes('kassir') || titleNorm.includes('kassir') || titleNorm.includes('kassa')) {
      result = {
        departmentId: 'dept-hesablasmalar-departamenti',
        divisionId: 'div-banking',
        teamIds: ['team-swift-eng'],
        departmentName: 'Hesablaşmalar Departamenti',
        departmentCode: 'HESAB_DEPT',
        roles: isManagerTitle ? ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'] : ['REQUESTER', 'ASSIGNEE'],
        securityClearance: 'RESTRICTED',
      };
    } else if (norm.includes('kredit') || norm.includes('mikro') || titleNorm.includes('kredit')) {
      result = {
        departmentId: 'dept-credit',
        divisionId: 'div-banking',
        teamIds: ['team-swift-eng'],
        departmentName: 'Kredit və Anderraytinq Departamenti',
        departmentCode: 'CREDIT',
        roles: isManagerTitle ? ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'] : ['REQUESTER', 'APPROVER'],
        securityClearance: 'RESTRICTED',
      };
    } else if (norm.includes('biznes') || norm.includes('bbd') || titleNorm.includes('biznes')) {
      result = {
        departmentId: 'dept-corporate',
        divisionId: 'div-banking',
        teamIds: ['team-swift-eng'],
        departmentName: 'Biznes Bankçılıq Departamenti',
        departmentCode: 'CORP_BANK',
        roles: isManagerTitle ? ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'] : ['REQUESTER', 'APPROVER'],
        securityClearance: 'INTERNAL',
      };
    } else if (norm.includes('dnd') || norm.includes('nezaret') || titleNorm.includes('nezaret')) {
      result = {
        departmentId: 'dept-daxili-nezaret-departamenti',
        divisionId: 'div-sec',
        teamIds: ['team-soc'],
        departmentName: 'Daxili Nəzarət Departamenti',
        departmentCode: 'DND_DEPT',
        roles: isManagerTitle ? ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'] : ['REQUESTER', 'APPROVER'],
        securityClearance: 'INTERNAL',
      };
    } else if (norm.includes('icra') || norm.includes('huquq') || titleNorm.includes('icra')) {
      result = {
        departmentId: 'dept-legal',
        divisionId: 'div-hr',
        teamIds: ['team-hr-ops'],
        departmentName: 'Hüquq Departamenti',
        departmentCode: 'LEGAL',
        roles: isManagerTitle ? ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'] : ['REQUESTER', 'APPROVER'],
        securityClearance: 'RESTRICTED',
      };
    } else {
      // Branch Managers and general retail banking specialists in branches
      let roles: BankRole[] = ['REQUESTER', 'ASSIGNEE'];
      if (isManagerTitle) {
        roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'];
      }
      result = {
        departmentId: 'dept-retail',
        divisionId: 'div-banking',
        teamIds: ['team-swift-eng'],
        departmentName: 'Pərakəndə Bankçılıq Departamenti',
        departmentCode: 'RETAIL',
        roles,
        securityClearance: 'INTERNAL',
      };
    }
  }

  // 21. General Fallback
  else {
    let roles: BankRole[] = ['REQUESTER', 'ASSIGNEE'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: 'dept-retail',
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: 'Pərakəndə Bankçılıq Departamenti',
      departmentCode: 'RETAIL',
      roles,
      securityClearance: 'INTERNAL',
    };
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

  // Security groups grant entitlements; they do not define the user's
  // reporting line. A human can be in several AD groups, so changing their
  // department/section from memberOf would corrupt the organisation tree.
  if (isEnterpriseSecurityAdmin) {
    result.roles = Array.from(new Set([...result.roles, 'PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'APPROVER', 'REQUESTER']));
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

  // 3-tier hierarchy assignment: Department -> Section (Şöbə) -> Unit (Bölmə)
  const parentName = normalizeAzerbaijani(result.departmentName).replace(/\s+/g, ' ').trim();
  
  result.positionTitle = hierarchy.positionTitle;
  result.isDepartmentHead = hierarchy.isDepartmentHead;
  result.isSectionHead = hierarchy.isSectionHead;

  // Resolve Section (Şöbə) candidate
  const sectionCandidate = [
    hierarchy.sectionCandidate,
    ...relevantOUs,
    deptStr,
  ].map((value) => normalizeDirectoryText(value)).find((value) => {
    const normalized = normalizeAzerbaijani(value).replace(/\s+/g, ' ').trim();
    if (!normalized || normalized === parentName) return false;
    if (/^(bank users|ho users|branch users|users|service|disabled|disable|outlook|no policy|ie test|qmatic user|tarcubacilar|tecrubeciler?|tercubeciler?|interns?|trainees?|stajyerler?)$/.test(normalized)) return false;
    // Don't treat unit as section if it's explicitly a bölmə
    if (normalized.includes('bölmə') || normalized.includes('bolme') || normalized.includes('sektor')) return false;
    return !normalized.includes('departamenti') && !normalized.includes('department');
  }) || hierarchy.sectionCandidate;

  if (sectionCandidate) {
    const sectionSlug = slugifyDept(sectionCandidate);
    result.sectionId = `section-${result.departmentId}-${sectionSlug}`;
    result.sectionName = sectionCandidate;
    result.sectionCode = `SEC_${sectionSlug.replace(/-/g, '_').slice(0, 60).toUpperCase()}`;
  }

  // Resolve Unit (Bölmə / Sektor) candidate
  const unitCandidate = hierarchy.unitCandidate || relevantOUs.find((ou) => {
    const n = normalizeAzerbaijani(ou);
    return n.includes('bölmə') || n.includes('bolme') || n.includes('sektor') || n.includes('qrup');
  });

  if (unitCandidate) {
    const unitSlug = slugifyDept(unitCandidate);
    result.unitId = `unit-${result.departmentId}-${unitSlug}`;
    result.unitName = unitCandidate;
    result.unitCode = `UNIT_${unitSlug.replace(/-/g, '_').slice(0, 60).toUpperCase()}`;
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
 * Privileged AD shadow accounts (.si, .sec, .abs, .sh, .adm, .rdp, etc.)
 * are intentionally excluded from the business directory. Their base employee account
 * is the only identity that may appear in tickets, assignments, or department member lists.
 */
export function isExcludedPrivilegedAccount(sAMAccountName: string): boolean {
  const normalized = normalizeDirectoryKey(sAMAccountName);
  if (/\.(?:rdp|si|sec|sh|shi|mie|abs|adm|admin|backup|test|old|\d{6,})$/i.test(normalized)) {
    return true;
  }
  const finalSegment = normalized.split('.').at(-1) || '';
  return normalized.includes('.') && finalSegment.length > 0 && finalSegment.length < 4 && !/^(?:az|com|net|org|int)$/i.test(finalSegment);
}

/**
 * Extracts the base human username from a secondary/privileged account name
 * (e.g. "u.gasimli.sec" -> "u.gasimli", "e.farzaliyev.si" -> "e.farzaliyev")
 */
export function getBaseUsername(sAMAccountName: string): string {
  const normalized = normalizeDirectoryKey(sAMAccountName);
  return normalized.replace(/\.(?:rdp|si|sec|sh|shi|mie|abs|adm|admin|backup|test|old|\d{6,})$/i, '');
}

/**
 * Known static service, integration, infrastructure, and non-human accounts.
 */
export const KNOWN_SERVICE_ACCOUNT_NAMES = new Set([
  'azure.ad',
  'ldap',
  'ldappa',
  'ldaps',
  'devopsldap',
  'ad.manager',
  'admanager',
  'assetit',
  'otpuser',
  'securit1',
  'qradar',
  'rtccomponent',
  'sysacc',
  'cob',
  'n8n',
  'noreply',
  'onlinepayments',
  'stmt',
  'melumatmerkezi',
  'cc',
  'ccm',
  'ccp',
  'fcloud',
  'callback',
  'survey',
  'syslog',
  'notifications',
  'servicedesk',
  'sdesk',
  'sed_contracts',
  'sed_incoming',
  'esb',
  'expressbankswift',
  'solidwall',
  'gsmgate',
  'gitlab',
  'kochurmeler',
  'request',
  'a.k',
  'sftp',
  'checkpoint',
  't24',
  'uqm',
  'anipaytest',
  'onlinesifarish',
  'rconfig',
  'sccm_push',
  'sccmsql_agent',
  'sccmsql_admin',
  'db.veaam.srv',
  'db.veeam.srv',
  'asanfinanceinfo',
  'bot',
  'owncloud',
  'zabbix.windows',
  'adaudit',
  'jira-itsec',
  'nessus.infosec',
  'pbxtest',
  'network.notification',
  'srv_wss_admin',
  'backup',
  'esd_wss_service',
  'esd_wss_admin',
  'esd_wss_pool',
  'testinfosec',
  'trainacc',
  'testaccount',
  'testacc',
  'trainingacc',
  'qmatic.vpn1',
  'rustam.vpn.new',
  'rauf.gni',
  'exb_scanner',
  'qualys',
  'nessus',
  'admin',
  'administrator',
  'krbtgt',
  'guest',
  'defaultaccount',
  'rtccomponentservice',
  'xerox',
  'cpam',
  'dnssense',
  'fsprotect.user',
  'dwh.user',
  'dbms-forward',
  'vaultadmin01',
  'expressbank.learning',
  'bookstack-infosec',
  'wug_svc',
  'fp_admin',
  'fp_dlp_svc',
  'e.review',
  'merkez.egov',
  'survey.merkerz',
  'survey.merkezi',
  'survey.merkez',
  'merkez.test',
  'test.branch',
]);

/**
 * AD-side exclusions for known non-human account families. AD matching is
 * case-insensitive, so these filters protect the server query as well as the
 * application-side guard below.
 */
export const LDAP_NON_HUMAN_ACCOUNT_FILTERS = [
  '(!(sAMAccountName=rtccomponentservice))',
  '(!(sAMAccountName=xerox))',
  '(!(sAMAccountName=cpam))',
  '(!(sAMAccountName=dnssense))',
  '(!(sAMAccountName=healthmailbox*))',
  '(!(sAMAccountName=training*))',
  '(!(sAMAccountName=*ldap*))',
  '(!(sAMAccountName=polis.*))',
  '(!(sAMAccountName=mbaudit*))',
  '(!(sAMAccountName=fp_*))',
  '(!(sAMAccountName=wug_*))',
  '(!(sAMAccountName=*_svc))',
] as const;

export type DirectoryAccountType = 'HUMAN' | 'SERVICE' | 'TEST' | 'TECHNICAL' | 'PRIVILEGED';

const TEST_DIRECTORY_IDENTITY = /(?:^|[._-])(?:test|qa|uat|demo|sandbox|review)(?:[._-]?\d+|[._-]|$)/i;
const TECHNICAL_DIRECTORY_IDENTITY = /(?:^|[._-])(?:adm|admin|svc|service|robot|bot|gpo|keycloak|review|qradar|splunk|zabbix|nessus|qualys|cpam|dnssense|gitlab|jira|mattermost|zammad|ipam|pgadmin|sccm|msol|vault|wug|cortex|polis|police|learning|forward|dwh|bookstack|fsprotect|mbaudit|fp|dlp|forcepoint)(?:[._-]|$)|(?:adm|admin|_svc|_admin|_user)$/i;
const TECHNICAL_NAME_MARKER = /\b(?:account|admin|service|system|technical|application|qradar|splunk|zabbix|nessus|qualys|cpam|sccm|monitor(?:ing)?|scanner|backup|database|sql|ldap|ldaps|devops|mailbox|exchange|vpn|oracle|swift|gitlab|jira|keycloak|test|demo|specialist|engineer|analyst|officer|administrator|operator|developer|support|polis|police|learning|training|tool|protect|forward|vault|dwh|bookstack|audit|mbaudit|expressbank|expresspay|netadmin|fsprotect|wug|forcepoint|dlp|review)\b/i;

function isPersonNamePart(value: string): boolean {
  const normalized = normalizeDirectoryText(value).replace(/[.,]/g, '');
  if (!normalized || normalized.length < 1) return false;
  if (TECHNICAL_NAME_MARKER.test(normalized)) return false;
  return /^\p{L}[\p{L}'’-]*$/u.test(normalized);
}

/**
 * A username shape is never enough to make an identity a bank employee.
 * Real employee records must carry an AD name pair (givenName + sn) or a
 * display/full name with at least two person-name components.
 */
export function hasHumanDirectoryName(
  entry: LDAPRawEntry | { fullName?: string; displayName?: string; givenName?: string; sn?: string },
): boolean {
  const givenName = normalizeDirectoryText(entry.givenName);
  const surname = normalizeDirectoryText(entry.sn);
  if (isPersonNamePart(givenName) && isPersonNamePart(surname)) return true;

  const displayName = normalizeDirectoryText(entry.displayName || entry.fullName);
  if (!displayName || TECHNICAL_NAME_MARKER.test(displayName)) return false;
  const cleanName = displayName.replace(/[.,]/g, ' ');
  const nameParts = cleanName.split(/\s+/).filter(Boolean);
  return nameParts.length >= 2 && nameParts.every(isPersonNamePart);
}

function isLikelyPersonalUsername(username: string): boolean {
  if (TECHNICAL_NAME_MARKER.test(username)) return false;
  if (TECHNICAL_DIRECTORY_IDENTITY.test(username)) return false;
  return /^\p{L}{1,}[._-]\p{L}{3,}$/u.test(username);
}

/**
 * Checks whether an account is a service, system, technical, or non-human identity.
 */
export function isServiceAccount(
  entry: LDAPRawEntry | { username?: string; sAMAccountName?: string; distinguishedName?: string },
  parsedGroups: string[] = []
): boolean {
  const typedEntry = entry as LDAPRawEntry & { username?: string };
  const identityValues = [
    typedEntry.sAMAccountName,
    typedEntry.username,
    typedEntry.userPrincipalName,
    typedEntry.mail,
  ].filter(Boolean);
  const identityAliases = new Set<string>();
  for (const value of identityValues) {
    const normalized = normalizeDirectoryKey(value);
    if (!normalized) continue;
    identityAliases.add(normalized);
    const accountPart = normalized.includes('\\') ? normalized.split('\\').pop()! : normalized;
    identityAliases.add(accountPart.includes('@') ? accountPart.split('@')[0] : accountPart);
  }
  const username = normalizeDirectoryKey(typedEntry.sAMAccountName || typedEntry.username);
  const dn = normalizeDirectoryKey(entry.distinguishedName);
  const groups = parsedGroups.map((group) => normalizeDirectoryKey(group));
  const objectClasses = Array.isArray(typedEntry.objectClass)
    ? typedEntry.objectClass.map((value) => normalizeDirectoryKey(value))
    : [normalizeDirectoryKey(typedEntry.objectClass)];
  const servicePrincipalNames = Array.isArray(typedEntry.servicePrincipalName)
    ? typedEntry.servicePrincipalName.filter(Boolean)
    : typedEntry.servicePrincipalName
      ? [typedEntry.servicePrincipalName]
      : [];
  const accountControl = Number(typedEntry.userAccountControl || 0);

  // 1. Explicit Service / System / Technical / Disabled OUs
  if (
    dn.includes('ou=service') ||
    dn.includes('ou=system') ||
    dn.includes('ou=special') ||
    dn.includes('ou=disable') ||
    dn.includes('ou=service accounts') ||
    dn.includes('ou=service_accounts') ||
    dn.includes('ou=security users') ||
    dn.includes('ou=netadmin') ||
    dn.includes('ou=it_nonprevileged_admins_group') ||
    dn.includes('ou=administrator')
  ) {
    return true;
  }

  // 2. Known service account names. Check every directory identity alias so
  // UPN/mail-based LDAP results cannot bypass an sAMAccountName exclusion.
  if (Array.from(identityAliases).some((alias) => KNOWN_SERVICE_ACCOUNT_NAMES.has(alias))) {
    return true;
  }

  // 2b. Explicit service-account families seen in the bank directory.
  if (
    /^healthmailbox/i.test(username) ||
    /^training/i.test(username) ||
    /^rtccomponentservice$/i.test(username) ||
    /^xerox(?:$|[._-])/i.test(username) ||
    /^polis\./i.test(username) ||
    /^mbaudit/i.test(username) ||
    /ldap(?:$|[._-])/i.test(username) ||
    /devopsldap/i.test(username) ||
    /^dwh\./i.test(username) ||
    /^fsprotect\./i.test(username) ||
    /^dbms-/i.test(username) ||
    /^vaultadmin/i.test(username) ||
    /^expressbank\./i.test(username) ||
    /^bookstack-/i.test(username) ||
    /^wug_/i.test(username) ||
    /^fp_/i.test(username) ||
    /^survey[._-]/i.test(username) ||
    /^merkez\./i.test(username) ||
    /\.egov$/i.test(username) ||
    /\.review$/i.test(username) ||
    /_svc$/i.test(username)
  ) {
    return true;
  }

  // 2c. Managed service accounts and machine/trust identities are not human
  // employees, even when the LDAP search returns them as person-like objects.
  if (
    objectClasses.some((objectClass) => /(?:managedserviceaccount|groupmanagedserviceaccount|computer)$/i.test(objectClass)) ||
    servicePrincipalNames.length > 0 ||
    (accountControl & (0x1000 | 0x2000 | 0x0800 | 0x0100)) !== 0
  ) {
    return true;
  }

  // Groups never classify an account. An explicit "service account" marker in
  // title/description/employeeType remains a valid identity-owned signal.
  const accountMetadata = [typedEntry.description, typedEntry.employeeType, typedEntry.title]
    .map((value) => normalizeDirectoryKey(value))
    .filter(Boolean)
    .join(' ');
  if (
    /(?:service|technical|application|system|non[-_ ]?human|managed)[-_ ]?(?:account|identity|user)/i.test(accountMetadata) ||
    /(?:service|technical|application|system|non[-_ ]?human)[-_ ]?accounts?$/i.test(accountMetadata)
  ) {
    return true;
  }

  // 3. Service prefix / suffix patterns
  if (
    /^(svc|service|sql|backup|scanner|scan|sys|adm|sync|srv|esd|sccm|db|exb|app|iis|polis|audit|tool|bot|wug|fp)[_\-\.]/i.test(username) ||
    /\.(?:rdp|si|sec|sh|shi|mie|adm|admin|service|srv|test|vpn|backup|notification|review)$/i.test(username) ||
    /(?:_svc|_admin|_user)$/i.test(username) ||
    username.endsWith('$')
  ) {
    return true;
  }

  return false;
}

/**
 * Classifies the identity itself. AD memberOf is deliberately excluded: a
 * person can hold many security/distribution groups without becoming a service
 * account or moving to a different organisational unit.
 */
export function classifyDirectoryAccount(
  entry: LDAPRawEntry | { username?: string; sAMAccountName?: string; distinguishedName?: string; title?: string; mail?: string; fullName?: string; department?: string; jobTitle?: string },
): DirectoryAccountType {
  const identity = entry as LDAPRawEntry & { username?: string; jobTitle?: string };
  const username = normalizeDirectoryKey(identity.sAMAccountName || identity.username);
  const email = normalizeDirectoryKey(identity.mail);
  const title = normalizeDirectoryText(identity.title || identity.jobTitle || '');
  const dept = normalizeDirectoryText(identity.department || '');

  if (isExcludedPrivilegedAccount(username)) return 'PRIVILEGED';
  if (isServiceAccount(entry, [])) return 'SERVICE';
  if (TEST_DIRECTORY_IDENTITY.test(username) || TEST_DIRECTORY_IDENTITY.test(email)) return 'TEST';
  if (!hasHumanDirectoryName(entry)) {
    const nameAlias = normalizeDirectoryKey(identity.displayName || identity.fullName).replace(/[._\-\s]/g, '');
    const usernameAlias = username.replace(/[._\-\s]/g, '');
    const isEmptyOrUsernameAlias = !nameAlias || nameAlias === usernameAlias;
    if (!isEmptyOrUsernameAlias || !isLikelyPersonalUsername(username)) return 'TECHNICAL';
  }

  return 'HUMAN';
}

/**
 * Filters out service users, generic system accounts, and non-employee objects.
 * Guarantees that ONLY genuine human employees and interns are synchronized.
 */
export function isGenuineEmployeeOrIntern(
  entry: LDAPRawEntry,
  parsedGroups: string[] = [],
  sAMAccountName: string = ''
): boolean {
  const username = normalizeDirectoryKey(sAMAccountName || entry.sAMAccountName);
  if (!username) return false;

  return classifyDirectoryAccount({ ...entry, sAMAccountName: username }) === 'HUMAN';
}

/**
 * Calculates a canonical score for deduplicating multiple account variants for a person.
 * Standard bank format (e.g. `u.gasimli`) and active directory entries score highest.
 */
export function calculateCanonicalScore(user: {
  username?: string;
  sAMAccountName?: string;
  email?: string;
  title?: string;
  departmentId?: string;
  managerId?: string;
  distinguishedName?: string;
  isActive?: boolean;
  directorySource?: string;
  organizationEligible?: boolean;
  lastLdapLoginAt?: string;
}): number {
  const username = normalizeDirectoryKey(user.username || user.sAMAccountName);
  let score = 0;

  if (user.directorySource === 'ACTIVE_DIRECTORY') score += 50;
  if (user.isActive) score += 30;
  if (user.organizationEligible !== false) score += 20;

  if (isExcludedPrivilegedAccount(username)) score -= 100;

  // Format preference: `f.surname` is the modern corporate standard
  if (/^[a-z]\.[a-z0-9_-]{3,}$/i.test(username)) {
    score += 40;
  } else if (/^[a-z]{2}\.[a-z0-9_-]{3,}$/i.test(username)) {
    score += 30;
  } else if (/^[a-z]{3,}\.[a-z0-9_-]{3,}$/i.test(username)) {
    score += 25;
  } else if (/^[a-z]{3,}$/i.test(username)) {
    score += 10;
  }

  if (user.email && user.email.includes('@')) score += 15;
  if (user.title && user.title.length > 2) score += 10;
  if (user.departmentId && user.departmentId !== 'dept-general-banking') score += 10;
  if (user.managerId) score += 10;
  if (user.distinguishedName) score += 5;

  return score;
}
