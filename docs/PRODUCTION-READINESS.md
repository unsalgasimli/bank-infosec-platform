# Production readiness gate

This document distinguishes verified repository work from infrastructure work
that must be owned and evidenced by the bank operations team. A successful
image build or `docker compose config` is not production deployment proof.

## Verified in this workspace

| Capability | Evidence |
| --- | --- |
| API / worker / scheduler separation | One immutable image has `start:api`, `start:worker`, and `start:scheduler` role commands. API startup has no background job loop. |
| Durable ticket, attachment, AI, SLA, and workflow work | PostgreSQL `outbox_events`, transactional projection persistence, RabbitMQ publisher confirms, consumer receipts, retry queue, and dead-letter queue. |
| Broker relay | An isolated PostgreSQL + RabbitMQ test migrated the schema, relayed one event, observed `PUBLISHED`, and observed one durable `aegissec.worker` message. A repeated consumer call left exactly one receipt. |
| PgBouncer | An isolated PostgreSQL 16 + PgBouncer SCRAM test executed `SELECT 1` through transaction pooling. |
| File safety | HTTP uploads are quarantined, unavailable scanner jobs retry, and downloads require `CLEAN` scan status. |
| Health, edge, and tracing | `/api/health/live`, strict `/api/health/ready`, Prometheus output, Nginx syntax, Compose interpolation, and OTLP trace-export configuration for API/worker/scheduler were checked locally. |
| Secrets | Literal Kubernetes credentials were removed. The ExternalSecret manifest references a bank Vault store; application settings accept `NAME_FILE` secret volumes and production requires a separate data-encryption key. |

## Required before production deployment

1. Provision a private S3-compatible evidence bucket with KMS encryption,
   versioning/retention, least-privilege workload identity, and a tested
   quarantine/final-object lifecycle. Set `STORAGE_PROVIDER=s3` only after
   this exists.
2. Populate the bank secret manager and configure the real `bank-vault`
   `ClusterSecretStore` (or an equivalent approved injector). Never place
   values in `.env`, Compose, Kubernetes YAML, image layers, or CI logs.
3. Deploy PostgreSQL primary/standby on encrypted storage. Configure WAL
   archiving, backup retention, off-host copies, and a documented PITR restore
   drill. The local single-PostgreSQL Compose service is not HA.
4. Deploy Redis Sentinel/cluster and RabbitMQ HA/quorum queues on private
   network segments. The local Compose services are single-node development
   topology only.
5. Run at least two API nodes and the needed worker replicas behind the
   corporate WAF/load balancer with TLS termination, network policy, request
   size/timeout controls, and tested client-IP forwarding.
6. Connect structured logs and traces to the approved central observability
   backend, set alerts for readiness failure, outbox backlog, DLQ depth,
   PgBouncer saturation, backup age, and malware-scanner availability.
7. Run the deployment verification below in the target environment and retain
   its output with the release record.

The read-only health/metrics portion is automated:

```bash
AEGIS_RELEASE_URL=https://aegissec.bank.internal npm run verify:release
```

It refuses non-HTTPS endpoints unless `ALLOW_INSECURE_LOCAL_RELEASE_PROBE=true`
is explicitly set for an isolated local test. It does not replace the
controlled state-changing, failover, malware, or PITR drills below.

## Deployment verification

```text
1. Apply migration and verify schema_migrations plus outbox_events indexes.
2. Start API, worker, and scheduler from the same release image.
3. Confirm /api/health/live is 200 and /api/health/ready is 200 through the LB.
4. Create a test ticket; prove its outbox row is PUBLISHED and its worker receipt exists.
5. Upload an EICAR test artifact; prove it cannot be downloaded and remains quarantined.
6. Upload a clean approved test artifact; prove it becomes CLEAN and is promoted.
7. Stop a worker briefly; prove events remain in outbox/RabbitMQ and resume safely.
8. Force a retryable scanner outage; prove bounded retry then DLQ alerting.
9. Execute a restore into an isolated environment from the latest PITR backup.
10. Capture WAF, TLS, backup, monitoring, and alert evidence in the change record.
```
