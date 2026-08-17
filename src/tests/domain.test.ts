import assert from 'node:assert';
import test from 'node:test';
import { AuthService } from '../server/services/auth.service.js';
import { WorkflowService } from '../server/services/workflow.service.js';
import { SLAService } from '../server/services/sla.service.js';
import { ApprovalService } from '../server/services/approval.service.js';
import { DedupService } from '../server/services/dedup.service.js';
import { SearchService } from '../server/services/search.service.js';
import { db } from '../server/db/database.js';
import { initialSeedData } from '../server/db/seed.js';

test('AegisSec BankSecOps Domain Logic & Security Test Suite', async (t) => {
  // Ensure database is in fresh seed state
  db.reset(initialSeedData);

  const cisoUser = db.data.users.find((u) => u.id === 'usr-ciso')!;
  const devLeadUser = db.data.users.find((u) => u.id === 'usr-dev-lead')!;
  const dlpAnalystUser = db.data.users.find((u) => u.id === 'usr-dlp-analyst')!;
  const appsecLeadUser = db.data.users.find((u) => u.id === 'usr-appsec-lead')!;

  const appsecTicket = db.data.tickets.find((t) => t.id === 'tick-appsec-001')!;
  const dlpTicket = db.data.tickets.find((t) => t.id === 'tick-dlp-001')!;

  await t.test('1. ABAC: Developer CAN access their own app ticket but CANNOT access restricted DLP case', () => {
    // Developer owns app-loan -> can access APPSEC-2026-0001
    const devAccessAppSec = AuthService.canAccessResource({
      user: devLeadUser,
      action: 'READ',
      resourceType: 'TICKET',
      resource: appsecTicket,
    });
    assert.strictEqual(devAccessAppSec.allowed, true, 'Dev lead should be allowed to view their own app ticket');

    // Developer CANNOT access restricted DLP case (DLP-2026-0090)
    const devAccessDLP = AuthService.canAccessResource({
      user: devLeadUser,
      action: 'READ',
      resourceType: 'TICKET',
      resource: dlpTicket,
    });
    assert.strictEqual(devAccessDLP.allowed, false, 'Dev lead MUST NOT be allowed to view restricted DLP investigation');

    // DLP Analyst CAN access DLP case
    const dlpAccessDLP = AuthService.canAccessResource({
      user: dlpAnalystUser,
      action: 'READ',
      resourceType: 'TICKET',
      resource: dlpTicket,
    });
    assert.strictEqual(dlpAccessDLP.allowed, true, 'DLP analyst must be allowed to view DLP case');

    // CISO has enterprise oversight
    const cisoAccessDLP = AuthService.canAccessResource({
      user: cisoUser,
      action: 'READ',
      resourceType: 'TICKET',
      resource: dlpTicket,
    });
    assert.strictEqual(cisoAccessDLP.allowed, true, 'CISO must have access to all bank tickets');
  });

  await t.test('2. Workflow Engine: State transition role validation & comment requirements', () => {
    // Attempt invalid transition by unauthorized user
    const invalidTrans = WorkflowService.executeTransition({
      ticketId: appsecTicket.id,
      transitionId: 'tr-v4', // Submit for security retest
      user: dlpAnalystUser, // DLP analyst does not have role on this dev ticket
    });
    assert.strictEqual(invalidTrans.success, false, 'Unauthorized role must be rejected');

    // Valid transition by assignee with comment & evidence
    const validTrans = WorkflowService.executeTransition({
      ticketId: appsecTicket.id,
      transitionId: 'tr-v3', // Begin remediation
      user: devLeadUser,
      comment: 'Starting hotfix branch implementation',
    });
    assert.strictEqual(validTrans.success, true, 'Valid transition by assignee must succeed');
    assert.strictEqual(appsecTicket.statusId, 'VULN_REMEDIATION');
  });

  await t.test('3. Banking SLA Engine: Calculation of remaining minutes and status', () => {
    const sla = SLAService.calculateSLA(appsecTicket);
    assert.ok(['SAFE', 'AT_RISK', 'BREACHED', 'PAUSED', 'MET'].includes(sla.state), 'SLA state must be valid');
    assert.ok(typeof sla.remainingMinutes === 'number', 'Remaining minutes must be computed');
  });

  await t.test('4. Approval Engine: Cryptographic signature generation & step progression', () => {
    const chain = db.data.approvals.find((a) => a.id === 'appr-grc-001')!;
    const cisoStep = chain.steps.find((s) => s.id === 'step-3')!;

    assert.strictEqual(cisoStep.status, 'PENDING');

    const result = ApprovalService.submitDecision({
      chainId: chain.id,
      stepId: cisoStep.id,
      decision: 'APPROVED',
      user: cisoUser,
      comments: 'Executive risk sign-off granted based on validated compensating controls.',
    });

    assert.strictEqual(result.success, true, 'Approval submission must succeed');
    assert.strictEqual(cisoStep.status, 'APPROVED');
    assert.ok(cisoStep.immutableSignatureHash?.startsWith('sha256-'), 'Must generate sha256 cryptographic hash');
    assert.strictEqual(chain.status, 'APPROVED', 'Entire chain must mark approved when all steps pass');
  });

  await t.test('5. Scanner Deduplication: Fingerprinting & Recurrence Detection', () => {
    // Ingest existing finding
    const res1 = DedupService.ingestFinding(
      {
        scannerSource: 'CHECKMARX',
        applicationId: 'app-loan',
        title: 'SQL Injection in Mortgage Assessment Filter',
        description: 'Checkmarx SAST scan finding',
        cweId: 'CWE-89',
        filePath: 'src/main/java/com/apexbank/loan/repository/UnderwritingRepository.java',
        codeLine: 142,
        endpoint: '/api/v2/underwriting/assessments/query',
        httpParameter: 'applicantTaxId',
      },
      appsecLeadUser
    );

    assert.strictEqual(res1.action, 'UPDATED', 'Duplicate active finding must be updated, not duplicated');

    // Ingest new finding
    const res2 = DedupService.ingestFinding(
      {
        scannerSource: 'TRIVY',
        assetId: 'asset-k8s-prod',
        title: 'High Severity CVE in Linux Kernel Node',
        description: 'New kernel vulnerability',
        cveId: 'CVE-2026-99999',
        cvssScore: 8.5,
      },
      appsecLeadUser
    );

    assert.strictEqual(res2.action, 'CREATED', 'New finding must create a new ticket');
    assert.ok(res2.ticket.key.startsWith('VM-2026-'), 'Must assign VM project key');
  });

  await t.test('6. JQL Search: Multi-criteria and clause evaluation', () => {
    const results1 = SearchService.query(db.data.tickets, 'project = APPSEC AND severity IN (CRITICAL, HIGH)', cisoUser);
    assert.ok(results1.length >= 1, 'Must match high/critical AppSec tickets');
    assert.strictEqual(results1[0].projectCode, 'APPSEC');

    const results2 = SearchService.query(db.data.tickets, 'status != CLOSED', cisoUser);
    assert.ok(results2.every((t) => t.statusCategory !== 'DONE' || t.statusId !== 'VULN_CLOSED'));
  });
});
