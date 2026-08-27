import crypto from 'node:crypto';
import { config } from '../config/index.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

function dataProtectionKey(): string {
  return config.DATA_ENCRYPTION_KEY || config.JWT_SECRET;
}

/**
 * Derives a cryptographic key using PBKDF2 from the server master secret and unique salt
 */
function deriveKey(secret: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(secret, salt, 100000, KEY_LENGTH, 'sha256');
}

/**
 * Encrypts plaintext string using authenticated AES-256-GCM
 */
export function encryptSecret(plaintext: string, masterKey = dataProtectionKey()): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(masterKey, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: salt:iv:authTag:ciphertext (base64url)
  return [
    salt.toString('base64url'),
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

/**
 * Decrypts ciphertext string using authenticated AES-256-GCM
 */
export function decryptSecret(encryptedPayload: string, masterKey = dataProtectionKey()): string {
  const parts = encryptedPayload.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted payload format');
  }

  const [saltB64, ivB64, authTagB64, cipherB64] = parts;
  const salt = Buffer.from(saltB64, 'base64url');
  const iv = Buffer.from(ivB64, 'base64url');
  const authTag = Buffer.from(authTagB64, 'base64url');
  const ciphertext = Buffer.from(cipherB64, 'base64url');

  const key = deriveKey(masterKey, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Returns a constant redaction marker for credentials.
 * Never reveal prefixes, suffixes, length, or any other password-derived data.
 */
export function maskSecret(secret?: string): string {
  return secret ? '[REDACTED]' : '[EMPTY]';
}

/**
 * Automatically decrypts secret if prefixed with "enc:", otherwise returns string as-is
 */
export function resolveSecret(rawSecret?: string, masterKey = dataProtectionKey()): string {
  if (!rawSecret) return '';
  const trimmed = rawSecret.trim();
  if (trimmed.startsWith('enc:')) {
    try {
      return decryptSecret(trimmed.slice(4), masterKey);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

/** A keyed, non-reversible lookup value for encrypted identity attributes. */
export function identityLookupHash(value: string): string {
  return crypto
    .createHmac('sha256', dataProtectionKey())
    .update(value.trim().toLowerCase(), 'utf8')
    .digest('base64url');
}
