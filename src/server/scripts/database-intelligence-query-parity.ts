/** Compare captured old/new list SQL in one read-only snapshot; emit counts, never records. */
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pgClient } from '../db/postgres/client.js';

try {
  const before = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const after = JSON.parse(await readFile(process.argv[3], 'utf8'));
  const oldSql = before.scenarios.find((entry: any) => entry.label === 'inventory-first').measurements[1].sql;
  const newSql = after.scenarios.find((entry: any) => entry.label === 'inventory-first').measurements[1].sql;
  assert.match(oldSql.trim(), /^SELECT\b/);
  assert.match(newSql.trim(), /^(SELECT|WITH)\b/);
  await pgClient.transaction(async (client) => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const oldRows = (await client.query(oldSql, [25, 0])).rows;
    const newRows = (await client.query(newSql, [25, 0])).rows;
    // The optimized list deliberately omits raw payloads and internal search
    // documents. Compare every selected public/enrichment column, not omitted
    // implementation fields that SELECT a.* used to transfer unnecessarily.
    const selectedColumns = Object.keys(newRows[0] || {});
    assert.ok(selectedColumns.includes('id') && selectedColumns.includes('source_coverage'));
    const project = (rows: any[]) => rows.map((row) => Object.fromEntries(selectedColumns.map((key) => [key, row[key]])));
    assert.deepEqual(newRows, project(oldRows));
    // Exercise a second page in the same snapshot, including all enriched fields.
    const oldNext = (await client.query(oldSql, [25, 25])).rows;
    const newNext = (await client.query(newSql, [25, 25])).rows;
    assert.deepEqual(newNext, project(oldNext));
    console.log(JSON.stringify({ equal: true, rowsCompared: oldRows.length + oldNext.length, columnsCompared: selectedColumns.length, includes: 'all selected list columns, enrichment, ordering; two pages in one repeatable-read snapshot; raw payload and internal search documents intentionally omitted' }));
  });
} finally { await pgClient.close(); }
