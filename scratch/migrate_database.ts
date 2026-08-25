import fs from 'fs';
import path from 'path';
import {
  mapDepartment,
  getDepartmentColor,
  getDepartmentIcon,
  isServiceAccount,
} from '../src/server/services/ldap-directory.data.js';

function processDatabaseFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}, skipping`);
    return;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const db = JSON.parse(raw);

  const initialUserCount = db.users?.length || 0;
  console.log(`\nProcessing ${filePath}: ${initialUserCount} users, ${db.departments?.length || 0} departments`);

  // 1. Filter out all non-human service, system, technical, and VPN accounts
  const serviceAccounts = (db.users || []).filter((u: any) => isServiceAccount(u));
  const genuineUsers = (db.users || []).filter((u: any) => !isServiceAccount(u));

  console.log(`  Purged ${serviceAccounts.length} service accounts.`);
  console.log(`  Retained ${genuineUsers.length} genuine employees.`);

  db.users = genuineUsers;

  const syncedDepartmentIds = new Set<string>();

  // 2. Process all genuine users
  for (const user of db.users || []) {
    const deptMapping = mapDepartment(
      user.department || '',
      user.title || '',
      user.distributionGroups || [],
      user.distinguishedName || ''
    );

    user.departmentId = deptMapping.departmentId;
    user.divisionId = deptMapping.divisionId;
    user.teamIds = deptMapping.teamIds;
    user.securityClearance = deptMapping.securityClearance;

    // Preserve special platform admin roles
    const preservedRoles: string[] = [];
    if (user.roles?.includes('PLATFORM_ADMIN')) preservedRoles.push('PLATFORM_ADMIN');
    if (user.roles?.includes('CISO')) preservedRoles.push('CISO');
    if (user.roles?.includes('INFOSEC_ADMIN')) preservedRoles.push('INFOSEC_ADMIN');

    user.roles = Array.from(new Set([...deptMapping.roles, ...preservedRoles]));

    syncedDepartmentIds.add(user.departmentId);

    // Auto-register or refresh department in db.departments
    let deptRecord = (db.departments || []).find((d: any) => d.id === user.departmentId);
    if (!deptRecord) {
      deptRecord = {
        id: user.departmentId,
        divisionId: deptMapping.divisionId,
        name: deptMapping.departmentName,
        code: deptMapping.departmentCode,
        description: `${deptMapping.departmentName} - Expressbank Active Directory Şöbəsi`,
        color: getDepartmentColor(deptMapping.departmentName),
        icon: getDepartmentIcon(deptMapping.departmentName),
        isActive: true,
        memberCount: 0,
        connectionCount: 0,
        templateCount: 0,
        activeTaskCount: 0,
        settings: {
          defaultSlaHours: 24,
          criticalSlaHours: 4,
          autoAssignEnabled: true,
          requireDualApproval: false,
          allowedTicketCategories: ['GENERAL_REQUEST', 'ACCESS_REQUEST'],
          workingHours: { start: '09:00', end: '18:00', timezone: 'Asia/Baku' },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        directorySource: 'ACTIVE_DIRECTORY',
      };
      db.departments.push(deptRecord);
    } else {
      // Fix name if it was previously corrupted
      if (
        deptMapping.departmentName &&
        deptMapping.departmentName !== 'Ümumi Bank Xidmətləri və Əməliyyatlar'
      ) {
        deptRecord.name = deptMapping.departmentName;
        deptRecord.code = deptMapping.departmentCode;
        deptRecord.color = getDepartmentColor(deptMapping.departmentName);
        deptRecord.icon = getDepartmentIcon(deptMapping.departmentName);
        deptRecord.divisionId = deptMapping.divisionId;
      }
    }
  }

  // 3. Resolve department managers and admin user IDs
  for (const dept of db.departments || []) {
    const deptMembers = (db.users || []).filter((u: any) => u.departmentId === dept.id && u.isActive !== false);

    // Explicit known department heads
    if (dept.id === 'dept-secops') {
      dept.name = 'İnformasiya Təhlükəsizliyi Departamenti';
      dept.code = 'INFOSEC';
      dept.divisionId = 'div-sec';
      dept.color = '#0052CC';
      dept.icon = 'Shield';
      dept.managerId = 'usr-e-farzaliyev';
      dept.adminUserIds = ['usr-e-farzaliyev', 'usr-u-gasimli', 'usr-s-mammadli'];
    } else if (dept.id === 'dept-it') {
      dept.name = 'İnformasiya Texnologiyaları Departamenti';
      dept.code = 'IT_DEPT';
      dept.divisionId = 'div-it';
      dept.color = '#00875A';
      dept.icon = 'Server';
    } else if (dept.id === 'dept-executive') {
      dept.name = 'İdarə Heyəti və Rəhbərlik';
      dept.code = 'EXECUTIVE';
      dept.divisionId = 'div-banking';
      dept.color = '#172B4D';
      dept.icon = 'Award';
      dept.managerId = 'usr-m-mammadov';
      dept.adminUserIds = ['usr-m-mammadov'];
    } else if (dept.id === 'dept-marketing') {
      dept.name = 'Reklam və Marketinq Departamenti';
      dept.code = 'MARKETING';
      dept.divisionId = 'div-hr';
      dept.color = '#E34935';
      dept.icon = 'TrendingUp';
      dept.managerId = 'usr-ayshan-hasanova';
    } else if (dept.id === 'dept-pmo') {
      dept.name = 'Biznes Proseslərin Təhlili və Optimallaşdırılması Şöbəsi';
      dept.code = 'PMO';
      dept.divisionId = 'div-banking';
      dept.color = '#36B37E';
      dept.icon = 'Layers';
      dept.managerId = 'usr-r-huseynova';
    } else if (dept.id === 'dept-finance') {
      dept.name = 'Maliyyə və Mühasibatlıq Departamenti';
      dept.code = 'FINANCE';
      dept.divisionId = 'div-banking';
      dept.color = '#6554C0';
      dept.icon = 'DollarSign';
      dept.managerId = 'usr-s-fattayeva';
    } else if (dept.id === 'dept-treasury') {
      dept.name = 'Xəzinədarlıq Departamenti';
      dept.code = 'TREASURY';
      dept.divisionId = 'div-banking';
      dept.color = '#36B37E';
      dept.icon = 'DollarSign';
      dept.managerId = 'usr-c-bagirov';
    } else if (dept.id === 'dept-hesablasmalar-departamenti') {
      dept.name = 'Hesablaşmalar Departamenti';
      dept.code = 'HESAB_DEPT';
      dept.divisionId = 'div-banking';
      dept.color = '#2684FF';
      dept.icon = 'CreditCard';
      dept.managerId = 'usr-c-rzayev';
    } else if (dept.id === 'dept-odenis-sistemlerin-idare-edilmesi-departamenti') {
      dept.name = 'Ödəniş Sistemlərinin İdarə Edilməsi Departamenti';
      dept.code = 'ODENIS_DEPT';
      dept.divisionId = 'div-banking';
      dept.color = '#00A3BF';
      dept.icon = 'Zap';
      dept.managerId = 'usr-ayten-hasanova';
    } else if (dept.id === 'dept-hr') {
      dept.name = 'İnsan Resursları Departamenti';
      dept.code = 'HR_DEPT';
      dept.divisionId = 'div-hr';
      dept.color = '#00B8D9';
      dept.icon = 'Users';
      dept.managerId = 'usr-g-ismayilli';
    } else if (dept.id === 'dept-legal') {
      dept.name = 'Hüquq Departamenti';
      dept.code = 'LEGAL';
      dept.divisionId = 'div-hr';
      dept.color = '#403294';
      dept.icon = 'BookOpen';
      dept.managerId = 'usr-a-aliyeva';
    } else if (dept.id === 'dept-credit') {
      dept.name = 'Kredit və Anderraytinq Departamenti';
      dept.code = 'CREDIT';
      dept.divisionId = 'div-banking';
      dept.color = '#FFAB00';
      dept.icon = 'CreditCard';
    } else if (dept.id === 'dept-corporate') {
      dept.name = 'Biznes Bankçılıq Departamenti';
      dept.code = 'CORP_BANK';
      dept.divisionId = 'div-banking';
      dept.color = '#0052CC';
      dept.icon = 'Briefcase';
    } else if (dept.id === 'dept-retail') {
      dept.name = 'Pərakəndə Bankçılıq Departamenti';
      dept.code = 'RETAIL';
      dept.divisionId = 'div-banking';
      dept.color = '#2684FF';
      dept.icon = 'Users';
      dept.managerId = 'usr-agarza-aliyev';
    } else if (dept.id === 'dept-customer-care') {
      dept.name = 'Müştəri Xidmətləri və Çağrı Mərkəzi';
      dept.code = 'CALL_CENTER';
      dept.divisionId = 'div-banking';
      dept.color = '#57D9A3';
      dept.icon = 'PhoneCall';
    } else if (dept.id === 'dept-audit') {
      dept.name = 'Daxili Audit Departamenti';
      dept.code = 'AUDIT';
      dept.divisionId = 'div-sec';
      dept.color = '#FF5630';
      dept.icon = 'CheckSquare';
    } else if (dept.id === 'dept-daxili-nezaret-departamenti') {
      dept.name = 'Daxili Nəzarət Departamenti';
      dept.code = 'DND_DEPT';
      dept.divisionId = 'div-sec';
      dept.color = '#FF8B00';
      dept.icon = 'AlertTriangle';
    } else if (dept.id === 'dept-grc') {
      dept.name = 'Komplayens və Risk Departamenti';
      dept.code = 'GRC';
      dept.divisionId = 'div-sec';
      dept.color = '#FF8B00';
      dept.icon = 'ShieldAlert';
    } else if (dept.id === 'dept-qaradag-branch') {
      dept.name = 'Qaradağ Filialı';
      dept.code = 'BRANCH_QARADAG';
      dept.divisionId = 'div-banking';
      dept.managerId = 'usr-f-aliyev';
    }

    // Generic head user detection if not explicitly set
    if (!dept.managerId || !db.users.some((u: any) => u.id === dept.managerId)) {
      const headUser = deptMembers.find(
        (u: any) =>
          u.roles.includes('INFOSEC_MANAGER') ||
          u.roles.includes('DEPARTMENT_MANAGER') ||
          u.roles.includes('CISO') ||
          /müdir|mudir|direktor|director|rəis|reis|sədr|head|manager/i.test(u.title || '')
      );
      if (headUser) {
        dept.managerId = headUser.id;
      }
    }

    if (dept.managerId && (!dept.adminUserIds || !dept.adminUserIds.includes(dept.managerId))) {
      dept.adminUserIds = Array.from(new Set([...(dept.adminUserIds || []), dept.managerId]));
    }

    // Update member count
    dept.memberCount = deptMembers.length;
  }

  // Save to disk
  fs.writeFileSync(filePath, JSON.stringify(db, null, 2), 'utf8');
  console.log(`Saved updated database to ${filePath}`);
}

processDatabaseFile(path.resolve(process.cwd(), 'data/database.json'));
processDatabaseFile(path.resolve(process.cwd(), 'data/database.test.json'));
