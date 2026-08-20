import type { DatabaseSchema } from './database.js';

/**
 * Runtime storage starts without fabricated bank records.
 *
 * Directory identities come from the configured Active Directory synchronizer;
 * tickets, CMDB data, workflow definitions and other business records are
 * created through authenticated API flows or approved integrations. Test
 * fixtures belong in test-only files, never in the operational baseline.
 */
export const initialSeedData: DatabaseSchema = {
  divisions: [], departments: [], teams: [], users: [], workflows: [], slaPolicies: [],
  tickets: [], approvals: [], assets: [], applications: [], risks: [], comments: [],
  attachments: [], auditEvents: [], automationRules: [], queues: [], kbArticles: [],
  ideas: [], requestForms: [], requestSubmissions: [], blueprints: [], workflowRuns: [],
  proofingDocuments: [], ganttDependencies: [], notifications: [], connections: [], savedFilters: [],
  ticketRelationships: [], ticketTasks: [], ticketWorklogs: [], ticketSlaInstances: [],
  ticketSatisfaction: [], ticketAiRecommendations: [], workflowDefinitions: [], workflowVersions: [],
  workflowCatalogTemplates: [], formDefinitionsV2: [], formFieldGroupsV2: [], formVersions: [],
  requestTypesV2: [], workflowPolicySets: [], assignmentRulesV2: [], businessCalendarsV2: [],
  connectorDefinitions: [], notificationPoliciesV2: [], workflowInstances: [], nodeInstances: [],
  nodeAttempts: [], deadLetters: [], workItemsV2: [], workRelations: [], workflowSlaClocks: [],
  notificationDeliveries: [], triggerReceipts: [], executionEvents: [],
};
