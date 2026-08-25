import test from 'node:test';
import assert from 'node:assert';
import {
  canUserAccessDestination,
  canUserAccessModule,
  resolveLegacyRoute,
  NAVIGATION_MODULES,
} from '../shared/types/navigation.js';
import { BankUser } from '../shared/types/auth.js';

test('Manage Department route opens the department admin portal', () => {
  assert.deepStrictEqual(resolveLegacyRoute('dept-admin'), { destinationId: 'dept-admin' });
});

test('🛡️ Enterprise Banking ITSM/GRC Navigation & RBAC Test Suite', async (t) => {
  const cisoUser: BankUser = {
    id: 'usr-ciso',
    username: 'u.gasimli',
    fullName: 'Unsal Gasimli',
    email: 'u.gasimli@apexbank.int',
    title: 'CISO',
    departmentId: 'dept-secops',
    divisionId: 'div-sec',
    teamIds: ['team-soc'],
    roles: ['PLATFORM_ADMIN', 'CISO'],
    securityClearance: 'HIGHLY_RESTRICTED_HR_LEGAL',
    ownedApplicationIds: [],
    ownedAssetIds: [],
    ownedRiskIds: [],
    isActive: true,
  };

  const employeeUser: BankUser = {
    id: 'usr-emp-1',
    username: 'a.mammadov',
    fullName: 'Anar Mammadov',
    email: 'a.mammadov@apexbank.int',
    title: 'Junior Loan Officer',
    departmentId: 'dept-retail',
    divisionId: 'div-banking',
    teamIds: [],
    roles: ['REQUESTER'],
    securityClearance: 'INTERNAL',
    ownedApplicationIds: [],
    ownedAssetIds: [],
    ownedRiskIds: [],
    isActive: true,
  };

  const appsecUser: BankUser = {
    id: 'usr-appsec-1',
    username: 'l.aliyeva',
    fullName: 'Leyla Aliyeva',
    email: 'l.aliyeva@apexbank.int',
    title: 'Senior AppSec Engineer',
    departmentId: 'dept-secops',
    divisionId: 'div-sec',
    teamIds: ['team-appsec'],
    roles: ['APPSEC_ANALYST', 'SECURITY_ANALYST'],
    securityClearance: 'CONFIDENTIAL_SECURITY_ONLY',
    ownedApplicationIds: [],
    ownedAssetIds: [],
    ownedRiskIds: [],
    isActive: true,
  };

  await t.test('1. Sidebar structure defines all 7 core modules and expected destinations', () => {
    const expectedModules = [
      'my-work',
      'work-management',
      'security-grc',
      'assets-cmdb',
      'knowledge',
      'analytics',
      'administration',
    ];

    const actualModules = NAVIGATION_MODULES.map((m) => m.id);
    assert.deepStrictEqual(actualModules, expectedModules);

    // Verify Security & GRC contains only Risk Management and Audit & Compliance
    const secGrc = NAVIGATION_MODULES.find((m) => m.id === 'security-grc')!;
    const itemIds = secGrc.items.map((i) => i.id);
    assert.deepStrictEqual(itemIds, ['risk-management', 'audit-compliance']);

    const riskItem = secGrc.items.find((i) => i.id === 'risk-management');
    assert.ok(riskItem, 'risk-management must exist');
    assert.strictEqual(riskItem.label, 'Risk Management');

    const auditItem = secGrc.items.find((i) => i.id === 'audit-compliance');
    assert.ok(auditItem, 'audit-compliance must exist');
    assert.strictEqual(auditItem.label, 'Audit & Compliance');

    // Verify Approvals renamed
    const myWork = NAVIGATION_MODULES.find((m) => m.id === 'my-work')!;
    const approvalsItem = myWork.items.find((i) => i.id === 'approvals');
    assert.ok(approvalsItem, 'approvals must exist');
    assert.strictEqual(approvalsItem.label, 'Approvals');

    // Verify Workflows renamed
    const workMgmt = NAVIGATION_MODULES.find((m) => m.id === 'work-management')!;
    const workflowsItem = workMgmt.items.find((i) => i.id === 'workflows');
    assert.ok(workflowsItem, 'workflows must exist');
    assert.strictEqual(workflowsItem.label, 'Workflows');
  });

  await t.test('2. RBAC: CISO has access to all modules and destinations', () => {
    for (const mod of NAVIGATION_MODULES) {
      assert.strictEqual(canUserAccessModule(cisoUser, mod.id), true);
      for (const item of mod.items) {
        assert.strictEqual(canUserAccessDestination(cisoUser, item.id), true);
      }
    }
  });

  await t.test('3. RBAC: Standard Employee can launch workflows but not manage project work', () => {
    assert.strictEqual(canUserAccessModule(employeeUser, 'my-work'), true);
    assert.strictEqual(canUserAccessModule(employeeUser, 'knowledge'), true);
    assert.strictEqual(canUserAccessModule(employeeUser, 'work-management'), true);
    assert.strictEqual(canUserAccessDestination(employeeUser, 'workflows'), true);
    assert.strictEqual(canUserAccessDestination(employeeUser, 'projects-tasks'), false);

    // Should NOT have access to restricted modules
    assert.strictEqual(canUserAccessModule(employeeUser, 'administration'), false);
    assert.strictEqual(canUserAccessModule(employeeUser, 'security-grc'), false);
    assert.strictEqual(canUserAccessModule(employeeUser, 'analytics'), false);
    assert.strictEqual(canUserAccessDestination(employeeUser, 'admin-settings'), false);
    assert.strictEqual(canUserAccessDestination(employeeUser, 'risk-management'), false);
  });

  await t.test('4. RBAC: AppSec Analyst has access to Security & GRC, but not Administration settings', () => {
    assert.strictEqual(canUserAccessModule(appsecUser, 'security-grc'), true);
    assert.strictEqual(canUserAccessDestination(appsecUser, 'risk-management'), true);
    assert.strictEqual(canUserAccessDestination(appsecUser, 'audit-compliance'), true);

    // AppSec analyst is not platform admin
    assert.strictEqual(canUserAccessModule(appsecUser, 'administration'), false);
    assert.strictEqual(canUserAccessDestination(appsecUser, 'admin-settings'), false);
  });

  await t.test('5. Legacy routes resolve cleanly to canonical destinations and view modes', () => {
    assert.deepStrictEqual(resolveLegacyRoute('table'), { destinationId: 'projects-tasks', viewMode: 'spreadsheet' });
    assert.deepStrictEqual(resolveLegacyRoute('board'), { destinationId: 'projects-tasks', viewMode: 'kanban' });
    assert.deepStrictEqual(resolveLegacyRoute('gantt'), { destinationId: 'projects-tasks', viewMode: 'spreadsheet' });
    assert.deepStrictEqual(resolveLegacyRoute('calendar'), { destinationId: 'projects-tasks', viewMode: 'spreadsheet' });
    assert.deepStrictEqual(resolveLegacyRoute('workload'), { destinationId: 'projects-tasks', viewMode: 'capacity' });

    assert.deepStrictEqual(resolveLegacyRoute('risk-register'), { destinationId: 'risk-management' });
    assert.deepStrictEqual(resolveLegacyRoute('cross-tasks'), { destinationId: 'workflows' });
    assert.deepStrictEqual(resolveLegacyRoute('soc-incidents'), { destinationId: 'security-incidents' });
    assert.deepStrictEqual(resolveLegacyRoute('ciso-dash'), { destinationId: 'executive-analytics' });
    assert.deepStrictEqual(resolveLegacyRoute('admin-center'), { destinationId: 'admin-settings' });
  });

  await t.test('6. URL Builder maps destinations, view modes, and tickets to clean browser URLs', async () => {
    const { buildUrl } = await import('../client/utils/urlRouter.js');

    assert.strictEqual(buildUrl('my-work-overview'), '/my-work/overview');
    assert.strictEqual(buildUrl('my-tasks'), '/my-work/tasks');
    assert.strictEqual(buildUrl('approvals'), '/my-work/approvals');
    assert.strictEqual(buildUrl('projects-tasks'), '/work-management/projects-tasks');
    assert.strictEqual(buildUrl('projects-tasks', 'kanban'), '/work-management/projects-tasks?view=kanban');
    assert.strictEqual(buildUrl('service-incidents'), '/service-management/incidents');
    assert.strictEqual(buildUrl('risk-management'), '/security-grc/risk-management');
    assert.strictEqual(buildUrl('audit-compliance'), '/security-grc/audit-compliance');
    assert.strictEqual(buildUrl('admin-settings'), '/administration/settings');
  });

  await t.test('7. Sidebar badges: My Tasks has dedicated my-tasks badgeKey', () => {
    const myWork = NAVIGATION_MODULES.find((m) => m.id === 'my-work')!;
    const myTasksItem = myWork.items.find((i) => i.id === 'my-tasks')!;
    assert.strictEqual(myTasksItem.badgeKey, 'my-tasks');

    const workMgmt = NAVIGATION_MODULES.find((m) => m.id === 'work-management')!;
    const projectTasksItem = workMgmt.items.find((i) => i.id === 'projects-tasks')!;
    assert.strictEqual(projectTasksItem.badgeKey, undefined);
  });
});
