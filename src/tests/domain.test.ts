import assert from 'node:assert';
import test from 'node:test';
import { AuthService } from '../server/services/auth.service.js';
import { WorkflowService } from '../server/services/workflow.service.js';
import { SLAService } from '../server/services/sla.service.js';
import { ApprovalService } from '../server/services/approval.service.js';
import { DedupService } from '../server/services/dedup.service.js';
import { SearchService } from '../server/services/search.service.js';
import { db } from '../server/db/database.js';
import type { DatabaseSchema } from '../server/db/database.js';
import { initialSeedData } from '../server/db/seed.js';
import { BankUser } from '../shared/types/auth.js';
import { Ticket } from '../shared/types/ticket.js';

test('AegisSec BankSecOps Domain Logic & Security Test Suite', async (t) => {
  const originalDatabase = structuredClone(db.data) as DatabaseSchema;
  t.after(() => {
    db.data = originalDatabase;
    db.persist();
  });
  const cisoUser: BankUser = {
    id: 'usr-ciso',
    username: 'ciso.officer',
    email: 'ciso@bank.internal',
    fullName: 'Chief Information Security Officer',
    title: 'CISO',
    divisionId: 'div-sec',
    departmentId: 'dept-sec',
    teamIds: ['team-sec'],
    roles: ['CISO', 'PLATFORM_ADMIN'],
    securityClearance: 'HIGHLY_RESTRICTED_HR_LEGAL',
    ownedApplicationIds: [],
    ownedAssetIds: [],
    ownedRiskIds: [],
    isActive: true,
  };

  const devLeadUser: BankUser = {
    id: 'usr-dev-lead',
    username: 'dev.lead',
    email: 'dev@bank.internal',
    fullName: 'Lead Engineer',
    title: 'Lead Software Engineer',
    divisionId: 'div-dev',
    departmentId: 'dept-dev',
    teamIds: ['team-dev'],
    roles: ['APPLICATION_OWNER', 'REQUESTER'],
    securityClearance: 'INTERNAL',
    ownedApplicationIds: ['app-loan'],
    ownedAssetIds: [],
    ownedRiskIds: [],
    isActive: true,
  };

  const dlpAnalystUser: BankUser = {
    id: 'usr-dlp-analyst',
    username: 'dlp.analyst',
    email: 'dlp@bank.internal',
    fullName: 'DLP Senior Analyst',
    title: 'DLP Analyst',
    divisionId: 'div-sec',
    departmentId: 'dept-dlp',
    teamIds: ['team-dlp'],
    roles: ['DLP_ANALYST', 'SECURITY_ANALYST'],
    securityClearance: 'CONFIDENTIAL_SECURITY_ONLY',
    ownedApplicationIds: [],
    ownedAssetIds: [],
    ownedRiskIds: [],
    isActive: true,
  };

  const appsecLeadUser: BankUser = {
    id: 'usr-appsec-lead',
    username: 'appsec.lead',
    email: 'appsec@bank.internal',
    fullName: 'AppSec Lead Specialist',
    title: 'AppSec Lead',
    divisionId: 'div-sec',
    departmentId: 'dept-appsec',
    teamIds: ['team-appsec'],
    roles: ['APPSEC_ANALYST', 'SECURITY_ANALYST', 'APPROVER'],
    securityClearance: 'CONFIDENTIAL_SECURITY_ONLY',
    ownedApplicationIds: [],
    ownedAssetIds: [],
    ownedRiskIds: [],
    isActive: true,
  };

  const appsecTicket: Ticket = {
    id: 'tick-appsec-001',
    key: 'APPSEC-2026-0001',
    projectCode: 'APPSEC',
    ticketTypeId: 'tt-vuln',
    ticketTypeName: 'Application Security Finding',
    category: 'VULNERABILITY',
    securityDomain: 'APPSEC',
    title: 'SQL Injection in Mortgage Assessment Filter',
    description: 'Dynamic SQL query construction in underwriting repository',
    statusId: 'VULN_TRIAGE',
    statusName: 'Triaged',
    statusCategory: 'TO_DO',
    workflowId: 'wf-vuln-lifecycle',
    workflowVersion: 1,
    technicalSeverity: 'HIGH',
    businessPriority: 'P2_HIGH',
    businessImpact: 'SIGNIFICANT',
    inherentRisk: 'HIGH',
    residualRisk: 'HIGH',
    riskScore: 78,
    confidentiality: 'INTERNAL',
    reporterId: 'usr-appsec-lead',
    assigneeId: 'usr-dev-lead',
    applicationId: 'app-loan',
    watcherIds: [],
    tags: ['OWASP-A03', 'CWE-89'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dueDate: new Date(Date.now() + 14 * 86400000).toISOString(),
    remediationDeadline: new Date(Date.now() + 14 * 86400000).toISOString(),
    slaState: 'SAFE',
    slaRemainingMinutes: 20160,
    version: 1,
    findingDetails: {
      vulnerabilityTitle: 'SQL Injection in Mortgage Assessment Filter',
      cweId: 'CWE-89',
      filePath: 'src/main/java/com/apexbank/loan/repository/UnderwritingRepository.java',
      codeLine: 142,
      endpoint: '/api/v2/underwriting/assessments/query',
      httpParameter: 'applicantTaxId',
      scannerSource: 'CHECKMARX',
      findingFingerprint: DedupService.calculateFingerprint({
        scannerSource: 'CHECKMARX',
        applicationId: 'app-loan',
        title: 'SQL Injection in Mortgage Assessment Filter',
        description: 'Checkmarx SAST scan finding',
        cweId: 'CWE-89',
        filePath: 'src/main/java/com/apexbank/loan/repository/UnderwritingRepository.java',
        codeLine: 142,
        endpoint: '/api/v2/underwriting/assessments/query',
        httpParameter: 'applicantTaxId',
      }),
      observationCount: 1,
    },
  };

  const dlpTicket: Ticket = {
    id: 'tick-dlp-001',
    key: 'DLP-2026-0090',
    projectCode: 'DLP',
    ticketTypeId: 'tt-dlp',
    ticketTypeName: 'DLP Data Exfiltration Alert',
    category: 'INCIDENT',
    securityDomain: 'DLP',
    title: 'Unauthorized Customer PII Export via USB Mass Storage',
    description: 'DLP Agent detected export of customer SSN/Tax IDs',
    statusId: 'INC_INVESTIGATING',
    statusName: 'Under Investigation',
    statusCategory: 'IN_PROGRESS',
    workflowId: 'wf-incident-response',
    workflowVersion: 1,
    technicalSeverity: 'CRITICAL',
    businessPriority: 'P1_URGENT',
    businessImpact: 'CATASTROPHIC',
    inherentRisk: 'CRITICAL',
    residualRisk: 'CRITICAL',
    riskScore: 95,
    confidentiality: 'CONFIDENTIAL_SECURITY_ONLY',
    restrictedUserIds: ['usr-ciso', 'usr-dlp-analyst'],
    reporterId: 'usr-dlp-analyst',
    assigneeId: 'usr-dlp-analyst',
    watcherIds: [],
    tags: ['PII', 'GDPR', 'INSIDER_THREAT'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dueDate: new Date(Date.now() + 86400000).toISOString(),
    remediationDeadline: new Date(Date.now() + 86400000).toISOString(),
    slaState: 'SAFE',
    slaRemainingMinutes: 1440,
    version: 1,
  };

  const testSchema = {
    divisions: [],
    departments: [],
    teams: [],
    users: [cisoUser, devLeadUser, dlpAnalystUser, appsecLeadUser],
    workflows: [
      {
        id: 'wf-vuln-lifecycle',
        name: 'Vulnerability Remediation Lifecycle',
        description: 'Standard security vulnerability remediation workflow',
        ticketTypeId: 'tt-vuln',
        version: 1,
        isActive: true,
        states: [
          { id: 'VULN_TRIAGE', name: 'Triaged', category: 'TO_DO', color: '#6366f1' },
          { id: 'VULN_REMEDIATION', name: 'In Remediation', category: 'IN_PROGRESS', color: '#3b82f6' },
          { id: 'VULN_CLOSED', name: 'Closed', category: 'DONE', color: '#10b981' },
        ],
        transitions: [
          {
            id: 'tr-v3',
            name: 'Begin Remediation',
            fromStateId: 'VULN_TRIAGE',
            toStateId: 'VULN_REMEDIATION',
            allowedRoles: ['APPLICATION_OWNER', 'ASSIGNEE', 'SECURITY_ANALYST', 'CISO'],
            requireComment: false,
          },
          {
            id: 'tr-v4',
            name: 'Submit for Retest',
            fromStateId: 'VULN_REMEDIATION',
            toStateId: 'VULN_CLOSED',
            allowedRoles: ['APPLICATION_OWNER', 'ASSIGNEE'],
            requireEvidence: true,
          },
        ],
      },
    ],
    slaPolicies: [
      {
        id: 'sla-default',
        name: 'Standard Banking SLA Policy',
        description: 'Default SLA thresholds',
        isDefault: true,
        businessHoursOnly: false,
        businessStartTime: '09:00',
        businessEndTime: '18:00',
        timezone: 'UTC',
        excludeWeekends: false,
        excludeHolidays: false,
        thresholds: {
          CRITICAL: { acknowledgmentMinutes: 15, firstResponseMinutes: 30, remediationMinutes: 240, resolutionMinutes: 480 },
          HIGH: { acknowledgmentMinutes: 60, firstResponseMinutes: 120, remediationMinutes: 20160, resolutionMinutes: 43200 },
          MEDIUM: { acknowledgmentMinutes: 240, firstResponseMinutes: 480, remediationMinutes: 43200, resolutionMinutes: 86400 },
          LOW: { acknowledgmentMinutes: 1440, firstResponseMinutes: 2880, remediationMinutes: 129600, resolutionMinutes: 259200 },
          INFORMATIONAL: { acknowledgmentMinutes: 2880, firstResponseMinutes: 5760, remediationMinutes: 259200, resolutionMinutes: 518400 },
        },
      },
    ],
    tickets: [appsecTicket, dlpTicket],
    approvals: [
      {
        id: 'appr-grc-001',
        ticketId: 'tick-appsec-001',
        title: 'Policy Exception Approval',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        steps: [
          {
            id: 'step-3',
            stepNumber: 1,
            name: 'CISO Executive Authorization',
            requiredRole: 'CISO',
            assignedApproverId: 'usr-ciso',
            status: 'PENDING',
            isMandatory: true,
          },
        ],
      },
    ],
    assets: [],
    applications: [],
    risks: [],
    comments: [],
    attachments: [],
    auditEvents: [],
    automationRules: [],
    queues: [],
    kbArticles: [],
    savedFilters: [],
  } as unknown as DatabaseSchema;

  // Setup test database
  db.reset(testSchema);

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
      transitionId: 'tr-v4',
      user: dlpAnalystUser,
    });
    assert.strictEqual(invalidTrans.success, false, 'Unauthorized role must be rejected');

    // Valid transition by assignee
    const validTrans = WorkflowService.executeTransition({
      ticketId: appsecTicket.id,
      transitionId: 'tr-v3',
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
