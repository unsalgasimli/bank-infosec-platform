import assert from 'node:assert/strict';
import test from 'node:test';
import { finishHttpSpan, runWithActiveSpan, startHttpSpan, traceIdFor, withTelemetrySpan } from '../server/services/telemetry.service.js';

test('disabled telemetry never emits a sentinel trace ID and preserves local execution', async () => {
  const span = startHttpSpan('HTTP GET', {}, { 'http.request.method': 'GET' });
  assert.equal(traceIdFor(span), undefined);
  let callbackRan = false;
  runWithActiveSpan(span, () => { callbackRan = true; });
  assert.equal(callbackRan, true);
  assert.equal(finishHttpSpan(span, 200), undefined);

  const result = await withTelemetrySpan('outbox.process', { 'messaging.system': 'rabbitmq' }, async () => 'processed');
  assert.equal(result, 'processed');
});
