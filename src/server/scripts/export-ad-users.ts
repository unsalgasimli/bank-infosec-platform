import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { config } from '../config/index.js';
import { StrictReadOnlyLdapClient } from '../utils/readonly-ldap-client.js';
import { resolveSecret, maskSecret } from '../utils/crypto.js';
import { logger } from '../services/logger.service.js';
import type { LDAPRawEntry } from '../services/ldap-directory.data.js';
import { toSafeString, normalizeDirectoryText, normalizeDirectoryKey } from '../services/ldap-directory.data.js';

/** Interactive prompt for credentials if not present in env */
async function prompt(query: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    let muted = false;
    const output = hidden
      ? new Writable({
          write(chunk, encoding, callback) {
            if (!muted) process.stdout.write(chunk, encoding);
            callback();
          },
        })
      : process.stdout;
    const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
    rl.question(query, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
    muted = hidden;
  });
}

export interface ADUserExportRecord {
  sAMAccountName: string;
  userPrincipalName: string;
  displayName: string;
  givenName: string;
  sn: string;
  mail: string;
  // --- Organization Tab Fields (Matching ADUC Screenshot) ---
  jobTitle: string;
  department: string;
  company: string;
  managerName: string;
  managerSamAccount: string;
  managerTitle: string;
  managerEmail: string;
  managerDistinguishedName: string;
  directReportsCount: number;
  directReports: string[];
  // Directory & Status
  distinguishedName: string;
  enabled: boolean;
  userAccountControl: number;
  memberOf: string[];
  whenCreated: string;
  whenChanged: string;
}

async function main(): Promise<void> {
  console.log('\n==========================================================================');
  console.log(' 🏦 Expressbank - Active Directory User & Organization Data Exporter (LDAPS)');
  console.log('==========================================================================\n');

  const args = process.argv.slice(2);
  const userIndex = args.indexOf('--user');
  const bindUser =
    (userIndex >= 0 ? args[userIndex + 1] : undefined) ||
    process.env.AD_USER ||
    config.LDAP_BIND_USER ||
    (await prompt('AD service account username: '));

  const bindPassword =
    resolveSecret(process.env.AD_PASS || config.LDAP_BIND_PASSWORD || '') ||
    (await prompt('AD service-account password: ', true));

  const ldapUrl = (config.LDAP_URL || '').trim();
  const baseDn = config.LDAP_BASE_DN;

  if (!ldapUrl.startsWith('ldaps://') || !baseDn || !bindUser || !bindPassword) {
    throw new Error(
      'LDAPS configuration incomplete. Ensure LDAP_URL (ldaps://...), LDAP_BASE_DN, and service credentials are provided.'
    );
  }

  console.log(`Connecting read-only to ${ldapUrl} as ${bindUser} (password ${maskSecret(bindPassword)})...`);

  const client = new StrictReadOnlyLdapClient({
    url: ldapUrl,
    timeout: 10000,
    connectTimeout: 10000,
    tlsRejectUnauthorized: config.LDAP_TLS_REJECT_UNAUTHORIZED !== false,
  });

  try {
    await client.bind(bindUser, bindPassword);
    console.log(' [✓] Bound successfully to Active Directory over LDAPS.');

    console.log(` [*] Searching ${baseDn} for all user objects...`);

    // Fetch all user objects (both active & disabled, excluding computer accounts $)
    const searchFilter = '(&(objectCategory=person)(objectClass=user)(!(sAMAccountName=*$)))';

    const searchRes = await client.search(baseDn, {
      scope: 'sub',
      filter: searchFilter,
      paged: { pageSize: 500 },
      attributes: [
        'sAMAccountName',
        'userPrincipalName',
        'mail',
        'displayName',
        'givenName',
        'sn',
        'title',
        'department',
        'company',
        'manager',
        'directReports',
        'distinguishedName',
        'userAccountControl',
        'memberOf',
        'whenCreated',
        'whenChanged',
      ],
    });

    const entries = (searchRes.searchEntries as LDAPRawEntry[]).filter(
      (e) => Boolean(e.sAMAccountName || e.userPrincipalName)
    );

    console.log(` [✓] Retrieved ${entries.length} raw user entries from Active Directory.`);

    // Build lookup maps for Manager resolution
    const userByDn = new Map<string, LDAPRawEntry>();
    const userBySam = new Map<string, LDAPRawEntry>();
    const directReportsMap = new Map<string, string[]>(); // ManagerDN -> array of direct report sAMAccountNames

    for (const entry of entries) {
      const sam = toSafeString(entry.sAMAccountName);
      const dn = toSafeString(entry.distinguishedName);
      if (dn) userByDn.set(normalizeDirectoryKey(dn), entry);
      if (sam) userBySam.set(normalizeDirectoryKey(sam), entry);

      const mgr = toSafeString(entry.manager);
      if (mgr) {
        const mgrKey = normalizeDirectoryKey(mgr);
        if (!directReportsMap.has(mgrKey)) {
          directReportsMap.set(mgrKey, []);
        }
        if (sam) directReportsMap.get(mgrKey)!.push(sam);
      }
    }

    // Process records into clean output
    const processed: ADUserExportRecord[] = [];

    for (const entry of entries) {
      const rawSam = toSafeString(entry.sAMAccountName || entry.userPrincipalName);
      let sam = rawSam;
      if (rawSam.includes('\\')) sam = rawSam.split('\\')[1];
      else if (rawSam.includes('@')) sam = rawSam.split('@')[0];

      const uac = Number(entry.userAccountControl || 512);
      const isDisabled = Boolean(uac & 2);

      const dn = toSafeString(entry.distinguishedName);
      const myDnKey = normalizeDirectoryKey(dn);

      const mgrDn = toSafeString(entry.manager);
      let managerName = '';
      let managerSam = '';
      let managerTitle = '';
      let managerEmail = '';

      if (mgrDn) {
        const mgrKey = normalizeDirectoryKey(mgrDn);
        const mgrObj = userByDn.get(mgrKey);
        if (mgrObj) {
          managerName = normalizeDirectoryText(mgrObj.displayName) || toSafeString(mgrObj.sAMAccountName);
          managerSam = toSafeString(mgrObj.sAMAccountName);
          managerTitle = normalizeDirectoryText(mgrObj.title);
          managerEmail = toSafeString(mgrObj.mail);
        } else {
          // Parse CN from DN
          const match = mgrDn.match(/^CN=([^,]+)/i);
          if (match) managerName = match[1];
        }
      }

      // Direct reports
      const reports = new Set<string>(directReportsMap.get(myDnKey) || []);
      if (entry.directReports) {
        const rawDr = Array.isArray(entry.directReports) ? entry.directReports : [entry.directReports];
        for (const item of rawDr) {
          const drStr = toSafeString(item);
          const drKey = normalizeDirectoryKey(drStr);
          const drObj = userByDn.get(drKey);
          if (drObj && drObj.sAMAccountName) {
            reports.add(drObj.sAMAccountName);
          } else {
            const match = drStr.match(/^CN=([^,]+)/i);
            if (match) reports.add(match[1]);
          }
        }
      }

      const groups: string[] = [];
      if (entry.memberOf) {
        const rawGroups = Array.isArray(entry.memberOf) ? entry.memberOf : [entry.memberOf];
        for (const g of rawGroups) {
          groups.push(toSafeString(g));
        }
      }

      const givenName = normalizeDirectoryText(entry.givenName);
      const sn = normalizeDirectoryText(entry.sn);
      const displayName = normalizeDirectoryText(entry.displayName) || `${givenName} ${sn}`.trim() || sam;

      processed.push({
        sAMAccountName: sam,
        userPrincipalName: toSafeString(entry.userPrincipalName) || `${sam}@${config.LDAP_DOMAIN.toLowerCase()}`,
        displayName,
        givenName,
        sn,
        mail: toSafeString(entry.mail) || `${sam}@${config.LDAP_DOMAIN.toLowerCase()}`,
        // Organization tab matching fields
        jobTitle: normalizeDirectoryText(entry.title),
        department: normalizeDirectoryText(entry.department),
        company: normalizeDirectoryText(entry.company),
        managerName,
        managerSamAccount: managerSam,
        managerTitle,
        managerEmail,
        managerDistinguishedName: mgrDn,
        directReportsCount: reports.size,
        directReports: Array.from(reports),
        // Directory metadata
        distinguishedName: dn,
        enabled: !isDisabled,
        userAccountControl: uac,
        memberOf: groups,
        whenCreated: toSafeString(entry.whenCreated),
        whenChanged: toSafeString(entry.whenChanged),
      });
    }

    // Write JSON file
    const jsonPath = path.resolve(process.cwd(), 'ad-users-export.json');
    fs.writeFileSync(jsonPath, JSON.stringify(processed, null, 2), 'utf8');
    console.log(`\n [✓] JSON file saved: ${jsonPath}`);

    // Summary stats
    const active = processed.filter((u) => u.enabled).length;
    const disabled = processed.filter((u) => !u.enabled).length;
    const withDept = processed.filter((u) => u.department).length;
    const withTitle = processed.filter((u) => u.jobTitle).length;
    const withManager = processed.filter((u) => u.managerName).length;
    const leaders = processed.filter((u) => u.directReportsCount > 0).length;

    console.log('\n==========================================================================');
    console.log(' 📊 Export Summary Statistics:');
    console.log('==========================================================================');
    console.log(` • Total Users Exported:    ${processed.length}`);
    console.log(` • Active Accounts:         ${active}`);
    console.log(` • Disabled Accounts:       ${disabled}`);
    console.log(` • With Department:         ${withDept}`);
    console.log(` • With Job Title:          ${withTitle}`);
    console.log(` • With Manager:            ${withManager}`);
    console.log(` • People Managers (leads): ${leaders}`);

    // Department grouping
    const deptMap = new Map<string, number>();
    for (const u of processed) {
      if (u.department) {
        deptMap.set(u.department, (deptMap.get(u.department) || 0) + 1);
      }
    }
    const topDepts = Array.from(deptMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    console.log('\n 🏢 Top 5 Departments in AD:');
    for (const [deptName, count] of topDepts) {
      console.log(`   - ${deptName}: ${count} user(s)`);
    }

    console.log('\n ✨ Done! You can now review "ad-users-export.json".');
    console.log('==========================================================================\n');
  } finally {
    try {
      await client.unbind();
    } catch {
      // ignore
    }
  }
}

main().catch((err) => {
  console.error(`\n❌ Export failed: ${err.message}`);
  process.exitCode = 1;
});
