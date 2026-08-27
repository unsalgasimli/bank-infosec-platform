import path from 'node:path';
import { readDirectoryBaselineWorkbook } from '../services/directory-baseline.service.js';
import {
  makeDirectoryNameMatchKey,
  normalizeDirectoryEmployeeId,
} from '../services/ldap-directory.data.js';
import { pgClient } from '../db/postgres/client.js';

interface DirectoryProjectionRow {
  id: string;
  username: string;
  full_name: string;
  title: string | null;
  department_id: string | null;
  section_id: string | null;
  unit_id: string | null;
  is_active: boolean;
  baseline_employee_id: string | null;
}

function nameSimilarity(left: string, right: string): number {
  const a = makeDirectoryNameMatchKey(left).split(' ').filter(Boolean);
  const b = makeDirectoryNameMatchKey(right).split(' ').filter(Boolean);
  if (a.length === 0 || b.length === 0) return 0;
  const used = new Set<number>();
  let matched = 0;
  for (const token of a) {
    let best = -1;
    let bestScore = 0;
    for (let index = 0; index < b.length; index += 1) {
      if (used.has(index)) continue;
      const candidate = b[index];
      const common = [...token].filter((char, charIndex) => candidate[charIndex] === char).length;
      const score = common / Math.max(token.length, candidate.length);
      if (score > bestScore) {
        best = index;
        bestScore = score;
      }
    }
    if (best >= 0 && bestScore >= 0.55) {
      used.add(best);
      matched += bestScore;
    }
  }
  return matched / Math.max(a.length, b.length);
}

function firstMatch(
  record: { employeeId: string; fullName: string },
  byEmployeeId: Map<string, DirectoryProjectionRow[]>,
  byName: Map<string, DirectoryProjectionRow[]>,
  baselineNameCounts: Map<string, number>,
  claimedUserIds: Set<string>,
): DirectoryProjectionRow | undefined {
  const employeeMatches = byEmployeeId.get(normalizeDirectoryEmployeeId(record.employeeId)) || [];
  if (employeeMatches.length === 1 && !claimedUserIds.has(employeeMatches[0].id)) return employeeMatches[0];
  const nameKey = makeDirectoryNameMatchKey(record.fullName);
  const nameMatches = byName.get(nameKey) || [];
  // A relaxed name key may deliberately collapse transliterations (for
  // example Gulnar/Gulnur) or omit a patronymic.  It is evidence only when
  // it identifies exactly one baseline employee and one unclaimed AD user.
  return baselineNameCounts.get(nameKey) === 1 && nameMatches.length === 1 && !claimedUserIds.has(nameMatches[0].id)
    ? nameMatches[0]
    : undefined;
}

async function main(): Promise<void> {
  const workbookPath = process.argv[2] || 'C:/Users/u.gasimli/Downloads/Əməkdaş sayı 31.07.2026.xlsx';
  const baseline = readDirectoryBaselineWorkbook(path.resolve(workbookPath));
  const users = (await pgClient.query<DirectoryProjectionRow>(
    `SELECT id, username, full_name, title, department_id, section_id, unit_id, is_active,
            source_payload->>'baselineEmployeeId' AS baseline_employee_id
       FROM bank_users
      WHERE directory_source = 'ACTIVE_DIRECTORY'`,
  )).rows;

  const byEmployeeId = new Map<string, DirectoryProjectionRow[]>();
  const byName = new Map<string, DirectoryProjectionRow[]>();
  for (const user of users) {
    const employeeId = normalizeDirectoryEmployeeId(user.baseline_employee_id || '');
    if (employeeId) {
      const matches = byEmployeeId.get(employeeId) || [];
      matches.push(user);
      byEmployeeId.set(employeeId, matches);
    }
    const name = makeDirectoryNameMatchKey(user.full_name || '');
    if (name) {
      const matches = byName.get(name) || [];
      matches.push(user);
      byName.set(name, matches);
    }
  }

  const baselineNameCounts = new Map<string, number>();
  for (const record of baseline) {
    const key = makeDirectoryNameMatchKey(record.fullName);
    if (key) baselineNameCounts.set(key, (baselineNameCounts.get(key) || 0) + 1);
  }
  const claimedUserIds = new Set<string>();
  const matches = baseline.map((record) => {
    const user = firstMatch(record, byEmployeeId, byName, baselineNameCounts, claimedUserIds);
    if (user) claimedUserIds.add(user.id);
    return { record, user };
  });
  const unmatchedBaseline = matches.filter((match) => !match.user);
  const baselineUserIds = new Set(matches.filter((match) => match.user).map((match) => match.user!.id));
  const unmatchedUsers = users.filter((user) => !baselineUserIds.has(user.id));
  const staleHierarchy = matches.filter(({ record, user }) => user && (
    user.department_id !== record.departmentId
    || user.section_id !== (record.sectionId || null)
    || user.unit_id !== (record.unitId || null)
  ));
  const duplicateEmployeeIds = [...byEmployeeId.entries()].filter(([, rows]) => rows.length > 1);
  const duplicateNames = [...byName.entries()].filter(([, rows]) => rows.length > 1);
  const ambiguousBaselineNames = [...new Map(baseline.map((record) => [makeDirectoryNameMatchKey(record.fullName), record])).keys()]
    .filter((key) => baseline.filter((record) => makeDirectoryNameMatchKey(record.fullName) === key).length > 1);
  const unmatchedSuggestions = unmatchedBaseline.slice(0, 50).map(({ record }) => ({
    employeeId: record.employeeId,
    fullName: record.fullName,
    candidates: users
      .map((user) => ({ user, score: nameSimilarity(record.fullName, user.full_name) }))
      .filter(({ score }) => score >= 0.5)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
      .map(({ user, score }) => ({ score: Number(score.toFixed(3)), username: user.username, fullName: user.full_name })),
  }));

  console.log(JSON.stringify({
    workbook: path.resolve(workbookPath),
    baselineUsers: baseline.length,
    directoryUsers: users.length,
    matchedUsers: baseline.length - unmatchedBaseline.length,
    unmatchedBaselineUsers: unmatchedBaseline.length,
    unmatchedBaselineSample: unmatchedBaseline.slice(0, 50).map(({ record }) => ({
      employeeId: record.employeeId,
      fullName: record.fullName,
      structureName: record.structureName,
    })),
    unmatchedBaselineSuggestions: unmatchedSuggestions,
    usersOutsideBaseline: unmatchedUsers.length,
    usersOutsideBaselineSample: unmatchedUsers.slice(0, 50).map((user) => ({
      username: user.username,
      fullName: user.full_name,
      departmentId: user.department_id,
      isActive: user.is_active,
    })),
    staleHierarchy: staleHierarchy.length,
    staleHierarchySample: staleHierarchy.slice(0, 50).map(({ record, user }) => ({
      employeeId: record.employeeId,
      fullName: record.fullName,
      baselineTitle: record.title,
      dbTitle: user!.title,
      dbBaselineEmployeeId: user!.baseline_employee_id,
      actualDepartmentId: user!.department_id,
      expectedDepartmentId: record.departmentId,
      actualSectionId: user!.section_id,
      expectedSectionId: record.sectionId || null,
      actualUnitId: user!.unit_id,
      expectedUnitId: record.unitId || null,
    })),
    duplicateEmployeeIds: duplicateEmployeeIds.map(([employeeId, rows]) => ({
      employeeId,
      users: rows.map((user) => ({ id: user.id, username: user.username, fullName: user.full_name })),
    })),
    duplicateNameKeys: duplicateNames.length,
    ambiguousBaselineNameKeys: [...baselineNameCounts.values()].filter((count) => count > 1).length,
    ambiguousBaselineNames: ambiguousBaselineNames.length,
    ambiguousBaselineSample: baseline
      .filter((record) => ambiguousBaselineNames.includes(makeDirectoryNameMatchKey(record.fullName)))
      .slice(0, 30)
      .map((record) => ({ employeeId: record.employeeId, fullName: record.fullName, title: record.title, structureName: record.structureName })),
    inactiveMatchedUsers: matches.filter(({ user }) => user && !user.is_active).length,
  }, null, 2));
}

main()
  .catch((error: Error) => {
    console.error(`Directory baseline audit failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pgClient.close();
  });
