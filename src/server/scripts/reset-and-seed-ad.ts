import fs from 'node:fs';
import path from 'node:path';
import { runMigrations } from '../db/postgres/migrate.js';
import { pgClient } from '../db/postgres/client.js';
import { db } from '../db/database.js';
import { LDAPSyncService } from '../services/ldap-sync.service.js';
import { logger } from '../services/logger.service.js';
import type { LDAPRawEntry } from '../services/ldap-directory.data.js';

export async function resetAndSeedActiveDirectory(): Promise<void> {
  logger.info('🚀 Starting Active Directory Database Reset & 3-Tier Hierarchy Seeding...');

  // 1. Run Schema Migrations
  await runMigrations();
  await db.initialize();

  // 2. Locate export file
  const exportCandidates = [
    path.resolve(process.cwd(), 'ad-users-export.json'),
    path.resolve(process.cwd(), 'scripts', 'ad-users-export.json'),
  ];
  const exportPath = exportCandidates.find((p) => fs.existsSync(p));
  if (!exportPath) {
    throw new Error(`Active Directory export file not found. Checked: ${exportCandidates.join(', ')}`);
  }

  logger.info({ exportPath }, '📂 Reading Active Directory export dataset...');
  let rawContent = fs.readFileSync(exportPath, 'utf8');
  if (rawContent.charCodeAt(0) === 0xFEFF) {
    rawContent = rawContent.slice(1);
  }
  const rawEntries: LDAPRawEntry[] = JSON.parse(rawContent);
  // Ensure authoritative directors are present in directory export if not exported directly
  if (!rawEntries.some((e: any) => (e.sAMAccountName || '').toLowerCase() === 's.khalilov')) {
    rawEntries.push({
      sAMAccountName: 's.khalilov',
      userPrincipalName: 's.khalilov@expressbank.az',
      displayName: 'Suleyman F. Khalilov',
      givenName: 'Suleyman',
      sn: 'Khalilov',
      mail: 's.khalilov@expressbank.az',
      title: 'Departament Direktoru',
      department: 'İnformasiya Texnologiyaları Departamenti',
      company: 'Expressbank',
      distinguishedName: 'CN=Suleyman F. Khalilov,OU=İnformasiya texnologiyaları departamenti,OU=HO Users,OU=BANK USERS,DC=Expressbank,DC=az',
      userAccountControl: 512,
      memberOf: ['CN=all,OU=GROUPS,DC=Expressbank,DC=az', 'CN=IT-Department-SG,OU=GROUPS,DC=Expressbank,DC=az'],
      directReports: ['CN=Ceyhun Ismayilzada,OU=İnformasiya texnologiyaları departamenti,OU=HO Users,OU=BANK USERS,DC=Expressbank,DC=az']
    });
  }

  const uGasimli = rawEntries.find((e: any) => (e.sAMAccountName || '').toLowerCase() === 'u.gasimli');
  if (uGasimli) {
    uGasimli.title = 'Chief Information Security Officer (CISO)';
    uGasimli.department = 'İnformasiya Təhlükəsizliyi Departamenti';
  }

  logger.info({ count: rawEntries.length }, '📦 Total Raw AD Objects');
  logger.info(`📦 Total Raw AD Objects: ${rawEntries.length}`);

  // 3. Clean stale directory data from PostgreSQL tables
  logger.info('🧹 Resetting directory tables in PostgreSQL...');
  await pgClient.transaction(async (client) => {
    // Break circular manager foreign keys first
    await client.query('UPDATE bank_users SET manager_id = NULL, unit_id = NULL, section_id = NULL, department_id = NULL');
    await client.query('UPDATE bank_departments SET manager_id = NULL');
    await client.query('UPDATE bank_department_sections SET manager_id = NULL, parent_section_id = NULL');
    
    // Clear sessions
    await client.query('DELETE FROM auth_sessions');
    
    // Clean old department sections & divisions (departments & users are updated in-place via upsert)
    await client.query('DELETE FROM bank_department_sections');
    await client.query('DELETE FROM legacy_json_records WHERE collection IN (\'users\', \'departments\', \'departmentSections\', \'divisions\')');
  });

  // Re-initialize in-memory store
  db.data.users = [];
  db.data.departments = [];
  db.data.departmentSections = [];
  db.data.divisions = [];

  // 4. Synchronize via LDAPSyncService using the fresh AD entries
  logger.info('⚙️ Processing and normalizing users with 3-tier hierarchy engine...');
  const report = await LDAPSyncService.syncAllUsers({
    trigger: 'MANUAL_TRIGGER',
    mockEntries: rawEntries,
  });

  // 5. Force flush to PostgreSQL database
  logger.info('💾 Persisting clean directory snapshot to PostgreSQL...');
  db.persist();
  await db.flush();

  // 6. Output Summary Report
  console.log('\n======================================================');
  console.log('✅ ACTIVE DIRECTORY RESET & 3-TIER HIERARCHY SEED COMPLETE');
  console.log('======================================================');
  console.log(`• Total Processed AD Objects:     ${report.totalLdapUsers}`);
  console.log(`• Genuine Human Employees Seeded: ${report.addedCount + report.updatedCount}`);
  console.log(`• Inactive / Disabled Accounts:   ${report.disabledCount}`);
  console.log(`• Duplicates Merged:              ${report.duplicatesRemovedCount}`);
  console.log(`• Departments Created:            ${db.data.departments.length}`);
  console.log(`• Şöbə & Bölmə Sections Created:  ${db.data.departmentSections.length}`);
  console.log('======================================================\n');

  // Verify sample approval chain
  const sampleUser = db.data.users.find((u) => u.username === 'u.gasimli' || u.username === 'emin.khozehagg' || u.username === 't.mammadli');
  if (sampleUser) {
    const chain = LDAPSyncService.getApprovalChain(sampleUser.id);
    if (chain) {
      console.log(`🔍 Sample User Approval Chain for [${sampleUser.fullName} (${sampleUser.username})]:`);
      console.log(`   - Department: ${chain.departmentName || 'N/A'}`);
      console.log(`   - Section:    ${chain.sectionName || 'N/A'}`);
      console.log(`   - Unit:       ${chain.unitName || 'N/A'}`);
      console.log(`   - Direct Manager:     ${chain.directManager?.name || 'N/A'}`);
      console.log(`   - Section Manager:    ${chain.sectionManager?.name || 'N/A'}`);
      console.log(`   - Department Manager: ${chain.departmentManager?.name || 'N/A'}`);
      console.log('------------------------------------------------------\n');
    }
  }
}

if (process.argv[1]?.endsWith('reset-and-seed-ad.ts') || process.argv[1]?.endsWith('reset-and-seed-ad.js')) {
  resetAndSeedActiveDirectory()
    .then(async () => {
      await pgClient.close();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('❌ Active Directory reset & seed failed:', error);
      await pgClient.close();
      process.exit(1);
    });
}
