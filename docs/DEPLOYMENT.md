# Apex Bank International - Production Deployment & Runbook Guide

## 1. Quickstart: Local Production Stack with Docker Compose

Read [PRODUCTION-READINESS.md](./PRODUCTION-READINESS.md) before promoting this topology. The local Compose stack is a release-validation environment; it is not evidence of HA, PITR, corporate secret-manager, WAF, or central-observability completion.

To deploy the modular-monolith topology (API + worker + scheduler + PostgreSQL + PgBouncer + Redis + RabbitMQ + ClamAV + Nginx) on a host machine:

### Prerequisites
- Docker Engine 24+ & Docker Compose v2+
- Git

### Deployment Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/unsalgasimli/bank-infosec-platform.git
   cd bank-infosec-platform
   ```

2. **Configure Environment**:
   ```bash
   cp .env.production.example .env
   ```

   Populate values through the bank-approved secrets mechanism. Production will refuse wildcard CORS, local attachment storage, disabled RabbitMQ, disabled malware scanning, a missing dedicated data-encryption key, or a missing bank-approved OTLP trace collector endpoint. The application accepts the standard `NAME_FILE` secret-volume form (for example `JWT_SECRET_FILE=/run/secrets/jwt_secret`) for its credential settings.

3. **Start the Production Topology**:
   ```bash
   docker compose up --build -d
   ```

4. **Verify Health**:
   ```bash
   # Check container status
   docker compose ps

   # Check liveness (via Nginx on 8080 or the localhost-only API listener)
   curl http://localhost:8080/api/health
   curl http://localhost:8080/api/health/live
   curl http://localhost:4000/api/health

   # Check deep readiness (PgBouncer/PostgreSQL + Redis + RabbitMQ + storage + ClamAV)
   curl http://localhost:8080/api/health/ready
   curl http://localhost:4000/api/health/ready
   ```

5. **Access the Platform**:
   - Open the browser through the WAF/LB or Nginx listener. The API listener is localhost-only for break-glass diagnostics.

6. **Optional local metrics profile**:
   ```bash
   docker compose --profile observability up -d
   ```
   Grafana binds to localhost by default and has a provisioned Prometheus datasource. OTLP traces are not sent to this local profile: `OTEL_EXPORTER_OTLP_ENDPOINT` must point to the approved bank collector.

---

## 2. Database Migrations & Seeding

The PostgreSQL container automatically runs the schema DDL on initial startup via `/docker-entrypoint-initdb.d/01_schema.sql`.

To manually migrate or seed a standalone PostgreSQL instance:

```bash
# Run schema migration DDL
npm run db:migrate

# Seed sample banking data
npm run db:seed
```

---

## 3. Kubernetes reference manifests (not the production rollout plan)

The current bank deployment topology is the hardened multi-role Compose/VM model above. The Kubernetes directory is a reference only and must be extended with the same dedicated worker, scheduler, RabbitMQ, PgBouncer, ClamAV, HA database, and monitoring topology before it is used for production.

### 1. Create Namespace & Secrets
```bash
kubectl create namespace bank-infosec

# Apply ConfigMap and ExternalSecret. `deploy/k8s/secret.yaml` contains no
# credential values; it requires the bank-managed External Secrets controller
# and a `bank-vault` ClusterSecretStore to create `aegissec-secrets`.
kubectl apply -f deploy/k8s/configmap.yaml
kubectl apply -f deploy/k8s/secret.yaml
```

### 2. Deploy Infrastructure Services
```bash
# Deploy PostgreSQL StatefulSet & Service
kubectl apply -f deploy/k8s/postgres.yaml

# Deploy Redis Deployment & Service
kubectl apply -f deploy/k8s/redis.yaml
```

### 3. Deploy Application Tier & Ingress
```bash
# Deploy Application Pods & ClusterIP Service
kubectl apply -f deploy/k8s/app-deployment.yaml

# Deploy Horizontal Pod Autoscaler
kubectl apply -f deploy/k8s/hpa.yaml

# Deploy the HTTP ingress
kubectl apply -f deploy/k8s/ingress.yaml
```

---

## 4. Production Security Checklist

| Check | Requirement | Status / Verification |
|---|---|---|
| **Non-Root Container** | App runs under UID 10001 (`appuser`) | Enforced in `Dockerfile` & `app-deployment.yaml` |
| **HTTP transport** | Application is served over HTTP only | Enforced by the Vite, Nginx, and Kubernetes ingress configuration |
| **Database Encryption** | PostgreSQL data volume encrypted with LUKS / KMS | Cloud EBS / PVC Encryption |
| **Object Storage** | S3 bucket encrypted with AWS KMS (`aws:kms`) | Configured in `storage.service.ts` |
| **Rate Limiting** | Strict limit on authentication endpoints | Configured in `rate-limit.middleware.ts` |
| **Tamper-Evident Audit** | Cryptographic hash on forensic attachments | SHA-256 integrity in `storage.service.ts` |
| **Vulnerability Scanning** | CI pipeline scans image before publishing | Configured with Trivy in `ci-cd.yml` |

---

## 5. Monitoring & Operational Troubleshooting

### Key Endpoints
- **Liveness Probe**: `GET /api/health`
- **Readiness Probe**: `GET /api/health/ready`
- **Prometheus Telemetry**: `GET /api/metrics?format=prometheus`

### Log Inspection
```bash
# API Logs (JSON format)
docker compose logs -f app

# Dedicated async roles
docker compose logs -f worker scheduler

# Outbox and broker
docker compose logs -f rabbitmq pgbouncer clamav

# PostgreSQL Logs
docker compose logs -f postgres

# Nginx Access & Error Logs
docker compose logs -f nginx
```
