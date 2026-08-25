import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../server/db/database.js';
import { ProjectService } from '../server/services/project.service.js';
import { ProjectsController } from '../server/controllers/projects.controller.js';
import { DepartmentsController } from '../server/controllers/departments.controller.js';
import { StorageController } from '../server/controllers/storage.controller.js';
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

test('project work-item permissions prevent viewers and restricted contributors from transitioning work', () => {
  const snapshot = { projects: db.data.projects, projectMembers: db.data.projectMembers, tickets: db.data.tickets };
  try {
    const p = project('prj-work-access');
    const contributor = user('contributor');
    const restricted = user('restricted');
    const owner = user('owner');
    const assignedTask = { ...task('assigned', 'IN_PROGRESS', 1), projectId: p.id, assigneeId: contributor.id, reporterId: owner.id, version: 4 };
    db.data.projects = [p];
    db.data.projectMembers = [
      { id: 'owner-member', projectId: p.id, subjectType: 'USER', subjectId: owner.id, role: 'OWNER', addedByUserId: owner.id, createdAt: new Date().toISOString() },
      { id: 'contributor-member', projectId: p.id, subjectType: 'USER', subjectId: contributor.id, role: 'CONTRIBUTOR', addedByUserId: owner.id, createdAt: new Date().toISOString() },
      { id: 'restricted-member', projectId: p.id, subjectType: 'USER', subjectId: restricted.id, role: 'RESTRICTED_CONTRIBUTOR', addedByUserId: owner.id, createdAt: new Date().toISOString() },
    ];
    db.data.tickets = [assignedTask];

    assert.equal(ProjectService.canUseProjectTask(p.id, assignedTask, contributor, 'TRANSITION').allowed, true);
    assert.equal(ProjectService.canUseProjectTask(p.id, assignedTask, restricted, 'TRANSITION').allowed, false);
    assert.equal(ProjectService.canUseProjectTask(p.id, assignedTask, restricted, 'COMMENT').allowed, false, 'restricted users cannot comment on a task they cannot see');

    const { req: deniedReq, res: deniedRes } = mockReqRes({ status: 'DONE', expectedVersion: 4 }, { id: p.id, taskId: assignedTask.id }, {}, restricted);
    ProjectsController.updateTask(deniedReq, deniedRes);
    assert.equal(deniedRes.getStatus(), 404, 'hidden work remains non-enumerable to restricted users');
    assert.equal(assignedTask.projectTaskStatus, 'IN_PROGRESS');

    const { req: staleReq, res: staleRes } = mockReqRes({ status: 'DONE', expectedVersion: 3 }, { id: p.id, taskId: assignedTask.id }, {}, contributor);
    ProjectsController.updateTask(staleReq, staleRes);
    assert.equal(staleRes.getStatus(), 409);

    const { req: transitionReq, res: transitionRes } = mockReqRes({ status: 'DONE', expectedVersion: 4 }, { id: p.id, taskId: assignedTask.id }, {}, contributor);
    ProjectsController.updateTask(transitionReq, transitionRes);
    assert.equal(transitionRes.getStatus(), 200);
    assert.equal(assignedTask.projectTaskStatus, 'DONE');
  } finally {
    db.data.projects = snapshot.projects;
    db.data.projectMembers = snapshot.projectMembers;
    db.data.tickets = snapshot.tickets;
  }
});

test('configured project workflows reject transitions outside the engine graph or caller role', () => {
  const snapshot = { projects: db.data.projects, projectMembers: db.data.projectMembers, tickets: db.data.tickets, workflows: db.data.workflows, notifications: db.data.notifications };
  try {
    const owner = user('owner', ['REQUESTER']);
    const contributor = user('contributor', ['REQUESTER']);
    const p = { ...project('prj-workflow'), workflowId: 'wf-project' };
    const work = { ...task('workflow-task', 'TO_DO', 1), projectId: p.id, workflowId: 'wf-project', workflowVersion: 1, assigneeId: contributor.id, reporterId: owner.id, watcherIds: [owner.id], version: 1 };
    db.data.projects = [p];
    db.data.projectMembers = [
      { id: 'owner-member', projectId: p.id, subjectType: 'USER', subjectId: owner.id, role: 'OWNER', addedByUserId: owner.id, createdAt: new Date().toISOString() },
      { id: 'contributor-member', projectId: p.id, subjectType: 'USER', subjectId: contributor.id, role: 'CONTRIBUTOR', addedByUserId: owner.id, createdAt: new Date().toISOString() },
    ];
    db.data.tickets = [work];
    db.data.notifications = [];
    db.data.workflows = [{
      id: 'wf-project', name: 'Project delivery', description: '', ticketTypeId: 'PROJECT_WORK', version: 1, isActive: true,
      states: [
        { id: 'TO_DO', name: 'To Do', category: 'TO_DO', color: '#94a3b8', isInitial: true },
        { id: 'IN_PROGRESS', name: 'In Progress', category: 'IN_PROGRESS', color: '#2563eb' },
        { id: 'DONE', name: 'Done', category: 'DONE', color: '#16a34a', isTerminal: true },
      ],
      transitions: [{ id: 'start', name: 'Start work', fromStateId: 'TO_DO', toStateId: 'IN_PROGRESS', allowedRoles: ['REQUESTER'], requireComment: true }],
    }];

    const { req: forbiddenGraphReq, res: forbiddenGraphRes } = mockReqRes({ status: 'DONE', expectedVersion: 1 }, { id: p.id, taskId: work.id }, {}, contributor);
    ProjectsController.updateTask(forbiddenGraphReq, forbiddenGraphRes);
    assert.equal(forbiddenGraphRes.getStatus(), 403);
    assert.equal(work.projectTaskStatus, 'TO_DO');

    const { req: missingCommentReq, res: missingCommentRes } = mockReqRes({ status: 'IN_PROGRESS', expectedVersion: 1 }, { id: p.id, taskId: work.id }, {}, contributor);
    ProjectsController.updateTask(missingCommentReq, missingCommentRes);
    assert.equal(missingCommentRes.getStatus(), 400);

    const { req: allowedReq, res: allowedRes } = mockReqRes({ status: 'IN_PROGRESS', expectedVersion: 1, transitionComment: 'Starting approved work.' }, { id: p.id, taskId: work.id }, {}, contributor);
    ProjectsController.updateTask(allowedReq, allowedRes);
    assert.equal(allowedRes.getStatus(), 200);
    assert.equal(work.projectTaskStatus, 'IN_PROGRESS');
    assert.equal(db.data.notifications[0]?.userId, owner.id);
  } finally {
    db.data.projects = snapshot.projects;
    db.data.projectMembers = snapshot.projectMembers;
    db.data.tickets = snapshot.tickets;
    db.data.workflows = snapshot.workflows;
    db.data.notifications = snapshot.notifications;
  }
});

test('project members can toggle only their own watcher subscription', () => {
  const snapshot = { projects: db.data.projects, projectMembers: db.data.projectMembers, tickets: db.data.tickets, users: db.data.users };
  try {
    const owner = user('owner');
    const contributor = user('contributor');
    const p = project('prj-watchers');
    const work = { ...task('watch-task', 'TO_DO', 1), projectId: p.id, reporterId: owner.id, watcherIds: [] };
    db.data.projects = [p];
    db.data.projectMembers = [
      { id: 'owner-member', projectId: p.id, subjectType: 'USER', subjectId: owner.id, role: 'OWNER', addedByUserId: owner.id, createdAt: new Date().toISOString() },
      { id: 'contributor-member', projectId: p.id, subjectType: 'USER', subjectId: contributor.id, role: 'CONTRIBUTOR', addedByUserId: owner.id, createdAt: new Date().toISOString() },
    ];
    db.data.tickets = [work];
    db.data.users = [owner, contributor];

    const { req: watchReq, res: watchRes } = mockReqRes({}, { id: p.id, taskId: work.id }, {}, contributor);
    ProjectsController.toggleWatcher(watchReq, watchRes);
    assert.equal(watchRes.getStatus(), 200);
    assert.equal(watchRes.getData().watching, true);
    assert.deepEqual(work.watcherIds, [contributor.id]);

    const { req: forbiddenReq, res: forbiddenRes } = mockReqRes({ userId: owner.id }, { id: p.id, taskId: work.id }, {}, contributor);
    ProjectsController.toggleWatcher(forbiddenReq, forbiddenRes);
    assert.equal(forbiddenRes.getStatus(), 403);
  } finally {
    db.data.projects = snapshot.projects;
    db.data.projectMembers = snapshot.projectMembers;
    db.data.tickets = snapshot.tickets;
    db.data.users = snapshot.users;
  }
});

test('project task list filters are evaluated on the authorized server projection', () => {
  const snapshot = { projects: db.data.projects, projectMembers: db.data.projectMembers, tickets: db.data.tickets };
  try {
    const owner = user('owner');
    const p = project('prj-server-filter');
    db.data.projects = [p];
    db.data.projectMembers = [{ id: 'owner-member', projectId: p.id, subjectType: 'USER', subjectId: owner.id, role: 'OWNER', addedByUserId: owner.id, createdAt: new Date().toISOString() }];
    db.data.tickets = [
      { ...task('first', 'TO_DO', 1), projectId: p.id, title: 'First delivery item' },
      { ...task('second', 'IN_PROGRESS', 1), projectId: p.id, title: 'Second delivery item' },
    ];
    const { req, res } = mockReqRes({}, { id: p.id }, { taskStatus: 'IN_PROGRESS', taskSearch: 'second' }, owner);
    ProjectsController.get(req, res);
    assert.equal(res.getStatus(), 200);
    assert.equal(res.getData().tasks.length, 1);
    assert.equal(res.getData().tasks[0].title, 'Second delivery item');
  } finally {
    db.data.projects = snapshot.projects;
    db.data.projectMembers = snapshot.projectMembers;
    db.data.tickets = snapshot.tickets;
  }
});

test('project work-item type schemes and assignment boundaries are validated on creation', () => {
  const snapshot = { projects: db.data.projects, projectMembers: db.data.projectMembers, tickets: db.data.tickets, users: db.data.users };
  try {
    const owner = user('owner');
    const outsider = user('outsider');
    const p = { ...project('prj-work-types'), workItemTypes: ['TASK'] as const };
    db.data.projects = [p];
    db.data.projectMembers = [{ id: 'owner-member', projectId: p.id, subjectType: 'USER', subjectId: owner.id, role: 'OWNER', addedByUserId: owner.id, createdAt: new Date().toISOString() }];
    db.data.users = [owner, outsider];
    db.data.tickets = [];

    const { req: disabledTypeReq, res: disabledTypeRes } = mockReqRes({ title: 'Security finding', projectWorkItemType: 'SECURITY_FINDING' }, { id: p.id }, {}, owner);
    ProjectsController.createTask(disabledTypeReq, disabledTypeRes);
    assert.equal(disabledTypeRes.getStatus(), 400);

    const { req: outsiderReq, res: outsiderRes } = mockReqRes({ title: 'Task', projectWorkItemType: 'TASK', assigneeId: outsider.id }, { id: p.id }, {}, owner);
    ProjectsController.createTask(outsiderReq, outsiderRes);
    assert.equal(outsiderRes.getStatus(), 400);
  } finally {
    db.data.projects = snapshot.projects;
    db.data.projectMembers = snapshot.projectMembers;
    db.data.tickets = snapshot.tickets;
    db.data.users = snapshot.users;
  }
});

test('project managers can persist a work-item type scheme and empty schemes are rejected', () => {
  const snapshot = { projects: db.data.projects, projectMembers: db.data.projectMembers, projectActivities: db.data.projectActivities, auditEvents: db.data.auditEvents };
  try {
    const owner = user('owner');
    const p = { ...project('prj-work-types-settings'), workItemTypes: ['TASK', 'SUBTASK'] as const };
    db.data.projects = [p];
    db.data.projectMembers = [{ id: 'owner-member', projectId: p.id, subjectType: 'USER', subjectId: owner.id, role: 'OWNER', addedByUserId: owner.id, createdAt: new Date().toISOString() }];
    db.data.projectActivities = [];
    db.data.auditEvents = [];

    const { req: updateReq, res: updateRes } = mockReqRes({ workItemTypes: ['TASK', 'BUG', 'SECURITY_FINDING'] }, { id: p.id }, {}, owner);
    ProjectsController.update(updateReq, updateRes);
    assert.equal(updateRes.getStatus(), 200);
    assert.deepEqual(p.workItemTypes, ['TASK', 'BUG', 'SECURITY_FINDING']);
    assert.equal(db.data.projectActivities[0]?.action, 'PROJECT_UPDATED');
    assert.equal(db.data.auditEvents[0]?.action, 'PROJECT_UPDATED');

    const { req: emptyReq, res: emptyRes } = mockReqRes({ workItemTypes: [] }, { id: p.id }, {}, owner);
    ProjectsController.update(emptyReq, emptyRes);
    assert.equal(emptyRes.getStatus(), 400);
    assert.deepEqual(p.workItemTypes, ['TASK', 'BUG', 'SECURITY_FINDING']);
  } finally {
    db.data.projects = snapshot.projects;
    db.data.projectMembers = snapshot.projectMembers;
    db.data.projectActivities = snapshot.projectActivities;
    db.data.auditEvents = snapshot.auditEvents;
  }
});

test('project task detail is project-scoped and only returns public comments for visible work', () => {
  const snapshot = { projects: db.data.projects, projectMembers: db.data.projectMembers, tickets: db.data.tickets, comments: db.data.comments, attachments: db.data.attachments, projectTaskDependencies: db.data.projectTaskDependencies, projectActivities: db.data.projectActivities };
  try {
    const owner = user('owner');
    const restricted = user('restricted');
    const p = project('prj-task-detail');
    const visibleTask = { ...task('visible', 'TO_DO', 1), projectId: p.id, reporterId: owner.id };
    const hiddenTask = { ...task('hidden', 'TO_DO', 1), projectId: p.id, reporterId: owner.id };
    db.data.projects = [p];
    db.data.projectMembers = [
      { id: 'owner-member', projectId: p.id, subjectType: 'USER', subjectId: owner.id, role: 'OWNER', addedByUserId: owner.id, createdAt: new Date().toISOString() },
      { id: 'restricted-member', projectId: p.id, subjectType: 'USER', subjectId: restricted.id, role: 'RESTRICTED_CONTRIBUTOR', addedByUserId: owner.id, createdAt: new Date().toISOString() },
    ];
    db.data.tickets = [visibleTask, hiddenTask];
    db.data.comments = [
      { id: 'public-comment', ticketId: visibleTask.id, authorId: owner.id, authorName: owner.fullName, authorRole: 'OWNER', content: 'Public progress note', visibility: 'PUBLIC', confidentiality: 'INTERNAL', mentions: [], createdAt: new Date().toISOString(), isEdited: false, reactions: [] },
      { id: 'internal-comment', ticketId: visibleTask.id, authorId: owner.id, authorName: owner.fullName, authorRole: 'OWNER', content: 'Not for this projection', visibility: 'INTERNAL', confidentiality: 'INTERNAL', mentions: [], createdAt: new Date().toISOString(), isEdited: false, reactions: [] },
    ];
    db.data.attachments = [{ id: 'attachment-hidden', ticketId: hiddenTask.id, fileName: 'hidden.txt', fileSizeBytes: 4, mimeType: 'text/plain', evidenceType: 'AUDIT_WORKPAPER', sha256Checksum: 'a'.repeat(64), isEncrypted: true, virusScanStatus: 'CLEAN', confidentiality: 'INTERNAL', uploaderId: owner.id, uploaderName: owner.fullName, uploadedAt: new Date().toISOString(), isImmutableEvidence: false, retentionUntil: new Date().toISOString(), downloadCount: 0, storageKey: 'hidden.txt' }];
    db.data.projectTaskDependencies = [{ id: 'dep-1', projectId: p.id, sourceTaskId: visibleTask.id, targetTaskId: hiddenTask.id, type: 'BLOCKS', createdByUserId: owner.id, createdAt: new Date().toISOString() }];
    db.data.projectActivities = [{ id: 'act-1', projectId: p.id, actorId: owner.id, action: 'PROJECT_COMMENT_ADDED', objectType: 'TASK', objectId: visibleTask.id, createdAt: new Date().toISOString() }];

    const { req: detailReq, res: detailRes } = mockReqRes({}, { id: p.id, taskId: visibleTask.id }, {}, owner);
    ProjectsController.getTask(detailReq, detailRes);
    assert.equal(detailRes.getStatus(), 200);
    assert.equal(detailRes.getData().comments.length, 1);
    assert.equal(detailRes.getData().comments[0].id, 'public-comment');
    assert.equal(detailRes.getData().dependencies.length, 1);

    const { req: deniedReq, res: deniedRes } = mockReqRes({}, { id: p.id, taskId: hiddenTask.id }, {}, restricted);
    ProjectsController.getTask(deniedReq, deniedRes);
    assert.equal(deniedRes.getStatus(), 404);

    const { req: attachmentReq, res: attachmentRes } = mockReqRes({}, { attachmentId: 'attachment-hidden' }, {}, restricted);
    void StorageController.getDownloadUrl(attachmentReq, attachmentRes);
    assert.equal(attachmentRes.getStatus(), 403, 'project attachment lookup must not leak a hidden work item');

    const { req: mismatchedDependencyReq, res: mismatchedDependencyRes } = mockReqRes(
      { sourceTaskId: hiddenTask.id, targetTaskId: visibleTask.id, type: 'BLOCKS' },
      { id: p.id, taskId: visibleTask.id },
      {},
      owner
    );
    ProjectsController.addDependency(mismatchedDependencyReq, mismatchedDependencyRes);
    assert.equal(mismatchedDependencyRes.getStatus(), 400, 'path task and dependency source must match');
  } finally {
    db.data.projects = snapshot.projects;
    db.data.projectMembers = snapshot.projectMembers;
    db.data.tickets = snapshot.tickets;
    db.data.comments = snapshot.comments;
    db.data.attachments = snapshot.attachments;
    db.data.projectTaskDependencies = snapshot.projectTaskDependencies;
    db.data.projectActivities = snapshot.projectActivities;
  }
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
