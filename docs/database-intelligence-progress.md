# Database intelligence implementation ledger

Objective: all 27 sections of the supplied database-intelligence objective, not merely CMDB indexes. Status: **in progress; not deployed; completion unproven**.

## Attention: local test-isolation incident (2026-09-03 11:13 UTC)

The second-pass combined integration run was mistakenly directed to the main local `bank_infosec_db`: `.env` `DATABASE_URL` took precedence over the command's `DB_NAME=bank_dataplatform_integration_20260903_1112`. The pool log also misleadingly reported DB_NAME instead of the effective URL database. The prior claim that this 13-test run was isolated is withdrawn. At incident inspection the newly created 1112 database was empty (0 public tables); it was subsequently explicitly verified and migrated by the safe runner described below. Earlier 1016/1023 databases each contained 120 tables, but their existence is not a substitute for per-run connection proof.

Read-only inspection confirmed the following committed fixture effects in the main local database:

- `dconn-test-primary`, `dconn-test-secondary`, `dconn-test-vcenter`, their 3 department connections, 13 runs, 13 source records and 18 raw observations.
- 7 canonical fixture assets and their identity/component/provenance/correlation evidence; 3 of the source records are unlinked review/conflict cases.
- `div-cmdb-test`, `dept-cmdb-test`, `user-cmdb-test`.
- GLOBAL lifecycle policy changed to stale after 1 / decommission candidate after 2 missed runs. Previous values were not captured. Migration defaults are 3 / 10, but those are not proof of the previous live values. User approval to restore 3 / 10 has been requested; no guessed restoration performed.
- Cursor test committed then deleted only its own random `ci-cursor-insert-*` fixture; remaining cursor rows: 0. Search fixtures rolled back; manager fixtures used transaction-local temporary tables. No reset/truncate or deletion of pre-existing canonical data was performed, but this does not make the isolation failure acceptable.

Containment: only the 3 exact fixture connectors, additionally matched to their creation-time window, were disabled to prevent further scheduled work. No fixture assets, source records or immutable evidence were deleted. Complete cleanup/quarantine is not yet authorized or performed. The GLOBAL policy remains 1 / 2 pending user direction; this can affect subsequent real full reconciliations.

Prevention implemented: the five original DB-writing integration files (including the existing threat-model integration), and the two new ordering/fencing files, now check `SELECT current_database()` against the explicitly selected disposable database in a before hook, before fixture writes or hydration. The helper also rejects non-test database names. A negative real-connection run with DB_NAME=1112 and DATABASE_URL still pointing at main was rejected before either test body ran; this expected failure is guard evidence, not a passing regression suite. Unit guard test passed. Pool diagnostics now report only the effective URL hostname/database, never its credentials. The discovery fixture now installs a connector-specific lifecycle policy instead of changing GLOBAL. Positive isolated replay is now proven: 14 tests in verified 1112, followed by 36 tests in verified fresh 1150, with no failures/skips. These do not retroactively make the incident run isolated.

Fixture canonical IDs retained for recovery (from this run's logs and current source links):

`ci-872ac26b-4f7a-47e4-86de-5fa74cfb3f09`, `ci-68f83fc7-c9b5-45df-8a4e-3736d501ff26`, `ci-5dde597e-6239-4e68-ac60-183d5d0fa2ae`, `ci-d6fff42a-dbc7-443a-a0b2-c23fd00149fb`, `ci-3382f88e-c938-40a4-98e5-9798e1a9b395`, `ci-40c90580-3075-467b-8c6e-1ea0518a21bc`, `ci-a21ff751-5f7f-4481-b2a2-a51988b09881`.

Do not present the following historical first-pass notes as the latest completion status; the later sections and this incident supersede them where applicable.

## Third pass: isolation, insertion visibility and ingestion ordering (11:36–12:02 UTC)

### Explicit disposable-database execution

`pnpm run test:db --database <existing_local_test_database> --migrate`, `--indexes`, or `--test src/tests/<explicit-file>.test.ts` uses `src/server/scripts/run-disposable-db.ts`. The runner never creates/resets/drops a database. It requires an explicit test/integration/e2e-delimited database name and loopback host, rejects connection URL query overrides, replaces the URL database, and probes actual `current_database()` before launching any child. It passes matching DATABASE_URL/DB_NAME, bounded pool settings, and resolved secret-file settings without logging credentials. Test names are explicit allowlisted paths, not arbitrary child CLI arguments.

An initial configuration rejection exposed paired direct/file secret settings; resolved `_FILE` values are now blanked in the child so dotenv cannot reload conflicting values. One connection-limit preflight failure stopped before writes; no other sessions were terminated. Fresh 1150 was created explicitly, verified, then migrated through 031. Its broad focused run passed **36/36, zero skipped**, covering cursor, search, generic discovery, ordering, manager updates, transaction locks, query guards, AD/Cortex/vCenter adapter contracts. Full TypeScript check passed. The main database readback showed no new order-test connectors, retained incident source count 13, and GLOBAL still 1/2.

### Cursor v2: concurrent insertion membership

`created_at <= snapshot` was insufficient: discovery legitimately creates a new canonical row with an old source observation timestamp. Migration `031_cmdb_insertion_visibility.sql` adds immutable `inventory_insert_xid xid8`. Existing rows use metadata-only zero; new inserts receive their top-level transaction ID in a trigger, including inserts under savepoints. The trigger prevents caller-supplied zero or later marker rewrites. Cursor v2 signs `pg_current_snapshot()` and filters using `pg_visible_in_snapshot`; mutable row `xmin` is not used. Legacy v1 tokens reject with refresh guidance. No long-lived pagination transaction or new index is introduced.

The running local development watcher applied 031 to main at 11:38:30 UTC. Catalog inspection confirmed the existing-row metadata default (`atthasmissing`, `{0}`), not a data backfill. Migration checksum must remain immutable. Integration tests commit fixtures before the initial page, then prove that both a backdated insertion and a transaction already open at the first page but committed later are excluded from that traversal and included on a fresh traversal. Four ascending/descending timestamp/null combinations retain all ties and microseconds. Non-sort updates preserve membership; marker tampering fails with 23514; scope/actor changes reject.

Residual: this is stable insertion membership, not a frozen multi-request snapshot of mutable sort/filter values. Logical restore to another PostgreSQL cluster requires a deliberate insertion-marker rebaseline before cursor traffic; no restore utility/rebaseline has been implemented. Snapshot/token size limits remain bounded. No fresh browser QA was run for v2.

### Observation ordering and run fencing

Under the existing source lock, an older observation now fails explicitly with `STALE_OBSERVATION`; equal timestamps with different normalized content at the same schema version fail with `CONFLICTING_OBSERVATION_VERSION`. Raw failure evidence is retained, but canonical/source identity, components, freshness, search projection and revision are not rewound. Same failure replay counts once. All three canonical discovery freshness timestamps use a monotonic maximum, including updates from an older secondary source. This adds one indexed source lookup per observation; ingestion throughput improvement is not claimed.

Completion previously could run between raw persistence and normalization, publish a successful checkpoint, and infer absence while RECEIVED work was pending. Completion now checks pending raw statuses under the run-row lock and raises retryable `RUN_OBSERVATIONS_PENDING`. Processing takes the same run-first lock order and fences terminal runs before source mutations; normalization/network work stays outside the transaction. Failure marking cannot overwrite a successful concurrent duplicate. A successful retry atomically replaces prior failure accounting and clears the raw processing error; another failure rolls that change back. Existing `(sync_run_id, processing_status, id)` index supports the pending lookup; no speculative index added.

Focused live regression after these changes proves pending completion leaves checkpoint/absence untouched, a late normalization failure preserves PROCESSED, failed-to-successful retry repairs counters, and a terminated run cannot mutate canonical data. The new test initially failed on fixture assumptions (TEXT checkpoint, BIGINT counts returned as strings), then passed after explicit decoding; those failed attempts remain in the disposable DB, not main. Ordering regression also passed after run fencing. Fresh, preflight-verified `bank_dataplatform_integration_20260903_1202` was migrated through 031 and the broader 12-file focused regression passed **37/37, zero failures/skips**, at 12:04 UTC. Whole-project TypeScript and whitespace checks passed. This is not a fresh all-project suite pass; earlier full-suite failures remain open.

Final schema-state coverage also explicitly includes NORMALIZED alongside RECEIVED/VALIDATED. The expanded fencing regression passed again at 12:06 UTC; whole-project TypeScript and whitespace checks passed afterward. A read-only main-data plan for the pending lookup uses `idx_cmdb_raw_observations_run_status` as an Index Only Scan, zero heap fetches; execution 11.819 ms includes selecting the latest run as a setup subquery. No new index was necessary. Same-run processing transactions are now serialized earlier; contention/throughput must still be measured before a capacity claim.

### Current read-only performance evidence

`data/database-intelligence-cursor-v2.json` records actual database identity and uncontrolled local cache/concurrent load, not an assumed warm cache. Main now has 18,955 canonical rows including the seven disclosed incident fixtures. Execution times are EXPLAIN ANALYZE SQL, not HTTP latency or production SLA:

| Query | Count / metadata | Data |
| --- | --- | --- |
| offset first page | 71.384 ms count | 232.146 ms |
| offset deep page | 2.638 ms count | 131.085 ms |
| no-match contains | 68.855 ms, only query | not executed |
| cursor first page | 0.027 ms snapshot; 18.180 ms count | 28.984 ms |
| cursor deep, no total | no count | 25.389 ms |
| exact canonical positive | 17.922 ms count | 8.599 ms; one result |
| exact IP positive | 8.922 ms count | 7.602 ms; one result |

Deep cursor uses `idx_cmdb_inventory_updated_cursor_v1`, a row-tuple Index Cond, 26 probe rows for 25 returned, zero filter removals, 27 shared hits and one read. Boundary setup may use OFFSET, but the measured continuation query does not. Historical samples vary with host load; these numbers are not a throughput/capacity claim.

## Fourth pass: LDAP failure handling and test isolation (12:07–12:16 UTC)

`LDAPSyncService.syncAllUsers()` assigned `operation.finally(...)` to its single-flight field but returned the parent `operation`. With one caller handling a failed acquisition, the detached finally promise still rejected unhandled. It now returns the tracked promise. A regression covers a handled failure, release of the single-flight slot, concurrent callers sharing one failed acquisition, and a subsequent attempt. PostgreSQL configuration with a missing/closed pool now fails before contacting LDAP instead of running synchronization without a database lock. Memory mode remains explicitly separate.

Whole-project `tsc -p tsconfig.json --noEmit` passed after correcting the test-only fake pool's explicit type cast; `git diff --check` passed. Earlier full-suite ticket-routing/orchestration failures remain unresolved; the focused scheduler result is not a fresh full-suite pass.

The scheduler unit suite had depended on the shared bootstrap closing its real PostgreSQL pool and later attempted baseline/report SQL against that closed pool. It now explicitly runs its projection/mapping scenarios in memory and restores configuration afterward. Its manual-trigger scenario also lacked an LDAP mock: the first diagnostic rerun at 12:13 performed a real read-only LDAP fetch of 992 entries; resulting mutations stayed in the test process's memory because DB_TYPE was memory, with no PostgreSQL report/projection persistence. This was not an intended live sync validation. A suite-wide mocked LDAP boundary now covers manual and scheduled paths. The final isolated run at 12:14 passed **16 tests, zero failures/skips**, in 961 ms; logs show one fixture account, not a live directory fetch. Main readback counted zero directory reports since 12:07 UTC. The incident GLOBAL policy remains 1/2, unchanged.

The core LDAP transaction-pooling issue remains **unresolved**. Current `withDatabaseSyncLock` holds a session advisory lock on one client, while `Database.persist()` queues `PostgresProjectionRepository.persist()` on another transaction/client, and report/audit writes have separate boundaries. `Database.transaction()` only rolls back a synchronous in-memory exception; a later durable write failure can leave the local projection mutated. Network fetch, snapshot validation, local mutation, durable persistence, failure rollback and report publication therefore need one coherent ownership/fencing design. Merely swapping the lock function would not make those writes atomic. PgBouncer explicitly marks session advisory locks unsupported in transaction-pooling mode ([official feature matrix](https://www.pgbouncer.org/features.html)). No lock lease, transaction-context refactor, new schema migration, or claim of fixing this cross-process race was made in this pass.

## Architecture and initial audit (2026-09-03)

PostgreSQL 16.9 is authoritative. `schema.sql` plus 29-numbered immutable migrations (including two distinct 029 names) contain the actual relational model. `PostgresProjectionRepository` hydrates legacy domain snapshots and persists changed records; CMDB discovery has direct transactional repositories. No new parallel canonical model is needed.

`AD / vCenter / Cortex / SMB adapters -> discovery sync runs -> immutable cmdb_raw_observations -> validated normalized DTO -> connector-scoped cmdb_source_records -> cmdb-identity-v3 correlation / strong identity claims -> configuration_items -> network, storage, relationships, attribute provenance/history -> CmdbApiService -> CMDBExplorerView`.

Workers receive committed outbox events through RabbitMQ; scheduler and API are separate processes. Connector uniqueness, raw-observation deduplication, identity advisory transaction locks, strong claim uniqueness, review cases, field precedence, manual locks and multi-source lifecycle already exist. Raw/history FK deletion generally uses RESTRICT. Ordinary ticket search currently evaluates authorized in-memory projections. CMDB inventory is SQL-backed but searches wide JSON and enriches every returned/skipped row using subqueries. The migration runner applies pending files in one transaction and rejects changed checksums.

### Confirmed issues / work queue

| Priority | Path | Evidence / next action |
| --- | --- | --- |
| HIGH | `projection-repository.ts` manager persistence | Every persistence clears manager_id for all snapshot users, then restores individual managers and updates every department. Live stats: 953 users, 2,028,004 updates; 83 departments, 176,624 updates (cumulative, not all attributable to this path). Replace with batched conditional updates; prove unchanged writes and removals. |
| HIGH | `discovery-ingestion.service.ts` run completion | FULL/RECONCILIATION absence processing runs before checking failed_count; AD/vCenter call it with failed batches. Prevent absence on incomplete observations and keep successful connector checkpoints on partial runs. |
| HIGH | `cmdb-api.service.ts` owner filter | `replace('?', ...)` replaces only the first of three placeholders. Execute actual path and regress all owner fields plus combined filters. |
| HIGH | `discovery-lock.service.ts` / Compose | Session advisory locks use a dedicated *client* through transaction-pooling PgBouncer, not a guaranteed dedicated server session. Needs transaction-scoped lock ownership review. |
| HIGH | inventory search / confidence enrichment | Whole normalized JSON substring search and historical confidence join with OR across all sources. Capture real query plans before changing. |
| MEDIUM | source-record ingestion | Existing content hash controls revision but unchanged payload is still assigned; all subordinate processing runs again. Measure and design safe freshness-only path without skipping authority changes or pending relationship resolution. |
| MEDIUM | reconciliation queue | N+2 queries for N cases; batch candidates by case IDs, retain stable score/asset ordering and authorization. |
| MEDIUM | pagination | Up to 100,000 pages with OFFSET; deterministic keyset API/UI path still required. |

## Baseline

Read-only `src/server/scripts/database-intelligence-baseline.ts` captures schema columns, constraints, indexes, migration ledger, table/database statistics, and EXPLAIN ANALYZE BUFFERS of the actual `listAssets` bound queries. Selects an existing active platform administrator only for internal read-service permissions; does not authenticate an HTTP session. Emits no asset records, credentials, or bound identity values. Generated detailed evidence stays in ignored `data/database-intelligence-*.json`.

Initial cumulative stats: about 18,948 canonical rows, 20,398 source records, 141,340 attribute observations (139 MB), 36,143 raw observations (107 MB). Database temp_bytes 68,222,831,345; no recorded deadlocks. `pg_trgm` exists, `pg_stat_statements` is not installed. These are snapshots on a running local dataset, not production throughput, growth rates or a before/after optimization claim.

## Full-scope acceptance ledger

| Objective sections | Required evidence | Status |
| --- | --- | --- |
| 1–2 audit / baseline | complete schema + runtime pipeline + live plans / statistics | initial audit and measurement in progress |
| 3–5 provenance / identity / deduplication | existing constraints inspected; concurrency, ambiguity, two-source convergence tests | existing implementation located; current verification pending |
| 6–9 incremental / lifecycle / precedence / history | durable successful cursor; partial/disappearance/reappearance, no-change write count, authority tests | confirmed fixes queued; adapter-specific cursors pending |
| 10–11 indexes / JSON | access-path-specific plan comparisons, typed hot fields, safe migration | pending; no speculative indexes added |
| 12–14 filter / pagination / search | combined filters, exact identifiers, partial names, stable cursors, UI compatibility | owner bug confirmed; broader implementation pending |
| 15–18 relationships / N+1 / read models / cache | relationship coverage, bounded query counts, invalidation / evidence for any cache | candidate batching queued; broader review pending |
| 19–22 concurrency / integrity / quality / authorization | redelivery/crash/rollback, FK orphans, normalization, scope isolation | existing controls located; lock risk and further checks pending |
| 23 observability | sync/query/pool/search/correlation metrics without payload leakage | partial baseline tool; runtime instrumentation pending |
| 24 migrations | additive immutable migration and resumable backfill proof | no schema mutation yet |
| 25–26 verification | focused tests, full suite, typecheck, available lint, real before/after | pending |
| 27 and final A–I | all confirmed issues implemented and measured or genuinely blocked; complete report | not complete |

No production data reset, truncation, deletion, canonical ID rewrite, deployment, commit or push has been performed. The broad existing test suite did invoke a live read-only LDAP fetch; its PostgreSQL pool was already closed and the domain mutations stayed in test-local projections. The suite is therefore not fully hermetic.

## Implemented first pass

1. `CmdbApiService`: all repeated owner placeholders bind to the same validated parameter. Page IDs are materialized before enrichment, so skipped OFFSET rows do not evaluate history/source subqueries. Confidence is computed through candidate/decision asset indexes without the source-wide OR join and history Cartesian multiplication. Candidate-score precedence remains unchanged. A zero total now returns an empty page without executing the same expensive predicate a second time.
2. `listCorrelationCases`: one batched candidate query per page, retaining case grouping and score-descending/asset-ID ordering. Query count is three for a populated page instead of N+2; no candidate query for an empty page. Authorization still precedes SQL.
3. `projection-manager-links.ts`: bounded 1,000-edge updates replace the full manager clear/rebuild. `IS DISTINCT FROM` preserves unchanged tuple versions and timestamps while clearing removed/invalid/self managers. Integration proof: changed fixture writes 2 user rows and 1 department row; unchanged replay writes 0 rows.
4. `DiscoveryIngestionService`: failed FULL/RECONCILIATION runs never infer absence. AD, vCenter and SMB explicitly take partial completion for failed batches, including failures before raw persistence. Partial completion retains connector successful checkpoint and stores attempted progress on the run; failed-record counts are bounded and propagated. Existing multi-source active-source protection and reappearance are preserved.
5. Discovery completion locks are transaction-scoped, held on the same transaction/client used by the callback, compatible with transaction-pooling PgBouncer. Duplicate callbacks are excluded; commit and rollback release the lock. LDAP's separate session-lock implementation remains a follow-up item.
6. Source-record identical hash/schema path updates freshness without assigning normalized JSON or changing its normalization time/revision. Immutable raw evidence is still persisted and authority/correlation/pending relationships still evaluate: this is **not** yet a complete freshness-only optimization of all component writes.
7. Test setup defaults to a 0-min/3-max pool (explicit process environment can override). This follows a real connection-exhaustion failure during broad hydration against the shared running host.

### Schema / rollout

No new indexes, dropped indexes, constraints, schema migrations, search engine, cache or read-model table in this pass. Existing indexes suffice for these query rewrites. Existing migrations successfully applied to fresh disposable databases `bank_dataplatform_integration_20260903_1016` and `bank_dataplatform_integration_20260903_1023`. Those isolated fixture databases remain available; the main database schema and data were not migrated/reset.

### Measured evidence (not a production SLA)

| Actual API data query | Before | First after-query sample |
| --- | --- | --- |
| first 25 assets | 735.435 ms; 70,266 shared hits + 2,668 reads | 168.172 ms; 13,743 hits + 435 reads |
| page 400 / 9,975 skipped assets | 20-second statement timeout | 138.999 ms; 13,908 hits + 215 reads |
| owner filter | SQL syntax error near OR | valid bound query; no matching owner in chosen sample |
| no-match substring search | count 4,603.642 ms + data 9,787.580 ms | still wide JSON scans; later short-circuit eliminates the data query |

`database-intelligence-query-parity.ts` executed old and new captured SQL in a single REPEATABLE READ / READ ONLY snapshot: **50 full result rows matched exactly**, including all columns, enrichment, and ordering. This is real local data proof, not a mock.

Timing is load-sensitive: a subsequent sample overlapping the broad suite measured 772.532 ms first page and 476.936 ms deep page, and the search count timed out. First-page buffer work remained about 14,097 blocks versus 72,934 before. Do not selectively present the fastest sample as a universal improvement or call substring search fixed. Capture current quiet-host measurements before the final report and compare structural plans as well as latency.

After the broad suite ended, `data/database-intelligence-after-idle.json` measured first page **74.714 ms**, deep page **79.349 ms**, zero-result search count **7,140.101 ms** (only one SQL query now), and owner count **17.061 ms**. This additional sample reinforces reduced inventory query work but confirms that substring-search indexing/read-model work remains necessary. The script's wall duration includes EXPLAIN execution plus a second execution to obtain row counts; it is not an HTTP API latency measurement.

### Verification status

- Latest isolated focused run: **8 passed, 0 failed, 0 skipped**. Includes real PostgreSQL generic discovery: first ingestion, changed fields/history, new-run unchanged payload, duplicate concurrent delivery, weak match rejection, identity conflicts, three-source convergence, strong-claim DB rejection, missing/reappearing lifecycle, partial checkpoint/absence protection; manager SQL and connector lock commit/rollback; five query/authorization/batching unit tests.
- Server `tsc -p tsconfig.server.json --noEmit`: passed after implementation. `git diff --check`: passed (Git's CRLF conversion notices are not whitespace errors).
- Full `pnpm test`: **181 passed, 7 failed, 4 skipped**, 192 total. Failures include LDAP manual queue bootstrap (`too many clients`), scheduler calling a closed pool, two ticket-routing assertions (500 vs 201), and orchestration event-trigger count (32 vs 1); runner totals include failed nested suites. These are not yet all root-caused or resolved. The full suite began before the pool-limit change; a focused follow-up is recorded separately.
- Follow-up under the reduced test pool: LDAP manual queue plus query regressions **6 passed, 0 failed**. This resolves the observed bootstrap failure in the focused rerun, not the other full-suite failures.
- `pnpm run lint:css`: fails existing non-semantic z-index utilities. No CSS files changed; do not broaden this database work into a style rewrite.
- No browser QA, deployment, new live connector sync, production throughput claim, or million-row capacity proof.

## Implemented second pass: indexed search and cursor pagination

Migration `030_cmdb_search_projection.sql` is already applied on the main local DB and must not be edited. It adds versioned typed search text, identity-term arrays, OS-name arrays, and source-owner text to the existing canonical/source tables. Immutable SQL v1 functions normalize Unicode, IP/MAC terms and explicit DTO field allowlists; raw arbitrary metadata keys and telemetry are not indexed as owner/search values. Relevant content changes update the projection in the same transaction. Freshness-only updates do not rebuild it. Rows awaiting backfill remain searchable through a version-0 fallback; this fallback stops touching normalized JSON once backfill completes.

`pnpm run db:search:prepare` prepares eight access-path-specific indexes concurrently outside the all-migrations transaction, validates their definitions, resumes only matching invalid indexes, and backfills in bounded SKIP LOCKED batches without resetting entity versions or business timestamps. Main backfill completed for 18,948 canonical and 20,398 source records. A subsequent index-definition replay passed; pending rows were 0 / 0. Later live/test inserts explain changed current totals.

Indexes added: canonical and source multicolumn GIN search indexes; two partial pending-backfill indexes; technical/business owner foreign-key lookup indexes (existing owner index reused); partial active-identifier trigram GIN; `(updated_at DESC,id DESC)` active-inventory cursor index. No existing valid indexes were dropped. Exact IP/MAC/UUID/CI and explicit source-ID searches use terms/equality; literal contains queries escape `%`, `_`, and backslash. Owner/OS combinations use typed projections. Search deliberately excludes accidental JSON-property-name matches and unrelated raw telemetry. Very short or low-selectivity contains searches can still be expensive; no universal full-scan-free claim.

`CmdbApiService.listAssets` now supports optional signed, actor/filter/page-size/sort-bound keyset cursors with expiry, microsecond-preserving SQL boundaries and explicit null ordering. Subsequent pages may omit the count. Legacy OFFSET remains compatible. The list selects 48 canonical fields plus enrichment instead of transferring `a.*` with raw payload/search documents. A fresh repeatable-read parity check compared **50 rows and 63 selected fields**, including enrichment and order, successfully.

The infrastructure Explorer uses cursor Next/Previous, remembers visited-page boundaries, resets traversal on filter/sort/Refresh, rejects stale asynchronous results and retains the initial count when later responses omit it. The separate all-CI/application/service endpoints remain legacy paths and still need audit. Browser-driven QA also found and fixed a status-map-as-function detail-render error, colliding built-in/custom column keys and stale localized page/range/heading text. Custom columns now have distinct keys and render their stored values.

### Structural/performance proof

`data/database-intelligence-search-cursor-complete.json` was captured before the 11:13 fixture incident. SQL EXPLAIN timing, not HTTP SLA:

| Query | Latest measured execution | Structural evidence |
| --- | --- | --- |
| no-match contains count | 47.988 ms | canonical/source/identifier GIN paths; empty pending indexes; no full normalized JSON scan; user names scan the 953-user directory three times |
| first cursor data page | 35.047 ms | 26 probe rows for 25 returned; initial count 17.483 ms |
| cursor at approximately row 9,975 | 28.553 ms | one API SQL query, no count/OFFSET; tuple-comparison index seek reads 26 rows, removes 0, 26 shared hits + 1 read at seek node |
| OFFSET first / page 400 data | 242.273 / 130.430 ms | page IDs before enrichment; load/cache-sensitive |

Comparison baselines remain above: no-match count 4,603.642 ms initially / 7,140.101 ms later; original deep data query timed out at 20 seconds. These do not establish production CPU/throughput or million-row capacity.

### Historical second-pass verification (superseded by third pass above)

- Combined discovery/search/cursor/manager/query regression run: **13 passed**, but its isolation claim is invalid; see incident. Positive replay on an actually verified disposable DB is required before accepting this gate.
- Adapter contract tests: **21 passed**. Updated tests now await normalize() and provide schemaVersion; assertions were retained. No live connector sync was deliberately invoked by these adapter tests.
- Whole-project TypeScript check passed after correcting the UI error and stale test typings, and passed again after the final guard additions. `git diff --check` passed. Server-only typecheck and client build passed earlier; build emits a large-bundle warning.
- Browser: infrastructure Next produced 25 new rows with zero overlap; Previous returned to page 1; Refresh reset page 2 to page 1; zero-result search disabled both buttons; Clear restored results. Observed `/api/cmdb/assets` request carried the expected search and `pagination=cursor`. A `.fill()` interaction did not propagate React state on one attempt; keyboard input + Enter did and was verified. Test/code hot reloads also reset the view, so earlier interrupted browser observations are not counted as successful scenarios.
- **Insertion-boundary defect found in this pass, fixed in third pass:** cursor v1 bounded `created_at`, but discovery creates canonical rows using the source observation timestamp. Consequently newly inserted backdated assets could enter an existing traversal. This occurred during browser testing. Cursor v2 and migration 031 now close this defect with committed/backdated/in-flight regression proof above. Mutable sort updates remain a separate limitation; this is not a frozen MVCC snapshot.
- LDAP session advisory lock is still unsafe through transaction-pooling PgBouncer; no fix yet. It spans network collection and separate projection persistence, so simply renaming the lock function is insufficient for connection-loss safety.

## Next work, full objective still active

0. Obtain direction for the local incident: GLOBAL policy restoration and retained fixture quarantine/cleanup. Write integration tests may run only after the safe runner proves the effective database and the per-file guard verifies it again; never infer isolation from DB_NAME or a log label.

1. Extend coverage of implemented typed/exact identifier search and indexed partial search across actual frontend filter combinations, owner/source semantics and environment overrides.
2. Complete cursor rollout/restore operations and fresh v2 UI validation. Precision/ties, null ordering, backdated inserts and in-flight commits are now covered; mutable sort/filter changes remain live.
3. Audit remaining unchanged component writes, adapter completeness, lifecycle authority, and lock contention/throughput after run fencing. Ordering and pending-completion fixes now have regression proof. Validate LDAP transaction-pooling lock separately.
4. Complete platform-wide schema/query/relationship/cache/observability/quality and tenant/scope audit; decide migrations only from measured access paths. Inspect hot projection writes beyond manager links.
5. Resolve/attribute remaining test failures, run repeatable perf measurements and full relevant gates, then deliver the required A–I report. No goal completion claim until the entire acceptance ledger has evidence.
