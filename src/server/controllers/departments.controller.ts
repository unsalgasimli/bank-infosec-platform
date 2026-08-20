import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { db } from '../db/database.js';
import { logger } from '../services/logger.service.js';
import { AuditService } from '../services/audit.service.js';
import { SLAService } from '../services/sla.service.js';
import { BankDepartment, BankUser } from '../../shared/types/auth.js';
import { DepartmentConnection, ConnectionTestResult } from '../../shared/types/connections.js';
import { ProjectBlueprint } from '../../shared/types/blueprints.js';
import { Ticket } from '../../shared/types/ticket.js';

export class DepartmentsController {
  // 1. List all departments with computed metrics
  public static listDepartments(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user!;
      const departments = db.data.departments || [];
      const users = db.data.users || [];
      const connections = db.data.connections || [];
      const blueprints = db.data.blueprints || [];
      const tickets = db.data.tickets || [];

      const enriched = departments.map((dept) => {
        const memberCount = users.filter((u) => u.departmentId === dept.id).length;
        const connectionCount = connections.filter((c) => c.departmentId === dept.id).length;
        const templateCount = blueprints.filter((b) => b.departmentId === dept.id).length;
        const activeTaskCount = tickets.filter(
          (t) => (t.departmentId === dept.id || t.targetDepartmentId === dept.id) && t.statusCategory !== 'DONE'
        ).length;

        const isSuperAdmin = user.roles.includes('PLATFORM_ADMIN') || user.roles.includes('CISO');
        const isDeptAdmin =
          isSuperAdmin ||
          dept.adminUserIds?.includes(user.id) ||
          dept.managerId === user.id ||
          (user.departmentId === dept.id && user.roles.includes('DEPARTMENT_ADMIN'));

        const manager = users.find((u) => u.id === dept.managerId);

        return {
          ...dept,
          memberCount: memberCount || dept.memberCount || 0,
          connectionCount: connectionCount || dept.connectionCount || 0,
          templateCount: templateCount || dept.templateCount || 0,
          activeTaskCount,
          managerName: manager?.fullName,
          managerEmail: manager?.email,
          isDeptAdmin,
          isSuperAdmin,
        };
      });

      res.json({
        success: true,
        departments: enriched,
        total: enriched.length,
      });
    } catch (err: any) {
      logger.error({ err }, 'Failed to list departments');
      res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  }

  // 2. Get single department by ID with deep resources
  public static getDepartmentById(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user!;
      const deptId = String(req.params.id || '');
      const dept = (db.data.departments || []).find(
        (d) => d.id === deptId || d.code.toLowerCase() === deptId.toLowerCase()
      );

      if (!dept) {
        res.status(404).json({ success: false, error: 'Department not found' });
        return;
      }

      const isSuperAdmin = user.roles.includes('PLATFORM_ADMIN') || user.roles.includes('CISO');
      const isDeptAdmin =
        isSuperAdmin ||
        dept.adminUserIds?.includes(user.id) ||
        dept.managerId === user.id ||
        (user.departmentId === dept.id && user.roles.includes('DEPARTMENT_ADMIN'));

      const members = (db.data.users || []).filter((u) => u.departmentId === dept.id);
      const connections = (db.data.connections || []).filter((c) => c.departmentId === dept.id);
      const templates = (db.data.blueprints || []).filter((b) => b.departmentId === dept.id || b.participatingDepartments?.includes(dept.id));
      const workflows = (db.data.workflows || []).filter((w) => !w.departmentId || w.departmentId === dept.id);
      const activeTickets = (db.data.tickets || []).filter(
        (t) => t.departmentId === dept.id || t.targetDepartmentId === dept.id
      );

      const manager = (db.data.users || []).find((u) => u.id === dept.managerId);
      const admins = (db.data.users || []).filter((u) => dept.adminUserIds?.includes(u.id));

      res.json({
        success: true,
        department: {
          ...dept,
          managerName: manager?.fullName,
          managerEmail: manager?.email,
          admins: admins.map((a) => ({ id: a.id, fullName: a.fullName, email: a.email, role: a.roles[0] })),
          isDeptAdmin,
          isSuperAdmin,
        },
        members,
        connections,
        templates,
        workflows,
        activeTickets: activeTickets.slice(0, 20),
        stats: {
          totalMembers: members.length,
          totalConnections: connections.length,
          totalTemplates: templates.length,
          openTasksCount: activeTickets.filter((t) => t.statusCategory !== 'DONE').length,
          slaBreachedCount: activeTickets.filter((t) => t.slaState === 'BREACHED').length,
        },
      });
    } catch (err: any) {
      logger.error({ err }, 'Failed to fetch department');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // 3. Create new department (Super Admin / Platform Admin)
  public static createDepartment(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user!;
      const isSuperAdmin = user.roles.includes('PLATFORM_ADMIN') || user.roles.includes('CISO');

      if (!isSuperAdmin) {
        res.status(403).json({ success: false, error: 'Permission denied: Only Super Admins can create new banking departments.' });
        return;
      }

      const body = req.body;
      if (!body.name || !body.code) {
        res.status(400).json({ success: false, error: 'Department name and code are required' });
        return;
      }

      const newId = `dept-${body.code.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString().slice(-4)}`;
      const now = new Date().toISOString();

      const newDept: BankDepartment = {
        id: newId,
        divisionId: body.divisionId || 'div-sec',
        name: body.name.trim(),
        code: body.code.trim().toUpperCase(),
        description: body.description?.trim() || `Department of ${body.name}`,
        managerId: body.managerId || user.id,
        adminUserIds: body.adminUserIds?.length ? body.adminUserIds : [user.id],
        color: body.color || '#0052CC',
        icon: body.icon || 'Shield',
        isActive: true,
        memberCount: 1,
        connectionCount: 0,
        templateCount: 0,
        activeTaskCount: 0,
        settings: {
          defaultSlaHours: Number(body.defaultSlaHours) || 24,
          criticalSlaHours: Number(body.criticalSlaHours) || 2,
          autoAssignEnabled: body.autoAssignEnabled !== undefined ? body.autoAssignEnabled : true,
          requireDualApproval: Boolean(body.requireDualApproval),
          allowedTicketCategories: body.allowedTicketCategories || ['GENERAL_REQUEST', 'SECURITY_REVIEW'],
          workingHours: { start: '09:00', end: '18:00', timezone: 'Asia/Baku' },
          notifications: { emailAlerts: true, escalateAfterHours: 4 },
        },
        createdAt: now,
        updatedAt: now,
      };

      if (!db.data.departments) db.data.departments = [];
      db.data.departments.push(newDept);

      AuditService.log({
        actor: user,
        action: 'TICKET_CREATED',
        entityType: 'TICKET',
        entityId: newDept.id,
        metadata: { action: 'CREATED_DEPARTMENT', name: newDept.name, code: newDept.code },
      });

      db.persist();
      res.status(201).json({ success: true, department: newDept });
    } catch (err: any) {
      logger.error({ err }, 'Failed to create department');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // 4. Update department metadata
  public static updateDepartment(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user!;
      const deptId = req.params.id;
      const dept = (db.data.departments || []).find((d) => d.id === deptId);

      if (!dept) {
        res.status(404).json({ success: false, error: 'Department not found' });
        return;
      }

      const isSuperAdmin = user.roles.includes('PLATFORM_ADMIN') || user.roles.includes('CISO');
      const isDeptAdmin =
        isSuperAdmin ||
        dept.adminUserIds?.includes(user.id) ||
        dept.managerId === user.id ||
        (user.departmentId === dept.id && user.roles.includes('DEPARTMENT_ADMIN'));

      if (!isDeptAdmin) {
        res.status(403).json({ success: false, error: 'Permission denied: You must be a Department Admin or Super Admin to edit settings.' });
        return;
      }

      const updates = req.body;
      if (updates.name) dept.name = updates.name.trim();
      if (updates.description !== undefined) dept.description = updates.description.trim();
      if (updates.color) dept.color = updates.color;
      if (updates.icon) dept.icon = updates.icon;
      if (updates.managerId) dept.managerId = updates.managerId;
      if (updates.adminUserIds) dept.adminUserIds = updates.adminUserIds;
      if (updates.isActive !== undefined) dept.isActive = updates.isActive;

      dept.updatedAt = new Date().toISOString();

      AuditService.log({
        actor: user,
        action: 'TICKET_UPDATED',
        entityType: 'TICKET',
        entityId: dept.id,
        metadata: { action: 'UPDATED_DEPARTMENT_METADATA', department: dept.name },
      });

      db.persist();
      res.json({ success: true, department: dept });
    } catch (err: any) {
      logger.error({ err }, 'Failed to update department');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // 5. Update department internal settings & SLAs (Department Admin & Super Admin)
  public static updateSettings(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user!;
      const deptId = req.params.id;
      const dept = (db.data.departments || []).find((d) => d.id === deptId);

      if (!dept) {
        res.status(404).json({ success: false, error: 'Department not found' });
        return;
      }

      const isSuperAdmin = user.roles.includes('PLATFORM_ADMIN') || user.roles.includes('CISO');
      const isDeptAdmin =
        isSuperAdmin ||
        dept.adminUserIds?.includes(user.id) ||
        dept.managerId === user.id ||
        (user.departmentId === dept.id && user.roles.includes('DEPARTMENT_ADMIN'));

      if (!isDeptAdmin) {
        res.status(403).json({ success: false, error: 'Permission denied: Only Department Admins can modify department settings.' });
        return;
      }

      dept.settings = {
        ...dept.settings,
        ...req.body,
      };
      dept.updatedAt = new Date().toISOString();

      AuditService.log({
        actor: user,
        action: 'TICKET_UPDATED',
        entityType: 'TICKET',
        entityId: dept.id,
        metadata: { action: 'UPDATED_DEPARTMENT_SETTINGS', department: dept.name, settings: dept.settings },
      });

      db.persist();
      res.json({ success: true, settings: dept.settings });
    } catch (err: any) {
      logger.error({ err }, 'Failed to update department settings');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // 6. Manage department members & internal RBAC roles
  public static addOrUpdateMember(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user!;
      const deptId = req.params.id;
      const dept = (db.data.departments || []).find((d) => d.id === deptId);

      if (!dept) {
        res.status(404).json({ success: false, error: 'Department not found' });
        return;
      }

      const isSuperAdmin = user.roles.includes('PLATFORM_ADMIN') || user.roles.includes('CISO');
      const isDeptAdmin =
        isSuperAdmin ||
        dept.adminUserIds?.includes(user.id) ||
        dept.managerId === user.id ||
        (user.departmentId === dept.id && user.roles.includes('DEPARTMENT_ADMIN'));

      if (!isDeptAdmin) {
        res.status(403).json({ success: false, error: 'Permission denied: Only Department Admins can manage department personnel.' });
        return;
      }

      const { userId, roles, fullName, email, title, isDeptAdminFlag } = req.body;

      let targetUser = (db.data.users || []).find((u) => u.id === userId || (email && u.email === email));

      if (targetUser) {
        targetUser.departmentId = dept.id;
        if (roles && Array.isArray(roles)) {
          targetUser.roles = roles;
        }
        if (title) targetUser.title = title;
      } else {
        // Create new employee persona in department
        const newUserId = `usr-${dept.code.toLowerCase()}-${Date.now().toString().slice(-4)}`;
        targetUser = {
          id: newUserId,
          username: email ? email.split('@')[0] : `user.${Date.now()}`,
          sAMAccountName: email ? email.split('@')[0] : `user.${Date.now()}`,
          email: email || `${newUserId}@apexbank.int`,
          fullName: fullName || 'New Department Specialist',
          title: title || 'Department Specialist',
          departmentId: dept.id,
          divisionId: dept.divisionId,
          teamIds: [],
          roles: roles || ['SECURITY_ANALYST'],
          securityClearance: 'INTERNAL',
          ownedApplicationIds: [],
          ownedAssetIds: [],
          ownedRiskIds: [],
          distributionGroups: [`${dept.name} DG`],
          isActive: true,
        };
        db.data.users.push(targetUser);
      }

      // Handle Department Admin role flag
      if (isDeptAdminFlag) {
        if (!dept.adminUserIds) dept.adminUserIds = [];
        if (!dept.adminUserIds.includes(targetUser.id)) {
          dept.adminUserIds.push(targetUser.id);
        }
        if (!targetUser.roles.includes('DEPARTMENT_ADMIN')) {
          targetUser.roles.push('DEPARTMENT_ADMIN');
        }
      }

      db.persist();
      res.status(200).json({ success: true, user: targetUser });
    } catch (err: any) {
      logger.error({ err }, 'Failed to add/update department member');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // 7. Department Connections CRUD. Connectivity must be verified by the
  // connector implementation; this API never fabricates a successful probe.
  public static listConnections(req: AuthenticatedRequest, res: Response): void {
    try {
      const deptId = req.params.id;
      const connections = (db.data.connections || []).filter((c) => c.departmentId === deptId);
      res.json({ success: true, connections });
    } catch (err: any) {
      logger.error({ err }, 'Failed to list connections');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static createConnection(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user!;
      const deptId = req.params.id;
      const dept = (db.data.departments || []).find((d) => d.id === deptId);

      if (!dept) {
        res.status(404).json({ success: false, error: 'Department not found' });
        return;
      }

      const body = req.body;
      if (!String(body.name || '').trim() || !String(body.provider || '').trim() || !String(body.endpointUrl || '').trim() || !body.type || !body.authType) {
        res.status(400).json({ success: false, error: 'Name, provider, endpoint, connection type and authentication type are required.' });
        return;
      }
      const newConn: DepartmentConnection = {
        id: `conn-${dept.code.toLowerCase()}-${uuidv4().substring(0, 6)}`,
        departmentId: dept.id,
        name: String(body.name || '').trim(),
        type: body.type,
        provider: String(body.provider || '').trim(),
        endpointUrl: String(body.endpointUrl || '').trim(),
        authType: body.authType,
        status: 'DISCONNECTED',
        lastSyncAt: '',
        syncFrequencyMinutes: Number(body.syncFrequencyMinutes) || 0,
        description: String(body.description || '').trim(),
        configSummary: body.configSummary || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (!db.data.connections) db.data.connections = [];
      db.data.connections.push(newConn);

      AuditService.log({
        actor: user,
        action: 'TICKET_CREATED',
        entityType: 'TICKET',
        entityId: newConn.id,
        metadata: { action: 'CREATED_DEPARTMENT_CONNECTION', name: newConn.name, department: dept.name },
      });

      db.persist();
      res.status(201).json({ success: true, connection: newConn });
    } catch (err: any) {
      logger.error({ err }, 'Failed to create connection');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static testConnection(req: AuthenticatedRequest, res: Response): void {
    try {
      const { id, connId } = req.params;
      const connection = (db.data.connections || []).find((c) => c.id === connId && c.departmentId === id);

      if (!connection) {
        res.status(404).json({ success: false, error: 'Connection not found in department' });
        return;
      }

      const testResult: ConnectionTestResult = {
        success: false,
        message: 'No connector health-check implementation is configured for this connection. No network probe was performed.',
        latencyMs: 0,
        timestamp: new Date().toISOString(),
      };
      res.status(501).json({ success: false, testResult, connection });
    } catch (err: any) {
      logger.error({ err }, 'Failed to test connection');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static deleteConnection(req: AuthenticatedRequest, res: Response): void {
    try {
      const { id, connId } = req.params;
      db.data.connections = (db.data.connections || []).filter((c) => !(c.id === connId && c.departmentId === id));
      db.persist();
      res.json({ success: true, message: 'Connection deleted successfully' });
    } catch (err: any) {
      logger.error({ err }, 'Failed to delete connection');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // 8. Cross-Department Task & Workflow Orchestration
  public static listCrossTasks(req: AuthenticatedRequest, res: Response): void {
    try {
      const tickets = db.data.tickets || [];
      const crossTickets = tickets.filter((t) => t.isCrossDepartmentParent || t.crossDepartmentId || t.parentTaskId);
      const blueprints = (db.data.blueprints || []).filter((b) => b.isCrossDepartment);
      const dependencies = db.data.ganttDependencies || [];

      // Group subtasks by parent or crossDepartmentId
      const parentWorkflows = tickets.filter((t) => t.isCrossDepartmentParent);

      res.json({
        success: true,
        crossTickets,
        parentWorkflows,
        blueprints,
        dependencies,
      });
    } catch (err: any) {
      logger.error({ err }, 'Failed to list cross tasks');
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public static launchCrossTaskWorkflow(req: AuthenticatedRequest, res: Response): void {
    try {
      const user = req.user!;
      const { blueprintId, customTitle, targetDepartments, tasks } = req.body;
      const now = new Date().toISOString();

      let bp: ProjectBlueprint | undefined;
      if (blueprintId) {
        bp = (db.data.blueprints || []).find((b) => b.id === blueprintId);
      }

      const workflowTitle = customTitle || bp?.title || 'Cross-Department Multi-Task Banking Workflow';
      const crossId = `cross-wf-${Date.now()}`;
      const parentKey = `CROSS-2026-${String((db.data.tickets || []).length + 1).padStart(4, '0')}`;
      const parentId = `tick-${uuidv4().substring(0, 8)}`;

      // 1. Create Parent Orchestrator Ticket
      const parentTicket: Ticket = {
        id: parentId,
        key: parentKey,
        projectCode: 'SEC',
        ticketTypeId: 'CROSS_DEPT_WORKFLOW',
        ticketTypeName: 'Cross-Department Orchestration',
        category: 'SECURITY_REVIEW',
        securityDomain: 'GENERAL_INFOSEC',
        title: workflowTitle,
        description: `Enterprise Cross-Department Workflow Orchestrator. Subtasks distributed across: ${(targetDepartments || bp?.participatingDepartments || ['HR', 'IT', 'INFOSEC', 'CORE_BANK']).join(', ')}.`,
        statusId: 'IN_PROGRESS',
        statusName: 'In Progress',
        statusCategory: 'IN_PROGRESS',
        workflowId: 'wf-secops-default',
        workflowVersion: 1,
        technicalSeverity: 'HIGH',
        businessPriority: 'P1_URGENT',
        businessImpact: 'SIGNIFICANT',
        inherentRisk: 'HIGH',
        residualRisk: 'LOW',
        riskScore: 75,
        confidentiality: 'RESTRICTED',
        reporterId: user.id,
        assigneeId: user.id,
        securityOwnerId: user.id,
        departmentId: user.departmentId,
        watcherIds: [user.id],
        isCrossDepartmentParent: true,
        crossDepartmentId: crossId,
        participatingDepartmentIds: targetDepartments || bp?.participatingDepartments || ['dept-hr', 'dept-it', 'dept-secops', 'dept-core'],
        createdAt: now,
        updatedAt: now,
        dueDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        remediationDeadline: new Date(Date.now() + 86400000 * 5).toISOString(),
        slaPolicyId: 'sla-p1-emergency',
        slaState: 'SAFE',
        version: 1,
        tags: ['CROSS_DEPARTMENT', 'MULTI_DEPT_PIPELINE'],
      };

      if (!db.data.tickets) db.data.tickets = [];
      db.data.tickets.unshift(parentTicket);

      // 2. Instantiate Subtasks for participating departments
      const subtaskDefs = tasks || bp?.defaultTasks || [];
      const createdSubtasks: Ticket[] = [];
      const createdDependencies: any[] = [];

      for (let i = 0; i < subtaskDefs.length; i++) {
        const def = subtaskDefs[i];
        const subCount = db.data.tickets.length + 1;
        const subKey = `SUB-2026-${String(subCount).padStart(4, '0')}`;
        const subId = `tick-${uuidv4().substring(0, 8)}`;

        const targetDeptId = def.targetDepartment || parentTicket.participatingDepartmentIds?.[i % (parentTicket.participatingDepartmentIds?.length || 1)] || user.departmentId;

        // Auto-assign to department lead if not specified
        const deptObj = (db.data.departments || []).find((d) => d.id === targetDeptId);
        const assignee = def.assigneeId || deptObj?.adminUserIds?.[0] || deptObj?.managerId || user.id;

        const subTicket: Ticket = {
          id: subId,
          key: subKey,
          projectCode: 'SEC',
          ticketTypeId: def.category || 'SECURITY_REVIEW',
          ticketTypeName: def.title,
          category: def.category || 'SECURITY_REVIEW',
          securityDomain: 'GENERAL_INFOSEC',
          title: def.title,
          description: `${def.description}\n\n*Part of Cross-Department Workflow:* **${workflowTitle}** (${parentKey})`,
          statusId: i === 0 ? 'OPEN' : 'WAITING_ON_DEPENDENCY',
          statusName: i === 0 ? 'Open' : 'Pending Previous Step',
          statusCategory: 'TO_DO',
          workflowId: 'wf-secops-default',
          workflowVersion: 1,
          technicalSeverity: def.technicalSeverity || 'MEDIUM',
          businessPriority: def.businessPriority || 'P2_HIGH',
          businessImpact: 'MODERATE',
          inherentRisk: 'MEDIUM',
          residualRisk: 'LOW',
          riskScore: 60,
          confidentiality: 'RESTRICTED',
          reporterId: user.id,
          assigneeId: assignee,
          securityOwnerId: user.id,
          departmentId: targetDeptId,
          targetDepartmentId: targetDeptId,
          parentTaskId: parentTicket.id,
          crossDepartmentId: crossId,
          departmentStepIndex: i + 1,
          watcherIds: [user.id, assignee],
          createdAt: now,
          updatedAt: now,
          dueDate: new Date(Date.now() + 86400000 * ((def.offsetDays || i) + (def.durationDays || 2))).toISOString(),
          remediationDeadline: new Date(Date.now() + 86400000 * ((def.offsetDays || i) + (def.durationDays || 2))).toISOString(),
          slaPolicyId: 'sla-p1-emergency',
          slaState: 'SAFE',
          version: 1,
          tags: ['CROSS_SUBTASK', deptObj?.code || 'DEPT', ...(def.tags || [])],
        };

        const sla = SLAService.calculateSLA(subTicket);
        subTicket.slaState = sla.state;
        subTicket.slaRemainingMinutes = sla.remainingMinutes;

        db.data.tickets.unshift(subTicket);
        createdSubtasks.push(subTicket);

        // Gantt Dependency (Finish-To-Start) with previous task
        if (i > 0 && createdSubtasks[i - 1]) {
          const dep = {
            id: `dep-cross-${uuidv4().substring(0, 6)}`,
            fromTaskId: createdSubtasks[i - 1].id,
            toTaskId: subTicket.id,
            type: 'FINISH_TO_START' as const,
          };
          if (!db.data.ganttDependencies) db.data.ganttDependencies = [];
          db.data.ganttDependencies.push(dep);
          createdDependencies.push(dep);
        }

        // Notification for department assignee
        if (assignee && assignee !== user.id) {
          if (!db.data.notifications) db.data.notifications = [];
          db.data.notifications.unshift({
            id: `notif-${uuidv4().substring(0, 8)}`,
            userId: assignee,
            title: `Cross-Department Task Assigned: [${deptObj?.name || 'Department'}]`,
            message: `You were assigned Step ${i + 1} ("${subTicket.title}") under "${workflowTitle}".`,
            type: 'ASSIGNMENT',
            severity: subTicket.technicalSeverity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
            timestamp: now,
            isRead: false,
            ticketId: subTicket.id,
            ticketKey: subTicket.key,
          });
        }
      }

      AuditService.log({
        actor: user,
        action: 'TICKET_CREATED',
        entityType: 'TICKET',
        entityId: parentTicket.id,
        entityKey: parentTicket.key,
        metadata: { action: 'LAUNCHED_CROSS_DEPARTMENT_WORKFLOW', title: workflowTitle, subtasksCount: createdSubtasks.length },
      });

      db.persist();

      res.status(201).json({
        success: true,
        message: `Successfully orchestrated cross-department workflow "${workflowTitle}" across ${createdSubtasks.length} departments.`,
        parentTicket,
        subtasks: createdSubtasks,
        dependencies: createdDependencies,
      });
    } catch (err: any) {
      logger.error({ err }, 'Failed to launch cross-department workflow');
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
