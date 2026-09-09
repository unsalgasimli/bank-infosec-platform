import 'dotenv/config';
import { Pool } from 'pg';
import {
  KNOWN_EXPRESSBANK_BRANCHES,
  matchKnownBranchEntry,
  CANONICAL_DEPARTMENTS_MAP,
  mapDepartment,
  getDepartmentColor,
  getDepartmentIcon,
} from '../services/ldap-directory.data.js';
import { mapBaselineRecord } from '../services/directory-baseline.service.js';

interface DepartmentDefinition {
  id: string;
  code: string;
  name: string;
  divisionId: string;
  description: string;
}

// 1. All authentic branches
const CANONICAL_BRANCHES: DepartmentDefinition[] = KNOWN_EXPRESSBANK_BRANCHES.map((b) => ({
  id: b.id,
  code: b.code,
  name: b.canonicalName,
  divisionId: 'div-banking',
  description: `Expressbank ${b.canonicalName} regional filialı`,
}));

// 2. All Head Office canonical departments
const CANONICAL_HEAD_OFFICE: DepartmentDefinition[] = [
  // IT
  { id: 'dept-it', code: 'IT_DEPT', name: 'İnformasiya Texnologiyaları Departamenti', divisionId: 'div-it', description: 'Bankın İT infrastrukturu, şəbəkə, telekommunikasiya və sistem inzibatçılığı' },
  { id: 'dept-core', code: 'CORE_BANKING', name: 'Bank Əməliyyat Sistemləri və Proqram Təminatı', divisionId: 'div-it', description: 'Avtomatlaşdırılmış bank sistemi (ABS), prosessinq və bank proqram təminatı' },
  // Security & Risk
  { id: 'dept-secops', code: 'INFOSEC', name: 'İnformasiya Təhlükəsizliyi Departamenti', divisionId: 'div-sec', description: 'Kibertəhlükəsizlik, SOC, insidentlərin idarə edilməsi, DLP və təhlükəsizlik arxitekturası' },
  { id: 'dept-grc', code: 'GRC', name: 'Komplayens və Risk Departamenti', divisionId: 'div-sec', description: 'Tənzimləyici uyğunluq, risklərin idarə edilməsi, audit və daxili nəzarət' },
  { id: 'dept-risk', code: 'RISK_DEPT', name: 'Risklərin İdarə Edilməsi Departamenti', divisionId: 'div-sec', description: 'Maliyyə, kredit və əməliyyat risklərinin təhlili və idarə olunması' },
  { id: 'dept-audit', code: 'AUDIT', name: 'Daxili Audit Departamenti', divisionId: 'div-sec', description: 'Daxili audit, audit komitəsi və təftiş mexanizmləri' },
  { id: 'dept-daxili-nezaret-departamenti', code: 'DND_DEPT', name: 'Daxili Nəzarət Departamenti', divisionId: 'div-sec', description: 'Daxili nəzarət, prosedur yoxlamaları və operativ audit' },
  { id: 'dept-compliance', code: 'COMPLIANCE', name: 'Komplayens Departamenti', divisionId: 'div-sec', description: 'AML, CFT və qanunvericilik tələblərinə uyğunluq' },
  { id: 'dept-phys-sec', code: 'PHYS_SEC', name: 'Texniki və Fiziki Təhlükəsizlik Şöbəsi', divisionId: 'div-sec', description: 'Bina mühafizəsi, video-nəzarət, girişə nəzarət və fiziki təhlükəsizlik' },
  // Banking Operations & Business
  { id: 'dept-retail', code: 'RETAIL', name: 'Pərakəndə Bankçılıq Departamenti', divisionId: 'div-banking', description: 'Pərakəndə müştərilərə xidmət, satış və filial şəbəkəsi kurasiyası' },
  { id: 'dept-corporate', code: 'CORP_BANK', name: 'Biznes Bankçılıq Departamenti', divisionId: 'div-banking', description: 'Korporativ müştərilər, KOB bankçılığı və kommersiya kreditləri' },
  { id: 'dept-hesablasmalar-departamenti', code: 'HESAB_DEPT', name: 'Hesablaşmalar Departamenti', divisionId: 'div-banking', description: 'Milli və xarici valyutada hesablaşmalar, klirinq və kassa əməliyyatları' },
  { id: 'dept-odenis-sistemlerin-idare-edilmesi-departamenti', code: 'ODENIS_DEPT', name: 'Ödəniş Sistemlərinin İdarə Edilməsi Departamenti', divisionId: 'div-banking', description: 'Plastik kartlar, prosessinq, POS terminallar və ödəniş sistemləri' },
  { id: 'dept-credit', code: 'CREDIT', name: 'Kredit və Anderraytinq Departamenti', divisionId: 'div-banking', description: 'Kredit təhlili, anderraytinq və kredit məhsullarının idarə edilməsi' },
  { id: 'dept-treasury', code: 'TREASURY', name: 'Xəzinədarlıq Departamenti', divisionId: 'div-banking', description: 'Likvidliyin idarə edilməsi, valyuta bazarları və qiymətli kağızlar' },
  { id: 'dept-reqemsal-bankciliq', code: 'DIGITAL_BANK', name: 'Rəqəmsal Bankçılıq Departamenti', divisionId: 'div-banking', description: 'Mobil bankçılıq, internet bankçılıq və rəqəmsal transformasiya' },
  { id: 'dept-customer-care', code: 'CALL_CENTER', name: 'Müştəri Xidmətləri və Çağrı Mərkəzi', divisionId: 'div-banking', description: 'Çağrı mərkəzi, müştəri sorğuları və informasiya dəstəyi' },
  { id: 'dept-marketing', code: 'MARKETING', name: 'Reklam və Marketinq Departamenti', divisionId: 'div-banking', description: 'Marketinq kommunikasiyaları, ictimaiyyətlə əlaqələr və brend idarəetməsi' },
  { id: 'dept-finance', code: 'FINANCE', name: 'Maliyyə və Mühasibatlıq Departamenti', divisionId: 'div-banking', description: 'Mühasibat uçotu, maliyyə hesabatlığı və büdcə planlaması' },
  // Governance, Legal, HR & Operations
  { id: 'dept-executive', code: 'EXECUTIVE', name: 'İdarə Heyəti və Rəhbərlik', divisionId: 'div-hr', description: 'Müşahidə Şurası, İdarə Heyəti və icraçı rəhbərlik' },
  { id: 'dept-katiblik-sobesi', code: 'KATIB_DEPT', name: 'Katiblik və Tərcümə Şöbəsi', divisionId: 'div-hr', description: 'Korporativ katiblik, sənədləşmə və tərcümə xidməti' },
  { id: 'dept-legal', code: 'LEGAL', name: 'Hüquq Departamenti', divisionId: 'div-hr', description: 'Hüquqi təminat, məhkəmə işləri və müqavilələrin hüquqi ekspertizası' },
  { id: 'dept-hr', code: 'HR_DEPT', name: 'İnsan Resursları Departamenti', divisionId: 'div-hr', description: 'İşə qəbul, təlim, inkişaf, əmək haqqı və kadr inzibatçılığı' },
  { id: 'dept-procurement', code: 'INZIBATI_DEPT', name: 'İnzibati Təsərrüfat və Satınalma Departamenti', divisionId: 'div-hr', description: 'Satınalmalar, təchizat, inzibati təsərrüfat və maddi-texniki təminat' },
  { id: 'dept-pmo', code: 'PMO_DEPT', name: 'Biznes Proseslərin Təhlili və PMO', divisionId: 'div-hr', description: 'Layihələrin idarə olunması, proseslərin optimallaşdırılması və keyfiyyətə nəzarət' },
];

export const ALL_CANONICAL_DEPARTMENTS: DepartmentDefinition[] = [
  ...CANONICAL_BRANCHES,
  ...CANONICAL_HEAD_OFFICE,
];

// Department ID alias map for known legacy/duplicate IDs:
const DEPT_ID_REMAP: Record<string, string> = {
  // IT
  'dept-informasiya-texnologiyalari-departamenti': 'dept-it',
  // SecOps
  'dept-informasiya-tehlukesizliyinin-temin-edilmesi-departamenti': 'dept-secops',
  // HR
  'dept-insan-resurslari-departamenti': 'dept-hr',
  // Finance
  'dept-maliyye-departamenti': 'dept-finance',
  // Retail
  'dept-perakende-bankciliq-departamenti': 'dept-retail',
  'dept-terefdaslarla-is-sobesi': 'dept-retail',
  // GRC & Compliance
  'dept-komplayens-departamenti': 'dept-grc',
  'dept-istehlakcilarin-huquqlarinin-mudafiesi-sobesi': 'dept-compliance',
  'dept-risklerin-idare-edilmesi-departamenti': 'dept-risk',
  'dept-maliyye-emeliyyatlarinin-monitorinqi-sobesi': 'dept-audit',
  // Settlements & Cash
  'dept-nagd-vesaitlerin-ve-diger-qiymetlilerin-saxlanil-62959aa4d7': 'dept-hesablasmalar-departamenti',
  'dept-inkassasiya-sobesi': 'dept-hesablasmalar-departamenti',
  // Payment Systems
  'dept-odenis-sistemlerinin-idareedilmesi-departamenti': 'dept-odenis-sistemlerin-idare-edilmesi-departamenti',
  // Customer Care
  'dept-melumat-merkezi-sobesi': 'dept-customer-care',
  'dept-musteri-xidmetleri-departamenti': 'dept-customer-care',
  'dept-xidmetin-keyfiyyetine-nezaret-sobesi': 'dept-customer-care',
  'dept-emeliyyat-sobesi-musteri-sorgulari-filiali': 'dept-customer-care',
  // Marketing
  'dept-reklam-ve-marketinq-sobesi': 'dept-marketing',
  // Procurement / Admin
  'dept-inzibati-sobe': 'dept-procurement',
  // Legal
  'dept-korporativ-huquq-sobesi': 'dept-legal',
  // Executive
  'dept-idare-heyeti': 'dept-executive',
  'dept-musahide-surasi': 'dept-executive',
  // Treasury
  'dept-xezinedarliq-sobesi': 'dept-treasury',
  // Digital Banking
  'dept-reqemsal-xidmetlerin-tetbiqi-sobesi': 'dept-reqemsal-bankciliq',
  // Branch alias duplicates
  'dept-bakixanov-filiali': 'dept-bakikhanov-filiali',
  'dept-hazi-aslanov-filiali': 'dept-hezi-aslanov-filiali',
  'dept-haziaslanov-filiali': 'dept-hezi-aslanov-filiali',
  'dept-khatai-filiali': 'dept-xetai-filiali',
  'dept-sumgait-filiali': 'dept-sumqayit-filiali',
  'dept-sumgayit-filiali': 'dept-sumqayit-filiali',
  'dept-xachmaz-filiali': 'dept-xacmaz-filiali',
  'dept-neftchilar-filiali': 'dept-neftciler-filiali',
  'dept-neftchiler-filiali': 'dept-neftciler-filiali',
  'dept-shirvan-filiali': 'dept-sirvan-filiali',
};

// Phantom departments whose users MUST be remapped using user attributes/baseline
const PHANTOM_DEPARTMENTS = new Set([
  'dept-dot1x-branch-filiali',
  'dept-sfb-branchmanagers-filiali',
  'dept-musteri-sorgulari-ve-filiali',
  'dept-bankomatlar-ve-filiali',
  'dept-bankomatlarla-ve-filiali',
  'dept-dnd-filiali',
]);

export async function runReconciliation(dryRun = false) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log(`Starting Department Reconciliation & Deduplication (dryRun = ${dryRun})...\n`);

    if (!dryRun) await client.query('BEGIN');

    // 0. Avoid unique constraint violations on code for obsolete departments
    const obsoleteIds = [
      ...Object.keys(DEPT_ID_REMAP),
      ...Array.from(PHANTOM_DEPARTMENTS),
    ];
    if (!dryRun) {
      await client.query(
        `UPDATE bank_departments
         SET code = CONCAT('__OBS_', LEFT(MD5(id), 20))
         WHERE id = ANY($1::text[])`,
        [obsoleteIds]
      );
    }

    // 1. Ensure all canonical departments exist in bank_departments
    const canonicalMap = new Map(ALL_CANONICAL_DEPARTMENTS.map((d) => [d.id, d]));
    console.log(`Ensuring all ${ALL_CANONICAL_DEPARTMENTS.length} canonical departments exist in bank_departments...`);

    for (const d of ALL_CANONICAL_DEPARTMENTS) {
      const color = getDepartmentColor(d.id);
      const icon = getDepartmentIcon(d.id);
      if (!dryRun) {
        await client.query(
          `INSERT INTO bank_departments(id, division_id, code, name, description, color, icon, is_active, directory_source, source_payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, 'ACTIVE_DIRECTORY', jsonb_build_object('canonical', true))
           ON CONFLICT (id) DO UPDATE SET
             division_id = EXCLUDED.division_id,
             code = EXCLUDED.code,
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             color = EXCLUDED.color,
             icon = EXCLUDED.icon,
             is_active = TRUE,
             updated_at = NOW()`,
          [d.id, d.divisionId, d.code, d.name, d.description, color, icon]
        );
      }
    }
    console.log(`✓ Canonical departments verified.\n`);

    // 2. Resolve users in bank_users
    const usersResult = await client.query(`
      SELECT id, username, email, title, department_id, division_id, source_payload, distinguished_name
      FROM bank_users
    `);
    console.log(`Analyzing ${usersResult.rows.length} total users...`);

    let remappedUsersCount = 0;
    const statsByDept = new Map<string, number>();

    for (const user of usersResult.rows) {
      let targetDeptId: string | undefined;

      // Check if user is in a phantom department
      if (user.department_id && PHANTOM_DEPARTMENTS.has(user.department_id)) {
        // Resolve using baseline structure name if available
        const baseName = user.source_payload?.baselineStructureName;
        if (baseName) {
          const branchMatch = matchKnownBranchEntry(baseName);
          if (branchMatch) {
            targetDeptId = branchMatch.id;
          } else {
            const mappedBase = mapBaselineRecord({ structureName: baseName, title: user.title });
            targetDeptId = DEPT_ID_REMAP[mappedBase.departmentId] || mappedBase.departmentId;
          }
        }

        // If not resolved from baseline, resolve using title & AD payload
        if (!targetDeptId || !canonicalMap.has(targetDeptId)) {
          const mapped = mapDepartment(user.source_payload?.department || '', user.title, user.source_payload?.memberOf || []);
          targetDeptId = DEPT_ID_REMAP[mapped.departmentId] || mapped.departmentId;
        }
      } else if (user.department_id && DEPT_ID_REMAP[user.department_id]) {
        targetDeptId = DEPT_ID_REMAP[user.department_id];
      }

      if (targetDeptId && targetDeptId !== user.department_id) {
        remappedUsersCount++;
        const targetDept = canonicalMap.get(targetDeptId);
        const targetDivisionId = targetDept?.divisionId || user.division_id;

        statsByDept.set(targetDeptId, (statsByDept.get(targetDeptId) || 0) + 1);

        if (!dryRun) {
          await client.query(
            `UPDATE bank_users
             SET department_id = $1::varchar,
                 division_id = $2::varchar,
                 source_payload = jsonb_set(
                   COALESCE(source_payload, '{}'::jsonb),
                   '{departmentId}',
                   to_jsonb($1::varchar)
                 ),
                 updated_at = NOW()
             WHERE id = $3`,
            [targetDeptId, targetDivisionId, user.id]
          );
        }
      }
    }
    console.log(`✓ Remapped ${remappedUsersCount} users to canonical departments.`);
    for (const [deptId, count] of statsByDept.entries()) {
      console.log(`   -> ${deptId}: +${count} users`);
    }
    console.log();

    // 3. Reassign sections in bank_department_sections
    const sectionsResult = await client.query(`
      SELECT id, department_id, code, name
      FROM bank_department_sections
    `);
    let remappedSectionsCount = 0;
    for (const sec of sectionsResult.rows) {
      let targetDeptId = DEPT_ID_REMAP[sec.department_id];
      if (PHANTOM_DEPARTMENTS.has(sec.department_id)) {
        targetDeptId = 'dept-customer-care'; // Default phantom section fallback
      }
      if (targetDeptId && targetDeptId !== sec.department_id) {
        remappedSectionsCount++;
        if (!dryRun) {
          // Check if target department already has a matching section by code or name
          const existing = await client.query(
            `SELECT id FROM bank_department_sections WHERE department_id = $1 AND (code = $2 OR LOWER(name) = LOWER($3)) LIMIT 1`,
            [targetDeptId, sec.code, sec.name]
          );
          if (existing.rows.length > 0) {
            const canonicalSecId = existing.rows[0].id;
            await client.query(`UPDATE bank_users SET section_id = $1 WHERE section_id = $2`, [canonicalSecId, sec.id]);
            await client.query(`UPDATE bank_users SET unit_id = $1 WHERE unit_id = $2`, [canonicalSecId, sec.id]);
            await client.query(`UPDATE bank_department_sections SET parent_section_id = $1 WHERE parent_section_id = $2`, [canonicalSecId, sec.id]);
            await client.query(`DELETE FROM bank_department_sections WHERE id = $1`, [sec.id]);
          } else {
            await client.query(
              `UPDATE bank_department_sections
               SET department_id = $1, updated_at = NOW()
               WHERE id = $2`,
              [targetDeptId, sec.id]
            );
          }
        }
      }
    }
    console.log(`✓ Remapped ${remappedSectionsCount} department sections.\n`);

    // 4. Reassign other foreign keys (connections, tickets, assets, applications, teams)
    for (const [oldId, newId] of Object.entries(DEPT_ID_REMAP)) {
      if (!dryRun) {
        await client.query(`UPDATE department_connections SET department_id = $1 WHERE department_id = $2`, [newId, oldId]);
        await client.query(`UPDATE tickets SET department_id = $1 WHERE department_id = $2`, [newId, oldId]);
        await client.query(`UPDATE bank_assets SET department_id = $1 WHERE department_id = $2`, [newId, oldId]);
        await client.query(`UPDATE bank_applications SET department_id = $1 WHERE department_id = $2`, [newId, oldId]);
        await client.query(`UPDATE bank_teams SET department_id = $1 WHERE department_id = $2`, [newId, oldId]);
      }
    }
    for (const phantomId of PHANTOM_DEPARTMENTS) {
      if (!dryRun) {
        await client.query(`UPDATE department_connections SET department_id = 'dept-customer-care' WHERE department_id = $1`, [phantomId]);
        await client.query(`UPDATE tickets SET department_id = 'dept-customer-care' WHERE department_id = $1`, [phantomId]);
        await client.query(`UPDATE bank_assets SET department_id = 'dept-customer-care' WHERE department_id = $1`, [phantomId]);
        await client.query(`UPDATE bank_applications SET department_id = 'dept-customer-care' WHERE department_id = $1`, [phantomId]);
        await client.query(`UPDATE bank_teams SET department_id = 'dept-customer-care' WHERE department_id = $1`, [phantomId]);
      }
    }
    console.log(`✓ Reassigned other relational tables (tickets, assets, connections, teams).\n`);

    // 5. Deactivate all duplicate, obsolete, and phantom departments
    console.log(`Deactivating ${obsoleteIds.length} obsolete / duplicate / phantom departments...`);
    if (!dryRun) {
      await client.query(
        `UPDATE bank_departments
         SET is_active = FALSE, updated_at = NOW()
         WHERE id = ANY($1::text[])`,
        [obsoleteIds]
      );

      // Also ensure ANY department that is NOT in ALL_CANONICAL_DEPARTMENTS is deactivated
      const canonicalIds = ALL_CANONICAL_DEPARTMENTS.map((d) => d.id);
      const extraDeactivated = await client.query(
        `UPDATE bank_departments
         SET is_active = FALSE, updated_at = NOW()
         WHERE id != ALL($1::text[]) AND is_active = TRUE
         RETURNING id, name`,
        [canonicalIds]
      );
      if (extraDeactivated.rows.length > 0) {
        console.log(`Deactivated ${extraDeactivated.rows.length} non-canonical departments:`, extraDeactivated.rows.map((r) => r.id));
      }
    }
    console.log(`✓ Deactivation complete.\n`);

    // 6. Verify final active departments count & members
    const finalActive = await client.query(`
      SELECT d.id, d.name, d.division_id, d.code,
             (SELECT COUNT(*) FROM bank_users u WHERE u.department_id = d.id AND u.is_active = TRUE) as member_count
      FROM bank_departments d
      WHERE d.is_active = TRUE
      ORDER BY d.division_id, d.name
    `);
    console.log(`================ FINAL ACTIVE DEPARTMENTS: ${finalActive.rows.length} ================`);
    for (const d of finalActive.rows) {
      console.log(`${d.id.padEnd(45)} | ${d.division_id.padEnd(15)} | members: ${String(d.member_count).padEnd(4)} | ${d.name}`);
    }

    if (!dryRun) {
      await client.query('COMMIT');
      console.log('\n✅ Transaction committed successfully!');
    } else {
      console.log('\n[DRY RUN] No changes were committed.');
    }
  } catch (err) {
    if (!dryRun) await client.query('ROLLBACK');
    console.error('Reconciliation failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// CLI entry point
const isDryRun = process.argv.includes('--dry-run');
runReconciliation(isDryRun).catch((err) => {
  console.error(err);
  process.exit(1);
});
