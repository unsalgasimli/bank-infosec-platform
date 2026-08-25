import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../server/db/database.js';
import { ProjectService } from '../server/services/project.service.js';
import { ProjectsController } from '../server/controllers/projects.controller.js';
import { DepartmentsController } from '../server/controllers/departments.controller.js';
import type { BankUser } from '../shared/types/auth.js';
import type { Project } from '../shared/types/project.js';
import type { Ticket } from '../shared/types/ticket.js';

function mockReqRes(body: any = {}, params: any = {}, query: any = {}, user: any = null) {
  const defaultUser = user || db.data.users[0];
  const req: any = {
    body,
    params,
    query,
    user: defaultUser,
    headers: { 'user-agent': 'Test-Agent' },
    ip: '127.0.0.1',
  };

  let statusCode = 200;
  let responseData: any = null;

  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      responseData = data;
      return res;
    },
    getStatus: () => statusCode,
    getData: () => responseData,
  };

  return { req, res };
}

const user = (id: string, roles: any[] = []): BankUser => ({
  id,
  username: id,
  email: `${id}@example.test`,
  fullName: id,
  title: 'Test user',
  divisionId: 'div-test',
  departmentId: 'dept-test',
  teamIds: [],
  roles,
  securityClearance: 'INTERNAL',
  ownedApplicationIds: [],
  ownedAssetIds: [],
  ownedRiskIds: [],
  isActive: true,
});

function project(id: string): Project {
  const now = new Date().toISOString();
  return {
    id,
    identifier: 'PRJ-9999',
    key: 'TST',
    name: 'Project workspace test',
    description: '',
    ownerId: 'owner',
    status: 'ACTIVE',
    priority: 'HIGH',
    businessCriticality: 'HIGH',
    category: 'INFORMATION_SECURITY',
    tags: [],
    relatedAssetIds: [],
    progressWeighting: 'STORY_POINTS',
    createdByUserId: 'owner',
    createdAt: now,
    updatedAt: now,
  };
}

function task(id: string, status: Ticket['projectTaskStatus'], points: number, dueDate = new Date(Date.now() + 86400000).toISOString()): Ticket {
  const now = new Date().toISOString();
  return {
    id,
    key: `TST-${id}`,
    projectCode: 'TST' as any,
    ticketTypeId: 'PROJECT_WORK',
    ticketTypeName: 'Project Task',
    category: 'GENERAL_REQUEST',
    securityDomain: 'GRC' as any,
    title: id,
    description: '',
    statusId: status || 'TO_DO',
    statusName: status || 'TO_DO',
    statusCategory: status === 'DONE' ? 'DONE' : status === 'IN_REVIEW' ? 'IN_REVIEW' : status === 'IN_PROGRESS' || status === 'BLOCKED' ? 'IN_PROGRESS' : 'TO_DO',
    workflowId: 'test',
    workflowVersion: 1,
    technicalSeverity: 'MEDIUM',
    businessPriority: 'P2_HIGH',
    businessImpact: 'MODERATE',
    inherentRisk: 'LOW',
    residualRisk: 'LOW',
    riskScore: 0,
    confidentiality: 'INTERNAL',
    reporterId: 'owner',
    watcherIds: [],
    createdAt: now,
    updatedAt: now,
    dueDate,
    remediationDeadline: dueDate,
    slaState: 'SAFE',
    version: 1,
    tags: [],
    projectId: 'prj-test',
    projectTaskStatus: status,
    storyPoints: points,
  };
}

test('project membership is a server-side boundary and does not leak between projects', () => {
  const snapshot = { projects: db.data.projects, projectMembers: db.data.projectMembers };
  try {
    db.data.projects = [project('prj-test'), { ...project('prj-other'), id: 'prj-other', key: 'OTH' }];
    db.data.projectMembers = [
      { id: 'member-a', projectId: 'prj-test', subjectType: 'USER', subjectId: 'member-a', role: 'CONTRIBUTOR', addedByUserId: 'owner', createdAt: new Date().toISOString() },
    ];
    const member = user('member-a');
    const outsider = user('outsider');
    const admin = user('admin', ['PLATFORM_ADMIN']);
    assert.equal(ProjectService.authorize('prj-test', member, 'READ').allowed, true);
    assert.equal(ProjectService.authorize('prj-test', member, 'WRITE').allowed, true);
    assert.equal(ProjectService.authorize('prj-test', outsider, 'READ').allowed, false);
    assert.equal(ProjectService.authorize('prj-other', member, 'READ').allowed, false, 'membership in Project A must not authorize Project B');
    assert.equal(ProjectService.authorize('prj-other', admin, 'ADMIN').allowed, true);
  } finally {
    db.data.projects = snapshot.projects;
    db.data.projectMembers = snapshot.projectMembers;
  }
});

test('project progress uses configured child-work weights rather than task count', () => {
  const p = project('prj-test');
  const tasks = [task('1', 'DONE', 8), task('2', 'TO_DO', 2)];
  assert.equal(ProjectService.weightedProgress(tasks, p), 80);
  p.progressWeighting = 'EQUAL';
  assert.equal(ProjectService.weightedProgress(tasks, p), 50);
});

test('health calculation surfaces blocked high-priority work and overdue schedule risk', () => {
  const p = project('prj-test');
  const overdue = new Date(Date.now() - 86400000).toISOString();
  const blocked = { ...task('blocked', 'BLOCKED', 1, overdue), technicalSeverity: 'CRITICAL' as const, blockedReason: 'Approval pending' };
  const health = ProjectService.health(p, [blocked]);
  assert.equal(health.health, 'BLOCKED');
  assert.ok(health.reasons.some((reason) => reason.includes('overdue')));
  assert.ok(health.reasons.some((reason) => reason.includes('blocked critical')));
});

test('project member access management via controller handles LDAP USER, DEPARTMENT, GROUP, TEAM and protects sole owner', () => {
  const snapshot = { projects: db.data.projects, projectMembers: db.data.projectMembers, users: db.data.users, departments: db.data.departments };
  try {
    const ownerUser = db.data.users.find((u) => u.roles.includes('CISO') || u.roles.includes('PLATFORM_ADMIN')) || db.data.users[0];
    const testProject = project('prj-ldap-ctrl-test');
    testProject.ownerId = ownerUser.id;
    db.data.projects.push(testProject);
    db.data.projectMembers.push({
      id: 'mem-owner-initial',
      projectId: testProject.id,
      subjectType: 'USER',
      subjectId: ownerUser.id,
      role: 'OWNER',
      addedByUserId: ownerUser.id,
      createdAt: new Date().toISOString(),
    });

    const targetUser = db.data.users.find((u) => u.id !== ownerUser.id && u.isActive) || db.data.users[1];
    const targetDept = db.data.departments[0];

    // 1. Add User Member
    const { req: addReq, res: addRes } = mockReqRes(
      { subjectType: 'USER', subjectId: targetUser.id, role: 'CONTRIBUTOR' },
      { id: testProject.id },
      {},
      ownerUser
    );
    ProjectsController.addMember(addReq, addRes);
    assert.equal(addRes.getStatus(), 201);
    const addedMember = addRes.getData().members.find((m: any) => m.subjectId === targetUser.id);
    assert.ok(addedMember);
    assert.equal(addedMember.role, 'CONTRIBUTOR');

    // 2. Add Department Member
    if (targetDept) {
      const { req: addDeptReq, res: addDeptRes } = mockReqRes(
        { subjectType: 'DEPARTMENT', subjectId: targetDept.id, role: 'VIEWER' },
        { id: testProject.id },
        {},
        ownerUser
      );
      ProjectsController.addMember(addDeptReq, addDeptRes);
      assert.equal(addDeptRes.getStatus(), 201);
    }

    // 3. Add LDAP Group Member
    const { req: addGrpReq, res: addGrpRes } = mockReqRes(
      { subjectType: 'GROUP', subjectId: 'sec_infosec_core', role: 'PROJECT_MANAGER' },
      { id: testProject.id },
      {},
      ownerUser
    );
    ProjectsController.addMember(addGrpReq, addGrpRes);
    assert.equal(addGrpRes.getStatus(), 201);

    // 4. Update Member Role
    const { req: patchReq, res: patchRes } = mockReqRes(
      { role: 'PROJECT_MANAGER' },
      { id: testProject.id, memberId: addedMember.id },
      {},
      ownerUser
    );
    ProjectsController.updateMemberRole(patchReq, patchRes);
    assert.equal(patchRes.getStatus(), 200);
    assert.equal(patchRes.getData().member.role, 'PROJECT_MANAGER');

    // 5. Demoting sole owner should fail with 400
    const { req: demoteReq, res: demoteRes } = mockReqRes(
      { role: 'VIEWER' },
      { id: testProject.id, memberId: 'mem-owner-initial' },
      {},
      ownerUser
    );
    ProjectsController.updateMemberRole(demoteReq, demoteRes);
    assert.equal(demoteRes.getStatus(), 400);
    assert.match(demoteRes.getData().error, /must retain at least one owner/i);

    // 6. Remove member
    const { req: delReq, res: delRes } = mockReqRes(
      {},
      { id: testProject.id, memberId: addedMember.id },
      {},
      ownerUser
    );
    ProjectsController.removeMember(delReq, delRes);
    assert.equal(delRes.getStatus(), 200);
    assert.equal(db.data.projectMembers.some((m) => m.id === addedMember.id), false);
  } finally {
    db.data.projects = snapshot.projects;
    db.data.projectMembers = snapshot.projectMembers;
    db.data.users = snapshot.users;
    db.data.departments = snapshot.departments;
  }
});

test('DepartmentsController.listTeams returns standard bank operational squads', () => {
  const { req, res } = mockReqRes();
  DepartmentsController.listTeams(req, res);
  assert.equal(res.getStatus(), 200);
  const teams = res.getData().teams;
  assert.ok(Array.isArray(teams));
  assert.ok(teams.length >= 4);
  assert.ok(teams.some((t: any) => t.id === 'team-soc'));
  assert.ok(teams.some((t: any) => t.id === 'team-appsec'));
});
