import test, { before, after } from 'node:test';
import { assertDisposableDatabase } from './fixtures/disposable-database.js';
import assert from 'node:assert/strict';
import { db } from '../server/db/database.js';
import { pgClient } from '../server/db/postgres/client.js';
import { config } from '../server/config/index.js';
import { ThreatModelService } from '../server/services/threat-model.service.js';

// This test creates append-only audit evidence. Run it only against an isolated
// disposable PostgreSQL database selected by the test runner, never a shared
// development or operational database.
const disposableDatabaseName = /(?:test|e2e|integration)/i.test(config.DB_NAME);
const enabled = process.env.RUN_THREAT_MODEL_POSTGRES_INTEGRATION === '1'
  && process.env.THREAT_MODEL_DISPOSABLE_DATABASE === '1'
  && disposableDatabaseName;

before(async () => { if (enabled) await assertDisposableDatabase(pgClient, config.DB_NAME); });
after(() => pgClient.close());

test('Threat Model creation persists the root and current revision in FK-safe order', { skip: !enabled }, async () => {
  await db.initialize();
  const actor = db.data.users.find((user) => user.roles.includes('PLATFORM_ADMIN') || user.roles.includes('CISO'));
  assert.ok(actor, 'An active platform or CISO user is required for the integration fixture.');

  try {
    const created = await ThreatModelService.create({
      title: `PostgreSQL FK integration ${Date.now()}`,
      serviceId: `integration-service-${Date.now()}`,
      criticality: 'MEDIUM',
      dataClassification: 'CONFIDENTIAL_SECURITY_ONLY',
      businessOwnerId: actor.id,
      technicalOwnerId: actor.id,
      departmentId: actor.departmentId,
    }, actor);
    const modelId = String(created.model?.id || '');
    assert.ok(modelId);
    assert.equal(created.model?.currentRevisionId, created.revision?.id);

    const stored = await pgClient.query<{ current_revision_id: string; status: string }>('SELECT current_revision_id,status FROM threat_models WHERE id=$1', [modelId]);
    assert.equal(stored.rows[0]?.current_revision_id, created.revision?.id);
    assert.equal(stored.rows[0]?.status, 'DRAFT');
  } finally {
    await pgClient.close();
  }
});
