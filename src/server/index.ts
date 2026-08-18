import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { config } from './config/index.js';
import { logger } from './services/logger.service.js';
import { db } from './db/database.js';
import { initialSeedData } from './db/seed.js';
import { pgClient } from './db/postgres/client.js';
import { cacheService } from './services/cache.service.js';
import { authMiddleware } from './middleware/auth.middleware.js';
import { securityHeadersMiddleware, complianceHeadersMiddleware } from './middleware/security.middleware.js';
import { generalRateLimiter, authRateLimiter } from './middleware/rate-limit.middleware.js';
import { requestTracingMiddleware } from './middleware/logging.middleware.js';
import { errorHandlerMiddleware } from './middleware/error.middleware.js';

import { TicketsController } from './controllers/tickets.controller.js';
import { ApprovalsController, FindingsController } from './controllers/approvals.controller.js';
import { DashboardsController } from './controllers/dashboards.controller.js';
import { AssetsController, RisksController, KBController, AdminController, IncidentsSimulatorController } from './controllers/assets.controller.js';
import { AuthController } from './controllers/auth.controller.js';
import { HealthController } from './controllers/health.controller.js';
import { StorageController } from './controllers/storage.controller.js';
import { WrikeController } from './controllers/wrike.controller.js';
import { NotificationsController } from './controllers/notifications.controller.js';
import { DepartmentsController } from './controllers/departments.controller.js';


const app = express();

// Trust reverse proxy (Nginx / Ingress / Load Balancer) for accurate client IP tracking
app.set('trust proxy', 1);

// 1. Core Security & Observability Middlewares
app.use(requestTracingMiddleware);
app.use(securityHeadersMiddleware);
app.use(complianceHeadersMiddleware);
app.use(compression());
app.use(
  cors({
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-User-Id'],
  })
);
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// 2. Health & Observability Endpoints (No auth / rate limiting on health checks)
app.get('/api/health', HealthController.getLiveness);
app.get('/api/health/ready', HealthController.getReadiness);
app.get('/api/metrics', HealthController.getMetrics);

// 3. Rate Limiting Middleware
app.use('/api', generalRateLimiter);

// 4. Authentication Middleware
app.use(authMiddleware);

// 5. Bank Active Directory / LDAP Authentication & Directory
app.post('/api/auth/ldap-login', authRateLimiter, AuthController.ldapLogin);
app.get('/api/auth/ldap/groups', AuthController.listGroups);
app.post('/api/auth/logout', AuthController.logout);
app.get('/api/auth/users', AuthController.listUsers);
app.get('/api/auth/me', AuthController.getCurrentUser);

// 6. Tickets
app.get('/api/tickets', TicketsController.list);
app.post('/api/tickets', TicketsController.create);
app.post('/api/tickets/multi-task-workflow', TicketsController.createMultiTaskWorkflow);
app.post('/api/tickets/bulk', TicketsController.bulkUpdate);
app.get('/api/tickets/:id', TicketsController.getById);
app.patch('/api/tickets/:id', TicketsController.update);
app.post('/api/tickets/:id/transition', TicketsController.transition);
app.post('/api/tickets/:id/comments', TicketsController.addComment);

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
app.post('/api/blueprints/:id/launch', WrikeController.launchBlueprint);

app.get('/api/proofing', WrikeController.listProofingDocuments);
app.post('/api/proofing/:id/annotations', WrikeController.addProofingAnnotation);
app.post('/api/proofing/:id/sign-off', WrikeController.signOffProofingDocument);

// 9. Notifications Engine & Real-time Alerts
app.get('/api/notifications', NotificationsController.list);
app.patch('/api/notifications/:id/read', NotificationsController.markAsRead);
app.post('/api/notifications/read-all', NotificationsController.markAllAsRead);
app.delete('/api/notifications/:id', NotificationsController.delete);

// 10. Scanner Finding Ingestion & Deduplication & Incident Simulation
app.post('/api/findings/ingest', FindingsController.ingest);
app.post('/api/incidents/simulate', IncidentsSimulatorController.simulateIncident);

// 10. Assets & Applications (CMDB)
app.get('/api/assets', AssetsController.listAssets);
app.post('/api/assets', AssetsController.createAsset);
app.get('/api/applications', AssetsController.listApplications);
app.post('/api/applications', AssetsController.createApplication);

// 11. Risks & Exceptions
app.get('/api/risks', RisksController.listRisks);
app.post('/api/risks', RisksController.createRisk);

// 12. Knowledge Base
app.get('/api/kb', KBController.listArticles);
app.post('/api/kb', KBController.createArticle);
app.get('/api/kb/:slug', KBController.getArticleBySlug);

// 13. Admin & Audit
app.get('/api/admin/metadata', AdminController.getMetadata);
app.get('/api/admin/audit', AdminController.getAuditTrail);

// 14. Enterprise Multi-Department Architecture & Cross-Tasks
app.get('/api/departments', DepartmentsController.listDepartments);
app.post('/api/departments', DepartmentsController.createDepartment);
app.get('/api/departments/:id', DepartmentsController.getDepartmentById);
app.patch('/api/departments/:id', DepartmentsController.updateDepartment);
app.patch('/api/departments/:id/settings', DepartmentsController.updateSettings);
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
app.get('/api/storage/download', StorageController.downloadDirect);

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
const server = app.listen(config.PORT, config.HOST, () => {
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
});

// Graceful Shutdown
async function handleGracefulShutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal, terminating server gracefully...');

  server.close(async () => {
    logger.info('HTTP server closed, draining database and cache connections...');
    try {
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
