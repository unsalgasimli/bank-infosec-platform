import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../server/db/database.js';
import { WrikeController } from '../server/controllers/wrike.controller.js';
import type { BankUser } from '../shared/types/auth.js';
import type { Ticket } from '../shared/types/ticket.js';

function responseMock() {
  let statusCode = 200;
  let body: any;
  const response: any = {
    status: (code: number) => {
      statusCode = code;
      return response;
    },
    json: (value: unknown) => {
      body = value;
      return response;
    },
  };
  return { response, status: () => statusCode, body: () => body };
}

test('Gantt and workload APIs do not disclose another user work from My Work scopes', async (t) => {
  const originalUsers = db.data.users;
  const originalTickets = db.data.tickets;
  const originalDependencies = db.data.ganttDependencies;

  const baseUser = db.data.users[0];
  const baseTicket = db.data.tickets[0];
  const analyst: BankUser = {
    ...baseUser,
    id: 'usr-work-scope-analyst',
    username: 'work.scope.analyst',
    email: 'work.scope.analyst@example.test',
    fullName: 'Work Scope Analyst',
    departmentId: 'dept-work-scope-a',
    teamIds: [],
    roles: ['REQUESTER'],
    securityClearance: 'INTERNAL',
    ownedApplicationIds: [],
    ownedAssetIds: [],
    ownedRiskIds: [],
    isActive: true,
  };
  const otherUser: BankUser = {
    ...analyst,
    id: 'usr-work-scope-other',
    username: 'work.scope.other',
    email: 'work.scope.other@example.test',
    fullName: 'Other User',
    departmentId: 'dept-work-scope-b',
  };
  const myTicket: Ticket = {
    ...baseTicket,
    id: 'tick-work-scope-mine',
    key: 'SEC-WORK-MINE',
    title: 'My private assigned task',
    assigneeId: analyst.id,
    reporterId: analyst.id,
    departmentId: analyst.departmentId,
    targetDepartmentId: undefined,
    participatingDepartmentIds: [],
    watcherIds: [analyst.id],
    participantIds: [analyst.id],
    confidentiality: 'INTERNAL',
    restrictedUserIds: [],
    restrictedTeamIds: [],
  };
  const otherTicket: Ticket = {
    ...myTicket,
    id: 'tick-work-scope-other',
    key: 'SEC-WORK-OTHER',
    title: 'Another user private assigned task',
    assigneeId: otherUser.id,
    reporterId: otherUser.id,
    departmentId: otherUser.departmentId,
    watcherIds: [otherUser.id],
    participantIds: [otherUser.id],
  };

  db.data.users = [analyst, otherUser];
  db.data.tickets = [myTicket, otherTicket];
  db.data.ganttDependencies = [{
    id: 'dep-work-scope-cross-boundary',
    fromTaskId: myTicket.id,
    toTaskId: otherTicket.id,
    type: 'FINISH_TO_START',
  }];
  t.after(() => {
    db.data.users = originalUsers;
    db.data.tickets = originalTickets;
    db.data.ganttDependencies = originalDependencies;
  });

  const gantt = responseMock();
  await WrikeController.getGanttSchedule({ user: analyst, query: { scope: 'assigned' } } as any, gantt.response);
  assert.equal(gantt.status(), 200);
  assert.deepEqual(gantt.body().tasks.map((task: Ticket) => task.id), [myTicket.id]);
  assert.deepEqual(gantt.body().dependencies, []);
  assert.deepEqual(gantt.body().criticalPathTaskIds, [myTicket.id]);

  const workload = responseMock();
  await WrikeController.getWorkload({ user: analyst, query: { scope: 'assigned' } } as any, workload.response);
  assert.equal(workload.status(), 200);
  assert.deepEqual(workload.body().members.map((member: { userId: string }) => member.userId), [analyst.id]);
  assert.deepEqual(workload.body().members[0].assignedTicketIds, [myTicket.id]);

  const crossScopeLink = responseMock();
  await WrikeController.addGanttDependency({
    user: analyst,
    body: { fromTaskId: myTicket.id, toTaskId: otherTicket.id, type: 'FINISH_TO_START' },
  } as any, crossScopeLink.response);
  assert.equal(crossScopeLink.status(), 403);
  assert.equal(db.data.ganttDependencies.length, 1, 'a rejected cross-scope link must not be persisted');
});
