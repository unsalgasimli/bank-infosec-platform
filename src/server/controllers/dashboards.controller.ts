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

    let totalOpen = 0;
    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;
    let slaSafe = 0;
    let slaAtRisk = 0;
    let slaBreached = 0;
    let slaPaused = 0;
    let activeExceptionsCount = 0;

    const domainBreakdown = {
      APPSEC: 0,
      SOC: 0,
      VM: 0,
      GRC: 0,
      DLP: 0,
      IAM: 0,
      AUDIT: 0,
      ARCH: 0,
    };

    const aging = {
      lessThan7d: 0,
      from7to30d: 0,
      from30to90d: 0,
      moreThan90d: 0,
    };

    const now = Date.now();
    const ms7d = 7 * 86400000;
    const ms30d = 30 * 86400000;
    const ms90d = 90 * 86400000;

    for (const t of tickets) {
      if (t.statusCategory === 'DONE' || t.statusCategory === 'CANCELLED') continue;

      totalOpen++;

      switch (t.technicalSeverity) {
        case 'CRITICAL': criticalCount++; break;
        case 'HIGH': highCount++; break;
        case 'MEDIUM': mediumCount++; break;
        case 'LOW':
        case 'INFORMATIONAL':
          lowCount++; break;
      }

      switch (t.slaState) {
        case 'SAFE': slaSafe++; break;
        case 'AT_RISK': slaAtRisk++; break;
        case 'BREACHED': slaBreached++; break;
        case 'PAUSED': slaPaused++; break;
      }

      switch (t.securityDomain) {
        case 'APPSEC': domainBreakdown.APPSEC++; break;
        case 'SOC': domainBreakdown.SOC++; break;
        case 'VULNERABILITY_MGMT': domainBreakdown.VM++; break;
        case 'GRC': domainBreakdown.GRC++; break;
        case 'DLP': domainBreakdown.DLP++; break;
        case 'IAM_PAM': domainBreakdown.IAM++; break;
        case 'AUDIT_COMPLIANCE': domainBreakdown.AUDIT++; break;
        case 'SEC_ARCHITECTURE': domainBreakdown.ARCH++; break;
      }

      const age = now - new Date(t.createdAt).getTime();
      if (age < ms7d) aging.lessThan7d++;
      else if (age < ms30d) aging.from7to30d++;
      else if (age < ms90d) aging.from30to90d++;
      else aging.moreThan90d++;

      if (t.category === 'SECURITY_EXCEPTION') activeExceptionsCount++;
    }

    const totalTrackedSLA = slaSafe + slaAtRisk + slaBreached + slaPaused;
    const slaComplianceRate = totalTrackedSLA > 0 ? Math.round(((slaSafe + slaPaused) / totalTrackedSLA) * 100) : 100;

    const riskDistribution = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const r of db.data.risks || []) {
      if (r.inherentRating in riskDistribution) {
        riskDistribution[r.inherentRating as keyof typeof riskDistribution]++;
      }
    }

    res.json({
      success: true,
      metrics: {
        totalOpen,
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
        activeExceptionsCount,
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

    const userMap = new Map((db.data.users || []).map((u) => [u.id, u.fullName]));
    const workloadByAnalyst: Record<string, { name: string; count: number; criticalCount: number }> = {};

    for (const t of tickets) {
      if (t.assigneeId) {
        let entry = workloadByAnalyst[t.assigneeId];
        if (!entry) {
          entry = { name: userMap.get(t.assigneeId) || t.assigneeId, count: 0, criticalCount: 0 };
          workloadByAnalyst[t.assigneeId] = entry;
        }
        entry.count += 1;
        if (t.technicalSeverity === 'CRITICAL' || t.technicalSeverity === 'HIGH') {
          entry.criticalCount += 1;
        }
      }
    }

    res.json({
      success: true,
      workload: Object.values(workloadByAnalyst),
      queues: db.data.queues,
    });
  }

  public static getAnalystWorkspace(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const allTickets = AuthService.filterAuthorizedTickets(db.data.tickets, user);

    const myTickets = allTickets.filter(
      (t) =>
        (t.assigneeId === user.id ||
          (!t.assigneeId &&
            ((t.targetDepartmentId && t.targetDepartmentId === user.departmentId) ||
              (t.departmentId && t.departmentId === user.departmentId) ||
              (t.assignmentGroupId && user.teamIds?.includes(t.assignmentGroupId)) ||
              t.participatingDepartmentIds?.includes(user.departmentId || '')) &&
            (!t.targetSectionId || t.targetSectionId === user.sectionId))) &&
        t.statusCategory !== 'DONE'
    );
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
