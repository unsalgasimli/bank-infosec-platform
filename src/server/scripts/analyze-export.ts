import fs from 'fs';
import path from 'path';
import {
  classifyDirectoryAccount,
  isAccountDisabled,
  mapDepartment,
  parseMemberOfGroups,
  normalizeDirectoryKey,
  normalizeDirectoryText,
  calculateCanonicalScore,
  getBaseUsername,
  isExcludedPrivilegedAccount,
  isServiceAccount,
  hasHumanDirectoryName,
} from '../services/ldap-directory.data.js';

interface RawExportEntry {
  sAMAccountName?: string;
  userPrincipalName?: string;
  mail?: string;
  displayName?: string;
  givenName?: string;
  sn?: string;
  title?: string;
  department?: string;
  company?: string;
  manager?: string;
  directReports?: string[] | string;
  distinguishedName?: string;
  userAccountControl?: number | string;
  accountExpires?: string;
  memberOf?: string[] | string;
}

function runAnalysis() {
  const jsonPath = path.resolve(process.cwd(), 'ad-users-export.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('ad-users-export.json not found');
    return;
  }

  let content = fs.readFileSync(jsonPath, 'utf8');
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  const rawData: RawExportEntry[] = JSON.parse(content);
  console.log(`\n======================================================`);
  console.log(`📊 ACTIVE DIRECTORY EXPORT ANALİZİ`);
  console.log(`======================================================`);
  console.log(`Cəmi AD Export Obyektləri (Raw Objects): ${rawData.length}`);

  let disabledCount = 0;
  let serviceCount = 0;
  let privilegedSuffixCount = 0;
  let technicalCount = 0;
  let testCount = 0;
  let genuineHumanCount = 0;

  const genuineActiveUsers: any[] = [];
  const genuineDisabledUsers: any[] = [];

  for (const entry of rawData) {
    const sAMAccountName = normalizeDirectoryKey(entry.sAMAccountName || '');
    if (!sAMAccountName) continue;

    const isDisabled = isAccountDisabled(entry as any);
    if (isDisabled) disabledCount++;

    const classification = classifyDirectoryAccount(entry as any);

    if (classification === 'SERVICE') {
      serviceCount++;
    } else if (classification === 'PRIVILEGED') {
      privilegedSuffixCount++;
    } else if (classification === 'TECHNICAL') {
      technicalCount++;
    } else if (classification === 'TEST') {
      testCount++;
    } else {
      // HUMAN
      genuineHumanCount++;
      if (isDisabled) {
        genuineDisabledUsers.push(entry);
      } else {
        genuineActiveUsers.push(entry);
      }
    }
  }

  console.log(`\n--- [1] KLASSIFİKASİYA VƏ TƏMİZLƏNMƏ ---`);
  console.log(`❌ Qeyri-insani / Xidmət Hesabları (Service/System): ${serviceCount}`);
  console.log(`❌ İnzibati Sufiks Hesabları (.si, .sec, .abs, .adm vs.): ${privilegedSuffixCount}`);
  console.log(`❌ Texniki / Maşın / Non-human Hesablar: ${technicalCount}`);
  console.log(`❌ Test Hesabları: ${testCount}`);
  console.log(`🔒 Deaktiv / Bloklanmış Hesablar (AD Disabled/Expired): ${disabledCount}`);
  console.log(`\n👤 Real İnsan İşçi Hesabları (Cəmi Human): ${genuineHumanCount}`);
  console.log(`   🟢 Aktiv İnsan İşçiləri: ${genuineActiveUsers.length}`);
  console.log(`   🔴 Deaktiv İnsan İşçiləri: ${genuineDisabledUsers.length}`);

  // Deduplication analysis on genuine active users
  const seenByIdentityKey = new Map<string, any>();
  const uniqueUsers: any[] = [];
  let duplicatesRemoved = 0;
  const mergedPairs: Array<{ canonical: string; duplicate: string; reason: string }> = [];

  // Sort by canonical score
  const sorted = [...genuineActiveUsers].sort((a, b) => calculateCanonicalScore(b) - calculateCanonicalScore(a));

  for (const u of sorted) {
    const username = normalizeDirectoryKey(u.sAMAccountName || '');
    const email = normalizeDirectoryKey(u.mail || u.userPrincipalName || '');
    const nameKey = hasHumanDirectoryName(u as any)
      ? normalizeDirectoryText(u.displayName || `${u.givenName} ${u.sn}`).split(/[\s,]+/).map(normalizeDirectoryKey).filter(Boolean).join(' ')
      : '';

    const identityKeys = Array.from(new Set([username, email, nameKey ? `person:${nameKey}` : ''].filter(Boolean)));
    const canonical = identityKeys.map((k) => seenByIdentityKey.get(k)).find(Boolean);

    if (canonical) {
      duplicatesRemoved++;
      mergedPairs.push({
        canonical: canonical.sAMAccountName,
        duplicate: u.sAMAccountName,
        reason: nameKey ? `Eyni Ad Soyad (${nameKey})` : `Eyni E-poçt / İstifadəçi adı`,
      });
    } else {
      for (const k of identityKeys) seenByIdentityKey.set(k, u);
      uniqueUsers.push(u);
    }
  }

  console.log(`\n--- [2] DEDUPLİKASİYA VƏ ƏSAS (CANONICAL) SEÇİMİ ---`);
  console.log(`🔄 Təkrarlanan Hesablar (Merged Duplicates): ${duplicatesRemoved}`);
  console.log(`✅ NƏTİCƏ: Bütün Təmizlənmə və Deduplikasiyadan Sonra Qalan UNİKAL AKTİV İŞÇİ SAYI: ${uniqueUsers.length}`);

  // Department breakdown
  const deptCounts: Record<string, { name: string; count: number; sections: Record<string, number> }> = {};

  for (const u of uniqueUsers) {
    const mapping = mapDepartment(u.department || '', u.title || '', parseMemberOfGroups(u.memberOf), u.distinguishedName || '');
    if (!deptCounts[mapping.departmentId]) {
      deptCounts[mapping.departmentId] = {
        name: mapping.departmentName,
        count: 0,
        sections: {},
      };
    }
    deptCounts[mapping.departmentId].count++;
    const secName = mapping.sectionName || mapping.unitName || '(Şöbə təyin edilməyib / Ümumi)';
    deptCounts[mapping.departmentId].sections[secName] = (deptCounts[mapping.departmentId].sections[secName] || 0) + 1;
  }

  console.log(`\n--- [3] DEPARTAMENTLƏR VƏ ŞÖBƏLƏR ÜZRƏ BÖLGÜ (Cəmi ${Object.keys(deptCounts).length} Departament) ---`);
  const sortedDepts = Object.entries(deptCounts).sort((a, b) => b[1].count - a[1].count);
  for (const [deptId, data] of sortedDepts) {
    console.log(`\n🏢 ${data.name} (${deptId}): ${data.count} işçi`);
    for (const [secName, secCount] of Object.entries(data.sections)) {
      console.log(`   📂 ${secName}: ${secCount} nəfər`);
    }
  }

  console.log(`\n======================================================`);
  console.log(`🔍 VƏZİFƏSİ VƏ YA DEPARTAMENTİ OLMAYAN / TEXNİKİ ADLI HESABLAR:`);
  console.log(`======================================================`);
  
  const suspiciousAccounts = uniqueUsers.filter((u) => {
    const title = normalizeDirectoryText(u.title || u.jobTitle || '');
    const dept = normalizeDirectoryText(u.department || '');
    const name = normalizeDirectoryText(u.displayName || `${u.givenName} ${u.sn}`);
    const username = normalizeDirectoryKey(u.sAMAccountName || '');
    
    const hasTechnicalMarker = /ldap|devops|service|admin|test|sync|user|bot|scan|monitor|backup|sql|system|exchange|mailbox/i.test(name) ||
      /ldap|devops|service|admin|test|sync|user|bot|scan|monitor|backup|sql|system|exchange|mailbox/i.test(username);
    const hasNoTitleAndDept = !title && !dept;
    const hasNoTitle = !title;
    
    return hasTechnicalMarker || hasNoTitleAndDept;
  });

  suspiciousAccounts.forEach((u, i) => {
    console.log(`[${i + 1}] ${u.displayName || u.sAMAccountName} | user: ${u.sAMAccountName} | title: "${u.title || u.jobTitle || ''}" | dept: "${u.department || ''}" | DN: ${u.distinguishedName}`);
  });
  console.log(`Cəmi şübhəli/texniki hesab sayı: ${suspiciousAccounts.length}`);
}

runAnalysis();




