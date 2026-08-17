import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { db } from '../db/database.js';
import { AuthService } from '../services/auth.service.js';
import { SLAService } from '../services/sla.service.js';

export class DashboardsController {
  public static getCisoMetrics(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    SLAService.refreshAllTicketSLAs();

    const tickets = AuthService.filterAuthorizedTickets(db.data.tickets, user);

    const openTickets = tickets.filter((t) => t.statusCategory !== 'DONE' && t.statusCategory !== 'CANCELLED');
    const criticalCount = openTickets.filter((t) => t.technicalSeverity === 'CRITICAL').length;
    const highCount = openTickets.filter((t) => t.technicalSeverity === 'HIGH').length;
    const mediumCount = openTickets.filter((t) => t.technicalSeverity === 'MEDIUM').length;
    const lowCount = openTickets.filter((t) => t.technicalSeverity === 'LOW' || t.technicalSeverity === 'INFORMATIONAL').length;

    const slaSafe = openTickets.filter((t) => t.slaState === 'SAFE').length;
    const slaAtRisk = openTickets.filter((t) => t.slaState === 'AT_RISK').length;
    const slaBreached = openTickets.filter((t) => t.slaState === 'BREACHED').length;
    const slaPaused = openTickets.filter((t) => t.slaState === 'PAUSED').length;

    const totalTrackedSLA = slaSafe + slaAtRisk + slaBreached + slaPaused;
    const slaComplianceRate = totalTrackedSLA > 0 ? Math.round(((slaSafe + slaPaused) / totalTrackedSLA) * 100) : 100;

    // Domain distribution
    const domainBreakdown = {
      APPSEC: openTickets.filter((t) => t.securityDomain === 'APPSEC').length,
      SOC: openTickets.filter((t) => t.securityDomain === 'SOC').length,
      VM: openTickets.filter((t) => t.securityDomain === 'VULNERABILITY_MGMT').length,
      GRC: openTickets.filter((t) => t.securityDomain === 'GRC').length,
      DLP: openTickets.filter((t) => t.securityDomain === 'DLP').length,
      IAM: openTickets.filter((t) => t.securityDomain === 'IAM_PAM').length,
      AUDIT: openTickets.filter((t) => t.securityDomain === 'AUDIT_COMPLIANCE').length,
      ARCH: openTickets.filter((t) => t.securityDomain === 'SEC_ARCHITECTURE').length,
    };

    // Aging breakdown
    const now = Date.now();
    const aging = {
      lessThan7d: openTickets.filter((t) => (now - new Date(t.createdAt).getTime()) < 7 * 86400000).length,
      from7to30d: openTickets.filter((t) => {
        const age = now - new Date(t.createdAt).getTime();
        return age >= 7 * 86400000 && age < 30 * 86400000;
      }).length,
      from30to90d: openTickets.filter((t) => {
        const age = now - new Date(t.createdAt).getTime();
        return age >= 30 * 86400000 && age < 90 * 86400000;
      }).length,
      moreThan90d: openTickets.filter((t) => (now - new Date(t.createdAt).getTime()) >= 90 * 86400000).length,
    };

    // Inherent vs Residual Risk matrix count
    const riskDistribution = {
      CRITICAL: db.data.risks.filter((r) => r.inherentRating === 'CRITICAL').length,
      HIGH: db.data.risks.filter((r) => r.inherentRating === 'HIGH').length,
      MEDIUM: db.data.risks.filter((r) => r.inherentRating === 'MEDIUM').length,
      LOW: db.data.risks.filter((r) => r.inherentRating === 'LOW').length,
    };

    res.json({
      success: true,
      metrics: {
        totalOpen: openTickets.length,
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
        slaComplianceRate,
        slaBreached,
        slaAtRisk,
        slaSafe,
        slaPaused,
        activeRisksCount: db.data.risks.length,
        activeExceptionsCount: openTickets.filter((t) => t.category === 'SECURITY_EXCEPTION').length,
        domainBreakdown,
        aging,
        riskDistribution,
        mttaMinutes: 18,
        mttrHours: 6.4,
      },
    });
  }

  public static getLeadMetrics(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const tickets = AuthService.filterAuthorizedTickets(db.data.tickets, user);

    // Workload per analyst
    const workloadByAnalyst: Record<string, { name: string; count: number; criticalCount: number }> = {};
    for (const u of db.data.users) {
      workloadByAnalyst[u.id] = { name: u.fullName, count: 0, criticalCount: 0 };
    }

    for (const t of tickets) {
      if (t.assigneeId && workloadByAnalyst[t.assigneeId]) {
        workloadByAnalyst[t.assigneeId].count += 1;
        if (t.technicalSeverity === 'CRITICAL' || t.technicalSeverity === 'HIGH') {
          workloadByAnalyst[t.assigneeId].criticalCount += 1;
        }
      }
    }

    res.json({
      success: true,
      workload: Object.values(workloadByAnalyst).filter((w) => w.count > 0),
      queues: db.data.queues,
    });
  }

  public static getAnalystWorkspace(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const allTickets = AuthService.filterAuthorizedTickets(db.data.tickets, user);

    const myTickets = allTickets.filter((t) => t.assigneeId === user.id && t.statusCategory !== 'DONE');
    const myApprovals = db.data.approvals
      .filter((a) => a.status === 'PENDING')
      .filter((a) => {
        const step = a.steps.find((s) => s.status === 'PENDING');
        return step && (step.assignedApproverId === user.id || (step.requiredRole && user.roles.includes(step.requiredRole)));
      });

    const watchedTickets = allTickets.filter((t) => t.watcherIds.includes(user.id) && t.assigneeId !== user.id);
    const slaApproaching = myTickets.filter((t) => t.slaState === 'AT_RISK' || t.slaState === 'BREACHED');

    res.json({
      success: true,
      myTickets,
      myApprovals,
      watchedTickets,
      slaApproaching,
    });
  }
}
