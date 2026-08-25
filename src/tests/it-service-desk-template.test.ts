import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../server/db/database.js';
import { initialSeedData } from '../server/db/seed.js';
import { WorkflowOrchestrationService } from '../server/services/workflow-orchestration.service.js';
import { WorkflowRuntimeService } from '../server/services/workflow-runtime.service.js';
import type { BankUser } from '../shared/types/auth.js';

const makeUser = (id: string, roles: BankUser['roles'], managerId?: string): BankUser => ({
  id, username: id, email: `${id}@example.test`, fullName: id, title: roles.includes('IT_ADMIN') ? 'Help Desk' : roles.includes('SECURITY_ANALYST') ? 'InfoSec' : 'Employee', divisionId: 'div-bank', departmentId: roles.includes('IT_ADMIN') ? 'dept-it' : roles.includes('SECURITY_ANALYST') ? 'dept-secops' : 'dept-retail', teamIds: roles.includes('IT_ADMIN') ? ['team-it-infra'] : roles.includes('SECURITY_ANALYST') ? ['team-soc'] : ['team-retail'], roles, securityClearance: 'INTERNAL', managerId, ownedApplicationIds: [], ownedAssetIds: [], ownedRiskIds: [], isActive: true, directorySource: 'ACTIVE_DIRECTORY', distinguishedName: `CN=${id},OU=People,DC=example,DC=test`,
});

test('ServiceDesk IT catalogue creates grouped basic tasks and special routes', async (t) => {
  t.after(() => db.reset(structuredClone(initialSeedData)));
  const manager = makeUser('it-manager', ['DEPARTMENT_MANAGER', 'APPROVER', 'REQUESTER']);
  const employee = makeUser('it-employee', ['REQUESTER'], manager.id);
  const infosec = makeUser('it-infosec', ['SECURITY_ANALYST', 'APPROVER', 'REQUESTER']);
  const helpdesk = makeUser('it-helpdesk', ['IT_ADMIN', 'APPROVER', 'REQUESTER']);
  db.reset(structuredClone(initialSeedData));
  db.data.users.push(manager, employee, infosec, helpdesk);
  db.data.departments.push(
    { id: 'dept-retail', divisionId: 'div-bank', name: 'Retail', code: 'RETAIL', managerId: manager.id, isActive: true, directorySource: 'ACTIVE_DIRECTORY' },
    { id: 'dept-it', divisionId: 'div-bank', name: 'IT', code: 'IT', managerId: helpdesk.id, isActive: true, directorySource: 'ACTIVE_DIRECTORY' },
    { id: 'dept-secops', divisionId: 'div-bank', name: 'InfoSec', code: 'SECOPS', managerId: infosec.id, isActive: true, directorySource: 'ACTIVE_DIRECTORY' },
  );

  const catalog = WorkflowOrchestrationService.catalogPayload(employee);
  const it = catalog.templates.filter((item) => item.catalogGroup?.startsWith('IT'));
  assert.equal(it.length, 74);
  assert.equal(it.filter((item) => item.kind === 'BASIC_TICKET').length, 71);
  assert.deepEqual(
    it.filter((item) => item.kind === 'WORKFLOW').map((item) => item.title).sort(),
    ['USB Access', 'Website Access Request', 'Şəbəkə proqram təminatının yüklənməsi'].sort(),
  );
  assert.ok(it.some((item) => item.title === 'Mail gəlməyib' && item.kind === 'BASIC_TICKET'));
  const basicTasks = it.filter((item) => item.kind === 'BASIC_TICKET');

  const basic = basicTasks.find((item) => item.title === 'Yerdəyişmə')!;
  const basicLaunch = WorkflowRuntimeService.launchQuickWork({
    requestTypeId: basic.requestTypeId!, actor: employee, idempotencyKey: 'service-desk-basic-001',
    values: { summary: 'Masa yerdəyişməsi', description: 'Yeni otağa köçürülürəm.', requesterId: employee.id, departmentId: employee.departmentId },
  });
  assert.ok(basicLaunch.execution.workItems.some((item) => item.title === 'Help Desk-də icra et'));

  const network = it.find((item) => item.title === 'Şəbəkə proqram təminatının yüklənməsi')!;
  const networkLaunch = WorkflowRuntimeService.launchQuickWork({
    requestTypeId: network.requestTypeId!, actor: employee, idempotencyKey: 'service-desk-network-001',
    values: { summary: 'VPN klienti', softwareName: 'VPN Client', businessJustification: 'İş üçün lazımdır.', requesterId: employee.id, departmentId: employee.departmentId },
  });
  assert.ok(networkLaunch.execution.approvals.some((item) => item.title === 'Müdir təsdiqi'));
  assert.equal(networkLaunch.execution.approvals.some((item) => item.title === 'InfoSec təsdiqi'), false);

  const mail = basicTasks.find((item) => item.title === 'Mail gəlməyib')!;
  const mailLaunch = WorkflowRuntimeService.launchQuickWork({
    requestTypeId: mail.requestTypeId!, actor: employee, idempotencyKey: 'service-desk-mail-001',
    values: { summary: 'Mail gəlməyib', description: 'Gözlənilən məktub daxil olmayıb.', requesterId: employee.id, departmentId: employee.departmentId },
  });
  assert.equal(mailLaunch.execution.approvals.length, 0);
  assert.ok(mailLaunch.execution.workItems.some((item) => item.title === 'InfoSec mail araşdırması'));
});
