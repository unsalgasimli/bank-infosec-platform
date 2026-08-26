# Modular-monolith runtime boundary

The platform remains one backend codebase and one PostgreSQL-authoritative domain model. It no longer starts background execution in API replicas.

```
browser/WAF -> nginx -> API
                       |
              PostgreSQL transaction
                 |- ticket/audit/domain rows
                 `- outbox_events
                       |
                 worker relay -> RabbitMQ -> general worker
                                           |- automation
                                           |- workflow trigger/runtime
                                           `- in-app notification

scheduler -> LDAP and timed workflow triggers
```

`ticket.created` is the first migrated event. The API writes only its ticket, audit evidence, and outbox record, then returns after that transaction is flushed. The worker reloads the committed PostgreSQL projection, performs the side effects, and records an `event_consumer_receipt`. Workflow trigger IDs and in-app notification IDs derive from the outbox event, so RabbitMQ redelivery is safe.

Run roles from the same immutable image:

```text
API        node dist/server/index.js
Worker     node dist/server/worker.js
Scheduler  node dist/server/scheduler.js
```

`docker-compose.yml` starts all three roles together with RabbitMQ. It deliberately requires deployment-provided secrets rather than embedding passwords in Compose. PostgreSQL is pinned to `16.9-alpine`: upgrading a pre-existing 16 volume to a different major must be a separately approved `pg_upgrade`/PITR-tested operation.

## Current boundary and next rollout

Implemented now: API/worker/scheduler separation, PgBouncer transaction pooling, transactional outbox, RabbitMQ durable delivery with dead-letter queues, consumer receipts, quarantine-first attachment handling, broker/scanner-aware readiness, and proxy request-ID/health routing.

Prometheus and Grafana are available through the `observability` Compose profile. Prometheus scrapes the internal API metrics endpoint; Grafana receives a provisioned non-anonymous Prometheus datasource. The dashboard listener is restricted to localhost by default. Production uses the existing S3-compatible storage contract; the Compose topology passes S3 endpoint and credential references through instead of forcing local disk storage. Scanner-unavailable jobs use a 30-second bounded retry queue (five retries) before dead-lettering; malware-positive attachments remain quarantined.

Not yet implemented: HA/PITR/WAL backup automation, OpenTelemetry collector/central logs, and multi-node deployment. Those require bank infrastructure credentials, retention policy, and operations ownership; they must not be represented as local Compose mocks.
