/**
 * Disposable-container verification for the projection contention fix.
 * Run only against a local disposable PostgreSQL database.
 *   1. A no-change persist must not touch any bank_department_sections row.
 *   2. Changing one section's parent must rewrite only that row.
 *   3. The persist transaction must queue behind the cross-process advisory lock.
 *   4. A lock-timeout (55P03) during persist must retry and still commit.
 */
import { db } from '../src/server/db/database.js';
import { pgClient } from '../src/server/db/postgres/client.js';
import { PostgresProjectionRepository as projection } from '../src/server/db/postgres/projection-repository.js';

const ok = async (condition: boolean, message: string) => {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`ok - ${message}`);
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sectionState = async () =>
  (await pgClient.query<{ id: string; parent_section_id: string | null; xid: string }>(
    'SELECT id, parent_section_id, xmin::text AS xid FROM bank_department_sections ORDER BY id'
  )).rows;

const seed = async () => {
  await pgClient.query(`INSERT INTO bank_divisions(id,code,name) VALUES ('div-t1','T1','Test Division')`);
  await pgClient.query(`INSERT INTO bank_departments(id,division_id,code,name,is_active) VALUES ('dept-t1','div-t1','T1','Test Department',TRUE)`);
  await pgClient.query(`INSERT INTO bank_department_sections(id,department_id,code,name,is_active,parent_section_id) VALUES
    ('sec-a','dept-t1','SA','Section A',TRUE,NULL),
    ('sec-b','dept-t1','SB','Section B',TRUE,'sec-a'),
    ('sec-c','dept-t1','SC','Section C',TRUE,'sec-a')`);
};

const main = async () => {
  await seed();
  await db.initialize();
  const sections = db.data.departmentSections;
  await ok(sections.length === 3, `hydrate loaded the seeded sections (got ${sections.length})`);

  // 1. No-change persist leaves every section row untouched (xmin unchanged).
  const before = await sectionState();
  await projection.persist(db.data);
  const afterNoChange = await sectionState();
  await ok(
    before.length === afterNoChange.length && before.every((row, index) => row.xid === afterNoChange[index].xid && row.parent_section_id === afterNoChange[index].parent_section_id),
    'no-change persist does not rewrite any bank_department_sections row'
  );

  // 2. One changed parent rewrites exactly one row.
  const target = sections.find((section) => section.id === 'sec-b')!;
  target.parentSectionId = 'sec-c';
  await projection.persist(db.data);
  const afterParentSwap = await sectionState();
  const changedRows = afterParentSwap.filter((row, index) => row.xid !== afterNoChange[index].xid);
  await ok(changedRows.map((row) => row.id).join(',') === 'sec-b', `parent change rewrites only sec-b (got ${changedRows.map((row) => row.id).join(',')})`);
  await ok(afterParentSwap.find((row) => row.id === 'sec-b')?.parent_section_id === 'sec-c', 'sec-b parent link committed');

  // 3. Persist queues behind the advisory lock instead of proceeding.
  let releaseGate!: () => void;
  const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  const holder = pgClient.transaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('aegissec:projection-persist', 0))`);
    await gate;
  });
  const queuedPersist = projection.persist(db.data);
  await sleep(1000);
  let settled = false;
  await Promise.race([queuedPersist.then(() => { settled = true; }), sleep(50)]);
  await ok(!settled, 'persist waits while another transaction holds the projection advisory lock');
  releaseGate();
  await holder;
  await queuedPersist;
  await ok(true, 'persist commits after the advisory lock is released');

  // 4. A row-lock timeout during persist retries and still commits. The row
  //    holder releases at ~6s: attempt 1 times out at ~5s (lock_timeout), the
  //    retry starts after its backoff and only waits ~0.5s for the row.
  target.parentSectionId = 'sec-a';
  const rowHolder = pgClient.transaction(async (client) => {
    await client.query(`SELECT id FROM bank_department_sections WHERE id='sec-b' FOR UPDATE`);
    await sleep(6000);
  });
  await sleep(100);
  const contendedPersist = projection.persist(db.data);
  const contendedResult = await Promise.race([contendedPersist.then(() => 'committed'), sleep(15000).then(() => 'timeout')]);
  await rowHolder.catch(() => undefined);
  await ok(contendedResult === 'committed', 'persist survives a lock timeout through retry');
  const finalState = await sectionState();
  await ok(finalState.find((row) => row.id === 'sec-b')?.parent_section_id === 'sec-a', 'retried persist committed the parent link');

  await pgClient.close();
  console.log('ALL CHECKS PASSED');
};

void main().catch((error) => { console.error(error); process.exitCode = 1; return pgClient.close(); });
