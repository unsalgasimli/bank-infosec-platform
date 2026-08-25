import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { config } from './config/index.js';
import { logger } from './services/logger.service.js';
import { db } from './db/database.js';
import { pgClient } from './db/postgres/client.js';
import { cacheService } from './services/cache.service.js';
import { authMiddleware, requireAuthentication } from './middleware/auth.middleware.js';
import { requireAdmin, requireSecOps, requireWorkflowDesigner } from './middleware/rbac.middleware.js';
import { securityHeadersMiddleware, complianceHeadersMiddleware, sameOriginMutationMiddleware } from './middleware/security.middleware.js';
import { generalRateLimiter, authRateLimiter } from './middleware/rate-limit.middleware.js';
import { requestTracingMiddleware } from './middleware/logging.middleware.js';
import { errorHandlerMiddleware } from './middleware/error.middleware.js';
import { runMigrations } from './db/postgres/migrate.js';

import { TicketsController } from './controllers/tickets.controller.js';
import { ApprovalsController, FindingsController } from './controllers/approvals.controller.js';
import { DashboardsController } from './controllers/dashboards.controller.js';
import { AssetsController, RisksController, KBController, AdminController } from './controllers/assets.controller.js';
import { CMDBController } from './controllers/cmdb.controller.js';
import { AuthController } from './controllers/auth.controller.js';
import { HealthController } from './controllers/health.controller.js';
import { StorageController } from './controllers/storage.controller.js';
import { WrikeController } from './controllers/wrike.controller.js';
import { NotificationsController } from './controllers/notifications.controller.js';
import { DepartmentsController } from './controllers/departments.controller.js';
import { OrchestrationController } from './controllers/orchestration.controller.js';
import { ProjectsController } from './controllers/projects.controller.js';
import { DirectoryController } from './controllers/directory.controller.js';
import { LDAPSchedulerService } from './services/ldap-scheduler.service.js';
import { WorkflowRuntimeService } from './services/workflow-runtime.service.js';
import { WorkflowTriggerService } from './services/workflow-trigger.service.js';


const app = express();

// Trust reverse proxy (Nginx / Ingress / Load Balancer) for accurate client IP tracking
app.set('trust proxy', 'loopback');

// 1. Core Security & Observability Middlewares
app.use(requestTracingMiddleware);
app.use(securityHeadersMiddleware);
app.use(complianceHeadersMiddleware);
app.use(compression());
app.use(
  cors({
    // The browser UI and API are served from the same origin. A wildcard must
    // not turn credentialed cross-origin requests into an authentication path.
    origin: config.CORS_ORIGIN === '*' ? false : config.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Request-Id'],
  })
);
// Base64 evidence payloads expand by roughly one third; keep the transport
// ceiling aligned with the 25 MiB storage policy rather than rejecting valid uploads.
app.use(express.json({ limit: '36mb' }));
app.use(express.urlencoded({ extended: true, limit: '36mb' }));
app.use('/api', sameOriginMutationMiddleware);

// The existing services expose a synchronous db.persist() compatibility API.
// In PostgreSQL mode, wait for its ordered transaction queue before sending a
// response so successful mutations are durable when the client receives 2xx.
app.use((req, res, next) => {
  if (config.DB_TYPE !== 'postgres' || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  res.json = ((body: unknown) => {
    void db.flush().then(() => originalJson(body)).catch(next);
    return res;
  }) as typeof res.json;
  res.send = ((body?: any) => {
    void db.flush().then(() => originalSend(body)).catch(next);
    return res;
  }) as typeof res.send;
  next();
});

// 2. Health & Observability Endpoints (No auth / rate limiting on health checks)
app.get('/api/health', HealthController.getLiveness);
app.get('/api/health/ready', HealthController.getReadiness);
app.get('/api/metrics', HealthController.getMetrics);

// 3. Rate Limiting Middleware
app.use('/api', generalRateLimiter);

// 4. Authentication Middleware
app.use(authMiddleware);

// 5. Bank Active Directory / LDAP Authentication, Directory & Daily Check
app.post('/api/auth/ldap-login', authRateLimiter, AuthController.ldapLogin);
app.post('/api/auth/logout', AuthController.logout);
app.get('/api/auth/me', AuthController.getCurrentUser);
app.get('/api/auth/public-directory', AuthController.getPublicDirectory);

// Every route below this point requires a server-validated session cookie.
app.use('/api', requireAuthentication);

app.get('/api/auth/ldap/groups', AuthController.listGroups);
app.get('/api/auth/users', AuthController.listUsers);
app.get('/api/directory/assignment-options', DirectoryController.assignmentOptions);
app.post('/api/admin/ldap/sync', requireAdmin, AuthController.triggerLdapSync);
app.get('/api/admin/ldap/sync-status', requireAdmin, AuthController.getLdapSyncStatus);
app.get('/api/admin/ldap/departments', requireAdmin, AuthController.getUsersByDepartment);
app.post('/api/admin/ldap/test-connection', requireAdmin, AuthController.testActiveDirectoryConnection);

// 6. Tickets
app.get('/api/tickets', TicketsController.list);
app.get('/api/tickets/intake-options', TicketsController.intakeOptions);
app.post('/api/tickets', TicketsController.create);
app.post('/api/tickets/multi-task-workflow', TicketsController.createMultiTaskWorkflow);
app.post('/api/tickets/bulk', TicketsController.bulkUpdate);
app.get('/api/tickets/:id', TicketsController.getById);
app.patch('/api/tickets/:id', TicketsController.update);
app.post('/api/tickets/:id/claim', TicketsController.claim);
app.post('/api/tickets/:id/transition', TicketsController.transition);
app.post('/api/tickets/:id/comments', TicketsController.addComment);
app.get('/api/tickets/:id/lifecycle', TicketsController.getLifecycle);
app.post('/api/tickets/:id/relationships', TicketsController.addRelationship);
app.post('/api/tickets/:id/merge', TicketsController.mergeDuplicate);
app.post('/api/tickets/:id/tasks', TicketsController.addTask);
app.patch('/api/tickets/:id/tasks/:taskId', TicketsController.updateTask);
app.post('/api/tickets/:id/sub-tickets', TicketsController.createSubTicket);
app.post('/api/tickets/:id/worklogs', TicketsController.addWorklog);
app.post('/api/tickets/:id/satisfaction', TicketsController.submitSatisfaction);
app.post('/api/tickets/:id/ai-analysis', TicketsController.analyze);
app.post('/api/tickets/:id/ai-recommendations/:recommendationId/apply', TicketsController.applyRecommendation);

// 6b. Project Operations Workspace. Every resource endpoint rechecks the
// authenticated caller's project membership or global administrative role.
app.get('/api/projects', ProjectsController.list);
app.post('/api/projects', ProjectsController.create);
app.get('/api/projects/:id', ProjectsController.get);
app.patch('/api/projects/:id', ProjectsController.update);
app.post('/api/projects/:id/members', ProjectsController.addMember);
app.patch('/api/projects/:id/members/:memberId', ProjectsController.updateMemberRole);
app.delete('/api/projects/:id/members/:memberId', ProjectsController.removeMember);
app.post('/api/projects/:id/milestones', ProjectsController.createMilestone);
app.post('/api/projects/:id/tasks', ProjectsController.createTask);
app.patch('/api/projects/:id/tasks/:taskId', ProjectsController.updateTask);
app.post('/api/projects/:id/tasks/:taskId/dependencies', ProjectsController.addDependency);
app.post('/api/projects/:id/tasks/:taskId/comments', ProjectsController.addComment);
app.post('/api/projects/:id/status-updates', ProjectsController.addStatusUpdate);
app.get('/api/projects/:id/activity', ProjectsController.listActivity);
app.get('/api/projects/:id/status-report', ProjectsController.report);

// 7. Multi-Stage Approvals
app.get('/api/approvals/pending', ApprovalsController.listPending);
app.post('/api/approvals/:chainId/steps/:stepId/decision', ApprovalsController.submitDecision);

// 8. Dashboards
app.get('/api/dashboards/ciso', DashboardsController.getCisoMetrics);
app.get('/api/dashboards/lead', DashboardsController.getLeadMetrics);
app.get('/api/dashboards/analyst', DashboardsController.getAnalystWorkspace);

// 9. Wrike Core Features (Ideate, Gantt, Workload, Request Forms, Blueprints, Proofing, Automations)
app.get('/api/ideate', WrikeController.listIdeas);
app.post('/api/ideate', WrikeController.createIdea);
app.patch('/api/ideate/:id', WrikeController.updateIdea);
app.delete('/api/ideate/:id', WrikeController.deleteIdea);
app.post('/api/ideate/:id/convert', WrikeController.convertIdeaToTask);

app.get('/api/gantt', WrikeController.getGanttSchedule);
app.post('/api/gantt/dependencies', WrikeController.addGanttDependency);

app.get('/api/workload', WrikeController.getWorkload);
app.post('/api/workload/rebalance', WrikeController.rebalanceWorkload);

app.get('/api/request-forms', WrikeController.listRequestForms);
app.post('/api/request-forms/:id/submit', WrikeController.submitRequestForm);

app.get('/api/automations', WrikeController.listAutomations);
app.get('/api/blueprints', WrikeController.listBlueprints);
app.post('/api/blueprints', WrikeController.createBlueprint);
app.get('/api/workflow-templates', WrikeController.listBlueprints);
app.post('/api/workflow-templates', WrikeController.createBlueprint);
app.get('/api/workflow-templates/metadata', WrikeController.getWorkflowTemplateMetadata);
app.get('/api/workflow-templates/assignment-options', WrikeController.getWorkflowAssignmentOptions);
app.get('/api/workflow-runs', WrikeController.listWorkflowRuns);
app.get('/api/workflow-templates/:id/preview', WrikeController.previewBlueprint);
app.post('/api/workflow-templates/graph/validate', WrikeController.validateGraph);
app.post('/api/workflow-templates/:id/clone', WrikeController.cloneBlueprint);
app.post('/api/workflow-templates/custom/launch', WrikeController.launchCustomWorkflow);
app.post('/api/workflow-templates/:id/launch', WrikeController.launchBlueprint);
app.post('/api/blueprints/:id/launch', WrikeController.launchBlueprint);

// Universal Enterprise Work Orchestration API. Catalog, Builder and Quick Work
// are three clients of these same versioned definition/runtime endpoints.
app.get('/api/orchestration/catalog', OrchestrationController.catalog);
app.get('/api/orchestration/catalog/:id', OrchestrationController.template);
app.post('/api/orchestration/catalog/:id/launch', OrchestrationController.launchTemplate);
app.get('/api/orchestration/request-types', OrchestrationController.requestTypes);
app.get('/api/orchestration/governance', requireWorkflowDesigner, OrchestrationController.governanceMetadata);
app.get('/api/orchestration/directory', requireWorkflowDesigner, OrchestrationController.directory);
app.get('/api/orchestration/request-types/:id/form', OrchestrationController.requestForm);
app.post('/api/orchestration/request-types/:id/validate', OrchestrationController.validateForm);
app.post('/api/orchestration/quick-work', OrchestrationController.quickWork);
app.get('/api/orchestration/instances', OrchestrationController.instances);
app.get('/api/orchestration/instances/:id', OrchestrationController.execution);
app.post('/api/orchestration/instances/:id/advance', OrchestrationController.advance);
app.post('/api/orchestration/instances/:id/cancel', OrchestrationController.cancel);
app.post('/api/orchestration/instances/:id/migrate', requireAdmin, OrchestrationController.migrate);
app.post('/api/orchestration/instances/:id/relations', OrchestrationController.addRelation);
app.post('/api/orchestration/instances/:id/comments', OrchestrationController.addComment);
app.post('/api/orchestration/instances/:id/dead-letters/:deadLetterId/requeue', OrchestrationController.requeueDeadLetter);
app.post('/api/orchestration/instances/:id/work-items/:workItemId/complete', OrchestrationController.completeWorkItem);
app.post('/api/orchestration/instances/:id/work-items/:workItemId/claim', OrchestrationController.claimWorkItem);
app.post('/api/orchestration/instances/:id/approvals/:chainId/decision', OrchestrationController.decideApproval);
app.post('/api/orchestration/definitions/drafts', requireWorkflowDesigner, OrchestrationController.saveDraft);
app.get('/api/orchestration/definitions/:id/preflight', OrchestrationController.preflight);
app.post('/api/orchestration/definitions/:id/preflight', OrchestrationController.preflight);
app.post('/api/orchestration/definitions/:id/simulate', OrchestrationController.simulate);
app.post('/api/orchestration/definitions/:id/versions/:version/publish', requireWorkflowDesigner, OrchestrationController.publish);
app.get('/api/orchestration/definitions/:id/compare', requireWorkflowDesigner, OrchestrationController.compareVersions);
app.post('/api/orchestration/definitions/:id/lifecycle', requireWorkflowDesigner, OrchestrationController.lifecycle);
app.post('/api/orchestration/catalog/:id/clone', requireWorkflowDesigner, OrchestrationController.cloneTemplate);
app.delete('/api/orchestration/catalog/:id', requireWorkflowDesigner, OrchestrationController.deleteTemplate);
app.post('/api/orchestration/triggers/events', OrchestrationController.emitTrigger);
app.get('/api/orchestration/analytics', OrchestrationController.analytics);

app.get('/api/proofing', WrikeController.listProofingDocuments);
app.post('/api/proofing/:id/annotations', WrikeController.addProofingAnnotation);
app.post('/api/proofing/:id/sign-off', WrikeController.signOffProofingDocument);

// 9. Notifications Engine & Real-time Alerts
app.get('/api/notifications', NotificationsController.list);
app.patch('/api/notifications/:id/read', NotificationsController.markAsRead);
app.post('/api/notifications/read-all', NotificationsController.markAllAsRead);
app.delete('/api/notifications/:id', NotificationsController.delete);

// 10. Scanner Finding Ingestion & Deduplication
app.post('/api/findings/ingest', FindingsController.ingest);

// 10. Assets & Applications (CMDB)
// Canonical CMDB APIs. Asset, application, and service lists are filtered
// views over configuration_items; no separate operational inventory exists.
app.get('/api/cmdb/cis', CMDBController.list);
app.post('/api/cmdb/cis', CMDBController.create);
app.get('/api/cmdb/cis/:id', CMDBController.get);
app.patch('/api/cmdb/cis/:id', CMDBController.update);
app.post('/api/cmdb/cis/:id/merge', CMDBController.merge);
app.get('/api/cmdb/cis/:id/history', CMDBController.history);
app.get('/api/cmdb/cis/:id/duplicates', CMDBController.duplicates);
app.get('/api/cmdb/cis/:id/relationships', CMDBController.relationships);
app.post('/api/cmdb/cis/:id/relationships', CMDBController.createRelationship);
app.get('/api/cmdb/cis/:id/graph', CMDBController.graph);
app.get('/api/cmdb/cis/:id/impact', CMDBController.impact);
app.post('/api/cmdb/cis/:id/records', CMDBController.linkRecord);
app.get('/api/cmdb/cis/:id/records', CMDBController.relatedRecords);
app.delete('/api/cmdb/relationships/:id', CMDBController.deleteRelationship);
app.get('/api/cmdb/assets', CMDBController.assets);
app.get('/api/cmdb/applications', CMDBController.applications);
app.get('/api/cmdb/business-services', CMDBController.businessServices);
app.get('/api/cmdb/types', CMDBController.types);
app.get('/api/cmdb/views', CMDBController.savedViews);
app.post('/api/cmdb/views', CMDBController.saveView);
app.post('/api/cmdb/types', CMDBController.createType);
app.patch('/api/cmdb/types/:id', CMDBController.updateType);
app.get('/api/cmdb/relationship-types', CMDBController.relationshipTypes);
app.post('/api/cmdb/relationship-types', CMDBController.createRelationshipType);
app.patch('/api/cmdb/relationship-types/:id', CMDBController.updateRelationshipType);
app.post('/api/cmdb/sync/:sourceSystem', CMDBController.sync);
// Compatibility read paths intentionally project the canonical model.
app.get('/api/assets', CMDBController.legacyAssets);
app.post('/api/assets', CMDBController.createLegacyAsset);
app.get('/api/applications', CMDBController.legacyApplications);
app.post('/api/applications', CMDBController.createLegacyApplication);

// 11. Risks & Exceptions
app.get('/api/risks', RisksController.listRisks);
app.post('/api/risks', RisksController.createRisk);

// 12. Knowledge Base
app.get('/api/kb', KBController.listArticles);
app.post('/api/kb', KBController.createArticle);
app.get('/api/kb/:slug', KBController.getArticleBySlug);

// 13. Admin & Audit
app.get('/api/admin/metadata', requireAdmin, AdminController.getMetadata);
app.get('/api/admin/audit', requireAdmin, AdminController.getAuditTrail);

// 14. Enterprise Multi-Department Architecture & Cross-Tasks
app.get('/api/departments', DepartmentsController.listDepartments);
app.get('/api/teams', DepartmentsController.listTeams);
app.post('/api/departments', requireAdmin, DepartmentsController.createDepartment);
app.get('/api/departments/:id', DepartmentsController.getDepartmentById);
app.patch('/api/departments/:id', requireAdmin, DepartmentsController.updateDepartment);
app.patch('/api/departments/:id/settings', requireAdmin, DepartmentsController.updateSettings);
app.post('/api/departments/:id/members', DepartmentsController.addOrUpdateMember);
app.get('/api/departments/:id/connections', DepartmentsController.listConnections);
app.post('/api/departments/:id/connections', DepartmentsController.createConnection);
app.post('/api/departments/:id/connections/:connId/test', DepartmentsController.testConnection);
app.delete('/api/departments/:id/connections/:connId', DepartmentsController.deleteConnection);
app.get('/api/cross-tasks', DepartmentsController.listCrossTasks);
app.post('/api/cross-tasks/launch', DepartmentsController.launchCrossTaskWorkflow);

// 15. Object Storage & Evidence Artifacts
app.post('/api/storage/upload', StorageController.uploadArtifact);
app.get('/api/storage/attachments/:attachmentId/url', StorageController.getDownloadUrl);
app.get('/api/storage/attachments/:attachmentId/download', StorageController.downloadAttachment);

// 15. Serve Static Production Frontend (if built)
const clientDistPath = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// 16. Centralized Error Handler
app.use(errorHandlerMiddleware);

// 17. Server Startup & Graceful Shutdown
let server: ReturnType<typeof app.listen> | null = null;

async function startServer(): Promise<void> {
  if (config.DB_TYPE === 'postgres') {
    await runMigrations();
    await db.initialize();
    logger.info('PostgreSQL projection hydrated and selected as the runtime source of truth.');
  }

  server = app.listen(config.PORT, config.HOST, () => {
    logger.info(
      {
        port: config.PORT,
        host: config.HOST,
        env: config.NODE_ENV,
        dbType: config.DB_TYPE,
        storageProvider: config.STORAGE_PROVIDER,
        redisEnabled: config.REDIS_ENABLED,
      },
      `🛡️ AegisSec Banking GRC & SecOps Production API running on http://${config.HOST}:${config.PORT}`
    );

    // Initialize and start Daily LDAP Synchronization Scheduler at 13:30 GMT+4
    if (config.LDAP_SYNC_AUTO_ENABLED) {
      LDAPSchedulerService.startScheduler();
    }
    WorkflowRuntimeService.startWorker();
    WorkflowTriggerService.startWorker();
  });
}

void startServer().catch((err) => {
  logger.fatal({ err }, 'Server startup failed; refusing to serve with an uninitialized database.');
  process.exit(1);
});

// Graceful Shutdown
async function handleGracefulShutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal, terminating server gracefully...');

  // Stop background scheduler timers
  LDAPSchedulerService.stopScheduler();
  WorkflowRuntimeService.stopWorker();
  WorkflowTriggerService.stopWorker();

  if (!server) {
    await pgClient.close();
    await cacheService.close();
    process.exit(0);
    return;
  }

  server.close(async () => {
    logger.info('HTTP server closed, draining database and cache connections...');
    try {
      await db.flush();
      await pgClient.close();
      await cacheService.close();
      logger.info('All database and cache connections closed cleanly. Exiting.');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during graceful teardown');
      process.exit(1);
    }
  });

  // Force shutdown after 10s if hanging
  setTimeout(() => {
    logger.fatal('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Rejection occurred');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught Exception occurred');
  process.exit(1);
});

export { app, server };
