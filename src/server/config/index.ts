import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';

// Load .env file
dotenv.config();

// Docker/Kubernetes secret volumes and most secret-manager injectors expose
// values as files. Support the standard NAME_FILE convention without ever
// copying a production credential into a repository-managed environment file.
const fileBackedSecrets = [
  'DATABASE_URL', 'DB_PASSWORD', 'REDIS_URL', 'REDIS_PASSWORD',
  'RABBITMQ_URL', 'JWT_SECRET', 'DATA_ENCRYPTION_KEY',
  'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'LDAP_BIND_PASSWORD',
] as const;

for (const key of fileBackedSecrets) {
  const filePath = process.env[`${key}_FILE`];
  if (!filePath) continue;
  if (process.env[key]) throw new Error(`${key} and ${key}_FILE cannot both be set.`);
  const value = fs.readFileSync(filePath, 'utf8').replace(/\r?\n$/, '');
  if (!value) throw new Error(`${key}_FILE points to an empty secret file.`);
  process.env[key] = value;
}

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  API_PREFIX: z.string().default('/api'),
  
  // Database Configuration
  DATABASE_URL: z.string().optional(),
  // PostgreSQL is the only durable runtime store. `memory` remains available
  // only for isolated unit-test processes that do not start the server.
  DB_TYPE: z.enum(['postgres', 'memory']).default('postgres'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_NAME: z.string().default('bank_infosec_db'),
  DB_POOL_MIN: z.coerce.number().default(2),
  DB_POOL_MAX: z.coerce.number().default(20),
  DB_SSL: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(30000),
  DB_LOCK_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(5000),
  
  // Redis Cache Configuration
  REDIS_ENABLED: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_KEY_PREFIX: z.string().default('aegissec:'),
  REDIS_TTL_SECONDS: z.coerce.number().default(300),

  // Durable asynchronous processing. PostgreSQL remains authoritative; the
  // broker only distributes events written through the transactional outbox.
  RABBITMQ_ENABLED: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  RABBITMQ_URL: z.string().default('amqp://localhost:5672'),
  RABBITMQ_EXCHANGE: z.string().default('aegissec.events'),
  OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().min(250).max(60000).default(1000),
  OUTBOX_RELAY_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
  SLA_SCHEDULER_INTERVAL_MS: z.coerce.number().int().min(30000).max(3600000).default(60000),
  
  // Object Storage Configuration (Cloud S3 / Local Disk - No MinIO)
  STORAGE_PROVIDER: z.enum(['s3', 'local']).default('local'),
  S3_BUCKET: z.string().default('apex-bank-infosec-artifacts'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT: z.string().optional(), // For custom S3-compatible cloud endpoints
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  LOCAL_STORAGE_PATH: z.string().default(path.resolve(process.cwd(), 'data', 'storage')),
  MAX_UPLOAD_SIZE_BYTES: z.coerce.number().default(25 * 1024 * 1024), // 25 MB

  // Attachment bytes are quarantined first. The worker promotes an object to
  // its final key only after a malware scanner reports it clean.
  MALWARE_SCAN_ENABLED: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  CLAMAV_HOST: z.string().default('localhost'),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
  CLAMAV_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  
  // Security & Cryptography
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be supplied through the environment.'),
  // Dedicated application-layer data-encryption key. Supply a separate
  // 32-byte-or-longer secret in every deployed environment; JWT_SECRET is a
  // backwards-compatible local-development fallback only.
  DATA_ENCRYPTION_KEY: z.string().min(32).optional(),
  JWT_EXPIRES_IN: z.string().default('8h'),
  SESSION_TIMEOUT_MINUTES: z.coerce.number().default(30),
  SESSION_ABSOLUTE_TIMEOUT_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(168),
  // Never enable outside an explicitly marked local-development environment.
  DEV_EMPTY_PASSWORD_LOGIN_ENABLED: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  CORS_ORIGIN: z.string().default('*'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 mins
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(2000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(60), // 60 attempts per 15 min for auth

  // Bank LDAP / Active Directory Integration
  LDAP_ENABLED: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  LDAP_URL: z.string().default(''),
  LDAP_BASE_DN: z.string().default(''),
  LDAP_USER_SEARCH_BASE: z.string().default(''),
  LDAP_DOMAIN: z.string().default(''),
  LDAP_BIND_USER: z.string().optional(),
  LDAP_BIND_PASSWORD: z.string().optional(),
  LDAP_TLS_REJECT_UNAUTHORIZED: z.preprocess((val) => val === 'true' || val === true || val === undefined, z.boolean()).default(true),
  LDAP_CA_CERT_PATH: z.string().optional(),
  LDAP_SYNC_TIME_GMT4: z.string().default('13:30'),
  LDAP_SYNC_TIMEZONE: z.string().default('Asia/Baku'),
  LDAP_SYNC_AUTO_ENABLED: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(true),
  
  // Logging & Observability
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ENABLE_METRICS: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(true),
  OTEL_TRACES_ENABLED: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().min(1).max(128).default('aegissec-platform'),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const parsed = configSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Invalid application configuration:');
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    throw new Error('Invalid configuration parameters');
  }

  if (parsed.data.NODE_ENV === 'production' && parsed.data.CORS_ORIGIN.trim() === '*') {
    throw new Error('CORS_ORIGIN must list explicit trusted origins in production.');
  }
  if (parsed.data.NODE_ENV === 'production' && !parsed.data.RABBITMQ_ENABLED) {
    throw new Error('RABBITMQ_ENABLED must be true in production so asynchronous work is durable.');
  }
  if (parsed.data.NODE_ENV === 'production' && !parsed.data.MALWARE_SCAN_ENABLED) {
    throw new Error('MALWARE_SCAN_ENABLED must be true in production; attachments cannot bypass quarantine.');
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.STORAGE_PROVIDER !== 's3') {
    throw new Error('STORAGE_PROVIDER must be s3 in production; local disk is not an attachment authority.');
  }
  if (parsed.data.NODE_ENV === 'production' && !parsed.data.DATA_ENCRYPTION_KEY) {
    throw new Error('DATA_ENCRYPTION_KEY must be supplied separately in production; JWT_SECRET must not double as an encryption key.');
  }
  if (parsed.data.OTEL_TRACES_ENABLED && !parsed.data.OTEL_EXPORTER_OTLP_ENDPOINT) {
    throw new Error('OTEL_EXPORTER_OTLP_ENDPOINT is required when OTEL_TRACES_ENABLED=true.');
  }
  if (parsed.data.NODE_ENV === 'production' && !parsed.data.OTEL_TRACES_ENABLED) {
    throw new Error('OTEL_TRACES_ENABLED must be true in production; send traces to the bank-approved collector.');
  }

  return parsed.data;
}

export const config = loadConfig();
