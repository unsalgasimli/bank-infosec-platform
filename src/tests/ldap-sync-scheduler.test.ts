import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { LDAPSyncService, LDAPSyncReport, LDAP_HUMAN_ACCOUNT_FILTER } from '../server/services/ldap-sync.service.js';
import type { LDAPRawEntry } from '../server/services/ldap-directory.data.js';
import { LDAPSchedulerService } from '../server/services/ldap-scheduler.service.js';
import { db } from '../server/db/database.js';
import { BankUser } from '../shared/types/auth.js';

describe('🛡️ Active Directory / LDAP Daily Synchronization Engine (13:30 GMT+4)', () => {
  before(() => {
    // Ensure clean state before tests
    LDAPSyncService.deduplicateUsers();
  });

  after(() => {
    LDAPSchedulerService.stopScheduler();
  });

  // 1. Timezone & Timing Calculations (13:30 GMT+4)
  it('1. Scheduler accurately computes next run at 13:30 GMT+4 (Asia/Baku / UTC+4)', () => {
    const calculation = LDAPSchedulerService.calculateNextRunGMT4(13, 30);
    assert.ok(calculation.nextRunDate instanceof Date, 'nextRunDate must be a valid Date object');
    assert.ok(calculation.delayMs > 0, 'delayMs must be positive');
    assert.ok(calculation.gmt4Formatted.includes('13:30:00 GMT+4'), 'Formatted string must specify 13:30:00 GMT+4');

    // 13:30 GMT+4 corresponds to 09:30 UTC
    const utcHours = calculation.nextRunDate.getUTCHours();
    const utcMinutes = calculation.nextRunDate.getUTCMinutes();
    assert.strictEqual(utcHours, 9, '13:30 GMT+4 must be exactly 09:30 UTC');
    assert.strictEqual(utcMinutes, 30, '13:30 GMT+4 must be exactly 30 minutes past the hour');
  });

  // 2. Department / Şöbə Mapping Logic
  it('2. Department mapping correctly classifies Azerbaijani & English banking şöbələr', () => {
    // InfoSec / Cyber Defense
    const secDept1 = LDAPSyncService.mapDepartment('İnformasiya Təhlükəsizliyi Şöbəsi', 'Chief Information Security Officer');
    assert.strictEqual(secDept1.departmentId, 'dept-secops');
    assert.strictEqual(secDept1.divisionId, 'div-sec');
    assert.ok(secDept1.roles.includes('CISO'));

    const secDept2 = LDAPSyncService.mapDepartment('Kibertəhlükəsizlik və SOC', 'Tier-2 SOC Analyst');
    assert.strictEqual(secDept2.departmentId, 'dept-secops');
    assert.ok(secDept2.roles.includes('SOC_ANALYST'));

    // IT Infrastructure
    const itDept = LDAPSyncService.mapDepartment('İnformasiya Texnologiyaları (İKT)', 'Head of IT');
    assert.strictEqual(itDept.departmentId, 'dept-it');
    assert.strictEqual(itDept.divisionId, 'div-it');
    assert.ok(itDept.roles.includes('IT_ADMIN'));

    const devOpsDept = LDAPSyncService.mapDepartment(
      'İnformasiya Texnologiyaları Departamenti',
      'Sistemlərin avtomatlaşdırılması bölməsi / Aparıcı Mütəxəssis',
      ['DevOps'],
      'CN=Turxan Mammadli,OU=DevOps,OU=İnformasiya Texnologiyaları Departamenti,OU=BANK USERS,DC=Expressbank,DC=az'
    );
    assert.strictEqual(devOpsDept.departmentId, 'dept-it');
    assert.strictEqual(devOpsDept.sectionName, 'DevOps');
    assert.strictEqual(devOpsDept.sectionId, 'section-dept-it-devops');
    assert.strictEqual(devOpsDept.divisionId, 'div-it');
    assert.ok(devOpsDept.roles.includes('IT_ADMIN'));

    const innovationDept = LDAPSyncService.mapDepartment(
      'İnformasiya Texnologiyaları Departamenti',
      'Aparıcı Mütəxəssis',
      [],
      'CN=Test User,OU=İnnovasiyalar və proqramlaşdırma şöbəsi,OU=İnformasiya Texnologiyaları Departamenti,OU=BANK USERS,DC=Expressbank,DC=az'
    );
    assert.strictEqual(innovationDept.departmentId, 'dept-it');
    assert.strictEqual(innovationDept.sectionName, 'İnnovasiyalar və proqramlaşdırma şöbəsi');

    // HR
    const hrDept = LDAPSyncService.mapDepartment('İnsan Resursları və Kadrlar', 'HR Specialist');
    assert.strictEqual(hrDept.departmentId, 'dept-hr');
    assert.strictEqual(hrDept.divisionId, 'div-hr');
    assert.ok(hrDept.roles.includes('HR_ADMIN'));

    // Core Banking
    const coreDept = LDAPSyncService.mapDepartment('Əməliyyat və Bank Sistemləri', 'SWIFT Engineer');
    assert.strictEqual(coreDept.departmentId, 'dept-core');
    assert.strictEqual(coreDept.divisionId, 'div-banking');

    // GRC / Compliance
    const grcDept = LDAPSyncService.mapDepartment('Risk və Komplayens Şöbəsi', 'Compliance Officer');
    assert.strictEqual(grcDept.departmentId, 'dept-grc');
    assert.ok(grcDept.roles.includes('AUDITOR'));
  });

  // 3. Active Directory Account Disable Detection (userAccountControl)
  it('3. Detects disabled accounts via Active Directory userAccountControl flags and account expiry', () => {
    // Standard Active Account: UAC = 512 (NORMAL_ACCOUNT)
    const activeEntry: LDAPRawEntry = { sAMAccountName: 'test.active', userAccountControl: 512 };
    assert.strictEqual(LDAPSyncService.isAccountDisabled(activeEntry), false, 'UAC 512 must be active');

    // Disabled Account: UAC = 514 (NORMAL_ACCOUNT | ACCOUNTDISABLE)
    const disabledEntry: LDAPRawEntry = { sAMAccountName: 'test.disabled', userAccountControl: 514 };
    assert.strictEqual(LDAPSyncService.isAccountDisabled(disabledEntry), true, 'UAC 514 must be detected as disabled');

    // Expired Account check
    const expiredEntry: LDAPRawEntry = {
      sAMAccountName: 'test.expired',
      userAccountControl: 512,
      accountExpires: '128000000000000000', // Past Windows FileTime date
    };
    assert.strictEqual(LDAPSyncService.isAccountDisabled(expiredEntry), true, 'Expired account must be detected as disabled');
  });

  it('3.1 excludes privileged shadow-account suffixes even when they are in the all group', () => {
    for (const suffix of ['rdp', 'si', 'sec', 'sh']) {
      const privilegedEntry: LDAPRawEntry = {
        sAMAccountName: `employee.${suffix}`,
        memberOf: ['CN=all,OU=GROUPS,DC=Expressbank,DC=az'],
      };
      assert.strictEqual(
        LDAPSyncService.isGenuineEmployeeOrIntern(privilegedEntry, ['all'], privilegedEntry.sAMAccountName),
        false,
        `.${suffix} must not be synchronized`
      );
    }
  });

  it('3.2 strictly excludes non-human service, system, technical, and VPN accounts', () => {
    const serviceTestCases = [
      { sam: 'azure.ad', dn: 'CN=Azure.ad,OU=İnformasiya Texnologiyaları Departamenti,OU=BANK USERS,DC=Expressbank,DC=az' },
      { sam: 'ldap', dn: 'CN=ldap,OU=DISABLED,OU=USER,OU=SERVICE,DC=Expressbank,DC=az' },
      { sam: 'ldappa', dn: 'CN=ldappa,OU=DISABLED,OU=USER,OU=SERVICE,DC=Expressbank,DC=az' },
      { sam: 'assetit', dn: 'CN=assetit,OU=USER,OU=SERVICE,DC=Expressbank,DC=az' },
      { sam: 'otpuser', dn: 'CN=OTP User,OU=VPN,OU=SERVICE,DC=Expressbank,DC=az' },
      { sam: 'securit1', dn: 'CN=securit1,OU=USER,OU=SERVICE,DC=Expressbank,DC=az' },
      { sam: 'qradar', dn: 'CN=qradar,OU=USER,OU=SERVICE,DC=Expressbank,DC=az' },
      { sam: 'rtccomponent', dn: 'CN=rtccomponent,OU=USER,OU=SERVICE,DC=Expressbank,DC=az' },
      { sam: 'rtccomponentservice', dn: 'CN=rtccomponentservice,OU=BANK USERS,DC=Expressbank,DC=az' },
      { sam: 'xerox', dn: 'CN=xerox,OU=BANK USERS,DC=Expressbank,DC=az' },
      { sam: 'healthmailbox-001', dn: 'CN=healthmailbox-001,OU=BANK USERS,DC=Expressbank,DC=az' },
      { sam: 'trainingroom01', dn: 'CN=trainingroom01,OU=BANK USERS,DC=Expressbank,DC=az' },
      { sam: 'sysacc', dn: 'CN=System Account,OU=USER,OU=SERVICE,DC=Expressbank,DC=az' },
      { sam: 'cob', dn: 'CN=cob,OU=USER,OU=SERVICE,DC=Expressbank,DC=az' },
      { sam: 'n8n', dn: 'CN=n8n,OU=SERVICE,DC=Expressbank,DC=az' },
      { sam: 'svc_backup', dn: 'CN=svc_backup,OU=BANK USERS,DC=Expressbank,DC=az' },
      { sam: 'ramin.quliyev', dn: 'CN=Ramin Quliyev,OU=PavpnUsers,OU=VPN,OU=SERVICE,DC=Expressbank,DC=az' },
      { sam: 'a.bubnov', dn: 'CN=Alexandr Bubnov,OU=SUPPORT,OU=SERVICE,DC=Expressbank,DC=az' },
      { sam: 'testinfosec', dn: 'CN=test infosec,CN=Users,DC=Expressbank,DC=az' },
      { sam: 'owncloud', dn: 'CN=owncloud web,OU=USER,OU=SERVICE,DC=Expressbank,DC=az' },
      { sam: 'zabbix.windows', dn: 'CN=Zabbix.Windows,OU=USER,OU=SERVICE,DC=Expressbank,DC=az' },
      { sam: 'adaudit', dn: 'CN=ADAudit,OU=USER,OU=SERVICE,DC=Expressbank,DC=az' },
      { sam: 'jira-itsec', dn: 'CN=Jira ITSec,OU=USER,OU=SERVICE,DC=Expressbank,DC=az' },
      { sam: 'nessus.infosec', dn: 'CN=Nessus Infosec,OU=SERVICE,DC=Expressbank,DC=az' },
      { sam: 'CPAM', dn: 'CN=CPAM,OU=BANK USERS,DC=Expressbank,DC=az' },
      { sam: 'dnssense', dn: 'CN=DNSSense,OU=BANK USERS,DC=Expressbank,DC=az' },
    ];

    for (const testCase of serviceTestCases) {
      const entry: LDAPRawEntry = {
        sAMAccountName: testCase.sam,
        distinguishedName: testCase.dn,
        memberOf: ['CN=all,OU=GROUPS,DC=Expressbank,DC=az'],
      };
      assert.strictEqual(
        LDAPSyncService.isGenuineEmployeeOrIntern(entry, ['all'], testCase.sam),
        false,
        `Service account ${testCase.sam} must be rejected from human employee directory`
      );
    }
  });

  it('3.3 applies service-account exclusions in the AD server-side LDAP filter', () => {
    assert.match(LDAP_HUMAN_ACCOUNT_FILTER, /!\(sAMAccountName=rtccomponentservice\)/i);
    assert.match(LDAP_HUMAN_ACCOUNT_FILTER, /!\(sAMAccountName=xerox\)/i);
    assert.match(LDAP_HUMAN_ACCOUNT_FILTER, /!\(sAMAccountName=cpam\)/i);
    assert.match(LDAP_HUMAN_ACCOUNT_FILTER, /!\(sAMAccountName=dnssense\)/i);
    assert.match(LDAP_HUMAN_ACCOUNT_FILTER, /!\(sAMAccountName=healthmailbox\*\)/i);
    assert.match(LDAP_HUMAN_ACCOUNT_FILTER, /!\(sAMAccountName=training\*\)/i);
  });

  it('3.4 rejects service identities through normalized aliases and AD metadata signals', () => {
    const cases: LDAPRawEntry[] = [
      {
        sAMAccountName: 'ordinary.alias',
        userPrincipalName: 'CPAM@expressbank.az',
        mail: 'cpam@expressbank.az',
      },
      {
        sAMAccountName: 'managed.identity',
        objectClass: ['top', 'person', 'msDS-GroupManagedServiceAccount'],
      },
      {
        sAMAccountName: 'spn.identity',
        servicePrincipalName: ['HTTP/dnssense.expressbank.az'],
      },
      {
        sAMAccountName: 'technical.identity',
        title: 'Application Service Account',
      },
    ];

    for (const entry of cases) {
      assert.strictEqual(
        LDAPSyncService.isGenuineEmployeeOrIntern(entry, [], entry.sAMAccountName),
        false,
        `Non-human identity ${entry.sAMAccountName} must be rejected by the shared guard`
      );
    }
  });

  // 4. Synchronization Pipeline: Added and Disabled Users Handling
  it('4. syncAllUsers correctly provisions new users, disables deactivated accounts, and updates changes', async () => {
    const originalQuery = LDAPSyncService.queryLdapDirectory;
    LDAPSyncService.queryLdapDirectory = async () => ({
      isLiveLdap: true,
      users: [{
        sAMAccountName: 'u.gasimli',
        userPrincipalName: 'u.gasimli@expressbank.az',
        mail: 'u.gasimli@expressbank.az',
        displayName: 'Unsal Gasimli',
        title: 'Chief Information Security Officer',
        department: 'Information Security',
        memberOf: ['CN=all,OU=GROUPS,DC=Expressbank,DC=az'],
        userAccountControl: 512,
      }],
    });

    let report: LDAPSyncReport;
    try {
      report = await LDAPSyncService.syncAllUsers({ trigger: 'SCHEDULED_DAILY_CHECK' });
    } finally {
      LDAPSyncService.queryLdapDirectory = originalQuery;
    }

    assert.ok(report.totalLdapUsers >= 1, 'Must process LDAP directory users');
    assert.ok(report.activeUsersCount >= 1, 'Must identify active users');
    assert.ok(
      Object.values(report.departmentCounts).some((department) => department.active > 0),
      'Must report an active department returned by live LDAP'
    );

    // Verify all users in db.data.users have proper department and LDAP metadata
    for (const u of db.data.users) {
      assert.ok(u.id, 'User must have id');
      assert.ok(u.username, 'User must have username');
      assert.ok(u.email, 'User must have email');
      assert.ok(u.departmentId, 'User must have departmentId');
      assert.ok(Array.isArray(u.roles) && u.roles.length > 0, 'User must have roles');
    }
  });

  // 5. Deduplication Engine: Purging Duplicates and Fixing Foreign Keys
  it('5. deduplicateUsers merges duplicate accounts and re-links ticket foreign keys', () => {
    const originalCount = db.data.users.length;
    const canonicalUser = db.data.users.find((user) => user.username === 'u.gasimli');
    assert.ok(canonicalUser, 'The live-sync fixture must provide a canonical AD account');

    // Inject artificial duplicate user
    const duplicateUser: BankUser = {
      id: 'usr-duplicate-test-99',
      username: 'u.gasimli', // duplicate username
      sAMAccountName: 'u.gasimli',
      email: 'u.gasimli@expressbank.az',
      fullName: 'Unsal Gasimli Duplicate',
      title: 'CISO Duplicate',
      departmentId: 'dept-secops',
      divisionId: 'div-sec',
      teamIds: ['team-soc'],
      roles: ['CISO'],
      securityClearance: 'HIGHLY_RESTRICTED_HR_LEGAL',
      ownedApplicationIds: [],
      ownedAssetIds: [],
      ownedRiskIds: [],
      isActive: true,
    };

    db.data.users.push(duplicateUser);

    db.data.tickets.push({
      id: 'TCK-DEDUP-001',
      key: 'SEC-9999',
      ticketType: 'SEC',
      title: 'Ticket for Deduplication Test',
      description: 'Testing re-mapping of ticket assignee',
      businessPriority: 'P2_HIGH',
      technicalSeverity: 'HIGH',
      confidentiality: 'CONFIDENTIAL_SECURITY_ONLY',
      statusId: 'OPEN',
      statusCategory: 'TO_DO',
      departmentId: 'dept-secops',
      reporterId: 'usr-duplicate-test-99',
      assigneeId: 'usr-duplicate-test-99',
      watcherIds: ['usr-duplicate-test-99'],
      tags: [],
      attachments: [],
    } as any);

    const dedupResult = LDAPSyncService.deduplicateUsers();
    assert.strictEqual(dedupResult.removedCount, 1, 'Must remove exactly 1 duplicate user');
    assert.strictEqual(db.data.users.length, originalCount, 'User count must return to canonical count');

    // Verify ticket foreign keys were remapped to canonical user ID
    const testTicket = db.data.tickets.find((t) => t.id === 'TCK-DEDUP-001');
    assert.ok(testTicket, 'Test ticket must exist');
    assert.notStrictEqual(testTicket.assigneeId, 'usr-duplicate-test-99', 'Assignee must be re-mapped away from duplicate ID');
    assert.strictEqual(testTicket.assigneeId, canonicalUser.id, 'Assignee must be re-mapped to the canonical AD identity');

    // Cleanup test ticket
    db.data.tickets = db.data.tickets.filter((t) => t.id !== 'TCK-DEDUP-001');
    db.persist();
  });

  // 6. Scheduler Lifecycle & Status API
  it('6. LDAPSchedulerService reports active status, next run at 13:30 GMT+4, and department overview', async () => {
    LDAPSchedulerService.startScheduler();
    const status = LDAPSchedulerService.getStatus();

    assert.strictEqual(status.isSchedulerActive, true, 'Scheduler must be active');
    assert.strictEqual(status.targetTimeGMT4, '13:30', 'Target time must be 13:30');
    assert.strictEqual(status.timezone, 'GMT+4 (Asia/Baku)', 'Timezone must be GMT+4 (Asia/Baku)');
    assert.ok(status.departmentOverview.length >= 5, 'Must report at least 5 departments');

    // Test manual trigger
    const manualReport = await LDAPSchedulerService.triggerManualSync();
    assert.strictEqual(manualReport.trigger, 'MANUAL_TRIGGER', 'Report trigger must be MANUAL_TRIGGER');
    assert.ok(manualReport.executionDurationMs >= 0, 'Must record execution duration');

    LDAPSchedulerService.stopScheduler();
    const stoppedStatus = LDAPSchedulerService.getStatus();
    assert.strictEqual(stoppedStatus.isSchedulerActive, false, 'Scheduler must be stopped');
  });

  // 7. No in-code directory baseline is allowed.
  it('7. does not expose an in-code user directory baseline', () => {
    assert.strictEqual(
      'getEnterpriseLdapDirectory' in LDAPSyncService,
      false,
      'Directory identities must originate from a live LDAP query, not source code'
    );
  });

  // 8. Leadership & Manager Role Differentiation & Slashed Title Resolution
  it('8. Accurately identifies department managers/heads and infosec staff from titles and OUs', () => {
    // 8.1 Emil Farzaliyev - Information Security Head (Müdir)
    const emilMapping = LDAPSyncService.mapDepartment(
      '',
      'İnformasiya təhlükəsizliyi şöbəsi / Müdir',
      ['İnformasiya təhlükəsizliyi şöbəsi - SG', 'all'],
      'CN=Emil Farzaliyev,OU=İnformasiya təhlükəsizliyi şöbəsi,OU=İnformasiya təhlükəsizliyinin təmin edilməsi departamenti,OU=HO Users,OU=BANK USERS,DC=Expressbank,DC=az'
    );
    assert.strictEqual(emilMapping.departmentId, 'dept-secops');
    assert.strictEqual(emilMapping.departmentName, 'İnformasiya Təhlükəsizliyi Departamenti');
    assert.strictEqual(emilMapping.sectionName, 'İnformasiya təhlükəsizliyi şöbəsi');
    assert.strictEqual(emilMapping.divisionId, 'div-sec');
    assert.ok(emilMapping.roles.includes('INFOSEC_MANAGER'), 'Head of Infosec must have INFOSEC_MANAGER role');
    assert.ok(emilMapping.roles.includes('DEPARTMENT_MANAGER'), 'Head of Infosec must have DEPARTMENT_MANAGER role');
    assert.ok(emilMapping.roles.includes('DEPARTMENT_ADMIN'), 'Head of Infosec must have DEPARTMENT_ADMIN role');
    assert.ok(emilMapping.roles.includes('TEAM_LEAD'), 'Head of Infosec must have TEAM_LEAD role');

    // 8.2 Ruslan Murtuzov - Information Security Specialist
    const ruslanMapping = LDAPSyncService.mapDepartment(
      '',
      'İnformasiya təhlükəsizliyi şöbəsi / Mütəxəssis',
      ['qradar-operators', 'DOT1x-ITSEC - SG', 'all'],
      'CN=Ruslan Murtuzov,OU=Kibertəhlükəsizlik bölməsi,OU=İnformasiya təhlükəsizliyi şöbəsi,OU=İnformasiya təhlükəsizliyinin təmin edilməsi departamenti,OU=HO Users,OU=BANK USERS,DC=Expressbank,DC=az'
    );
    assert.strictEqual(ruslanMapping.departmentId, 'dept-secops');
    assert.strictEqual(ruslanMapping.divisionId, 'div-sec');
    assert.ok(ruslanMapping.roles.includes('SECURITY_ANALYST'), 'Infosec specialist must have SECURITY_ANALYST role');
    assert.ok(ruslanMapping.roles.includes('SOC_ANALYST'), 'Infosec specialist in SOC/Cyber unit must have SOC_ANALYST role');
    assert.strictEqual(ruslanMapping.roles.includes('DEPARTMENT_MANAGER'), false, 'Specialist must not have manager role');

    // 8.3 Roza Huseynova - PMO / Business Process Optimization Head
    const rozaMapping = LDAPSyncService.mapDepartment(
      '',
      'Biznes proseslərinin təhlili və optimallaşdırılması şöbəsi / Şöbə müdiri',
      ['Koordinatorlar', 'all'],
      'CN=Roza Huseynova,OU=Biznes proseslərin təhlili və optimallaşdırılması şöbəsi,OU=HO Users,OU=BANK USERS,DC=Expressbank,DC=az'
    );
    assert.strictEqual(rozaMapping.departmentId, 'dept-pmo');
    assert.strictEqual(rozaMapping.divisionId, 'div-banking');
    assert.ok(rozaMapping.roles.includes('DEPARTMENT_MANAGER'), 'Şöbə müdiri must have DEPARTMENT_MANAGER role');
    assert.ok(rozaMapping.roles.includes('TEAM_LEAD'), 'Şöbə müdiri must have TEAM_LEAD role');

    // 8.4 Mehman Mammadov - Executive Board Chairman (İdarə Heyətinin Sədri)
    const mehmanMapping = LDAPSyncService.mapDepartment(
      '',
      'İdarə Heyətinin Sədri',
      ['all'],
      'CN=Mehman Mammadov,OU=BOSSES,OU=BANK USERS,DC=Expressbank,DC=az'
    );
    assert.strictEqual(mehmanMapping.departmentId, 'dept-executive');
    assert.ok(mehmanMapping.roles.includes('DEPARTMENT_MANAGER'), 'Chairman must have DEPARTMENT_MANAGER role');
    assert.ok(mehmanMapping.roles.includes('PLATFORM_ADMIN'), 'Chairman must have PLATFORM_ADMIN role');

    // 8.5 Ayshan Hasanova - Marketing Head (Müdir)
    const ayshanMapping = LDAPSyncService.mapDepartment(
      '',
      'Reklam və marketinq şöbəsi / Müdir',
      ['all'],
      'CN=Ayshan Hasanova,OU=Reklam və marketinq şöbəsi,OU=HO Users,OU=BANK USERS,DC=Expressbank,DC=az'
    );
    assert.strictEqual(ayshanMapping.departmentId, 'dept-marketing');
    assert.ok(ayshanMapping.roles.includes('DEPARTMENT_MANAGER'), 'Marketing Müdir must have DEPARTMENT_MANAGER role');
  });
});
