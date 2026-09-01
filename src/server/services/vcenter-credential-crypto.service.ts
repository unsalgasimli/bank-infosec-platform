import crypto from 'node:crypto';
import { config } from '../config/index.js';

export type VCenterCredential = { username: string; password: string };
export type EncryptedVCenterCredential = { credentialCiphertext: string; credentialIv: string; credentialAuthTag: string; credentialKeyVersion: string };

function keyMaterial(): Buffer {
  const configured = config.VCENTER_CREDENTIAL_KEK;
  if (!configured) throw Object.assign(new Error('VCENTER_CREDENTIAL_KEK is not configured; vCenter credentials cannot be stored or read.'), { code: 'VCENTER_CONFIG_INVALID', statusCode: 503 });
  // Derive a fixed AES-256 key without depending on a particular secret encoding.
  return crypto.createHash('sha256').update(configured, 'utf8').digest();
}

export class VCenterCredentialCryptoService {
  public static encrypt(credential: VCenterCredential): EncryptedVCenterCredential {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyMaterial(), iv);
    const plaintext = Buffer.from(JSON.stringify(credential), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { credentialCiphertext: ciphertext.toString('base64'), credentialIv: iv.toString('base64'), credentialAuthTag: cipher.getAuthTag().toString('base64'), credentialKeyVersion: 'v1' };
  }

  public static decrypt(value: EncryptedVCenterCredential): VCenterCredential {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', keyMaterial(), Buffer.from(value.credentialIv, 'base64'));
      decipher.setAuthTag(Buffer.from(value.credentialAuthTag, 'base64'));
      const raw = Buffer.concat([decipher.update(Buffer.from(value.credentialCiphertext, 'base64')), decipher.final()]);
      const parsed = JSON.parse(raw.toString('utf8'));
      if (!parsed || typeof parsed.username !== 'string' || typeof parsed.password !== 'string' || !parsed.username || !parsed.password) throw new Error('invalid credential payload');
      return { username: parsed.username, password: parsed.password };
    } catch {
      throw Object.assign(new Error('Stored vCenter credential cannot be decrypted.'), { code: 'VCENTER_CONFIG_INVALID' });
    }
  }
}
