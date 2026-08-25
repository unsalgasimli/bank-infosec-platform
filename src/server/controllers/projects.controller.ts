import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { db } from '../db/database.js';
import { AuditService } from '../services/audit.service.js';
import { NotificationService } from '../services/notification.service.js';
import { WorkflowService } from '../services/workflow.service.js';
import { ProjectService } from '../services/project.service.js';
import { PROJECT_WORK_ITEM_TYPES, Project, ProjectCategory, ProjectMember, ProjectPriority, ProjectRole, ProjectStatus, ProjectTaskStatus, ProjectWorkItemType } from '../../shared/types/project.js';
import { Ticket } from '../../shared/types/ticket.js';
import { TicketComment } from '../../shared/types/comments.js';

const PROJECT_ROLES: ProjectRole[] = ['OWNER', 'PROJECT_MANAGER', 'CONTRIBUTOR', 'VIEWER', 'RESTRICTED_CONTRIBUTOR'];
const PROJECT_STATUSES: ProjectStatus[] = ['DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'];
const TASK_STATUSES: ProjectTaskStatus[] = ['BACKLOG', 'TO_DO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'];
const priorityMap: Record<ProjectPriority, Ticket['businessPriority']> = { CRITICAL: 'P1_URGENT', HIGH: 'P2_HIGH', MEDIUM: 'P3_MEDIUM', LOW: 'P4_LOW' };
const workItemTypeLabel: Record<ProjectWorkItemType, string> = { EPIC: 'Epic', STORY: 'Story', TASK: 'Task', SUBTASK: 'Subtask', BUG: 'Bug', IMPROVEMENT: 'Improvement', INCIDENT: 'Incident', SERVICE_REQUEST: 'Service Request', CHANGE: 'Change', PROBLEM: 'Problem', RESEARCH: 'Research', SECURITY_FINDING: 'Security Finding' };

export class ProjectsController {
  static list(req: AuthenticatedRequest, res: Response): void {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.toLowerCase() : '';
    const projects = ProjectService.visibleProjects(req.user!).map((project) => ProjectService.summary(project, req.user!)).filter((summary) =>
      (!status || status === 'ALL' || (status === 'MY') || (status === 'AT_RISK' ? ['AT_RISK', 'DELAYED', 'BLOCKED'].includes(summary.health) : summary.project.status === status)) && (!search || `${summary.project.name} ${summary.project.key} ${summary.project.identifier}`.toLowerCase().includes(search))
    );
    res.json({ success: true, projects });
  }

  static workflowOptions(_req: AuthenticatedRequest, res: Response): void {
    const workflows = [ProjectService.ensureDefaultWorkflow(), ...db.data.workflows.filter((workflow) => workflow.id !== ProjectService.DEFAULT_WORKFLOW_ID)]
      .filter((workflow) => workflow.isActive && (!workflow.ticketTypeId || workflow.ticketTypeId === 'PROJECT_WORK'))
      .map((workflow) => ({ id: workflow.id, name: workflow.name, version: workflow.version, ticketTypeId: workflow.ticketTypeId }));
    res.json({ success: true, workflows });
  }

  static create(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const body = req.body || {};
    const key = String(body.key || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    const name = String(body.name || '').trim();
    if (!name || !key || !/^[A-Z][A-Z0-9-]{1,11}$/.test(key)) {
      res.status(400).json({ success: false, error: 'Project name and a 2–12 character uppercase project key are required.' }); return;
    }
    if (db.data.projects.some((project) => project.key === key)) { res.status(409).json({ success: false, error: 'Project key already exists.' }); return; }
    const workItemTypes = ProjectsController.parseWorkItemTypes(body.workItemTypes);
    if (workItemTypes.length === 0) { res.status(400).json({ success: false, error: 'Enable at least one work-item type for the project.' }); return; }
    const now = new Date().toISOString();
    const workflowId = body.workflowId || ProjectService.ensureDefaultWorkflow().id;
    const workflow = WorkflowService.getWorkflowById(workflowId);
    if (!workflow || !workflow.isActive || workflow.ticketTypeId !== 'PROJECT_WORK') { res.status(400).json({ success: false, error: 'Select an active Project Work workflow.' }); return; }
    const project: Project = {
      id: `prj-${uuidv4().slice(0, 8)}`, identifier: ProjectService.nextIdentifier(), key, name,
      description: String(body.description || ''), objective: body.objective, scope: body.scope, successCriteria: body.successCriteria,
      departmentId: body.departmentId || user.departmentId, ownerId: body.ownerId || user.id, managerId: body.managerId || user.id, sponsorId: body.sponsorId,
      status: body.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE', priority: body.priority || 'MEDIUM', businessCriticality: body.businessCriticality || body.priority || 'MEDIUM',
      category: (body.category || 'INFORMATION_SECURITY') as ProjectCategory, tags: Array.isArray(body.tags) ? body.tags.map(String).slice(0, 20) : [],
      relatedAssetIds: Array.isArray(body.relatedAssetIds) ? body.relatedAssetIds.map(String) : [], slaPolicyId: body.slaPolicyId, templateId: body.templateId,
      startDate: body.startDate, targetDate: body.targetDate, progressWeighting: body.progressWeighting || 'EQUAL', workflowId, workItemTypes, createdByUserId: user.id, createdAt: now, updatedAt: now,
    };
    db.transaction(() => {
      db.data.projects.unshift(project);
      const members: Array<[string | undefined, ProjectRole]> = [[project.ownerId, 'OWNER'], [project.managerId, 'PROJECT_MANAGER']];
      for (const userId of Array.isArray(body.initialMembers) ? body.initialMembers : []) members.push([String(userId), 'CONTRIBUTOR']);
      for (const [subjectId, role] of members) {
        if (!subjectId || db.data.projectMembers.some((member) => member.projectId === project.id && member.subjectType === 'USER' && member.subjectId === subjectId)) continue;
        db.data.projectMembers.push({ id: `pm-${uuidv4().slice(0, 8)}`, projectId: project.id, subjectType: 'USER', subjectId, role, addedByUserId: user.id, createdAt: now });
      }
      for (const milestone of Array.isArray(body.initialMilestones) ? body.initialMilestones : []) {
        if (!String(milestone?.name || '').trim()) continue;
        db.data.projectMilestones.push({ id: `pms-${uuidv4().slice(0, 8)}`, projectId: project.id, name: String(milestone.name).trim(), description: milestone.description, ownerId: milestone.ownerId, startDate: milestone.startDate, targetDate: milestone.targetDate, status: 'PLANNED', dependencyIds: [], createdAt: now, updatedAt: now });
      }
      ProjectService.record(project.id, user.id, 'PROJECT_CREATED', 'PROJECT', project.id, undefined, { identifier: project.identifier, name, key });
      AuditService.log({ actor: user, action: 'PROJECT_CREATED', entityType: 'PROJECT', entityId: project.id, entityKey: project.identifier, metadata: { key, name } });
    });
    res.status(201).json({ success: true, project: ProjectService.summary(project, user) });
  }

  static get(req: AuthenticatedRequest, res: Response): void {
    const project = ProjectsController.authorizedProject(req, res, 'READ'); if (!project) return;
    const summary = ProjectService.summary(project, req.user!);
    const taskStatus = String(req.query.taskStatus || 'ALL');
    const taskSearch = String(req.query.taskSearch || '').trim().toLowerCase();
    const tasks = ProjectService.visibleTasks(project.id, req.user!).filter((task) => {
      const matchesStatus = taskStatus === 'ALL' || task.projectTaskStatus === taskStatus || (taskStatus === 'OVERDUE' && task.statusCategory !== 'DONE' && Boolean(task.dueDate) && new Date(task.dueDate).getTime() < Date.now());
      const matchesSearch = !taskSearch || `${task.key} ${task.title} ${task.description || ''}`.toLowerCase().includes(taskSearch);
      return matchesStatus && matchesSearch;
    }).slice(0, 100);
    res.json({ success: true, ...summary, tasks, activity: db.data.projectActivities.filter((event) => event.projectId === project.id).slice(0, 50) });
  }

  static getTask(req: AuthenticatedRequest, res: Response): void {
    const project = ProjectsController.authorizedProject(req, res, 'READ'); if (!project) return;
    const task = ProjectService.visibleTasks(project.id, req.user!).find((candidate) => candidate.id === req.params.taskId || candidate.key === req.params.taskId);
    if (!task) { res.status(404).json({ success: false, error: 'Project task not found.' }); return; }
    const comments = db.data.comments.filter((comment) => comment.ticketId === task.id && comment.visibility === 'PUBLIC');
    const dependencies = db.data.projectTaskDependencies.filter((dependency) => dependency.projectId === project.id && (dependency.sourceTaskId === task.id || dependency.targetTaskId === task.id));
    const activity = db.data.projectActivities.filter((event) => event.projectId === project.id && event.objectType === 'TASK' && event.objectId === task.id).slice(0, 100);
    const attachments = db.data.attachments.filter((attachment) => attachment.ticketId === task.id).map(({ storageKey: _storageKey, ...attachment }) => attachment);
    res.json({ success: true, task, comments, dependencies, activity, attachments });
  }

  static update(req: AuthenticatedRequest, res: Response): void {
    const project = ProjectsController.authorizedProject(req, res, 'MANAGE'); if (!project) return;
    const body = req.body || {};
    if (Object.prototype.hasOwnProperty.call(body, 'workflowId')) {
      const workflowId = String(body.workflowId || '').trim() || ProjectService.DEFAULT_WORKFLOW_ID;
      const workflow = workflowId === ProjectService.DEFAULT_WORKFLOW_ID
        ? ProjectService.ensureDefaultWorkflow()
        : WorkflowService.getWorkflowById(workflowId);
      if (!workflow || !workflow.isActive || workflow.ticketTypeId !== 'PROJECT_WORK') { res.status(400).json({ success: false, error: 'Select an active Project Work workflow.' }); return; }
      body.workflowId = workflow.id;
    }
    const allowed = ['name', 'description', 'objective', 'scope', 'successCriteria', 'departmentId', 'ownerId', 'managerId', 'sponsorId', 'priority', 'businessCriticality', 'category', 'tags', 'relatedAssetIds', 'slaPolicyId', 'templateId', 'workflowId', 'startDate', 'targetDate', 'progressWeighting', 'status'] as const;
    const before: Record<string, unknown> = {};
    for (const field of allowed) if (Object.prototype.hasOwnProperty.call(body, field)) { before[field] = (project as any)[field]; (project as any)[field] = body[field]; }
    if (Object.prototype.hasOwnProperty.call(body, 'workItemTypes')) { const workItemTypes = ProjectsController.parseWorkItemTypes(body.workItemTypes); if (workItemTypes.length === 0) { res.status(400).json({ success: false, error: 'Enable at least one work-item type for the project.' }); return; } before.workItemTypes = project.workItemTypes; project.workItemTypes = workItemTypes; }
    if (body.healthOverride) project.healthOverride = { health: body.healthOverride.health, reason: String(body.healthOverride.reason || ''), changedByUserId: req.user!.id, changedAt: new Date().toISOString() };
    if (body.status && !PROJECT_STATUSES.includes(body.status)) { res.status(400).json({ success: false, error: 'Invalid project status.' }); return; }
    project.updatedAt = new Date().toISOString();
    if (project.status === 'ARCHIVED') project.archivedAt = project.updatedAt;
    db.transaction(() => {
      ProjectService.record(project.id, req.user!.id, project.status === 'ARCHIVED' ? 'PROJECT_ARCHIVED' : 'PROJECT_UPDATED', 'PROJECT', project.id, before, body);
      AuditService.log({ actor: req.user!, action: project.status === 'ARCHIVED' ? 'PROJECT_ARCHIVED' : 'PROJECT_UPDATED', entityType: 'PROJECT', entityId: project.id, entityKey: project.identifier, fieldChanges: Object.entries(before).map(([field, oldValue]) => ({ field, oldValue, newValue: (project as any)[field] })) });
    });
    res.json({ success: true, project: ProjectService.summary(project, req.user!) });
  }

  static addMember(req: AuthenticatedRequest, res: Response): void {
    const project = ProjectsController.authorizedProject(req, res, 'MANAGE'); if (!project) return;
    const { subjectType = 'USER', subjectId, role = 'CONTRIBUTOR' } = req.body || {};
    const cleanSubjectId = String(subjectId || '').trim();
    if (!['USER', 'TEAM', 'DEPARTMENT', 'GROUP'].includes(subjectType) || !cleanSubjectId || !PROJECT_ROLES.includes(role)) { res.status(400).json({ success: false, error: 'Valid membership subject and project role are required.' }); return; }
    if (subjectType === 'USER' && !db.data.users.some((user) => user.id === cleanSubjectId && user.isActive)) { res.status(400).json({ success: false, error: 'Active user not found in directory.' }); return; }
    if (subjectType === 'DEPARTMENT' && !db.data.departments.some((dept) => dept.id === cleanSubjectId || dept.code === cleanSubjectId)) { res.status(400).json({ success: false, error: 'Bank department not found.' }); return; }
    const existing = db.data.projectMembers.find((member) => member.projectId === project.id && member.subjectType === subjectType && member.subjectId === cleanSubjectId);
    const now = new Date().toISOString();
    db.transaction(() => {
      if (existing) { const oldRole = existing.role; existing.role = role; ProjectService.record(project.id, req.user!.id, 'PROJECT_PERMISSION_CHANGED', 'MEMBER', existing.id, oldRole, role); AuditService.log({ actor: req.user!, action: 'PROJECT_PERMISSION_CHANGED', entityType: 'PROJECT_MEMBER', entityId: existing.id, entityKey: project.identifier, fieldChanges: [{ field: 'role', oldValue: oldRole, newValue: role }] }); }
      else { const member: ProjectMember = { id: `pm-${uuidv4().slice(0, 8)}`, projectId: project.id, subjectType, subjectId: cleanSubjectId, role, addedByUserId: req.user!.id, createdAt: now }; db.data.projectMembers.push(member); ProjectService.record(project.id, req.user!.id, 'PROJECT_MEMBER_ADDED', 'MEMBER', member.id, undefined, member); AuditService.log({ actor: req.user!, action: 'PROJECT_MEMBER_ADDED', entityType: 'PROJECT_MEMBER', entityId: member.id, entityKey: project.identifier, metadata: { subjectType, subjectId: cleanSubjectId, role } }); }
    });
    if (subjectType === 'USER' && cleanSubjectId !== req.user!.id) NotificationService.create({ userId: cleanSubjectId, title: `Added to ${project.name}`, message: `You have ${role.replace('_', ' ').toLowerCase()} access to ${project.identifier}.`, type: 'ASSIGNMENT', actionUrl: '/work-management/projects-tasks' });
    res.status(201).json({ success: true, members: db.data.projectMembers.filter((member) => member.projectId === project.id) });
  }

  static updateMemberRole(req: AuthenticatedRequest, res: Response): void {
    const project = ProjectsController.authorizedProject(req, res, 'MANAGE'); if (!project) return;
    const { role } = req.body || {};
    if (!PROJECT_ROLES.includes(role)) { res.status(400).json({ success: false, error: 'Valid project role is required.' }); return; }
    const member = db.data.projectMembers.find((candidate) => candidate.id === req.params.memberId && candidate.projectId === project.id);
    if (!member) { res.status(404).json({ success: false, error: 'Project member not found.' }); return; }
    if (member.role === 'OWNER' && role !== 'OWNER' && db.data.projectMembers.filter((candidate) => candidate.projectId === project.id && candidate.role === 'OWNER').length <= 1) {
      res.status(400).json({ success: false, error: 'A project must retain at least one owner.' }); return;
    }
    const oldRole = member.role;
    db.transaction(() => {
      member.role = role;
      ProjectService.record(project.id, req.user!.id, 'PROJECT_PERMISSION_CHANGED', 'MEMBER', member.id, oldRole, role);
      AuditService.log({ actor: req.user!, action: 'PROJECT_PERMISSION_CHANGED', entityType: 'PROJECT_MEMBER', entityId: member.id, entityKey: project.identifier, fieldChanges: [{ field: 'role', oldValue: oldRole, newValue: role }] });
    });
    res.json({ success: true, member, members: db.data.projectMembers.filter((candidate) => candidate.projectId === project.id) });
  }

  static removeMember(req: AuthenticatedRequest, res: Response): void {
    const project = ProjectsController.authorizedProject(req, res, 'ADMIN'); if (!project) return;
    const member = db.data.projectMembers.find((candidate) => candidate.id === req.params.memberId && candidate.projectId === project.id);
    if (!member) { res.status(404).json({ success: false, error: 'Project member not found.' }); return; }
    if (member.role === 'OWNER' && db.data.projectMembers.filter((candidate) => candidate.projectId === project.id && candidate.role === 'OWNER').length <= 1) { res.status(400).json({ success: false, error: 'A project must retain an owner.' }); return; }
    db.transaction(() => { db.data.projectMembers = db.data.projectMembers.filter((candidate) => candidate.id !== member.id); ProjectService.record(project.id, req.user!.id, 'PROJECT_MEMBER_REMOVED', 'MEMBER', member.id, member); AuditService.log({ actor: req.user!, action: 'PROJECT_MEMBER_REMOVED', entityType: 'PROJECT_MEMBER', entityId: member.id, entityKey: project.identifier, metadata: { subjectId: member.subjectId } }); });
    res.json({ success: true });
  }

  static createMilestone(req: AuthenticatedRequest, res: Response): void {
    const project = ProjectsController.authorizedProject(req, res, 'MANAGE'); if (!project) return;
    const body = req.body || {}; if (!String(body.name || '').trim()) { res.status(400).json({ success: false, error: 'Milestone name is required.' }); return; }
    const now = new Date().toISOString(); const milestone = { id: `pms-${uuidv4().slice(0, 8)}`, projectId: project.id, name: String(body.name).trim(), description: body.description, ownerId: body.ownerId, startDate: body.startDate, targetDate: body.targetDate, status: body.status || 'PLANNED', dependencyIds: Array.isArray(body.dependencyIds) ? body.dependencyIds : [], createdAt: now, updatedAt: now } as any;
    db.transaction(() => { db.data.projectMilestones.push(milestone); ProjectService.record(project.id, req.user!.id, 'PROJECT_MILESTONE_CREATED', 'MILESTONE', milestone.id, undefined, milestone); AuditService.log({ actor: req.user!, action: 'PROJECT_MILESTONE_UPDATED', entityType: 'PROJECT_MILESTONE', entityId: milestone.id, entityKey: project.identifier, metadata: { action: 'CREATED', name: milestone.name } }); });
    res.status(201).json({ success: true, milestone });
  }

  static createTask(req: AuthenticatedRequest, res: Response): void {
    const project = ProjectsController.authorizedProject(req, res, 'WRITE'); if (!project) return;
    const body = req.body || {}; const title = String(body.title || '').trim(); if (!title) { res.status(400).json({ success: false, error: 'Task summary is required.' }); return; }
    const user = req.user!; const now = new Date().toISOString(); const number = ProjectService.tasks(project.id).reduce((max, task) => Math.max(max, task.projectTaskNumber || 0), 0) + 1; const taskStatus = TASK_STATUSES.includes(body.status) ? body.status : 'TO_DO';
    const projectWorkItemType = (body.projectWorkItemType || (body.parentTicketId ? 'SUBTASK' : 'TASK')) as ProjectWorkItemType;
    if (!ProjectService.workItemTypes(project).includes(projectWorkItemType)) { res.status(400).json({ success: false, error: 'This work-item type is not enabled for the project.' }); return; }
    if (!['BACKLOG', 'TO_DO'].includes(taskStatus) && !ProjectService.authorize(project.id, user, 'MANAGE').allowed && !ProjectService.isGlobalAdmin(user)) { res.status(403).json({ success: false, error: 'Only a project manager may create work directly in a non-initial status.' }); return; }
    if (taskStatus === 'BLOCKED' && !String(body.blockedReason || '').trim()) { res.status(400).json({ success: false, error: 'A blocking reason is required when a task is blocked.' }); return; }
    const parentTicketId = body.parentTicketId ? String(body.parentTicketId) : undefined;
    if ((projectWorkItemType === 'SUBTASK') !== Boolean(parentTicketId)) { res.status(400).json({ success: false, error: 'Subtasks require a parent, and only subtasks may have a parent work item.' }); return; }
    if (parentTicketId && !ProjectService.tasks(project.id).some((task) => task.id === parentTicketId)) { res.status(400).json({ success: false, error: 'A subtask parent must belong to the same project.' }); return; }
    if (body.milestoneId && !db.data.projectMilestones.some((milestone) => milestone.id === body.milestoneId && milestone.projectId === project.id)) { res.status(400).json({ success: false, error: 'Milestone must belong to this project.' }); return; }
    if (!ProjectsController.isAssignable(project.id, body.assigneeId)) { res.status(400).json({ success: false, error: 'Assignee must be an active user with project access.' }); return; }
    const workflow = project.workflowId ? WorkflowService.getWorkflowById(project.workflowId) : undefined;
    if (project.workflowId && !workflow) { res.status(400).json({ success: false, error: 'Configured project workflow is unavailable.' }); return; }
    const workflowState = workflow?.states.find((state) => state.id === taskStatus);
    if (workflow && !workflowState) { res.status(400).json({ success: false, error: 'Initial status is not defined by the project workflow.' }); return; }
    const task: Ticket = { id: `ptsk-${uuidv4().slice(0, 8)}`, key: `${project.key}-${number}`, projectCode: project.key as any, ticketTypeId: `PROJECT_${projectWorkItemType}`, ticketTypeName: workItemTypeLabel[projectWorkItemType], type: 'PROJECT_WORK', category: 'GENERAL_REQUEST', securityDomain: 'GRC' as any, title, description: String(body.description || ''), statusId: taskStatus, statusName: workflowState?.name || taskStatus.replace(/_/g, ' '), statusCategory: workflowState?.category || (taskStatus === 'DONE' ? 'DONE' : taskStatus === 'IN_REVIEW' ? 'IN_REVIEW' : taskStatus === 'IN_PROGRESS' || taskStatus === 'BLOCKED' ? 'IN_PROGRESS' : 'TO_DO'), workflowId: project.workflowId || 'project-default', workflowVersion: workflow?.version || 1, technicalSeverity: body.technicalSeverity || 'MEDIUM', businessPriority: body.businessPriority || priorityMap[project.priority], businessImpact: body.businessImpact || 'MODERATE', inherentRisk: 'LOW', residualRisk: 'LOW', riskScore: 0, confidentiality: 'INTERNAL', reporterId: user.id, ownerId: body.ownerId || body.assigneeId || user.id, assigneeId: body.assigneeId, watcherIds: Array.isArray(body.watcherIds) ? body.watcherIds : [user.id], customFields: body.customFields || [], checklists: body.checklists || [], createdAt: now, updatedAt: now, startDate: body.startDate, dueDate: body.dueDate || project.targetDate || now, remediationDeadline: body.dueDate || project.targetDate || now, slaState: 'SAFE', version: 1, tags: Array.isArray(body.tags) ? body.tags : [], projectId: project.id, milestoneId: body.milestoneId, parentTicketId, projectTaskNumber: number, projectTaskStatus: taskStatus, projectWorkItemType, estimatedHours: body.estimatedHours, actualHours: body.actualHours, storyPoints: body.storyPoints, taskWeight: body.taskWeight, blockedReason: body.blockedReason, blockerTaskId: body.blockerTaskId };
    db.transaction(() => { db.data.tickets.unshift(task); ProjectService.record(project.id, user.id, 'PROJECT_TASK_CREATED', 'TASK', task.id, undefined, { key: task.key, title: task.title }); AuditService.log({ actor: user, action: 'PROJECT_TASK_UPDATED', entityType: 'TICKET', entityId: task.id, entityKey: task.key, metadata: { action: 'CREATED', projectId: project.id } }); });
    if (task.assigneeId && task.assigneeId !== user.id) NotificationService.create({ userId: task.assigneeId, title: `Task assigned: ${task.key}`, message: task.title, type: 'ASSIGNMENT', ticketId: task.id, ticketKey: task.key, actionUrl: '/work-management/projects-tasks' });
    res.status(201).json({ success: true, task });
  }

  static updateTask(req: AuthenticatedRequest, res: Response): void {
    const project = ProjectsController.authorizedProject(req, res, 'TASK_WRITE'); if (!project) return;
    const task = ProjectService.visibleTasks(project.id, req.user!).find((candidate) => candidate.id === req.params.taskId || candidate.key === req.params.taskId); if (!task) { res.status(404).json({ success: false, error: 'Project task not found.' }); return; }
    const body = req.body || {}; if (body.status && !TASK_STATUSES.includes(body.status)) { res.status(400).json({ success: false, error: 'Invalid task status.' }); return; }
    if (body.expectedVersion !== undefined && Number(body.expectedVersion) !== task.version) { res.status(409).json({ success: false, error: 'This work item was changed by another user. Refresh and retry.' }); return; }
    const isTransition = Boolean(body.status && body.status !== task.projectTaskStatus);
    const configuredWorkflow = WorkflowService.getWorkflowById(task.workflowId);
    if (isTransition && configuredWorkflow) {
      const transition = WorkflowService.getAvailableTransitions(task, req.user!).find((candidate) => candidate.toStateId === body.status);
      if (!transition) { res.status(403).json({ success: false, error: 'The configured workflow does not permit this transition for your role.' }); return; }
      const transitionComment = String(body.transitionComment || body.blockedReason || '').trim();
      if (transition.requireComment && !transitionComment) { res.status(400).json({ success: false, error: 'A transition comment is required by the configured workflow.' }); return; }
      if (transition.requireEvidence && !db.data.attachments.some((attachment) => attachment.ticketId === task.id)) { res.status(400).json({ success: false, error: 'Evidence is required by the configured workflow before this transition.' }); return; }
      for (const field of transition.requiredFields || []) {
        const value = body[field] ?? (task as any)[field];
        if (value === undefined || value === null || String(value).trim() === '') { res.status(400).json({ success: false, error: `${field} is required by the configured workflow.` }); return; }
      }
    }
    const editFields = ['title', 'description', 'ownerId', 'milestoneId', 'dueDate', 'startDate', 'estimatedHours', 'actualHours', 'storyPoints', 'taskWeight', 'tags', 'blockedReason', 'blockerTaskId', 'blockerExpectedResolutionDate', 'technicalSeverity', 'businessPriority'];
    if (editFields.some((field) => Object.prototype.hasOwnProperty.call(body, field))) { const check = ProjectService.canUseProjectTask(project.id, task, req.user!, 'EDIT'); if (!check.allowed) { res.status(403).json({ success: false, error: check.reason }); return; } }
    if (isTransition) { const check = ProjectService.canUseProjectTask(project.id, task, req.user!, 'TRANSITION'); if (!check.allowed) { res.status(403).json({ success: false, error: check.reason }); return; } }
    if (Object.prototype.hasOwnProperty.call(body, 'assigneeId')) { const check = ProjectService.canUseProjectTask(project.id, task, req.user!, 'ASSIGN'); if (!check.allowed) { res.status(403).json({ success: false, error: check.reason }); return; } if (body.assigneeId && body.assigneeId !== req.user!.id && !ProjectService.authorize(project.id, req.user!, 'MANAGE').allowed) { res.status(403).json({ success: false, error: 'Contributors may only assign work to themselves.' }); return; } if (!ProjectsController.isAssignable(project.id, body.assigneeId)) { res.status(400).json({ success: false, error: 'Assignee must be an active user with project access.' }); return; } }
    if (body.status === 'BLOCKED' && !String(body.blockedReason || task.blockedReason || '').trim()) { res.status(400).json({ success: false, error: 'A blocking reason is required when a task is blocked.' }); return; }
    const allowed = ['title', 'description', 'assigneeId', 'ownerId', 'milestoneId', 'dueDate', 'startDate', 'estimatedHours', 'actualHours', 'storyPoints', 'taskWeight', 'tags', 'blockedReason', 'blockerTaskId', 'blockerExpectedResolutionDate', 'technicalSeverity', 'businessPriority'] as const; const oldValue: Record<string, unknown> = {};
    for (const field of allowed) if (Object.prototype.hasOwnProperty.call(body, field)) { oldValue[field] = (task as any)[field]; (task as any)[field] = body[field]; }
    if (body.status) { oldValue.status = task.projectTaskStatus; task.projectTaskStatus = body.status; task.statusId = body.status; task.statusName = body.status.replace(/_/g, ' '); task.statusCategory = body.status === 'DONE' ? 'DONE' : body.status === 'IN_REVIEW' ? 'IN_REVIEW' : ['IN_PROGRESS', 'BLOCKED'].includes(body.status) ? 'IN_PROGRESS' : 'TO_DO'; if (body.status === 'DONE') task.resolvedAt = new Date().toISOString(); if (body.status !== 'BLOCKED') { oldValue.blockedReason = task.blockedReason; task.blockedReason = undefined; } }
    task.updatedAt = new Date().toISOString(); task.version += 1;
    db.transaction(() => {
      ProjectService.record(project.id, req.user!.id, isTransition ? 'PROJECT_TASK_TRANSITIONED' : 'PROJECT_TASK_UPDATED', 'TASK', task.id, oldValue, body);
      AuditService.log({ actor: req.user!, action: isTransition ? 'STATUS_TRANSITIONED' : 'PROJECT_TASK_UPDATED', entityType: 'TICKET', entityId: task.id, entityKey: task.key, fieldChanges: Object.entries(oldValue).map(([field, oldValue]) => ({ field, oldValue, newValue: (task as any)[field] })) });
      const notificationTitle = isTransition ? `Task status changed: ${task.key}` : `Task updated: ${task.key}`;
      const notificationMessage = isTransition ? `${req.user!.fullName} changed status to ${task.statusName}.` : task.title;
      for (const watcherId of task.watcherIds.filter((userId) => userId !== req.user!.id)) {
        NotificationService.create({ userId: watcherId, title: notificationTitle, message: notificationMessage, type: isTransition ? 'ALERT' : 'SYSTEM', ticketId: task.id, ticketKey: task.key, actionUrl: '/work-management/projects-tasks' }, false);
      }
      if (Object.prototype.hasOwnProperty.call(body, 'assigneeId') && task.assigneeId && task.assigneeId !== req.user!.id && !task.watcherIds.includes(task.assigneeId)) {
        NotificationService.create({ userId: task.assigneeId, title: `Task assigned: ${task.key}`, message: task.title, type: 'ASSIGNMENT', ticketId: task.id, ticketKey: task.key, actionUrl: '/work-management/projects-tasks' }, false);
      }
    });
    res.json({ success: true, task });
  }

  static addStatusUpdate(req: AuthenticatedRequest, res: Response): void {
    const project = ProjectsController.authorizedProject(req, res, 'WRITE'); if (!project) return; const body = String(req.body?.body || '').trim(); if (!body) { res.status(400).json({ success: false, error: 'Status update text is required.' }); return; }
    const update = { id: `psu-${uuidv4().slice(0, 8)}`, projectId: project.id, body, createdByUserId: req.user!.id, createdAt: new Date().toISOString() };
    db.transaction(() => { db.data.projectStatusUpdates.unshift(update); ProjectService.record(project.id, req.user!.id, 'PROJECT_STATUS_UPDATED', 'STATUS_UPDATE', update.id, undefined, update); AuditService.log({ actor: req.user!, action: 'PROJECT_STATUS_UPDATED', entityType: 'PROJECT', entityId: project.id, entityKey: project.identifier, metadata: { updateId: update.id } }); }); res.status(201).json({ success: true, update });
  }

  static addDependency(req: AuthenticatedRequest, res: Response): void {
    const project = ProjectsController.authorizedProject(req, res, 'TASK_WRITE'); if (!project) return;
    const { sourceTaskId, targetTaskId, type = 'BLOCKS' } = req.body || {};
    if (req.params.taskId && sourceTaskId !== req.params.taskId) { res.status(400).json({ success: false, error: 'Dependency source must match the task in the request path.' }); return; }
    const tasks = ProjectService.visibleTasks(project.id, req.user!);
    const sourceTask = tasks.find((task) => task.id === sourceTaskId); const targetTask = tasks.find((task) => task.id === targetTaskId);
    if (!sourceTask || !targetTask || sourceTaskId === targetTaskId) { res.status(400).json({ success: false, error: 'Both dependency tasks must belong to this project and be different.' }); return; }
    const sourceAccess = ProjectService.canUseProjectTask(project.id, sourceTask, req.user!, 'LINK'); const targetAccess = ProjectService.canUseProjectTask(project.id, targetTask, req.user!, 'LINK'); if (!sourceAccess.allowed || !targetAccess.allowed) { res.status(403).json({ success: false, error: sourceAccess.reason || targetAccess.reason }); return; }
    if (!['BLOCKS', 'DEPENDS_ON', 'REQUIRED_BY', 'RELATES_TO', 'DUPLICATES'].includes(type)) { res.status(400).json({ success: false, error: 'Invalid dependency type.' }); return; }
    const dependency = { id: `ptd-${uuidv4().slice(0, 8)}`, projectId: project.id, sourceTaskId, targetTaskId, type, createdByUserId: req.user!.id, createdAt: new Date().toISOString() } as const;
    db.transaction(() => { db.data.projectTaskDependencies.push(dependency); ProjectService.record(project.id, req.user!.id, 'PROJECT_DEPENDENCY_CREATED', 'TASK', dependency.id, undefined, dependency); AuditService.log({ actor: req.user!, action: 'PROJECT_TASK_UPDATED', entityType: 'TICKET', entityId: targetTaskId, entityKey: project.identifier, metadata: { action: 'DEPENDENCY_CREATED', dependency } }); });
    res.status(201).json({ success: true, dependency });
  }

  static addComment(req: AuthenticatedRequest, res: Response): void {
    const project = ProjectsController.authorizedProject(req, res, 'TASK_WRITE'); if (!project) return;
    const task = ProjectService.visibleTasks(project.id, req.user!).find((candidate) => candidate.id === req.params.taskId || candidate.key === req.params.taskId);
    const content = String(req.body?.content || '').trim(); if (!task) { res.status(404).json({ success: false, error: 'Project task not found.' }); return; } if (!content) { res.status(400).json({ success: false, error: 'Comment content is required.' }); return; }
    const commentAccess = ProjectService.canUseProjectTask(project.id, task, req.user!, 'COMMENT'); if (!commentAccess.allowed) { res.status(403).json({ success: false, error: commentAccess.reason }); return; }
    const mentions = Array.isArray(req.body?.mentions) ? req.body.mentions.filter((value: unknown) => typeof value === 'string').slice(0, 20) : [];
    if (mentions.some((userId: string) => !ProjectsController.isAssignable(project.id, userId))) { res.status(400).json({ success: false, error: 'Mentioned users must be active project members.' }); return; }
    const comment: TicketComment = { id: `com-${uuidv4().slice(0, 8)}`, ticketId: task.id, authorId: req.user!.id, authorName: req.user!.fullName, authorRole: req.user!.roles[0] || 'USER', content, visibility: 'PUBLIC', confidentiality: 'INTERNAL', mentions, createdAt: new Date().toISOString(), isEdited: false, reactions: [], parentId: req.body?.parentId };
    db.transaction(() => { db.data.comments.unshift(comment); ProjectService.record(project.id, req.user!.id, 'PROJECT_COMMENT_ADDED', 'TASK', task.id, undefined, { commentId: comment.id, mentions }); AuditService.log({ actor: req.user!, action: 'COMMENT_ADDED', entityType: 'COMMENT', entityId: comment.id, entityKey: task.key, metadata: { projectId: project.id } }); });
    for (const userId of mentions.filter((userId: string) => userId !== req.user!.id)) NotificationService.create({ userId, title: `Mentioned in ${task.key}`, message: content.slice(0, 160), type: 'ALERT', ticketId: task.id, ticketKey: task.key, actionUrl: '/work-management/projects-tasks' });
    res.status(201).json({ success: true, comment });
  }

  static toggleWatcher(req: AuthenticatedRequest, res: Response): void {
    const project = ProjectsController.authorizedProject(req, res, 'READ'); if (!project) return;
    const task = ProjectService.visibleTasks(project.id, req.user!).find((candidate) => candidate.id === req.params.taskId || candidate.key === req.params.taskId);
    if (!task) { res.status(404).json({ success: false, error: 'Project task not found.' }); return; }
    const targetUserId = String(req.body?.userId || req.user!.id);
    if (targetUserId !== req.user!.id && !ProjectService.authorize(project.id, req.user!, 'MANAGE').allowed) { res.status(403).json({ success: false, error: 'Only a project manager can manage another user\'s watchers.' }); return; }
    if (!ProjectsController.isAssignable(project.id, targetUserId)) { res.status(400).json({ success: false, error: 'Watcher must be an active project member.' }); return; }
    const wasWatching = task.watcherIds.includes(targetUserId);
    db.transaction(() => {
      task.watcherIds = wasWatching ? task.watcherIds.filter((userId) => userId !== targetUserId) : [...new Set([...task.watcherIds, targetUserId])];
      task.updatedAt = new Date().toISOString(); task.version += 1;
      ProjectService.record(project.id, req.user!.id, wasWatching ? 'PROJECT_WATCHER_REMOVED' : 'PROJECT_WATCHER_ADDED', 'TASK', task.id, { userId: targetUserId, wasWatching }, { watcherIds: task.watcherIds });
      AuditService.log({ actor: req.user!, action: 'TICKET_UPDATED', entityType: 'TICKET', entityId: task.id, entityKey: task.key, metadata: { projectId: project.id, userId: targetUserId, action: wasWatching ? 'WATCHER_REMOVED' : 'WATCHER_ADDED' } });
    });
    res.json({ success: true, watching: !wasWatching, task });
  }

  static listActivity(req: AuthenticatedRequest, res: Response): void { const project = ProjectsController.authorizedProject(req, res, 'READ'); if (!project) return; const filter = String(req.query.type || 'ALL'); const activity = db.data.projectActivities.filter((event) => event.projectId === project.id && (filter === 'ALL' || event.objectType === filter)).slice(0, Math.min(200, Number(req.query.limit) || 50)); res.json({ success: true, activity }); }

  static report(req: AuthenticatedRequest, res: Response): void { const project = ProjectsController.authorizedProject(req, res, 'READ'); if (!project) return; const summary = ProjectService.summary(project, req.user!); res.json({ success: true, report: { project: `${project.name} (${project.identifier})`, health: summary.health, healthReasons: summary.healthReasons, progressPercent: summary.progressPercent, completed: summary.taskCounts.completed, active: summary.taskCounts.active, blocked: summary.taskCounts.blocked, overdue: summary.taskCounts.overdue, nextMilestone: summary.nextMilestone?.name, risks: summary.risks.map((risk) => risk.title), latestUpdate: summary.latestUpdate?.body } }); }

  private static parseWorkItemTypes(value: unknown): ProjectWorkItemType[] {
    if (!Array.isArray(value)) return [...PROJECT_WORK_ITEM_TYPES];
    const types = [...new Set(value.filter((type): type is ProjectWorkItemType => typeof type === 'string' && (PROJECT_WORK_ITEM_TYPES as readonly string[]).includes(type)))];
    return types;
  }

  private static isAssignable(projectId: string, userId: unknown): boolean {
    if (!userId) return true;
    const user = db.data.users.find((candidate) => candidate.id === userId && candidate.isActive);
    return Boolean(user && ProjectService.authorize(projectId, user, 'READ').allowed);
  }

  private static authorizedProject(req: AuthenticatedRequest, res: Response, action: 'READ' | 'WRITE' | 'TASK_WRITE' | 'MANAGE' | 'ADMIN'): Project | undefined { const project = db.data.projects.find((candidate) => candidate.id === req.params.id || candidate.identifier === req.params.id || candidate.key === req.params.id); if (!project) { res.status(404).json({ success: false, error: 'Project not found.' }); return; } const check = ProjectService.authorize(project.id, req.user!, action); if (!check.allowed) { res.status(403).json({ success: false, error: check.reason }); return; } return project; }
}
