import assert from 'node:assert';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../server/db/database.js';
import { initialSeedData } from '../server/db/seed.js';
import { StorageController } from '../server/controllers/storage.controller.js';
import { storageService } from '../server/services/storage.service.js';

const response = () => {
  let statusCode = 200;
  let payload: any;
  let body: Buffer | undefined;
  const headers = new Map<string, string>();
  const result: any = {
    status(code: number) { statusCode = code; return result; },
    json(value: any) { payload = value; return result; },
    setHeader(name: string, value: string) { headers.set(name, value); },
    send(value: Buffer) { body = value; return result; },
    getStatus: () => statusCode,
    getPayload: () => payload,
    getBody: () => body,
    getHeader: (name: string) => headers.get(name),
  };
  return result;
};

test('evidence upload stores the opaque key and download re-authorizes the ticket', async (t) => {
  const originalDatabase = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'data/database.test.json'), 'utf8'));
  const originalUpload = storageService.upload.bind(storageService);
  const originalGetFileBuffer = storageService.getFileBuffer.bind(storageService);
  t.after(() => {
    db.data = originalDatabase;
    db.persist();
    storageService.upload = originalUpload;
    storageService.getFileBuffer = originalGetFileBuffer;
  });
  db.reset(JSON.parse(JSON.stringify(initialSeedData)));

  const user = db.data.users.find((candidate) => candidate.roles.includes('CISO'))!;
  const ticket = db.data.tickets[0];
  storageService.upload = async () => ({
    storageKey: 'bank-artifacts/2026/08/unit-test-evidence.txt', storageProvider: 'local' as const,
    sha256Hash: 'a'.repeat(64), fileSizeBytes: 5, mimeType: 'text/plain',
  });
  storageService.getFileBuffer = async () => ({ buffer: Buffer.from('proof'), mimeType: 'text/plain' });

  const uploadResponse = response();
  await StorageController.uploadArtifact({
    body: { ticketId: ticket.id, fileName: 'evidence.txt', fileBase64: Buffer.from('proof').toString('base64'), mimeType: 'text/plain', evidenceType: 'AUDIT_WORKPAPER' },
    user,
  } as any, uploadResponse);
  assert.strictEqual(uploadResponse.getStatus(), 201);
  const attachment = uploadResponse.getPayload().attachment;
  assert.strictEqual(attachment.storageKey, 'bank-artifacts/2026/08/unit-test-evidence.txt');

  const urlResponse = response();
  await StorageController.getDownloadUrl({ params: { attachmentId: attachment.id }, user } as any, urlResponse);
  assert.strictEqual(urlResponse.getStatus(), 200);
  assert.strictEqual(urlResponse.getPayload().downloadUrl, `/api/storage/attachments/${attachment.id}/download`);

  const downloadResponse = response();
  await StorageController.downloadAttachment({ params: { attachmentId: attachment.id }, user } as any, downloadResponse);
  assert.strictEqual(downloadResponse.getStatus(), 200);
  assert.strictEqual(downloadResponse.getBody()?.toString(), 'proof');
  assert.strictEqual(attachment.downloadCount, 1);
  assert.match(downloadResponse.getHeader('Content-Disposition') || '', /evidence\.txt/);
});
