import { v4 as uuidv4 } from 'uuid';
import { BankUser } from '../../shared/types/auth.js';
import { Ticket } from '../../shared/types/ticket.js';
import { Project, ProjectActivity, ProjectHealth, ProjectMember, ProjectMilestone, ProjectRole, ProjectSummary } from '../../shared/types/project.js';
import { db } from '../db/database.js';

const GLOBAL_PROJECT_ADMINS = new Set(['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN']);
const MANAGE_ROLES = new Set<ProjectRole>(['OWNER', 'PROJECT_MANAGER']);
const WRITE_ROLES = new Set<ProjectRole>(['OWNER', 'PROJECT_MANAGER', 'CONTRIBUTOR']);

export class ProjectService {
  static isGlobalAdmin(user: BankUser): boolean {
    return user.roles.some((role) => GLOBAL_PROJECT_ADMINS.has(role));
  }

  static memberFor(projectId: string, user: BankUser): ProjectMember | undefined {
    return db.data.projectMembers.find((member) => {
      if (member.projectId !== projectId) return false;
      if (member.subjectType === 'USER') return member.subjectId === user.id;
      if (member.subjectType === 'TEAM') return user.teamIds.includes(member.subjectId);
      if (member.subjectType === 'DEPARTMENT') return user.departmentId === member.subjectId;
      return (user.distributionGroups || []).includes(member.subjectId);
    });
  }

  static authorize(projectId: string, user: BankUser, action: 'READ' | 'WRITE' | 'TASK_WRITE' | 'MANAGE' | 'ADMIN'): { allowed: boolean; member?: ProjectMember; reason?: string } {
    const project = db.data.projects.find((candidate) => candidate.id === projectId || candidate.identifier === projectId || candidate.key === projectId);
    if (!project) return { allowed: false, reason: 'Project not found.' };
    if (this.isGlobalAdmin(user)) return { allowed: true };
    const member = this.memberFor(project.id, user);
    if (!member) return { allowed: false, reason: 'You are not authorized to access this project.' };
    if (action === 'READ') return { allowed: true, member };
    if (action === 'WRITE' && WRITE_ROLES.has(member.role)) return { allowed: true, member };
    if (action === 'TASK_WRITE' && (WRITE_ROLES.has(member.role) || member.role === 'RESTRICTED_CONTRIBUTOR')) return { allowed: true, member };
    if ((action === 'MANAGE' || action === 'ADMIN') && MANAGE_ROLES.has(member.role)) return { allowed: true, member };
    return { allowed: false, member, reason: 'Your project role does not permit this operation.' };
  }

  static visibleProjects(user: BankUser): Project[] {
    return db.data.projects.filter((project) => this.isGlobalAdmin(user) || Boolean(this.memberFor(project.id, user)));
  }

  static nextIdentifier(): string {
    const highest = db.data.projects.reduce((max, project) => Math.max(max, Number(project.identifier.replace('PRJ-', '')) || 0), 0);
    return `PRJ-${String(highest + 1).padStart(4, '0')}`;
  }

  static record(projectId: string, actorId: string, action: string, objectType: ProjectActivity['objectType'], objectId: string, oldValue?: unknown, newValue?: unknown): ProjectActivity {
    const event: ProjectActivity = { id: `pact-${uuidv4().slice(0, 8)}`, projectId, actorId, action, objectType, objectId, oldValue, newValue, createdAt: new Date().toISOString() };
    db.data.projectActivities.unshift(event);
    return event;
  }

  static tasks(projectId: string): Ticket[] { return db.data.tickets.filter((task) => task.projectId === projectId); }

  static visibleTasks(projectId: string, user: BankUser): Ticket[] {
    const tasks = this.tasks(projectId);
    const member = this.memberFor(projectId, user);
    if (this.isGlobalAdmin(user) || member?.role !== 'RESTRICTED_CONTRIBUTOR') return tasks;
    return tasks.filter((task) => task.assigneeId === user.id || task.reporterId === user.id || task.watcherIds.includes(user.id) || task.participantIds?.includes(user.id));
  }

  static weightedProgress(tasks: Ticket[], project: Project): number {
    if (!tasks.length) return 0;
    const weight = (task: Ticket) => project.progressWeighting === 'STORY_POINTS' ? Math.max(1, task.storyPoints || 1) : project.progressWeighting === 'ESTIMATED_EFFORT' ? Math.max(1, task.estimatedHours || 1) : project.progressWeighting === 'MANUAL' ? Math.max(1, task.taskWeight || 1) : 1;
    const total = tasks.reduce((sum, task) => sum + weight(task), 0);
    return Math.round(tasks.filter((task) => task.projectTaskStatus === 'DONE' || task.statusCategory === 'DONE').reduce((sum, task) => sum + weight(task), 0) / total * 100);
  }

  static health(project: Project, tasks = this.tasks(project.id)): { health: ProjectHealth; reasons: string[] } {
    if (project.status === 'COMPLETED') return { health: 'COMPLETED', reasons: ['Project is completed.'] };
    if (project.status === 'ON_HOLD') return { health: 'ON_HOLD', reasons: ['Project is on hold.'] };
    if (project.healthOverride) return { health: project.healthOverride.health, reasons: [project.healthOverride.reason] };
    const now = Date.now();
    const overdue = tasks.filter((task) => task.statusCategory !== 'DONE' && task.projectTaskStatus !== 'DONE' && task.dueDate && new Date(task.dueDate).getTime() < now);
    const blocked = tasks.filter((task) => task.projectTaskStatus === 'BLOCKED' || task.blockedReason);
    const criticalBlocked = blocked.filter((task) => task.businessPriority === 'P1_URGENT' || task.businessPriority === 'P2_HIGH' || task.technicalSeverity === 'CRITICAL');
    const milestoneLate = db.data.projectMilestones.some((milestone) => milestone.projectId === project.id && milestone.status !== 'COMPLETED' && milestone.targetDate && new Date(milestone.targetDate).getTime() < now);
    const reasons: string[] = [];
    if (overdue.length) reasons.push(`${overdue.length} overdue task${overdue.length === 1 ? '' : 's'}`);
    if (criticalBlocked.length) reasons.push(`${criticalBlocked.length} blocked critical/high task${criticalBlocked.length === 1 ? '' : 's'}`);
    if (milestoneLate) reasons.push('A milestone target date has passed');
    if (blocked.length && criticalBlocked.length) return { health: 'BLOCKED', reasons };
    if (milestoneLate || overdue.length >= 3 || (project.targetDate && new Date(project.targetDate).getTime() < now)) return { health: 'DELAYED', reasons };
    if (overdue.length || blocked.length || (project.targetDate && new Date(project.targetDate).getTime() - now < 7 * 86400000 && this.weightedProgress(tasks, project) < 80)) return { health: 'AT_RISK', reasons };
    return { health: 'ON_TRACK', reasons: ['No material schedule, blocker, or deadline risk detected.'] };
  }

  static summary(project: Project, user: BankUser): ProjectSummary {
    const tasks = this.tasks(project.id);
    const now = Date.now();
    const done = tasks.filter((task) => task.projectTaskStatus === 'DONE' || task.statusCategory === 'DONE');
    const active = tasks.filter((task) => !done.includes(task) && ['IN_PROGRESS', 'IN_REVIEW'].includes(task.projectTaskStatus || ''));
    const blocked = tasks.filter((task) => task.projectTaskStatus === 'BLOCKED' || Boolean(task.blockedReason));
    const overdue = tasks.filter((task) => !done.includes(task) && Boolean(task.dueDate) && new Date(task.dueDate).getTime() < now);
    const milestones = db.data.projectMilestones.filter((milestone) => milestone.projectId === project.id).map((milestone) => {
      const milestoneTasks = tasks.filter((task) => task.milestoneId === milestone.id);
      return { ...milestone, taskCount: milestoneTasks.length, progressPercent: this.weightedProgress(milestoneTasks, project) };
    });
    const nextMilestone = milestones.filter((milestone) => milestone.status !== 'COMPLETED').sort((a, b) => (a.targetDate || '9999').localeCompare(b.targetDate || '9999'))[0];
    const health = this.health(project, tasks);
    const upcoming = [
      ...tasks.filter((task) => !done.includes(task) && task.dueDate).map((task) => ({ type: 'TASK' as const, id: task.id, title: `${task.key} ${task.title}`, dueDate: task.dueDate })),
      ...milestones.filter((milestone) => milestone.status !== 'COMPLETED').map((milestone) => ({ type: 'MILESTONE' as const, id: milestone.id, title: milestone.name, dueDate: milestone.targetDate })),
      ...(project.targetDate ? [{ type: 'PROJECT' as const, id: project.id, title: 'Project target completion', dueDate: project.targetDate }] : []),
    ].sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).slice(0, 6);
    const myTasks = tasks.filter((task) => task.assigneeId === user.id || task.watcherIds.includes(user.id));
    return { project, health: health.health, healthReasons: health.reasons, progressPercent: this.weightedProgress(tasks, project), taskCounts: { total: tasks.length, completed: done.length, active: active.length, blocked: blocked.length, overdue: overdue.length, openCriticalHigh: tasks.filter((task) => !done.includes(task) && ['P1_URGENT', 'P2_HIGH'].includes(task.businessPriority)).length }, nextMilestone, milestones, members: db.data.projectMembers.filter((member) => member.projectId === project.id), myTasks, recentlyCompleted: done.sort((a, b) => (b.resolvedAt || b.updatedAt).localeCompare(a.resolvedAt || a.updatedAt)).slice(0, 5), upcoming, risks: db.data.projectRisks.filter((risk) => risk.projectId === project.id && risk.status !== 'CLOSED'), latestUpdate: db.data.projectStatusUpdates.filter((update) => update.projectId === project.id)[0] };
  }
}
