# Universal Enterprise Work Orchestration

The platform now treats Workflow Catalog, Workflow Builder, and Quick Work Item as clients of one execution architecture:

`WorkflowDefinition → WorkflowVersion → WorkflowInstance → NodeInstance / WorkItem → ExecutionEvent`

A Quick Work Item launches the published `wf-standard-task` definition, whose executable graph contains one human work node between explicit start and success nodes. A catalog launch pins the published workflow, form, and policy versions. Publishing a later workflow version never mutates an existing instance.

## Existing architecture disposition

| Existing capability | Decision | Universal-platform treatment |
| --- | --- | --- |
| Canonical Ticket and lifecycle APIs | Keep | Tickets remain the ITSM/security record model. Universal `WorkItem` adds normalized human activity beneath workflow instances without breaking ticket APIs. |
| Bank users, departments, teams, LDAP state | Keep | Reused by assignment, approver resolution, RBAC, group queues, and lifecycle context. No parallel identity directory was introduced. |
| ApprovalService and immutable signature hashes | Extend | Reused for workflow approval nodes with ANY/ALL/MAJORITY/N-of-M/sequential/parallel policy, delegation, timeout/escalation, mandatory rejection comments, and requester self-approval prevention. |
| SLA policies and multi-clock ticket lifecycle | Extend | Universal policy sets resolve domain-aware priority, calendar, first-response/assignment/resolution clocks, or HR lifecycle targets. Requesters do not choose SLA policy. |
| CMDB applications/assets and ownership | Keep | Reused by service/application/CI owner routing, approvals, and form pickers. |
| AuditService | Extend | Existing audit remains for tickets; workflow runtime adds immutable, sequence-numbered, SHA-256 hash-linked `ExecutionEvent` records. |
| Backend-owned blueprints | Migrate compatibly | Legacy `/api/workflow-templates` remains available. New catalog templates reference normalized published workflow versions and launch durable workflow instances. |
| `GraphOrchestratorService.launchGraph` eager fan-out | Migrate | Retained for compatibility, but the universal runtime persists node readiness/waits/retries and never marks a launch complete merely because tickets were created. |
| `dependsOnTaskId` / Gantt dependencies | Keep as compatibility metadata | Primary workflow semantics now live on explicit, conditional `WorkflowEdgeDefinition` records. Preflight rejects cycles and broken references. |
| Static request forms | Migrate | `FormDefinition` and immutable `FormVersion` support sections, conditional visibility/required state, validation, typed pickers, tables, evidence, attachments, money, sensitive and hidden fields. |
| Cross-department launch controllers | Migrate | Reference onboarding/offboarding/access/deployment/security workflows use the same runtime rather than dedicated HR/IT execution paths. |
| Oversized Create Work modal | Remove as builder surface | The global shortcut remains a Quick Work Item modal. Catalog and Builder selections navigate to the immersive workflow workspace. |

## Runtime guarantees

- JSON development persistence stores normalized definitions, versions, instances, node instances, attempts, work items, and events; the worker resumes due instances after restart.
- PostgreSQL DDL contains queryable design-time and runtime tables. Immutable JSON snapshots supplement, rather than replace, normalized stages, nodes, edges, triggers, variables, instances, attempts, work items, and events.
- In-process instance locks plus optimistic version fields protect concurrent transitions. Runtime changes are wrapped in database transactions with rollback-on-error.
- Logical node completion keys prevent duplicate completion. External actions use stable idempotency keys and at-least-once-safe retry attempts with exponential backoff.
- Timers, approvals, subworkflows, retry waits, and human work persist independently of any browser session.
- Failure and cancellation compensation is configured on the node and recorded in the immutable execution timeline.
- Safe condition objects are evaluated by a governed expression interpreter; arbitrary JavaScript is not evaluated.

## API

- `GET /api/orchestration/catalog`
- `GET /api/orchestration/catalog/:id`
- `POST /api/orchestration/catalog/:id/launch`
- `GET /api/orchestration/request-types`
- `GET /api/orchestration/request-types/:id/form`
- `POST /api/orchestration/request-types/:id/validate`
- `POST /api/orchestration/quick-work`
- `GET /api/orchestration/instances`
- `GET /api/orchestration/instances/:id`
- `POST /api/orchestration/instances/:id/work-items/:workItemId/complete`
- `POST /api/orchestration/instances/:id/approvals/:chainId/decision`
- `POST /api/orchestration/instances/:id/advance`
- `POST /api/orchestration/instances/:id/cancel`
- `POST /api/orchestration/definitions/drafts`
- `GET|POST /api/orchestration/definitions/:id/preflight`
- `POST /api/orchestration/definitions/:id/simulate`
- `POST /api/orchestration/definitions/:id/versions/:version/publish`
- `GET /api/orchestration/analytics`

## Seeded governed catalog

The catalog ships with 18 executable workflows: Standard Task, Incident Response, Major Incident, Problem Investigation, Standard Change, Normal Production Change, Emergency Change, Software Feature Delivery, Production Deployment, Vulnerability Remediation, Access Request, Privileged Access Request, New Employee Onboarding, Employee Offboarding, Internal Transfer, Employee Promotion, Procurement Request, and Hardware Request.

The detailed reference workflows exercise conditions, parallel split/join, human tasks, information requests, dynamic approvals, date gates, integrations, retries, rollback/compensation, subworkflows, risk acceptance, legal hold, and machine-verifiable access revocation.

## Validation evidence

`src/tests/universal-orchestration.test.ts` proves:

- catalog and domain-specific form separation;
- Quick Work Item version pinning and idempotency;
- Dev workflow QA + Security join and independent high-risk approval;
- deployment retry after persistence reload, stable external idempotency, rollback, and one incident action;
- onboarding parallel preboarding and Day-One date gate;
- scheduled versus emergency offboarding, legal-hold cleanup suppression, and machine-verifiable access closure;
- mutation-free workflow simulation.
