# Apex Bank International - Production Deployment & Runbook Guide

## 1. Quickstart: Local Production Stack with Docker Compose

To deploy the entire production stack (App + PostgreSQL 16 + Redis 7 + Nginx) on a host machine:

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
   cp .env.example .env
   ```

3. **Start the Production Topology**:
   ```bash
   docker compose up --build -d
   ```

4. **Verify Health**:
   ```bash
   # Check container status
   docker compose ps

   # Check liveness (via Nginx on 8080 or directly on 4000)
   curl http://localhost:8080/api/health
   curl http://localhost:4000/api/health

   # Check deep readiness (PostgreSQL + Redis + Storage)
   curl http://localhost:8080/api/health/ready
   curl http://localhost:4000/api/health/ready
   ```

5. **Access the Platform**:
   - Open your browser at `http://localhost:8080` (via Nginx Reverse Proxy) or `http://localhost:4000` (Direct App Server).

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

## 3. Kubernetes (EKS / GKE / AKS / On-Prem K8s) Deployment

### 1. Create Namespace & Secrets
```bash
kubectl create namespace bank-infosec

# Apply ConfigMap and Secrets
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
# App Logs (JSON format)
docker compose logs -f app

# PostgreSQL Logs
docker compose logs -f postgres

# Nginx Access & Error Logs
docker compose logs -f nginx
```
