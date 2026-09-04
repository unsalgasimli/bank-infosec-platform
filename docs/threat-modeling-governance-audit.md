# Threat Modeling governance audit — 2026-09-04

## Architecture decision (before implementation)

Extend the existing first-class domain and immutable numbered migrations. Do not
create another inventory or a parallel threat model. PostgreSQL repositories,
ticket attachments, central user roles, CMDB/application references, enterprise
risk links, outbox automation and the existing React workspace are reusable.

## Initial gap map against the supplied 40-section brief

This table records the starting audit, not the current implementation status. The
implementation report and outstanding-work list below record the subsequent changes.

| Sections | Existing foundation | Gap / required work |
| --- | --- | --- |
| 1, 12, 13, 28 | Separate threats and per-threat controls | No normalized requirement/catalog chain or reusable control definitions |
| 2, 5, 26 | CMDB/service/project/change references; risk links; outbox | Reference checks use projections; no verified GitLab/Cortex correlation |
| 3, 4, 17, 33 | JSON policy and applicability answers | No TM-0–3 engine, no hard minimum tier, policy history not bound to revisions |
| 6–9 | Components, boundaries and flows stored relationally | No reusable data objects or node zones; crossing flag is client asserted |
| 10, 11, 15 | STRIDE/abuse categories, scenarios and scores | No explicit analyst disposition; no threat transition endpoint; revision key collision |
| 14, 24 | Clean-ticket evidence, independent verification, numbered revisions | Verification and residual updates can mutate approved revisions; no DB content guards; no approval snapshot |
| 16, 18 | Review/approval and material-change draft copying | Old approvals can count after re-submission; overdue review not release-blocking |
| 19, 20 | Exception records, roles, some SoD checks | Admin is implicitly approver; client chooses exception severity; excessive limits; terminal decisions replayable |
| 21, 22 | HMAC gate token and protected workflow action | No execution-time DB recheck; no emergency SLA flow; missing evidence freshness checks |
| 23, 25 | Append-only approval/audit tables | No retention metadata, hash chain, immutable approval package |
| 27 | No automatic AI governance approval | No provenance/disposition workflow; do not fabricate AI results |
| 29, 34, 35 | Services/transactions, ownership authorization | Department-wide disclosure; unbounded lists; inconsistent errors; weak schema validation |
| 30–32 | Functional workspace, gate, counts and history | Missing requirements/data/screening workspace; unknown gate rendered green; coverage denominator is models, not applications |
| 36–40 | Focused tests and guarded PostgreSQL test fixture | Full acceptance lifecycle and all integrations are not demonstrated |

## Safety and migration boundaries

Preserve legacy IDs, approvals, evidence and decisions. New metadata must label
legacy unscreened records, never invent approval/evidence. Use an additive migration;
do not rewrite migrations 005–008. Approved content must require a new draft.
The supplied CBA references are an internal interpretation pending compliance-owner
validation, not legal certification. Seven-year post-decommission retention is
bank policy, not a claimed statutory minimum.

## Verification ledger

Implementation and results are recorded here at handoff. No production deployment,
external pipeline enforcement or compliance certification is implied by source tests.

## Implementation report

**Status: substantial implementation, NOT the complete 40-section definition of done.**

1. **Existing architecture findings.** The first-class PostgreSQL domain was worth
   extending. It already had revisions, architecture, threats, per-threat controls,
   verifications, attachments, risk links, approvals, outbox events and a workspace.
   A read-only operational DB inspection found five models, all DRAFT, and zero
   exceptions. Those records were not rewritten or certified by this work.
2. **Major defects fixed.** Platform-admin approval inheritance; department-wide
   model disclosure; missing clearance enforcement; mutable approved controls and
   residual scores; old approvals surviving a new review cycle; client-selected
   exception severity; excessive exception lifetimes; replayable exception decisions;
   PostgreSQL exception-decision parameter type failure; colliding threat keys across
   revisions; green UI when gate evaluation was unavailable; token-only simulated
   deployment success; missing current-state token consumption; and union-of-ownership
   scope checks that let one owned reference authorize a different linked object.
3. **Reused.** Existing models/revisions rather than a parallel domain, directory-backed
   roles and clearance levels, attachment malware/access infrastructure, CMDB and
   application references, enterprise risk records, domain audit tables, transactional
   outbox and scheduler/worker infrastructure. Risk registration and AppSec now use
   one shared 5x5 rating function.
4. **Redesigned.** Persisted TM-0–3 screening policy versions and rules; explicit
   questionnaire answers; hard tier floors; normalized requirement/threat/control/
   compliance mappings; classified information objects and revision links; review
   cycles; immutable approval packages; and release authorization consumption.
5. **DB migrations.** Additive `032_threat_model_governance.sql`,
   `033_threat_governance_execution.sql`, `034_threat_emergency_lifecycle.sql`,
   `035_threat_control_catalog.sql`, `036_threat_control_catalog_guards.sql` and
   `037_threat_lineage_and_editing.sql` and `038_threat_architecture_editing.sql`
   were applied successfully to the separately
   created `bank_threat_integration_20260904` database. Existing migrations were not
   rewritten. These migrations were **not applied to the operational database**.
   Test fixtures remain in the isolated database for reproduction. Approved legacy
   records without a snapshot require a new reviewed revision; no approvals or
   evidence are fabricated during migration. Migration 035 backfills existing primary
   control/threat links and adds catalog versions, decisions and scope-version guards.
   Migration 036 additively hardens catalog decision transitions and immutable instance
   bindings; migration 035 was not rewritten after application.
   Migration 037 adds append-only lineage membership, server-managed threat content
   versions, verification invalidation and exception assessment bindings. Existing
   threats become separate `LEGACY_UNCORRELATED` roots without modifying their content
   or stored approval snapshots. Historical correlations are not guessed from titles
   or positional keys. Future copies retain the same stable lineage ID and an explicit
   same-model predecessor; duplicate membership within a revision is DB-rejected.
   Migration 038 adds architecture-record optimistic versions, a server-managed revision
   architecture version and immutable exception/architecture bindings. Database triggers
   validate endpoint/boundary scope, derive crossings, prevent removal of referenced
   draft objects and invalidate evidence scope on structural or data-context changes.
   Existing approved content and stored snapshots are not rewritten by this migration.
6. **Backend/services.** Screening, policy version creation, scope optimistic locking,
   requirement creation/control linkage, data-object linkage, compliance-reference
   proposals, threat transitions, bounded exceptions, snapshot export, authorization
   issue/consume, emergency assessment/decision/deployment attestation/review/closure,
   and scheduled overdue-review/exception-expiry/emergency-SLA maintenance are
   implemented. The reusable control catalog now supports immutable draft versions,
   independent publication and retirement, optimistic version creation, paged search,
   and pinned catalog-backed implementations. Existing control rows remain the
   implementation instances; a same-revision many-to-many mapping connects each
   implementation to its covered threats. All operate on persisted state with
   transaction/authorization checks.
   Authored threat content now has a full-replacement edit endpoint with captured
   content-version conflict detection, bounded schema validation, canonical risk
   calculation, active-owner checks and current-revision architecture references.
   A scoped, paged lineage endpoint exposes persisted versions. Governance status,
   residual scores and lineage identity cannot be changed through the editor.
   Components, boundaries and flows now share bounded creation/edit validation and
   current-draft mutation endpoints. Draft removal is limited to unreferenced records,
   with full prior content retained in audit. No delete path for approved history was added.
7. **Workflows.** Existing model/threat state names are retained and enforced, rather
   than claiming the entire expanded lifecycle vocabulary. Review cycles isolate
   approvals, SoD prevents owner/contributor approval, verified residual risk is
   required for mitigation/closure, approved content is DB-guarded, and revalidation
   copies architecture, threats, controls and requirements without carrying forward
   verification. Catalog-backed copies preserve their pinned definition and all threat
   mappings, but never inherit a previous verification. Mapping changes increment the
   implementation scope version, invalidate its previous PASS and clear mapped
   residual-risk decisions. Verification and release evaluation require the exact
   current scope version. The primary historical anchor and requirement-dependent
   mappings cannot be removed. Source-event IDs deduplicate CMDB/project re-review triggers.
   Authored threat changes reopen the threat and invalidate every linked control's
   verification scope, clearing residual decisions for other threats sharing those
   controls. The conservative rule applies to all authored fields, including ownership
   and due dates; a no-op save preserves decisions. Exceptions retain the originally
   assessed content version: old decisions remain readable but cannot approve or
   authorize changed scenarios. Stale assessments are excluded from active-exception
   counts. A fresh assessment requires a new request and independent approval.
   Architecture names/descriptions are documentation-only changes. Other persisted
   architecture changes and data-object link changes require re-screening, invalidate
   all control verification scopes in that revision, clear residual decisions and reopen
   threats. This is deliberately revision-wide: selective affected-subgraph evidence
   inheritance is not inferred. Exceptions must match both threat content and architecture
   versions. Component zone changes recompute connected flow crossings atomically;
   missing boundaries roll back the complete operation. Unknown legacy zones remain
   representable for revalidation but are release-blocking. Persisted node criticality,
   flow classification and boundary crossings supply screening floors.
   Emergency records enforce REQUESTED -> APPROVED/REJECTED, APPROVED ->
   DEPLOYED/REVOKED, DEPLOYED -> CLOSED. Independent CISO authorization, a consumed
   matching release authorization, clean change-ticket evidence, an independent
   post-change review and an approved post-deployment model update are required.
   Deployment recording creates a revalidation draft, never edits approved history.
8. **Policy limits.** TM-3: six calendar months; TM-1/2: twelve; TM-0: twenty-four.
   Exception maxima are Critical 7 / High 30 / Medium 90 / Low 180 days. Critical
   acceptance requires the emergency flag and CISO decision but does not permit normal
   production release. Expired/terminal decisions cannot be renewed in place. Rules,
   weights, score thresholds and tighter intervals can be versioned; mandatory floors
   cannot be weakened. Emergency authorization expires after 24 hours, with a separate
   five-minute execution token. Post-change review is due within 2 bank business days
   and an approved model update within 5. The existing bank business calendar (including
   holidays and timezone) is snapshotted with the assessment. Breaches are persisted,
   audited, shown in the UI and cannot be erased by late completion. Model-update
   completion is recorded at approval, not at the later administrative closure.
9. **UI.** The existing workspace now exposes real screening, scope, data classification,
   requirement/control mapping, threat-state, exception-decision, compliance-proposal,
   revision and immutable JSON-export operations. Component zones drive boundary
   crossing in the backend. Model lists are paged and model switching resets forms.
   Critical-model approval percentage is no longer labelled application coverage.
   Emergency forms cover real assessment, CISO decision, short-lived authorization,
   external deployment attestation, review and closure, plus visible deadlines/breaches.
   Authorization tokens stay in component memory and are not put in browser storage.
   A catalog tab provides version proposals, independent publication/retirement,
   implementation creation and threat-scope changes. Legacy/custom controls remain
   visibly uncatalogued; no regulatory definitions or verification results are invented.
   The threat-content editor exposes structured scenario, STRIDE/abuse categories,
   attacker/preconditions/path, architecture links, CWE/CAPEC references, ownership and
   risk inputs with progressive disclosure. Unsaved edits retain their original content
   version, and conflicts require an explicit reload. It displays stable lineage,
   historical revision entries and stale exception assessments.
   The architecture editor supports existing component/boundary/flow fields, creation,
   optimistic editing, explicit draft-removal confirmation and backend-derived flow
   relationships. It preserves unsaved edits on conflicts and presents actionable
   graph-constraint errors. Flow classifications are clearance-checked and may raise
   the model's confidentiality label, with audit and re-screening; lowering a flow's
   classification never automatically lowers the model's label.
10. **Integrations.** Existing clean ticket evidence, remediation tickets and risk
    links remain. CMDB/project material-change events carry source IDs/reasons and
    skip known non-security fields. The scheduler emits a durable governance tick.
    A new authenticated consume endpoint rechecks the current gate immediately before
    CI execution and records idempotent consumption. It explicitly returns
    `deploymentExecuted: false`. The synchronous workflow cannot fabricate a successful
    production deployment; a real asynchronous deployment adapter is still required.
    Emergency execution is explicitly OPERATOR_ATTESTATION with retained evidence,
    not proof that this application performed a deployment. A requested emergency or
    overdue post-change obligations block the gate. Revoked/stale/unbound emergency
    authorizations cannot be consumed. Emergency does not bypass the normal gate:
    unresolved Critical risk remains blocked even through this conservative path.
11. **Security hardening.** Owners/security reviewers/auditors plus clearance checks,
    auditor mutation rejection, independent control verification, bounded evidence
    freshness, cross-revision link checks, immutable approved content and JSON snapshots,
    stable snapshot SHA-256, append-only chained domain audit events, transactional
    model locks, current-revision checks and safe API database-error messages.
    Assessment, decision, execution evidence and SLA dates are DB-guarded; assessment
    contents and evidence SHA-256 values are included in hash-chained audit records.
    Emergency sweeps use the same model -> emergency -> audit lock order as API writes.
    Every supplied scope reference is now authorized independently; platform administration
    no longer supplies an implicit scope-creation bypass. Scope hydration is still projection-based.
    Catalog lifecycle events use the existing central audit with actor/request context
    and a SHA-256 definition fingerprint. Approval snapshots include the pinned catalog
    definitions and implementation/threat mappings. Verification rechecks retained,
    clean evidence and the reviewer's source-ticket read authorization. Catalog retirement
    blocks new implementations without rewriting existing pinned, verified history.
    Threat edits record full before/after content, rationale, actor/request context,
    invalidated controls and stale exceptions in the existing hash-chained audit.
    Threat/control mutations and exception decisions acquire the model lock first.
    Verification-required outbox keys distinguish each threat-content/control-scope
    transition; the original request correlation ID is retained in audit and payload.
12. **Tests/results.** Eighteen architecture/authoring/policy tests and thirteen gate/workflow/scheduler
    tests passed. Sixteen isolated PostgreSQL tests (including the parent lifecycle
    test) passed:
    actual persistence, IDOR/admin denial, tier floors, duplicate rollback, review-cycle
    invalidation, evidence verification, residual risk, direct SQL immutability,
    snapshot hash round-trip, idempotent release consumption, concurrent revisions,
    bounded independent risk acceptance, periodic revalidation and classified DFD
    boundaries, cross-scope creation denial, emergency self-approval denial, token
    revocation, evidence attestation replay, independent review/reapproval, immutable
    SLA dates and breach history, and concurrent replay-safe breach maintenance.
    The catalog lifecycle test additionally covers concurrent version creation,
    independent publication, central audit fingerprints, duplicate implementation keys,
    cross-model mapping denial, stale scope rejection, verification invalidation,
    secondary-threat requirement coverage, approval snapshots, SQL immutability,
    retirement and revision copying. The gate regression rejects stale-scope PASS
    records even when the implementation status claims VERIFIED. Threat authoring tests
    cover nullable persisted-field round trips, category/date/risk validation, stripped
    governance overrides, no-op saves, stale-version rejection, cross-scope/IDOR denial,
    shared-control invalidation, unchanged historical evidence, stale/fresh exceptions,
    before/after audit, two-control outbox fan-out, parallel edits, an edit/verification
    race, reviewer-author approval denial and direct SQL lineage/content guards.
    Copied lineage and approval snapshots are checked against the original revision.
    Architecture tests cover metadata-only preservation, optimistic/no-op/concurrent
    edits, cross-model/clearance denial, derived crossings, zone-change rollback,
    stale architecture-bound exceptions, protected version counters, referenced-object
    removal denial, audited unreferenced draft removal, confidentiality escalation without
    automatic downgrade, data-context outbox invalidation, re-screening/reverification,
    independent approval, immutable export hashes and faithful structural revision copies.
    Total: 47 targeted
    tests, including the integration parent test.
    Server TypeScript and scoped Threat Modeling client TypeScript checks
    passed. An attempted whole-project build failed in concurrently edited, unrelated
    `AliveTicketInspector.tsx`; that file was not changed here. Full suite, authenticated
    browser QA, live worker delivery and production deployment are not verified.
    The default operational-profile test setup hit hydration/pool timeouts on this
    continuation; the regression tests passed when hydrated from the isolated test DB.
    No operational configuration or running service was changed to make tests pass.
    A later isolated-test connection attempt timed out before the lifecycle suite started.
    PostgreSQL readiness was checked read-only; the standalone retry passed all 16 tests
    without restarting services or modifying connection configuration.
13. **Outstanding implementation and rollout work.** These are not declared complete:
    richer architecture component types/properties, typed encryption/authorization/
    integrity/hosting details beyond the existing schema, and extended threat attributes/
    analyst-disposition tooling;
    explicit historical lineage reconciliation and merge/split workflows (legacy roots
    remain intentionally uncorrelated);
    fully authoritative inventory scope FK migration and comprehensive access grants;
    AI provenance/disposition; expanded abuse/attack-tree tooling; material-change
    classification below generic CMDB `details`; finding-to-control assumption correlation
    and Cortex/SAST/SCA/DAST degradation; GitLab deployment adapter and automated
    emergency execution; retirement/legal-hold/disposal operations (retention
    metadata only exists); complete approval/exception escalation and renewal assessment;
    verified CBA/SSDF/ASVS/PCI catalog content and mapping governance; typed multi-source
    finding/commit/pipeline references beyond existing ticket/evidence links and an
    optional catalog reference URL; complete application
    coverage/compliance/SLA dashboards; richer artifact/report formats; all requested
    server filters/search; complete evidence storage encryption and download audit proof;
    and full end-to-end acceptance across the operational application. Some canonical
    attachment/scope authorization still relies on existing projections. The current
    patch is therefore **not a production-readiness or compliance certification**.

## Reproduction

```powershell
pnpm.cmd test:db --database bank_threat_integration_20260904 --migrate
pnpm.cmd test:db --database bank_threat_integration_20260904 --test src/tests/threat-governance-postgres.integration.test.ts
pnpm.cmd exec tsx --test src/tests/threat-architecture.test.ts src/tests/threat-authoring.test.ts src/tests/threat-emergency-policy.test.ts src/tests/threat-governance-policy.test.ts
# Process-scoped test target only; does not edit .env or operational configuration.
$env:DB_NAME='bank_threat_integration_20260904'
$env:DATABASE_URL=''
$env:DATABASE_URL_FILE=''
pnpm.cmd exec tsx --import ./src/tests/setup.ts --test --test-concurrency=1 src/tests/security-release-gate.test.ts src/tests/threat-model-workflow-template.test.ts src/tests/platform-scheduler.service.test.ts
pnpm.cmd exec tsc -p tsconfig.server.json --noEmit
```

The disposable runner validates the actual connected database name before writes.
No commit, push, Docker rebuild, service restart or production deployment was performed.
Unrelated concurrent UI edits were preserved.

## Standards-source boundary

The official [OWASP ASVS project](https://owasp.org/www-project-application-security-verification-standard/)
identifies the 5.0 release. Catalog entries remain explicit proposals and are not
automatically marked compliant. The supplied CBA clause interpretation needs validation
against the applicable official text by the bank compliance owner; no legal wording or
regulatory certification was inferred from the user brief.
