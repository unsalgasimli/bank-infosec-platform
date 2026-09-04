/** Online, resumable search rollout. Existing table data and canonical IDs are never deleted. */
import { pgClient } from '../db/postgres/client.js';

export const searchIndexDefinitions = [
  ['idx_cmdb_search_asset_v1', 'configuration_items', 'gin', '(search_text gin_trgm_ops, search_terms, search_os_names) WHERE search_document_version = 1'],
  ['idx_cmdb_search_source_v1', 'cmdb_source_records', 'gin', '(search_text gin_trgm_ops, search_owner_text gin_trgm_ops, search_terms, search_os_names) WHERE search_document_version = 1'],
  ['idx_cmdb_search_asset_pending_v1', 'configuration_items', 'btree', '(id) WHERE search_document_version < 1'],
  ['idx_cmdb_search_source_pending_v1', 'cmdb_source_records', 'btree', '(id) WHERE search_document_version < 1'],
  ['idx_cmdb_search_technical_owner_v1', 'configuration_items', 'btree', '(technical_owner_user_id) WHERE technical_owner_user_id IS NOT NULL'],
  ['idx_cmdb_search_business_owner_v1', 'configuration_items', 'btree', '(business_owner_user_id) WHERE business_owner_user_id IS NOT NULL'],
  ['idx_cmdb_search_identifier_v1', 'cmdb_asset_identifiers', 'gin', '(lower(normalized_value) gin_trgm_ops) WHERE retired_at IS NULL'],
  ['idx_cmdb_inventory_updated_cursor_v1', 'configuration_items', 'btree', '(updated_at DESC, id DESC) WHERE archived_at IS NULL'],
] as const;

const normalizeDefinition = (value: string) => value.replace(/\bCONCURRENTLY\b|\bIF NOT EXISTS\b/gi, '').replace(/\bpublic\./gi, '').replace(/::text\b/gi, '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

export async function prepareSearchIndexes(): Promise<void> {
  for (const [name, table, method, expression] of searchIndexDefinitions) {
    const expected = `CREATE INDEX ${name} ON public.${table} USING ${method} ${expression}`;
    const existing = await pgClient.query<{ indisvalid: boolean; definition: string }>(`SELECT i.indisvalid,pg_get_indexdef(i.indexrelid) AS definition
      FROM pg_index i WHERE i.indexrelid=to_regclass($1)`, [`public.${name}`]);
    if (existing.rows[0]) {
      if (normalizeDefinition(existing.rows[0].definition) !== normalizeDefinition(expected)) throw new Error(`Index ${name} has an unexpected definition; refusing to replace it.`);
      if (existing.rows[0].indisvalid) continue;
      // A cancelled concurrent build leaves an invalid index. Rebuild only the
      // exact named/defined projection index, never an unrelated or valid index.
      await pgClient.query(`DROP INDEX CONCURRENTLY public.${name}`);
      console.log(JSON.stringify({ event: 'invalid_search_index_rebuild', name }));
    }
    await pgClient.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${name} ON public.${table} USING ${method} ${expression}`);
    const verified = await pgClient.query<{ indisvalid: boolean }>('SELECT indisvalid FROM pg_index WHERE indexrelid=to_regclass($1)', [`public.${name}`]);
    if (!verified.rows[0]?.indisvalid) throw new Error(`Concurrent index ${name} is not valid; rerun db:search:prepare.`);
    console.log(JSON.stringify({ event: 'search_index_ready', name }));
  }
}

export async function backfillSearchBatch(table: 'configuration_items' | 'cmdb_source_records', batchSize: number): Promise<number> {
  if (!['configuration_items', 'cmdb_source_records'].includes(table) || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 2000) throw new Error('Invalid bounded search backfill arguments.');
  return pgClient.transaction(async (client) => {
    const result = await client.query(`WITH batch AS (
      SELECT id FROM ${table} WHERE search_document_version < 1 ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED
    ) UPDATE ${table} target SET search_document_version=0 FROM batch WHERE target.id=batch.id`, [batchSize]);
    return result.rowCount || 0;
  });
}

export async function searchBackfillStatus(): Promise<Array<{ table_name: string; pending: string }>> {
  return (await pgClient.query<{ table_name: string; pending: string }>(`SELECT 'configuration_items' AS table_name,count(*) AS pending FROM configuration_items WHERE search_document_version < 1
    UNION ALL SELECT 'cmdb_source_records',count(*) FROM cmdb_source_records WHERE search_document_version < 1`)).rows;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((arg) => !/^--(status|indexes-only|backfill-only|batch-size=\d+|max-batches=\d+)$/.test(arg))) throw new Error('Unknown search preparation argument.');
  const numeric = (name: string, fallback: number) => Number(args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1] || fallback);
  const batchSize = numeric('batch-size', 250);
  const maxBatches = numeric('max-batches', 1000);
  if (!Number.isSafeInteger(maxBatches) || maxBatches < 1 || maxBatches > 100000 || batchSize < 1 || batchSize > 2000) throw new Error('Invalid backfill bounds.');
  try {
    if (!args.includes('--status')) {
      if (!args.includes('--backfill-only')) await prepareSearchIndexes();
      if (!args.includes('--indexes-only')) {
        for (const table of ['configuration_items', 'cmdb_source_records'] as const) {
          let updated = 0;
          for (let batch = 0; batch < maxBatches; batch += 1) {
            const count = await backfillSearchBatch(table, batchSize);
            updated += count;
            console.log(JSON.stringify({ event: 'search_backfill_batch', table, batch: batch + 1, updated, rows: count }));
            if (!count) break;
          }
          // Planner estimates must reflect the populated projection and empty
          // pending partial index. ANALYZE does not block ordinary table writes.
          await pgClient.query(`ANALYZE ${table}`);
        }
      }
    }
    const status = await searchBackfillStatus();
    console.log(JSON.stringify({ event: 'search_backfill_status', status }));
    if (!args.includes('--indexes-only') && status.some((row) => Number(row.pending) > 0)) process.exitCode = 2;
  } finally { await pgClient.close(); }
}

if (/prepare-cmdb-search\.(ts|js)$/.test(process.argv[1] || '')) void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
