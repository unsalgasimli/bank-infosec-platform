import test from 'node:test';
import assert from 'node:assert/strict';
import { getKanbanColumnId } from '../client/components/tickets/TicketKanbanBoard.js';

const ticket = (overrides: Partial<Parameters<typeof getKanbanColumnId>[0]> = {}) => ({
  statusCategory: 'TO_DO' as const,
  statusId: 'OPEN',
  statusName: 'Open',
  ...overrides,
});

test('Kanban lanes are mutually exclusive by workflow category', () => {
  assert.equal(getKanbanColumnId(ticket({ statusCategory: 'TO_DO', statusId: 'OPEN' })), 'col-todo');
  assert.equal(getKanbanColumnId(ticket({ statusCategory: 'IN_PROGRESS', statusId: 'CUSTOM_WORK', statusName: 'Doing' })), 'col-progress');
  assert.equal(getKanbanColumnId(ticket({ statusCategory: 'IN_REVIEW', statusId: 'CUSTOM_REVIEW', statusName: 'Review' })), 'col-review');
  assert.equal(getKanbanColumnId(ticket({ statusCategory: 'DONE', statusId: 'FINAL_STATE', statusName: 'Final' })), 'col-done');
  assert.equal(getKanbanColumnId(ticket({ statusCategory: 'CANCELLED', statusId: 'CANCELLED', statusName: 'Cancelled' })), 'col-done');
});

test('Kanban prefers explicit workflow state over a broad legacy category', () => {
  assert.equal(getKanbanColumnId(ticket({ statusCategory: 'IN_PROGRESS', statusId: 'UNDER_REVIEW', statusName: 'Under Review' })), 'col-review');
  assert.equal(getKanbanColumnId(ticket({ statusCategory: 'IN_PROGRESS', statusId: 'OPEN', statusName: 'Legacy open' })), 'col-todo');
});
