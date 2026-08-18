# ==============================================================================
# Multi-Stage Enterprise Production Dockerfile
# Platform: Apex Bank International - InfoSec & GRC Platform
# Security Standards: Non-Root Execution, Minimal Attack Surface, OCI Compliant
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build & Compilation
# ------------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache libc6-compat python3 make g++

# Copy package manifests
COPY package.json package-lock.json ./

# Clean installation of dependencies
RUN npm ci

# Copy full application source
COPY . .

# Build Client (Vite Bundle) and Server (TypeScript compilation)
RUN npm run build

# Prune development dependencies for minimal production image
RUN npm prune --production

# ------------------------------------------------------------------------------
# Stage 2: Hardened Production Runner
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runner

# Set production environment
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

WORKDIR /app

# Security: Install dumb-init for proper PID 1 signal forwarding & curl for healthcheck
RUN apk add --no-cache dumb-init curl

# Create non-root dedicated application user & group (UID/GID 10001)
RUN addgroup -g 10001 -S appgroup && \
    adduser -u 10001 -S appuser -G appgroup

# Create persistent data and storage directories with strict permissions
RUN mkdir -p /app/data/storage && \
    chown -R appuser:appgroup /app

# Copy production assets from builder
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/package.json ./package.json
COPY --from=builder --chown=appuser:appgroup /app/src/server/db/postgres/schema.sql ./dist/server/db/postgres/schema.sql

# Switch to non-privileged user
USER appuser

# Expose backend API / Frontend HTTP port
EXPOSE 4000

# Docker Healthcheck Probe
HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4000/api/health || exit 1

# Process supervisor using dumb-init
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start production server
CMD ["node", "dist/server/index.js"]
