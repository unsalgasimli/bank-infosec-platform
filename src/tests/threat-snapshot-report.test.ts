import test from 'node:test';
import assert from 'node:assert/strict';
import { renderThreatSnapshotReport } from '../shared/threat-snapshot-report.js';
test('approved report is deterministic, script-free and escapes stored adversarial content',()=>{
  const report={sha256:'a'.repeat(64),snapshot:{revisionId:'rev-1',model:{title:'<script>alert(1)</script>',data_classification:'RESTRICTED'},threats:[{title:'<img src=x onerror=alert(1)>',notes:{reason:'" onload="alert(1)'}}],approvals:[]}};
  const html=renderThreatSnapshotReport(report);assert.equal(html,renderThreatSnapshotReport(report));
  assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));
  assert.ok(html.includes("default-src 'none'"));assert.ok(html.includes(report.sha256));assert.ok(html.includes('No records in this approved snapshot.'));
});
