import fs from 'fs';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data/database.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

function normalizeAzerbaijani(text) {
  return (text || '')
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

function slugifyDept(text) {
  return (
    normalizeAzerbaijani(text)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'general'
  );
}

function generateDeptCode(text) {
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

function extractOUs(dn) {
  if (!dn) return [];
  const matches = [];
  const re = /OU=((?:\\.|[^,])*)/gi;
  let m;
  while ((m = re.exec(dn)) !== null) {
    matches.push(m[1].replace(/\\/g, '').trim());
  }
  return matches;
}

function getSpecificItOrganizationalUnit(distinguishedName, adDepartment) {
  const parentDepartment = normalizeAzerbaijani(adDepartment).replace(/\s+/g, ' ').trim();
  const technicalContainers = new Set([
    'bank users',
    'ho users',
    'branch users',
    'users',
    'bosses',
    'service',
    'disabled',
    'disable',
    'outlook',
    'no policy',
  ]);

  return extractOUs(distinguishedName).find((ou) => {
    const normalizedOu = normalizeAzerbaijani(ou).replace(/\s+/g, ' ').trim();
    if (!normalizedOu || technicalContainers.has(normalizedOu)) return false;
    if (/^(ie\s+)?test$/.test(normalizedOu)) return false;
    return normalizedOu !== parentDepartment && !normalizedOu.includes('informasiya texnologiyalari departamenti');
  });
}

function mapDepartmentSim(adDepartment = '', adTitle = '', groups = [], distinguishedName = '') {
  const deptStr = String(adDepartment || '').trim();
  const titleStr = String(adTitle || '').trim();
  const dnStr = String(distinguishedName || '').trim();

  const ous = extractOUs(dnStr);
  const relevantOUs = ous.filter(ou => {
    const n = normalizeAzerbaijani(ou);
    return !['bank users', 'ho users', 'branch users', 'users', 'service', 'disabled', 'disable', 'outlook', 'no policy', 'ie test', 'qmatic user'].includes(n);
  });

  // Extract department candidate from title if formatted as "Department / Position"
  let titleDept = '';
  let titlePos = titleStr;
  if (titleStr.includes('/')) {
    const parts = titleStr.split('/').map(p => p.trim());
    titleDept = parts[0];
    titlePos = parts[parts.length - 1];
  }

  // Combined context string for searching
  const combinedContext = [deptStr, titleStr, ...relevantOUs].join(' ');
  const norm = normalizeAzerbaijani(combinedContext);
  const titleNorm = normalizeAzerbaijani(titleStr);
  const posNorm = normalizeAzerbaijani(titlePos);

  const groupArr = Array.isArray(groups) ? groups : groups ? [groups] : [];
  const groupNorms = groupArr.map((g) => normalizeAzerbaijani(String(g))).filter(Boolean);

  // Check if position is a manager / head / leadership role
  const isManagerTitle =
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

  let result;

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
    norm.includes('tehlukesizliyi') ||
    norm.includes('tehlukesizlik') ||
    norm.includes('cyber') ||
    norm.includes('kiber') ||
    norm.includes('soc') ||
    norm.includes('appsec') ||
    norm === 'dept-secops'
  ) {
    let roles = ['SECURITY_ANALYST', 'APPROVER', 'REQUESTER'];
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
      roles = ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'SECURITY_ANALYST', 'APPROVER', 'REQUESTER'];
      teamIds = ['team-soc', 'team-grc'];
    } else if (isInfosecHead) {
      roles = ['INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'SECURITY_ANALYST', 'APPROVER', 'REQUESTER'];
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
  else if (norm.includes('texniki ve fiziki tehlukesizlik') || norm.includes('muhafize') || norm.includes('inkassasiya') || norm.includes('inkasasiya')) {
    let roles = ['REQUESTER', 'ASSIGNEE'];
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
    norm.includes('pr') ||
    norm.includes('dizayn') ||
    norm.includes('brend')
  ) {
    let roles = ['REQUESTER'];
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
    let roles = ['REQUESTER', 'APPROVER'];
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

  // 6. IT Infrastructure & Systems (İT İnfrastruktur və Sistemlər)
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
    norm.includes('abs-in idare')
  ) {
    let roles = ['IT_ADMIN', 'APPROVER', 'REQUESTER'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'IT_ADMIN', 'TEAM_LEAD', 'APPROVER', 'REQUESTER'];
    }

    // Specific IT Sub-Department / Şöbə routing
    const specificOu = getSpecificItOrganizationalUnit(dnStr, deptStr) || (titleDept && titleDept.length > 2 ? titleDept : '');
    let deptId = 'dept-it';
    let deptName = 'İnformasiya Texnologiyaları Departamenti';
    let deptCode = 'IT_DEPT';

    if (specificOu) {
      const specificSlug = slugifyDept(specificOu);
      deptId = `dept-${specificSlug}`;
      deptName = specificOu;
      deptCode = generateDeptCode(specificOu);
    }

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

  // 7. Human Resources (İnsan Resursları)
  else if (
    norm.includes('hr') ||
    norm.includes('human') ||
    norm.includes('insan resurs') ||
    norm.includes('kadr') ||
    norm.includes('telim') ||
    norm.includes('tedris') ||
    norm.includes('senedlesdirme') ||
    norm.includes('ise celb')
  ) {
    let roles = ['HR_ADMIN', 'REQUESTER'];
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
    norm.includes('katiblik')
  ) {
    let roles = ['REQUESTER', 'APPROVER'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'LEGAL_ADMIN', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: norm.includes('katiblik') ? 'dept-katiblik-sobesi' : 'dept-legal',
      divisionId: 'div-hr',
      teamIds: ['team-hr-ops'],
      departmentName: norm.includes('katiblik') ? 'Katiblik Şöbəsi' : 'Hüquq Departamenti',
      departmentCode: norm.includes('katiblik') ? 'KATIB_DEPT' : 'LEGAL',
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
    norm.includes('budce')
  ) {
    let roles = ['REQUESTER', 'APPROVER'];
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
  else if (norm.includes('xezine') || norm.includes('treasury') || norm.includes('valyuta')) {
    let roles = ['REQUESTER', 'APPROVER'];
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

  // 11. Settlements & Clearing (Hesablaşmalar və Klirinq)
  else if (
    norm.includes('hesablas') ||
    norm.includes('klirinq') ||
    norm.includes('kartlar') ||
    norm.includes('prosessinq') ||
    norm.includes('kassa') ||
    norm.includes('nagd vesait')
  ) {
    let roles = ['REQUESTER', 'ASSIGNEE'];
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

  // 12. Payment Systems (Ödəniş Sistemləri)
  else if (norm.includes('odenis sistem') || norm.includes('expresspay')) {
    let roles = ['REQUESTER', 'ASSIGNEE'];
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
    norm.includes('dnd')
  ) {
    let roles = ['AUDITOR', 'REQUESTER'];
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

  // 14. Internal Audit (Daxili Audit)
  else if (norm.includes('audit')) {
    let roles = ['AUDITOR', 'REQUESTER'];
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
    norm.includes('mxd')
  ) {
    let roles = ['REQUESTER', 'ASSIGNEE'];
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
  else if (norm.includes('kredit') || norm.includes('credit') || norm.includes('andrraytinq') || norm.includes('anderraytinq')) {
    let roles = ['REQUESTER', 'APPROVER'];
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

  // 17. Corporate / Business Banking (Biznes Bankçılıq)
  else if (norm.includes('biznes bank') || norm.includes('korporativ') || norm.includes('bbd') || norm.includes('biznessatish')) {
    let roles = ['REQUESTER', 'APPROVER'];
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
  else if (norm.includes('perakende') || norm.includes('retail') || norm.includes('pbd')) {
    let roles = ['REQUESTER', 'APPROVER'];
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

  // 19. Bank Branches (Filiallar)
  else if (norm.includes('branch') || norm.includes('filial')) {
    const branchOu = relevantOUs.find(ou => normalizeAzerbaijani(ou).includes('branch') || normalizeAzerbaijani(ou).includes('filial')) || 'Bank Filialı';
    const branchSlug = slugifyDept(branchOu);
    let roles = ['REQUESTER', 'ASSIGNEE'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: `dept-${branchSlug}`,
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: branchOu,
      departmentCode: 'BRANCH_' + branchSlug.replace(/[^a-z0-9]/g, '').slice(0, 8).toUpperCase(),
      roles,
      securityClearance: 'INTERNAL',
    };
  }

  // 20. Other Real Department via title / OU / deptStr
  else if (relevantOUs.length > 0 || (deptStr && deptStr.length > 1) || (titleDept && titleDept.length > 1)) {
    const candidateName = relevantOUs[0] || titleDept || deptStr;
    const rawSlug = slugifyDept(candidateName);
    let roles = ['REQUESTER', 'ASSIGNEE'];
    if (isManagerTitle) {
      roles = ['DEPARTMENT_ADMIN', 'DEPARTMENT_MANAGER', 'APPROVER', 'REQUESTER'];
    }
    result = {
      departmentId: `dept-${rawSlug}`,
      divisionId: 'div-banking',
      teamIds: ['team-swift-eng'],
      departmentName: candidateName,
      departmentCode: generateDeptCode(candidateName),
      roles,
      securityClearance: 'INTERNAL',
    };
  }

  // 21. Total Fallback
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

  // Dynamic Group RBAC overrides
  const isEnterpriseSecurityAdmin = groupNorms.some(
    (g) =>
      g.includes('enterprise_security_admins') ||
      g.includes('domain admins') ||
      g.includes('enterprise admins') ||
      g.includes('ciso_executive') ||
      g.includes('platform_admins')
  );

  if (isEnterpriseSecurityAdmin) {
    result.departmentId = 'dept-secops';
    result.divisionId = 'div-sec';
    result.teamIds = ['team-soc', 'team-grc'];
    result.departmentName = 'İnformasiya Təhlükəsizliyi Departamenti';
    result.departmentCode = 'INFOSEC';
    result.roles = ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'APPROVER', 'REQUESTER'];
    result.securityClearance = 'HIGHLY_RESTRICTED_HR_LEGAL';
  }

  return result;
}

// Test against all users
console.log('--- TESTING NEW SIMULATION MAPPING ACROSS 1008 USERS ---');
const mappedCounts = {};
let newGeneralCount = 0;
const infosecUsers = [];
const allManagersMapped = [];

db.users.forEach(u => {
  const m = mapDepartmentSim(u.department || '', u.title || '', u.distributionGroups || [], u.distinguishedName || '');
  mappedCounts[m.departmentId] = (mappedCounts[m.departmentId] || 0) + 1;
  if (m.departmentId === 'dept-general-banking') newGeneralCount++;
  if (m.departmentId === 'dept-secops') infosecUsers.push({ u, m });
  if (m.roles.includes('DEPARTMENT_MANAGER') || m.roles.includes('INFOSEC_MANAGER') || m.roles.includes('CISO')) {
    allManagersMapped.push({ u, m });
  }
});

console.log(`Remaining in dept-general-banking: ${newGeneralCount} (down from 228)`);
console.log(`Infosec Department (dept-secops) Total Members: ${infosecUsers.length}`);

console.log('\n--- Infosec Department Members & Roles ---');
infosecUsers.forEach(({ u, m }) => {
  console.log(`${u.username} | ${u.fullName} | Title: "${u.title}" | Roles: [${m.roles.join(', ')}]`);
});

console.log(`\nTotal Managers / Heads with diff roles: ${allManagersMapped.length}`);
console.log('\nSample Managers with diff:');
allManagersMapped.slice(0, 15).forEach(({ u, m }) => {
  console.log(`${u.username} (${u.fullName}) -> Dept: ${m.departmentName} (${m.departmentId}) | Title: "${u.title}" | Roles: [${m.roles.join(', ')}]`);
});
