# Enterprise Ticket Management

The AegisSec ticket engine uses one canonical `Ticket` record for incidents, service requests, problems, changes, security incidents, access requests, vulnerabilities, and custom work. Request types remain user-facing catalog definitions; ticket type and workflow remain process definitions.

## Core invariants

- Status describes where work is in the workflow. Resolution describes its outcome. Resolving requires both `resolutionCode` and `resolutionSummary`; closing is a separate transition.
- Business priority is deterministic: impact and urgency are scored through the central priority matrix. A caller cannot bypass workflow by patching status or resolution fields directly.
- Reporter, requester, assignee, assignment group, owner, participants, and watchers are distinct fields.
- Public comments and internal security notes are separate authorization domains. A requester cannot create an internal note or escalate confidentiality through the generic update endpoint.
- Every lifecycle mutation creates an audit entry. Ticket updates use optimistic concurrency through `version`.
- AI analysis creates a versioned recommendation with confidence, evidence, risk signals, and missing fields. It never changes the ticket until an authorized human sends explicit confirmation.

## Lifecycle resources

Each ticket can expose the following resources through its detail response and `/api/tickets/:id/lifecycle`:

- independent acknowledgment, first-response, assignment, remediation, resolution, and incident-containment SLA clocks;
- dependency-aware tasks;
- typed relationships between incidents, problems, changes, duplicates, and parent/child work;
- agent worklogs with activity type and duration;
- one requester CSAT response after resolution or closure;
- advisory AI recommendations and their review state.

The lifecycle tab in the ticket detail UI displays SLA clocks, tasks, worklogs, relationships, and the human-confirmed advisory flow.

## Workflow

The default version 2 workflow includes active work, customer/vendor waits, approval waits, review, resolved, closed, cancelled, and reopen paths. Wait states pause SLA instances. Resolution transitions validate required fields server-side, regardless of UI behavior.

Approval chains support `ANY_ONE`, `ALL`, `MAJORITY`, `SEQUENTIAL`, and `PARALLEL` modes. Sequential chains reject out-of-order decisions; quorum modes calculate their terminal state from approved, rejected, and pending counts.

## Dynamic request forms

Forms support text, textarea, numeric, date/time, select, multi-select, radio, checkbox, user, group, asset, service, IP, URL, email, file, risk, confidential, calculated, and hidden fields. Conditional visibility and server-side validation run before ticket creation. Unknown values are not copied into the normalized submission.

## API surface

```text
GET    /api/tickets/:id/lifecycle
POST   /api/tickets/:id/relationships
POST   /api/tickets/:id/merge
POST   /api/tickets/:id/tasks
PATCH  /api/tickets/:id/tasks/:taskId
POST   /api/tickets/:id/worklogs
POST   /api/tickets/:id/satisfaction
POST   /api/tickets/:id/ai-analysis
POST   /api/tickets/:id/ai-recommendations/:recommendationId/apply
```

Existing create, update, transition, comment, bulk, approval, search, queue, automation, CMDB, knowledge-base, storage, dashboard, and scanner-ingestion APIs remain in place.

## Persistence

The development adapter backfills new lifecycle collections when it loads an older JSON database. PostgreSQL DDL includes additive ticket columns plus normalized relationship, task, worklog, SLA-instance, satisfaction, and AI-recommendation tables with foreign keys, uniqueness rules, and indexes.

## Verification

`src/tests/ticket-lifecycle.test.ts` covers priority calculation, intake normalization, multiple SLA clocks, task dependencies, approval quorum behavior, mandatory resolution, requester mutation restrictions, and advisory-only AI. The complete test runner is serialized and restores the original JSON database after every test file.
