import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load .env file
dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  API_PREFIX: z.string().default('/api'),
  
  // Database Configuration
  DATABASE_URL: z.string().optional(),
  DB_TYPE: z.enum(['postgres', 'memory']).default('memory'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_NAME: z.string().default('bank_infosec_db'),
  DB_POOL_MIN: z.coerce.number().default(2),
  DB_POOL_MAX: z.coerce.number().default(20),
  DB_SSL: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  
  // Redis Cache Configuration
  REDIS_ENABLED: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_KEY_PREFIX: z.string().default('aegissec:'),
  REDIS_TTL_SECONDS: z.coerce.number().default(300),
  
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
  
  // Security & Cryptography
  JWT_SECRET: z.string().default('aegissec-super-secret-bank-enterprise-key-2026-replace-in-prod'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  SESSION_TIMEOUT_MINUTES: z.coerce.number().default(30),
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 mins
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(2000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(60), // 60 attempts per 15 min for auth

  // Bank LDAP / Active Directory Integration
  LDAP_ENABLED: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  LDAP_URL: z.string().default('ldaps://DC01.Expressbank.az:636'),
  LDAP_BASE_DN: z.string().default('DC=Expressbank,DC=az'),
  LDAP_DOMAIN: z.string().default('EXPRESSBANK.AZ'),
  
  // Logging & Observability
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ENABLE_METRICS: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(true),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const parsed = configSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Invalid application configuration:');
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    throw new Error('Invalid configuration parameters');
  }

  return parsed.data;
}

export const config = loadConfig();
