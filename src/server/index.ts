import express from 'express';
import cors from 'cors';
import { db } from './db/database.js';
import { initialSeedData } from './db/seed.js';
import { authMiddleware, AuthenticatedRequest } from './middleware/auth.middleware.js';
import { TicketsController } from './controllers/tickets.controller.js';
import { ApprovalsController, FindingsController } from './controllers/approvals.controller.js';
import { DashboardsController } from './controllers/dashboards.controller.js';
import { AssetsController, RisksController, KBController, AdminController } from './controllers/assets.controller.js';

// Auto-seed database if empty
if (!db.data.users || db.data.users.length === 0) {
  console.log('🌱 Seeding database with Apex Bank International data...');
  db.reset(initialSeedData);
}

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(authMiddleware);

// Health Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'UP',
    version: '1.0.0',
    institution: 'Apex Bank International (Tier-1 Regulated)',
    timestamp: new Date().toISOString(),
  });
});

// Auth & Users
app.get('/api/auth/users', (req: AuthenticatedRequest, res) => {
  res.json({ success: true, users: db.data.users });
});

app.get('/api/auth/me', (req: AuthenticatedRequest, res) => {
  res.json({ success: true, user: req.user });
});

// Tickets
app.get('/api/tickets', TicketsController.list);
app.post('/api/tickets', TicketsController.create);
app.post('/api/tickets/bulk', TicketsController.bulkUpdate);
app.get('/api/tickets/:id', TicketsController.getById);
app.patch('/api/tickets/:id', TicketsController.update);
app.post('/api/tickets/:id/transition', TicketsController.transition);
app.post('/api/tickets/:id/comments', TicketsController.addComment);

// Multi-Stage Approvals
app.get('/api/approvals/pending', ApprovalsController.listPending);
app.post('/api/approvals/:chainId/steps/:stepId/decision', ApprovalsController.submitDecision);

// Dashboards
app.get('/api/dashboards/ciso', DashboardsController.getCisoMetrics);
app.get('/api/dashboards/lead', DashboardsController.getLeadMetrics);
app.get('/api/dashboards/analyst', DashboardsController.getAnalystWorkspace);

// Scanner Finding Ingestion & Deduplication
app.post('/api/findings/ingest', FindingsController.ingest);

// Assets & Applications (CMDB)
app.get('/api/assets', AssetsController.listAssets);
app.get('/api/applications', AssetsController.listApplications);

// Risks & Exceptions
app.get('/api/risks', RisksController.listRisks);
app.post('/api/risks', RisksController.createRisk);

// Knowledge Base
app.get('/api/kb', KBController.listArticles);
app.get('/api/kb/:slug', KBController.getArticleBySlug);

// Admin & Audit
app.get('/api/admin/metadata', AdminController.getMetadata);
app.get('/api/admin/audit', AdminController.getAuditTrail);

app.listen(PORT, () => {
  console.log(`🛡️ AegisSec Banking GRC & SecOps API running on http://localhost:${PORT}`);
});
