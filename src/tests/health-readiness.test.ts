import assert from 'node:assert/strict';
import test from 'node:test';
import { pgClient } from '../server/db/postgres/client.js';
import { cacheService } from '../server/services/cache.service.js';
import { storageService } from '../server/services/storage.service.js';
import { QueueService } from '../server/services/queue.service.js';
import { MalwareScanService } from '../server/services/malware-scan.service.js';
import { HealthService } from '../server/services/health.service.js';

test('readiness is DOWN when Redis is unavailable', async () => {
  const originals = {
    database: pgClient.checkHealth,
    cache: cacheService.checkHealth,
    storage: storageService.checkHealth,
    queue: QueueService.checkHealth,
    scanner: MalwareScanService.checkHealth,
  };
  try {
    (pgClient as any).checkHealth = async () => ({ status: 'UP' });
    (cacheService as any).checkHealth = async () => ({ status: 'DOWN', mode: 'redis', error: 'connection refused' });
    (storageService as any).checkHealth = async () => ({ status: 'UP', provider: 's3' });
    (QueueService as any).checkHealth = async () => ({ status: 'UP' });
    (MalwareScanService as any).checkHealth = async () => ({ status: 'UP' });

    const report = await HealthService.getReadiness();
    assert.equal(report.status, 'DOWN');
    assert.equal(report.checks.cache.status, 'DOWN');
  } finally {
    (pgClient as any).checkHealth = originals.database;
    (cacheService as any).checkHealth = originals.cache;
    (storageService as any).checkHealth = originals.storage;
    (QueueService as any).checkHealth = originals.queue;
    (MalwareScanService as any).checkHealth = originals.scanner;
  }
});

test('readiness is DOWN while the API is draining but liveness stays UP', async () => {
  try {
    HealthService.setDraining(true);
    const report = await HealthService.getReadiness();
    assert.equal(report.status, 'DOWN');
    assert.equal(report.draining, true);
    assert.equal(HealthService.getLiveness().status, 'UP');
  } finally {
    HealthService.setDraining(false);
  }
});
