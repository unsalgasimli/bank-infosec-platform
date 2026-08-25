import test from 'node:test';
import assert from 'node:assert/strict';
import { OrchestrationExpressionService } from '../server/services/orchestration-expression.service.js';

test('workflow condition operators evaluate typed requester and intake values', () => {
  const context = {
    requesterIsDepartmentManager: true,
    requester: { roles: ['REQUESTER', 'DEPARTMENT_MANAGER'], groups: ['team-retail'] },
    accessType: 'TEMPORARY',
    requestedDays: 30,
  };

  assert.equal(OrchestrationExpressionService.evaluate({ combinator: 'ALL', clauses: [{ left: { source: 'CONTEXT', path: 'requesterIsDepartmentManager' }, operator: 'IS_TRUE' }] }, context), true);
  assert.equal(OrchestrationExpressionService.evaluate({ combinator: 'ALL', clauses: [{ left: { source: 'CONTEXT', path: 'requester.roles' }, operator: 'CONTAINS', right: { source: 'LITERAL', value: 'DEPARTMENT_MANAGER' } }] }, context), true);
  assert.equal(OrchestrationExpressionService.evaluate({ combinator: 'ALL', clauses: [{ left: { source: 'CONTEXT', path: 'accessType' }, operator: 'NOT_EQUALS', right: { source: 'LITERAL', value: 'PERMANENT' } }] }, context), true);
  assert.equal(OrchestrationExpressionService.evaluate({ combinator: 'ALL', clauses: [{ left: { source: 'CONTEXT', path: 'requestedDays' }, operator: 'GREATER_THAN', right: { source: 'LITERAL', value: 7 } }] }, context), true);
  assert.equal(OrchestrationExpressionService.evaluate({ combinator: 'ALL', clauses: [{ left: { source: 'CONTEXT', path: 'requester.managerId' }, operator: 'NOT_EXISTS' }] }, context), true);
});
