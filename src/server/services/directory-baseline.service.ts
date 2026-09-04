import fs from 'node:fs';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { pgClient } from '../db/postgres/client.js';
import type pg from 'pg';
import { config } from '../config/index.js';
import {
  mapDepartment,
  normalizeDirectoryKey,
  normalizeDirectoryText,
  normalizeDirectoryEmployeeId,
  makeDirectoryNameMatchKey,
  slugifyDept,
  makeDepartmentNodeId,
  toSafeString,
  makeHierarchyNodeId,
  getDepartmentColor,
  getDepartmentIcon,
} from './ldap-directory.data.js';
import type { DepartmentMappingResult } from './ldap-directory.data.js';

export interface DirectoryBaselineRecord {
  employeeId: string;
  fullName: string;
  title: string;
  structureName: string;
  hireDate?: string;
  normalizedFullName: string;
  departmentId: string;
  sectionId?: string;
  sectionName?: string;
  unitId?: string;
  unitName?: string;
}

/**
 * The workbook's "Əsas struktur adı" is the authoritative root label. The
 * legacy rules classified branch/section roots by job function (for example a
 * branch cashier became part of Settlements), which loses the HR hierarchy.
 * Keep the existing role/division inference, but make the workbook structure
 * the stable department root for known employees.
 */
export function mapBaselineRecord(record: Pick<DirectoryBaselineRecord, 'structureName' | 'title'>): DepartmentMappingResult {
  const inferred = mapDepartment(record.structureName, record.title);
  const structureNorm = normalizeDirectoryKey(record.structureName);
  const divisionId = structureNorm.includes('informasiya təhlükəsizliyi') || structureNorm.includes('təhlükəsizlik') || structureNorm.includes('daxili audit') || structureNorm.includes('komplayens') || structureNorm.includes('risk')
    ? 'div-sec'
    : structureNorm.includes('informasiya texnologiyaları') || structureNorm.includes('texniki')
      ? 'div-it'
      : structureNorm.includes('insan resursları') || structureNorm.includes('hüquq')
        ? 'div-hr'
        : 'div-banking';
  const departmentId = makeDepartmentNodeId(record.structureName);
  const hasDistinctSection = Boolean(
    inferred.sectionName && normalizeDirectoryKey(inferred.sectionName) !== normalizeDirectoryKey(record.structureName)
  );
  const sectionId = hasDistinctSection ? makeHierarchyNodeId('section', departmentId, inferred.sectionName!) : undefined;
  const unitId = inferred.unitName ? makeHierarchyNodeId('unit', departmentId, inferred.unitName) : undefined;
  return {
    ...inferred,
    departmentId,
    divisionId,
    departmentName: record.structureName,
    departmentCode: `BASE_${slugifyDept(record.structureName).replace(/-/g, '_').slice(0, 25).toUpperCase()}`,
    sectionId,
    unitId,
  };
}

export interface DirectoryBaselineImportReport {
  filePath: string;
  imported: number;
  deactivated: number;
  structures: number;
  invalidRows: number;
  projectedUsers?: number;
  projectedDepartments?: number;
  projectedSections?: number;
  deduplicatedUsers?: number;
}

const textDecoder = new TextDecoder('utf-8');

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function xmlText(value: string): string {
  return normalizeDirectoryText(decodeXml(value.replace(/<[^>]+>/g, '')));
}

function readZipText(files: Record<string, Uint8Array>, fileName: string): string {
  const content = files[fileName];
  if (!content) throw new Error(`Workbook entry is missing: ${fileName}`);
  return textDecoder.decode(content);
}

function excelDate(value: string): string | undefined {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial <= 0) return normalizeDirectoryText(value) || undefined;
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

function attribute(attrs: string, name: string): string {
  const match = attrs.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function parseSharedStrings(xml: string): string[] {
  return Array.from(
    xml.matchAll(/<(?:[\w.-]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?si>/gi),
    (match) => xmlText(match[1]),
  );
}

function parseWorksheet(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<(?:[\w.-]+:)?row\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?row>/gi)) {
    const row: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<(?:[\w.-]+:)?c\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?c>/gi)) {
      const attrs = cellMatch[1];
      const ref = attribute(attrs, 'r');
      const column = ref.replace(/\d+/g, '');
      let columnIndex = 0;
      for (const char of column) columnIndex = columnIndex * 26 + char.charCodeAt(0) - 64;
      columnIndex -= 1;
      const type = attribute(attrs, 't');
      const body = cellMatch[2];
      const raw = body.match(/<(?:[\w.-]+:)?v\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?v>/i)?.[1] || '';
      const inline = body.match(/<(?:[\w.-]+:)?is\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?is>/i)?.[1] || '';
      const value = type === 's'
        ? sharedStrings[Number(raw)] || ''
        : type === 'inlineStr'
          ? xmlText(inline)
          : decodeXml(raw);
      while (row.length <= columnIndex) row.push('');
      row[columnIndex] = normalizeDirectoryText(value);
    }
    rows.push(row);
  }
  return rows;
}

function baselineRecord(row: string[], header: Map<string, number>): DirectoryBaselineRecord | undefined {
  const value = (name: string) => normalizeDirectoryText(row[header.get(name) ?? -1] || '');
  const employeeId = value('id');
  const fullName = value('name');
  const title = value('title');
  const structureName = value('structure');
  if (!employeeId || !fullName || !title || !structureName) return undefined;

  const mapping = mapBaselineRecord({ structureName, title });
  return {
    employeeId,
    fullName,
    title,
    structureName,
    hireDate: excelDate(value('hireDate')),
    normalizedFullName: normalizeDirectoryKey(fullName),
    departmentId: mapping.departmentId,
    sectionId: mapping.sectionId,
    sectionName: mapping.sectionName,
    unitId: mapping.unitId,
    unitName: mapping.unitName,
  };
}

function titleToken(value: string): string {
  return normalizeDirectoryKey(value)
    .replace(/(nin|nın|nun|nün|inin|unun|ünün|si|sı|sü|su|i)$/g, '')
    .replace(/(lar|lər)$/g, '');
}

function titleMatchScore(left: string, right: string): number {
  const stopWords = new Set(['uzre', 've', 'of', 'the', 'departamenti', 'departamentinin', 'sobesinin', 'filialinin']);
  const leftTokens = normalizeDirectoryText(left).split(/[^\p{L}\p{N}]+/u).map(titleToken).filter((token) => token.length > 2 && !stopWords.has(token));
  const rightTokens = normalizeDirectoryText(right).split(/[^\p{L}\p{N}]+/u).map(titleToken).filter((token) => token.length > 2 && !stopWords.has(token));
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  const matched = leftTokens.filter((token) => rightTokens.some((candidate) => token === candidate || token.startsWith(candidate) || candidate.startsWith(token)));
  return matched.length / Math.max(leftTokens.length, rightTokens.length);
}

export function readDirectoryBaselineWorkbook(filePath: string): DirectoryBaselineRecord[] {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`Directory baseline workbook not found: ${absolutePath}`);
  const files = unzipSync(new Uint8Array(fs.readFileSync(absolutePath)));
  const sharedStrings = parseSharedStrings(readZipText(files, 'xl/sharedStrings.xml'));
  const rows = parseWorksheet(readZipText(files, 'xl/worksheets/sheet1.xml'), sharedStrings);
  const headerRow = rows[0] || [];
  const headerAliases = new Map<string, string>([
    ['id', 'id'], ['i̇d', 'id'], ['a.s.a', 'name'], ['tam vəzifə adı', 'title'],
    ['əsas struktur adı', 'structure'], ['işə qəbul tarixi', 'hireDate'],
  ]);
  const header = new Map<string, number>();
  headerRow.forEach((cell, index) => {
    const canonical = headerAliases.get(normalizeDirectoryKey(cell));
    if (canonical) header.set(canonical, index);
  });
  for (const required of ['id', 'name', 'title', 'structure']) {
    if (!header.has(required)) throw new Error(`Directory baseline workbook is missing required column: ${required}`);
  }

  const records = rows.slice(1)
    .map((row) => baselineRecord(row, header))
    .filter((record): record is DirectoryBaselineRecord => Boolean(record));
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const record of records) {
    if (ids.has(record.employeeId)) throw new Error(`Directory baseline has duplicate employee ID: ${record.employeeId}`);
    if (names.has(record.normalizedFullName)) throw new Error(`Directory baseline has duplicate employee name: ${record.fullName}`);
    ids.add(record.employeeId);
    names.add(record.normalizedFullName);
  }
  if (records.length === 0) throw new Error('Directory baseline workbook contains no valid employee rows.');
  return records;
}

export class DirectoryBaselineService {
  public static async loadCurrent(client?: pg.PoolClient): Promise<DirectoryBaselineRecord[]> {
    if (config.DB_TYPE !== 'postgres') return [];
    const sql = 'SELECT employee_id, full_name, title, structure_name, hire_date, normalized_full_name, department_id, section_id, section_name, unit_id, unit_name FROM directory_baseline_entries WHERE is_current = TRUE ORDER BY employee_id';
    const result = await (client ? client.query(sql) : pgClient.query(sql));
    return result.rows.map((row: any) => ({
      employeeId: row.employee_id,
      fullName: row.full_name,
      title: row.title,
      structureName: row.structure_name,
      hireDate: row.hire_date ? String(row.hire_date).slice(0, 10) : undefined,
      normalizedFullName: row.normalized_full_name,
      departmentId: row.department_id,
      sectionId: row.section_id || undefined,
      sectionName: row.section_name || undefined,
      unitId: row.unit_id || undefined,
      unitName: row.unit_name || undefined,
    }));
  }

  public static async importWorkbook(filePath: string): Promise<DirectoryBaselineImportReport> {
    if (config.DB_TYPE !== 'postgres') throw new Error('Directory baseline import requires DB_TYPE=postgres.');
    const records = readDirectoryBaselineWorkbook(filePath);
    const absolutePath = path.resolve(filePath);
    const structures = new Set(records.map((record) => normalizeDirectoryKey(record.structureName)));
    let deactivated = 0;
    await pgClient.transaction(async (client) => {
      const inactive = await client.query(
        'UPDATE directory_baseline_entries SET is_current = FALSE, updated_at = NOW() WHERE is_current = TRUE AND NOT (employee_id = ANY($1::text[]))',
        [records.map((record) => record.employeeId)]
      );
      deactivated = inactive.rowCount || 0;
      for (const record of records) {
        await client.query(
          `INSERT INTO directory_baseline_entries(employee_id,full_name,title,structure_name,hire_date,normalized_full_name,department_id,section_id,section_name,unit_id,unit_name,is_current,source_payload)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12::jsonb)
           ON CONFLICT(employee_id) DO UPDATE SET full_name=EXCLUDED.full_name,title=EXCLUDED.title,structure_name=EXCLUDED.structure_name,hire_date=EXCLUDED.hire_date,normalized_full_name=EXCLUDED.normalized_full_name,department_id=EXCLUDED.department_id,section_id=EXCLUDED.section_id,section_name=EXCLUDED.section_name,unit_id=EXCLUDED.unit_id,unit_name=EXCLUDED.unit_name,is_current=TRUE,source_payload=EXCLUDED.source_payload,updated_at=NOW()`,
          [record.employeeId, record.fullName, record.title, record.structureName, record.hireDate || null, record.normalizedFullName, record.departmentId, record.sectionId || null, record.sectionName || null, record.unitId || null, record.unitName || null, JSON.stringify(record)]
        );
      }
    });
    const projection = await this.reconcileExistingDirectoryProjection();
    return {
      filePath: absolutePath,
      imported: records.length,
      deactivated,
      structures: structures.size,
      invalidRows: 0,
      projectedUsers: projection.matchedUsers,
      projectedDepartments: projection.departments,
      projectedSections: projection.sections,
      deduplicatedUsers: projection.deduplicatedUsers,
    };
  }

  /**
   * Applies the workbook hierarchy to existing AD projection rows only. This
   * never creates a login identity and never reads/decrypts identity_ciphertext.
   * Live AD remains responsible for adding/removing users and current status.
   */
  public static async reconcileExistingDirectoryProjection(): Promise<{
    matchedUsers: number;
    departments: number;
    sections: number;
    deduplicatedUsers: number;
  }> {
    const baseline = await this.loadCurrent();
    if (baseline.length === 0) return { matchedUsers: 0, departments: 0, sections: 0, deduplicatedUsers: 0 };

    const baselineByEmployeeId = new Map<string, DirectoryBaselineRecord>();
    const baselineByName = new Map<string, DirectoryBaselineRecord>();
    const baselineByNameCandidates = new Map<string, DirectoryBaselineRecord[]>();
    const ambiguousNames = new Set<string>();
    for (const record of baseline) {
      const employeeId = normalizeDirectoryEmployeeId(record.employeeId);
      if (employeeId) baselineByEmployeeId.set(employeeId, record);
      const nameKey = makeDirectoryNameMatchKey(record.fullName);
      if (!nameKey) continue;
      const candidates = baselineByNameCandidates.get(nameKey) || [];
      candidates.push(record);
      baselineByNameCandidates.set(nameKey, candidates);
      if (baselineByName.has(nameKey)) {
        ambiguousNames.add(nameKey);
        baselineByName.delete(nameKey);
      } else if (!ambiguousNames.has(nameKey)) {
        baselineByName.set(nameKey, record);
      }
    }

    return pgClient.transaction(async (client) => {
      const existing = await client.query<{ id: string; full_name: string; is_active: boolean; source_payload: any }>(
        `SELECT id, full_name, is_active, source_payload
           FROM bank_users
          WHERE directory_source = 'ACTIVE_DIRECTORY'`
      );
      const assignedBaselineIds = new Set(
        existing.rows
          .map((row) => normalizeDirectoryEmployeeId(row.source_payload?.baselineEmployeeId))
          .filter((employeeId) => baselineByEmployeeId.has(employeeId))
      );
      const existingNameCandidates = new Map<string, number>();
      for (const row of existing.rows) {
        const nameKey = makeDirectoryNameMatchKey(row.full_name);
        if (nameKey) existingNameCandidates.set(nameKey, (existingNameCandidates.get(nameKey) || 0) + 1);
      }
      const matches: Array<{ id: string; record: DirectoryBaselineRecord }> = [];
      for (const row of existing.rows) {
        const payload = row.source_payload && typeof row.source_payload === 'object' ? row.source_payload : {};
        const employeeId = normalizeDirectoryEmployeeId(payload.baselineEmployeeId);
        const nameKey = makeDirectoryNameMatchKey(row.full_name);
        const nameCandidates = baselineByNameCandidates.get(nameKey) || [];
        const title = toSafeString(payload.title);
        const titleCandidates = nameCandidates
          .map((candidate) => ({ candidate, score: titleMatchScore(title, candidate.title) }))
          .sort((left, right) => right.score - left.score);
        const titleRecord = titleCandidates.length > 0
          && titleCandidates[0].score > 0
          && (titleCandidates.length === 1 || titleCandidates[0].score > titleCandidates[1].score)
          ? titleCandidates[0].candidate
          : undefined;
        const byEmployeeId = baselineByEmployeeId.get(employeeId);
        const nameRecord = existingNameCandidates.get(nameKey) === 1 && !assignedBaselineIds.has(employeeId)
          ? baselineByName.get(nameKey)
          : undefined;
        const record = byEmployeeId || nameRecord || (nameRecord === undefined && !assignedBaselineIds.has(employeeId) ? titleRecord : undefined);
        if (record) {
          matches.push({ id: row.id, record });
          if (!byEmployeeId) assignedBaselineIds.add(normalizeDirectoryEmployeeId(record.employeeId));
        }
      }

      const departmentMappings = new Map<string, DepartmentMappingResult>();
      const sectionMappings = new Map<string, { mapping: DepartmentMappingResult; isUnit: boolean }>();
      for (const record of baseline) {
        const mapping = mapBaselineRecord(record);
        departmentMappings.set(mapping.departmentId, mapping);
        if (mapping.sectionId) sectionMappings.set(mapping.sectionId, { mapping, isUnit: false });
        if (mapping.unitId) sectionMappings.set(mapping.unitId, { mapping, isUnit: true });
      }

      const divisionNames: Record<string, { code: string; name: string }> = {
        'div-banking': { code: 'BANKING', name: 'Bank əməliyyatları və biznes' },
        'div-it': { code: 'IT', name: 'İnformasiya Texnologiyaları' },
        'div-hr': { code: 'HR', name: 'İnsan Resursları' },
        'div-sec': { code: 'INFOSEC', name: 'İnformasiya Təhlükəsizliyi' },
      };
      for (const mapping of departmentMappings.values()) {
        const division = divisionNames[mapping.divisionId] || divisionNames['div-banking'];
        await client.query(
          `INSERT INTO bank_divisions(id,code,name,description,source_payload)
           VALUES($1,$2,$3,$4,$5::jsonb)
           ON CONFLICT(id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,updated_at=NOW(),source_payload=EXCLUDED.source_payload`,
          [mapping.divisionId, division.code, division.name, division.name, JSON.stringify({ id: mapping.divisionId, code: division.code, name: division.name, directorySource: 'ACTIVE_DIRECTORY' })]
        );
        await client.query(
          `INSERT INTO bank_departments(id,division_id,code,name,description,color,icon,is_active,directory_source,settings,admin_user_ids,source_payload)
           VALUES($1,$2,$3,$4,$5,$6,$7,TRUE,'ACTIVE_DIRECTORY',$8::jsonb,'[]'::jsonb,$9::jsonb)
           ON CONFLICT(id) DO UPDATE SET division_id=EXCLUDED.division_id,code=EXCLUDED.code,name=EXCLUDED.name,description=EXCLUDED.description,color=EXCLUDED.color,icon=EXCLUDED.icon,is_active=TRUE,directory_source='ACTIVE_DIRECTORY',source_payload=EXCLUDED.source_payload,updated_at=NOW()`,
          [mapping.departmentId, mapping.divisionId, mapping.departmentCode, mapping.departmentName, `${mapping.departmentName} – Expressbank Active Directory Şöbəsi`, getDepartmentColor(mapping.departmentName), getDepartmentIcon(mapping.departmentName), JSON.stringify({ defaultSlaHours: 24, criticalSlaHours: 4 }), JSON.stringify({ ...mapping, directorySource: 'ACTIVE_DIRECTORY' })]
        );
      }

      // The old projection grouped many workbook roots into legacy buckets
      // (Retail, Corporate, Settlements, etc.). Hide only those AD-owned
      // buckets from the active department hub after the baseline roots exist;
      // retain their rows for audit/history and let the next live AD sync
      // reactivate any genuinely current department.
      await client.query(
        `UPDATE bank_departments
            SET is_active=FALSE, manager_id=NULL, admin_user_ids='[]'::jsonb, updated_at=NOW()
          WHERE directory_source='ACTIVE_DIRECTORY'
            AND NOT (id = ANY($1::text[]))`,
        [[...departmentMappings.keys()]]
      );

      const sortedSections = [...sectionMappings.values()].sort((left, right) => {
        return Number(left.isUnit) - Number(right.isUnit);
      });
      for (const node of sortedSections) {
        const mapping = node.mapping;
        const isUnit = node.isUnit;
        const id = isUnit ? mapping.unitId! : mapping.sectionId!;
        const name = isUnit ? mapping.unitName! : mapping.sectionName!;
        const code = isUnit ? mapping.unitCode! : mapping.sectionCode!;
        const parentSectionId = isUnit ? mapping.sectionId || null : null;
        await client.query(
          `INSERT INTO bank_department_sections(id,department_id,code,name,section_type,parent_section_id,has_own_manager,is_active,source_payload)
           VALUES($1,$2,$3,$4,$5,$6,$7,TRUE,$8::jsonb)
           ON CONFLICT(id) DO UPDATE SET department_id=EXCLUDED.department_id,code=EXCLUDED.code,name=EXCLUDED.name,section_type=EXCLUDED.section_type,parent_section_id=EXCLUDED.parent_section_id,has_own_manager=EXCLUDED.has_own_manager,is_active=TRUE,source_payload=EXCLUDED.source_payload,updated_at=NOW()`,
          [id, mapping.departmentId, code, name, isUnit ? 'BOLME' : 'SOBE', parentSectionId, !isUnit, JSON.stringify({ id, departmentId: mapping.departmentId, code, name, sectionType: isUnit ? 'BOLME' : 'SOBE', parentSectionId, hasOwnManager: !isUnit, directorySource: 'ACTIVE_DIRECTORY' })]
        );
      }

      // Keep the active hierarchy an exact projection of the current workbook.
      // Legacy AD mapping can leave old functional sections attached to a now
      // correct department root (for example a head-office section in a branch).
      // Retain those rows for audit/history, but never offer them as active
      // routing targets after the Excel baseline has supplied the hierarchy.
      await client.query(
        `UPDATE bank_department_sections
            SET is_active=FALSE, manager_id=NULL, updated_at=NOW()
          WHERE is_active=TRUE
            AND department_id = ANY($1::text[])
            AND COALESCE(source_payload->>'directorySource', 'ACTIVE_DIRECTORY') = 'ACTIVE_DIRECTORY'
            AND NOT (id = ANY($2::text[]))`,
        [[...departmentMappings.keys()], [...sectionMappings.keys()]]
      );

      for (const match of matches) {
        const mapping = mapBaselineRecord(match.record);
        const payloadResult = await client.query<{ source_payload: any }>('SELECT source_payload FROM bank_users WHERE id=$1', [match.id]);
        const payload = payloadResult.rows[0]?.source_payload && typeof payloadResult.rows[0].source_payload === 'object'
          ? payloadResult.rows[0].source_payload
          : {};
        const nextPayload = {
          ...payload,
          baselineEmployeeId: match.record.employeeId,
          baselineStructureName: match.record.structureName,
          baselineProjectionSource: 'HR_WORKBOOK_31_07_2026',
        };
        await client.query(
          `UPDATE bank_users
              SET department_id=$2, division_id=$3, section_id=$4, unit_id=$5,
                  section_name=$6, unit_name=$7, source_payload=$8::jsonb, updated_at=NOW()
            WHERE id=$1`,
          [match.id, mapping.departmentId, mapping.divisionId, mapping.sectionId || null, mapping.unitId || null, mapping.sectionName || null, mapping.unitName || null, JSON.stringify(nextPayload)]
        );
      }

      const matchesByEmployeeId = new Map<string, Array<{ id: string; record: DirectoryBaselineRecord; isActive: boolean }>>();
      for (const match of matches) {
        const employeeId = normalizeDirectoryEmployeeId(match.record.employeeId);
        const row = existing.rows.find((candidate) => candidate.id === match.id);
        const group = matchesByEmployeeId.get(employeeId) || [];
        group.push({ id: match.id, record: match.record, isActive: Boolean(row?.is_active) });
        matchesByEmployeeId.set(employeeId, group);
      }
      let deduplicatedUsers = 0;
      for (const group of matchesByEmployeeId.values()) {
        if (group.length < 2) continue;
        const [canonical, ...duplicates] = [...group].sort((left, right) => Number(right.isActive) - Number(left.isActive) || left.id.localeCompare(right.id));
        for (const duplicate of duplicates) {
          if (duplicate.id === canonical.id) continue;
          await client.query('UPDATE bank_users SET manager_id=$1, updated_at=NOW() WHERE manager_id=$2', [canonical.id, duplicate.id]);
          await client.query('UPDATE bank_departments SET manager_id=$1, updated_at=NOW() WHERE manager_id=$2', [canonical.id, duplicate.id]);
          await client.query('UPDATE bank_department_sections SET manager_id=$1, updated_at=NOW() WHERE manager_id=$2', [canonical.id, duplicate.id]);
          await client.query(
            `UPDATE bank_users
                SET is_active=FALSE,
                    manager_id=NULL,
                    source_payload=(COALESCE(source_payload,'{}'::jsonb) - 'baselineEmployeeId') || jsonb_build_object('organizationEligible', FALSE, 'directoryDuplicateOf', $1::text, 'directoryDuplicateReason', 'DUPLICATE_BASELINE_EMPLOYEE_ID'),
                    updated_at=NOW()
              WHERE id=$2`,
            [canonical.id, duplicate.id]
          );
          deduplicatedUsers += 1;
        }
      }

      return { matchedUsers: matches.length, departments: departmentMappings.size, sections: sectionMappings.size, deduplicatedUsers };
    });
  }
}

export function baselineSlug(value: string): string {
  return slugifyDept(value);
}
