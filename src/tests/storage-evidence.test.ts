import assert from 'node:assert';
import test from 'node:test';
import { db } from '../server/db/database.js';
import { initialSeedData } from '../server/db/seed.js';
import { StorageController } from '../server/controllers/storage.controller.js';
import { storageService } from '../server/services/storage.service.js';
import { OutboxService } from '../server/services/outbox.service.js';

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

test('evidence upload stages in quarantine and blocks download before the worker scan', async (t) => {
  const originalDatabase = structuredClone(initialSeedData);
  const originalStageUpload = storageService.stageUpload.bind(storageService);
  t.after(() => {
    db.data = originalDatabase;
    db.persist();
    storageService.stageUpload = originalStageUpload;
    OutboxService.clearForTests();
  });
  db.reset(JSON.parse(JSON.stringify(initialSeedData)));

  const user: any = { id: 'usr-ciso-test', fullName: 'CISO Test', email: 'ciso@bank.test', roles: ['CISO'], departmentId: 'dept-secops', isActive: true };
  const ticket: any = { id: 'tick-test-01', key: 'SEC-0001', title: 'Test Ticket', departmentId: 'dept-secops', assigneeId: user.id, reporterId: user.id, status: 'OPEN', statusCategory: 'TO_DO', priority: 'HIGH', technicalSeverity: 'CRITICAL', category: 'INCIDENT', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  db.data.users.push(user);
  db.data.tickets.push(ticket);
  storageService.stageUpload = async () => ({
    storageKey: 'bank-artifacts/2026/08/unit-test-evidence.txt', storageProvider: 'local' as const,
    quarantineStorageKey: 'quarantine/bank-artifacts/2026/08/unit-test-evidence.txt',
    sha256Hash: 'a'.repeat(64), fileSizeBytes: 5, mimeType: 'text/plain',
  });

  const uploadResponse = response();
  await StorageController.uploadArtifact({
    body: { ticketId: ticket.id, fileName: 'evidence.txt', fileBase64: Buffer.from('proof').toString('base64'), mimeType: 'text/plain', evidenceType: 'AUDIT_WORKPAPER' },
    user,
  } as any, uploadResponse);
  assert.strictEqual(uploadResponse.getStatus(), 202);
  const attachment = uploadResponse.getPayload().attachment;
  assert.strictEqual(attachment.storageKey, undefined);
  assert.strictEqual(attachment.virusScanStatus, 'PENDING');
  assert.strictEqual(attachment.quarantineStorageKey, 'quarantine/bank-artifacts/2026/08/unit-test-evidence.txt');
  assert.strictEqual(OutboxService.pending().some((event) => event.topic === 'attachment.scan.requested' && event.aggregateId === attachment.id), true);

  const urlResponse = response();
  await StorageController.getDownloadUrl({ params: { attachmentId: attachment.id }, user } as any, urlResponse);
  assert.strictEqual(urlResponse.getStatus(), 409);

  const downloadResponse = response();
  await StorageController.downloadAttachment({ params: { attachmentId: attachment.id }, user } as any, downloadResponse);
  assert.strictEqual(downloadResponse.getStatus(), 409);
});
