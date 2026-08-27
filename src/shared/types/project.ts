export type ProjectRole = 'OWNER' | 'PROJECT_MANAGER' | 'CONTRIBUTOR' | 'VIEWER' | 'RESTRICTED_CONTRIBUTOR';
export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';
export type ProjectHealth = 'ON_TRACK' | 'AT_RISK' | 'DELAYED' | 'BLOCKED' | 'COMPLETED' | 'ON_HOLD';
export type ProjectPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type ProjectCategory = 'IT' | 'INFORMATION_SECURITY' | 'SOFTWARE_DEVELOPMENT' | 'HR' | 'OPERATIONS' | 'COMPLIANCE' | 'OTHER';
export type ProjectTaskStatus = 'BACKLOG' | 'TO_DO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'DONE';
export const PROJECT_WORK_ITEM_TYPES = ['EPIC', 'STORY', 'TASK', 'SUBTASK', 'BUG', 'IMPROVEMENT', 'INCIDENT', 'SERVICE_REQUEST', 'CHANGE', 'PROBLEM', 'RESEARCH', 'SECURITY_FINDING'] as const;
export type ProjectWorkItemType = typeof PROJECT_WORK_ITEM_TYPES[number];

export interface Project {
  id: string;
  identifier: string;
  key: string;
  name: string;
  description: string;
  objective?: string;
  scope?: string;
  successCriteria?: string;
  departmentId?: string;
  sectionId?: string;
  ownerId: string;
  managerId?: string;
  sponsorId?: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  businessCriticality: ProjectPriority;
  category: ProjectCategory;
  tags: string[];
  relatedAssetIds: string[];
  slaPolicyId?: string;
  templateId?: string;
  /** Optional platform workflow scheme applied to newly created project work items. */
  workflowId?: string;
  startDate?: string;
  targetDate?: string;
  healthOverride?: { health: ProjectHealth; reason: string; changedByUserId: string; changedAt: string };
  progressWeighting: 'EQUAL' | 'STORY_POINTS' | 'ESTIMATED_EFFORT' | 'MANUAL';
  /** Admin-controlled types that may be created in this project. */
  workItemTypes?: ProjectWorkItemType[];
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  subjectType: 'USER' | 'TEAM' | 'DEPARTMENT' | 'GROUP';
  subjectId: string;
  role: ProjectRole;
  addedByUserId: string;
  createdAt: string;
}

export interface ProjectMilestone {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  ownerId?: string;
  startDate?: string;
  targetDate?: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'AT_RISK' | 'DELAYED' | 'COMPLETED';
  dependencyIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectTaskDependency {
  id: string;
  projectId: string;
  sourceTaskId: string;
  targetTaskId: string;
  type: 'BLOCKS' | 'DEPENDS_ON' | 'REQUIRED_BY' | 'RELATES_TO' | 'DUPLICATES';
  createdByUserId: string;
  createdAt: string;
}

export interface ProjectStatusUpdate {
  id: string;
  projectId: string;
  body: string;
  createdByUserId: string;
  createdAt: string;
}

export interface ProjectRisk {
  id: string;
  projectId: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  ownerId?: string;
  probability?: 'LOW' | 'MEDIUM' | 'HIGH';
  impact?: 'LOW' | 'MEDIUM' | 'HIGH';
  mitigation?: string;
  targetDate?: string;
  status: 'OPEN' | 'MITIGATING' | 'CLOSED';
  linkedTaskId?: string;
  linkedMilestoneId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectActivity {
  id: string;
  projectId: string;
  actorId: string;
  action: string;
  objectType: 'PROJECT' | 'MEMBER' | 'MILESTONE' | 'TASK' | 'RISK' | 'STATUS_UPDATE';
  objectId: string;
  oldValue?: unknown;
  newValue?: unknown;
  createdAt: string;
}

/** Immutable project-scoped audit projection used alongside the platform audit ledger. */
export type ProjectAuditEvent = ProjectActivity;

export interface ProjectSummary {
  project: Project;
  health: ProjectHealth;
  healthReasons: string[];
  progressPercent: number;
  taskCounts: { total: number; completed: number; active: number; blocked: number; overdue: number; openCriticalHigh: number };
  nextMilestone?: ProjectMilestone & { progressPercent: number };
  milestones: Array<ProjectMilestone & { progressPercent: number; taskCount: number }>;
  members: ProjectMember[];
  myTasks: unknown[];
  recentlyCompleted: unknown[];
  upcoming: Array<{ type: 'TASK' | 'MILESTONE' | 'PROJECT'; id: string; title: string; dueDate?: string }>;
  risks: ProjectRisk[];
  latestUpdate?: ProjectStatusUpdate;
}
