# Backend-owned Create Work workflows

The Create Work modal is a client of the workflow-template service. The browser does not contain assignment, department, SLA, category, or template business rules.

## API

- `GET /api/workflow-templates` returns active persisted templates.
- `GET /api/workflow-templates/metadata` returns live departments, teams, active users, workflows, SLA policies, categories, severities, priorities, and project codes.
- `GET /api/workflow-templates/:id/preview` validates the dependency graph and resolves every route without writing tickets.
- `POST /api/workflow-templates/:id/launch` accepts template parameters and an idempotency key.
- `POST /api/workflow-templates/custom/launch` validates and launches an administrator-authored graph. It requires workflow-designer privileges.
- `GET /api/workflow-runs` returns launch history; administrators see all runs and other users see only their own runs.

The legacy `/api/blueprints` read and launch routes remain aliases for existing clients.

## Launch invariants

Before any ticket is written, the service validates:

1. required template parameters;
2. unique task IDs and references;
3. absence of dependency cycles;
4. active departments and valid department/team relationships;
5. explicit assignees are active and belong to the routed department/team;
6. an active workflow with an initial state and a valid SLA policy exist.

There is no arbitrary-user fallback. Assignment resolution is explicit assignee, exact configured role, team lead, department default assignee, then department manager. A configured but invalid explicit assignee or role is rejected instead of silently rerouted.

Each successful launch creates a `WorkflowRun`, unique ticket keys, SLA metric instances, audit events, and finish-to-start dependency edges. Reusing the same idempotency key for the same actor returns the original run and does not duplicate tickets.

## Persistence

JSON persistence stores `blueprints` and `workflowRuns` for the local runtime. PostgreSQL DDL provides normalized `workflow_templates` and `workflow_runs` tables with foreign keys, versioning, activation state, JSON task definitions, and per-actor idempotency uniqueness.
