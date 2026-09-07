# Deferred delivery integration

Direct GitLab integration is deliberately **not configured**, per the user's instruction.
No GitLab project, token, webhook, runner, protected environment or pipeline was changed.
No deployment endpoint or pretend-success button is exposed.

`src/server/services/threat-delivery-contract.ts` defines the typed extension boundary.
The reference implementation is fail-closed without a registered adapter, before consuming
any authorization. Repository and pipeline references reject embedded credentials/query
tokens; commit identity must be a full hash. Metadata alone is not evidence of a trusted pipeline.

## Existing security API

1. `GET /api/threat-models/:id/release-gate` returns the current machine-readable gate.
2. `POST /api/threat-models/:id/release-authorization`, body `{releaseId}`, requires an
   authorized server-validated security identity and persists a short-lived authorization.
3. `POST /api/threat-models/:id/release-authorization/consume`, body
   `{releaseId, authorization, idempotencyKey}`, rechecks the live gate, exact revision,
   expiry and persisted single-consumption state. Its `deploymentExecuted: false` is intentional.

## Future adapter activation checklist

The integrator must implement `ThreatDeliveryAdapter`: independently verify provider identity,
repository ownership, full commit, protected ref, target environment and approved change;
map the automation principal through central authentication/RBAC; keep secrets in the
existing secret store; and implement durable idempotent execution receipts keyed by the
provided correlation key. Never trust a client-supplied `protected=true` flag.

`executeWithDeliveryAdapter` orders target verification, fresh authorization consumption and
adapter execution. The adapter must revalidate its target immediately before deployment,
handle a crash after consumption without duplicate deployment, and record real provider
receipts/failures. Tests currently use a stub only and are not live GitLab acceptance evidence.

Do not convert a successful gate or consumed token into a claim that production was deployed.
