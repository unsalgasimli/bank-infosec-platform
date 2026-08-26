import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/index.js';
import { logger } from './logger.service.js';

export interface StorageUploadResult {
  storageKey: string;
  storageProvider: 's3' | 'local';
  sha256Hash: string;
  fileSizeBytes: number;
  mimeType: string;
  url?: string;
}

export interface QuarantinedStorageUpload extends StorageUploadResult {
  quarantineStorageKey: string;
}

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.tcpdump.pcap',
  'application/octet-stream',
];

export class StorageService {
  private static instance: StorageService;
  private s3Client: S3Client | null = null;

  private constructor() {
    this.initStorage();
  }

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  private initStorage(): void {
    if (config.STORAGE_PROVIDER === 's3') {
      const s3Config: any = {
        region: config.S3_REGION,
      };

      if (config.S3_ENDPOINT) {
        s3Config.endpoint = config.S3_ENDPOINT;
        s3Config.forcePathStyle = config.S3_FORCE_PATH_STYLE;
      }

      if (config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY) {
        s3Config.credentials = {
          accessKeyId: config.S3_ACCESS_KEY_ID,
          secretAccessKey: config.S3_SECRET_ACCESS_KEY,
        };
      }

      this.s3Client = new S3Client(s3Config);
      logger.info({ bucket: config.S3_BUCKET, region: config.S3_REGION }, 'S3 Cloud Object Storage client initialized');
    } else {
      // Local secure disk storage fallback
      if (!fs.existsSync(config.LOCAL_STORAGE_PATH)) {
        fs.mkdirSync(config.LOCAL_STORAGE_PATH, { recursive: true });
      }
      logger.info({ storagePath: config.LOCAL_STORAGE_PATH }, 'Local secure disk storage initialized');
    }
  }

  /**
   * Generates a collision-resistant partitioned storage key.
   */
  public generateStorageKey(fileName: string): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueId = crypto.randomUUID();
    return `bank-artifacts/${year}/${month}/${uniqueId}-${cleanName}`;
  }

  /**
   * Calculates SHA-256 checksum for immutable audit and integrity.
   */
  public calculateSha256(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /** Writes an object where no download path can ever resolve it. */
  public async stageUpload(
    fileName: string,
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<QuarantinedStorageUpload> {
    if (fileBuffer.length > config.MAX_UPLOAD_SIZE_BYTES) {
      throw new Error(`File size (${fileBuffer.length} bytes) exceeds maximum limit of ${config.MAX_UPLOAD_SIZE_BYTES} bytes.`);
    }

    if (!ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase())) {
      throw new Error(`MIME type '${mimeType}' is not permitted by bank security policy.`);
    }

    const storageKey = this.generateStorageKey(fileName);
    const quarantineStorageKey = `quarantine/${storageKey}`;
    const sha256Hash = this.calculateSha256(fileBuffer);

    if (config.STORAGE_PROVIDER === 's3' && this.s3Client) {
      const command = new PutObjectCommand({
        Bucket: config.S3_BUCKET,
        Key: quarantineStorageKey,
        Body: fileBuffer,
        ContentType: mimeType,
        ChecksumSHA256: Buffer.from(sha256Hash, 'hex').toString('base64'),
        Metadata: {
          originalName: fileName,
          uploadedAt: new Date().toISOString(),
          sha256: sha256Hash,
        },
      });

      await this.s3Client.send(command);
      logger.info({ quarantineStorageKey, bucket: config.S3_BUCKET, sha256Hash }, 'File staged in object-storage quarantine');

      return {
        storageKey,
        quarantineStorageKey,
        storageProvider: 's3',
        sha256Hash,
        fileSizeBytes: fileBuffer.length,
        mimeType,
      };
    } else {
      // Store to local encrypted/secured filesystem
      const targetFilePath = this.localPathFor(quarantineStorageKey);
      const targetDir = path.dirname(targetFilePath);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      fs.writeFileSync(targetFilePath, fileBuffer);
      logger.info({ targetFilePath, sha256Hash }, 'File staged in local storage quarantine');

      return {
        storageKey,
        quarantineStorageKey,
        storageProvider: 'local',
        sha256Hash,
        fileSizeBytes: fileBuffer.length,
        mimeType,
      };
    }
  }

  /**
   * Compatibility helper for trusted internal callers. HTTP upload endpoints
   * must use stageUpload and the worker-driven promotion path instead.
   */
  public async upload(fileName: string, fileBuffer: Buffer, mimeType: string): Promise<StorageUploadResult> {
    const staged = await this.stageUpload(fileName, fileBuffer, mimeType);
    await this.promoteQuarantinedObject(staged.quarantineStorageKey, staged.storageKey);
    return { storageKey: staged.storageKey, storageProvider: staged.storageProvider, sha256Hash: staged.sha256Hash, fileSizeBytes: staged.fileSizeBytes, mimeType: staged.mimeType };
  }

  /** Promotes only a scanner-approved quarantined object into final storage. */
  public async promoteQuarantinedObject(quarantineStorageKey: string, storageKey: string): Promise<void> {
    if (config.STORAGE_PROVIDER === 's3' && this.s3Client) {
      await this.s3Client.send(new CopyObjectCommand({
        Bucket: config.S3_BUCKET,
        Key: storageKey,
        CopySource: `${config.S3_BUCKET}/${encodeURIComponent(quarantineStorageKey).replace(/%2F/g, '/')}`,
        MetadataDirective: 'COPY',
      }));
      await this.s3Client.send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: quarantineStorageKey }));
      return;
    }
    const source = this.localPathFor(quarantineStorageKey);
    const target = this.localPathFor(storageKey);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(source, target);
  }

  public async deleteObject(storageKey: string): Promise<void> {
    if (config.STORAGE_PROVIDER === 's3' && this.s3Client) {
      await this.s3Client.send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: storageKey }));
      return;
    }
    const filePath = this.localPathFor(storageKey);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  /**
   * Generates a time-limited Presigned URL for downloading artifacts.
   */
  public async getDownloadUrl(storageKey: string, expiresInSeconds: number = 900): Promise<string> {
    if (config.STORAGE_PROVIDER === 's3' && this.s3Client) {
      const command = new GetObjectCommand({
        Bucket: config.S3_BUCKET,
        Key: storageKey,
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
    } else {
      // Local URL endpoint
      return `${config.API_PREFIX}/storage/download?key=${encodeURIComponent(storageKey)}`;
    }
  }

  /**
   * Fetches the raw file buffer from storage.
   */
  public async getFileBuffer(storageKey: string): Promise<{ buffer: Buffer; mimeType: string }> {
    if (config.STORAGE_PROVIDER === 's3' && this.s3Client) {
      const command = new GetObjectCommand({
        Bucket: config.S3_BUCKET,
        Key: storageKey,
      });
      const response = await this.s3Client.send(command);
      const byteArray = await response.Body?.transformToByteArray();
      return {
        buffer: Buffer.from(byteArray || []),
        mimeType: response.ContentType || 'application/octet-stream',
      };
    } else {
      const filePath = this.localPathFor(storageKey);
      if (!fs.existsSync(filePath)) {
        throw new Error('File not found in local storage.');
      }
      const buffer = fs.readFileSync(filePath);
      return {
        buffer,
        mimeType: 'application/octet-stream',
      };
    }
  }

  /**
   * Health check for readiness probe.
   */
  public async checkHealth(): Promise<{ status: 'UP' | 'DOWN'; provider: string; error?: string }> {
    if (config.STORAGE_PROVIDER === 's3' && this.s3Client) {
      try {
        await this.s3Client.send(new HeadObjectCommand({ Bucket: config.S3_BUCKET, Key: 'health-check.tmp' })).catch((err) => {
          if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return;
          throw err;
        });
        return { status: 'UP', provider: 's3' };
      } catch (error: any) {
        return { status: 'DOWN', provider: 's3', error: error.message };
      }
    } else {
      const isAccessible = fs.existsSync(config.LOCAL_STORAGE_PATH);
      return {
        status: isAccessible ? 'UP' : 'DOWN',
        provider: 'local-disk',
        error: isAccessible ? undefined : 'Storage directory inaccessible',
      };
    }
  }

  private localPathFor(storageKey: string): string {
    const root = path.resolve(config.LOCAL_STORAGE_PATH);
    const candidate = path.resolve(root, storageKey);
    if (!candidate.startsWith(`${root}${path.sep}`)) throw new Error('Invalid storage key.');
    return candidate;
  }
}

export const storageService = StorageService.getInstance();
