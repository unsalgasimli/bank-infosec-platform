import { BankRole, BankUser } from './auth.js';

export type ViewMode = 'spreadsheet' | 'kanban' | 'gantt' | 'calendar' | 'capacity';

export type NavigationModuleId =
  | 'my-work'
  | 'work-management'
  | 'service-management'
  | 'security-grc'
  | 'assets-cmdb'
  | 'knowledge'
  | 'analytics'
  | 'administration';

export type DestinationId =
  // My Work
  | 'my-work-overview'
  | 'my-tasks'
  | 'my-requests'
  | 'approvals'
  // Work Management
  | 'projects-tasks'
  | 'workflows'
  // Service Management
  | 'service-incidents'
  | 'service-requests'
  | 'service-changes'
  | 'service-problems'
  | 'service-catalog'
  // Security & GRC
  | 'vulnerabilities'
  | 'security-incidents'
  | 'policy-exceptions'
  | 'risk-management'
  | 'audit-compliance'
  // Assets & CMDB
  | 'asset-inventory'
  | 'configuration-items'
  | 'business-services'
  | 'applications'
  | 'relationship-map'
  // Knowledge
  | 'knowledge-base'
  // Analytics
  | 'operational-analytics'
  | 'executive-analytics'
  // Administration
  | 'admin-request-forms'
  | 'admin-workflow-templates'
  | 'admin-automations'
  | 'admin-sla-policies'
  | 'admin-departments'
  | 'admin-taxonomy'
  | 'admin-integrations'
  | 'admin-settings'
  // Legacy / Sub-view mappings
  | 'dept-admin';

export interface NavigationItem {
  id: DestinationId;
  label: string;
  moduleId: NavigationModuleId;
  iconName: string;
  allowedRoles?: BankRole[];
  badgeKey?: 'tasks' | 'my-tasks' | 'my-requests' | 'approvals' | 'incidents' | 'risks' | 'assets' | 'kb' | 'departments';
  isDefaultView?: boolean;
  defaultViewMode?: ViewMode;
  supportsViewSwitcher?: boolean;
  description?: string;
}

export interface NavigationModule {
  id: NavigationModuleId;
  label: string;
  iconName: string;
  allowedRoles?: BankRole[];
  items: NavigationItem[];
}

export const NAVIGATION_MODULES: NavigationModule[] = [
  {
    id: 'my-work',
    label: 'My Work',
    iconName: 'UserCheck',
    items: [
      {
        id: 'my-work-overview',
        label: 'Overview',
        moduleId: 'my-work',
        iconName: 'LayoutDashboard',
        description: 'Personalized command center with your assigned tasks, pending approvals, and SLA deadlines.',
      },
      {
        id: 'my-tasks',
        label: 'My Tasks',
        moduleId: 'my-work',
        iconName: 'CheckSquare',
        badgeKey: 'my-tasks',
        supportsViewSwitcher: true,
        defaultViewMode: 'spreadsheet',
        description: 'Tasks and action items specifically assigned to you across all banking units.',
      },
      {
        id: 'my-requests',
        label: 'Requests',
        moduleId: 'my-work',
        iconName: 'Inbox',
        supportsViewSwitcher: true,
        defaultViewMode: 'spreadsheet',
        description: 'Service, change, and access requests submitted by you or on behalf of your team.',
      },
      {
        id: 'approvals',
        label: 'Approvals',
        moduleId: 'my-work',
        iconName: 'CheckCircle2',
        badgeKey: 'approvals',
        description: 'Dual-control, maker-checker authorization queues requiring your cryptographic sign-off.',
      },
    ],
  },
  {
    id: 'work-management',
    label: 'Work Management',
    iconName: 'Briefcase',
    allowedRoles: [
      'PLATFORM_ADMIN',
      'INFOSEC_ADMIN',
      'CISO',
      'INFOSEC_MANAGER',
      'DEPARTMENT_ADMIN',
      'DEPARTMENT_MANAGER',
      'TEAM_LEAD',
      'IT_ADMIN',
      'CORE_BANK_ADMIN',
      'SECURITY_ANALYST',
      'SOC_ANALYST',
      'APPSEC_ANALYST',
      'VULN_ANALYST',
      'GRC_ANALYST',
      'DLP_ANALYST',
      'AUDITOR',
    ],
    items: [
      {
        id: 'projects-tasks',
        label: 'Projects & Tasks',
        moduleId: 'work-management',
        iconName: 'Layers',
        supportsViewSwitcher: true,
        defaultViewMode: 'spreadsheet',
        description: 'Unified cross-functional task spreadsheet, Kanban board, Gantt schedule, and capacity view.',
      },
      {
        id: 'workflows',
        label: 'Workflows',
        moduleId: 'work-management',
        iconName: 'GitMerge',
        description: 'Multi-department orchestration pipelines, automated handoffs, and fan-out workflows.',
      },
    ],
  },
  {
    id: 'security-grc',
    label: 'Security & GRC',
    iconName: 'Shield',
    allowedRoles: [
      'PLATFORM_ADMIN',
      'INFOSEC_ADMIN',
      'CISO',
      'INFOSEC_MANAGER',
      'TEAM_LEAD',
      'SECURITY_ANALYST',
      'SOC_ANALYST',
      'APPSEC_ANALYST',
      'VULN_ANALYST',
      'GRC_ANALYST',
      'DLP_ANALYST',
      'AUDITOR',
      'DEPARTMENT_ADMIN',
    ],
    items: [
      {
        id: 'risk-management',
        label: 'Risk Management',
        moduleId: 'security-grc',
        iconName: 'TrendingUp',
        badgeKey: 'risks',
        description: 'Enterprise 5×5 risk matrix, inherent vs. residual scoring, treatment plans, and risk registers.',
      },
      {
        id: 'audit-compliance',
        label: 'Audit & Compliance',
        moduleId: 'security-grc',
        iconName: 'FileCheck',
        description: 'Regulatory compliance posture (PCI-DSS, ISO 27001, Central Bank), control testing, and audit trails.',
      },
    ],
  },
  {
    id: 'assets-cmdb',
    label: 'Assets & CMDB',
    iconName: 'Server',
    allowedRoles: [
      'PLATFORM_ADMIN',
      'INFOSEC_ADMIN',
      'CISO',
      'INFOSEC_MANAGER',
      'DEPARTMENT_ADMIN',
      'IT_ADMIN',
      'CORE_BANK_ADMIN',
      'SECURITY_ANALYST',
      'SOC_ANALYST',
      'APPSEC_ANALYST',
      'AUDITOR',
      'APPLICATION_OWNER',
      'ASSET_OWNER',
    ],
    items: [
      {
        id: 'asset-inventory',
        label: 'Asset Inventory',
        moduleId: 'assets-cmdb',
        iconName: 'HardDrive',
        badgeKey: 'assets',
        description: 'Hardware, virtual servers, firewalls, and cloud infrastructure inventory with criticality tiers.',
      },
      {
        id: 'configuration-items',
        label: 'Configuration Items',
        moduleId: 'assets-cmdb',
        iconName: 'Cpu',
        description: 'CMDB Configuration Items (CIs), version baselines, and configuration drift monitors.',
      },
      {
        id: 'business-services',
        label: 'Business Services',
        moduleId: 'assets-cmdb',
        iconName: 'Activity',
        description: 'Core banking business services (Payment Clearing, Core API, SWIFT, ATM) and service health.',
      },
      {
        id: 'applications',
        label: 'Applications',
        moduleId: 'assets-cmdb',
        iconName: 'Box',
        badgeKey: 'assets',
        description: 'Banking software applications, code repositories, database connections, and technical ownership.',
      },
      {
        id: 'relationship-map',
        label: 'Relationship Map',
        moduleId: 'assets-cmdb',
        iconName: 'Network',
        description: 'Interactive topological dependency graph linking Business Services, Applications, CIs, and Incidents.',
      },
    ],
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    iconName: 'BookOpen',
    items: [
      {
        id: 'knowledge-base',
        label: 'SOPs & Knowledge Base',
        moduleId: 'knowledge',
        iconName: 'BookOpen',
        badgeKey: 'kb',
        description: 'Standard operating procedures (SOPs), incident runbooks, disaster recovery playbooks, and guides.',
      },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    iconName: 'BarChart2',
    allowedRoles: [
      'PLATFORM_ADMIN',
      'INFOSEC_ADMIN',
      'CISO',
      'INFOSEC_MANAGER',
      'DEPARTMENT_ADMIN',
      'DEPARTMENT_MANAGER',
      'TEAM_LEAD',
      'AUDITOR',
      'GRC_ANALYST',
      'SECURITY_ANALYST',
      'SOC_ANALYST',
      'IT_ADMIN',
    ],
    items: [
      {
        id: 'operational-analytics',
        label: 'Operational Analytics',
        moduleId: 'analytics',
        iconName: 'Gauge',
        description: 'Real-time operational dashboards for SecOps and Service Desk squad leads and analysts.',
      },
      {
        id: 'executive-analytics',
        label: 'Executive Analytics',
        moduleId: 'analytics',
        iconName: 'PieChart',
        allowedRoles: [
          'PLATFORM_ADMIN',
          'INFOSEC_ADMIN',
          'CISO',
          'INFOSEC_MANAGER',
          'AUDITOR',
          'DEPARTMENT_ADMIN',
        ],
        description: 'High-level CISO, Board, and Audit committee security posture, risk heatmaps, and MTTR trends.',
      },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    iconName: 'Settings',
    allowedRoles: [
      'PLATFORM_ADMIN',
      'INFOSEC_ADMIN',
      'CISO',
      'DEPARTMENT_ADMIN',
      'INFOSEC_MANAGER',
      'IT_ADMIN',
      'CORE_BANK_ADMIN',
      'HR_ADMIN',
      'LEGAL_ADMIN',
    ],
    items: [
      {
        id: 'admin-request-forms',
        label: 'Request Forms',
        moduleId: 'administration',
        iconName: 'FilePlus',
        description: 'Design dynamic conditional request intake forms with custom validations and SLA mappings.',
      },
      {
        id: 'admin-workflow-templates',
        label: 'Workflow Templates',
        moduleId: 'administration',
        iconName: 'Workflow',
        description: 'Configure and test state machines, turnkey blueprint templates, and multi-stage DAGs.',
      },
      {
        id: 'admin-automations',
        label: 'Automations',
        moduleId: 'administration',
        iconName: 'Zap',
        description: 'Manage trigger-condition-action automation rules, SLA auto-escalations, and webhook syncs.',
      },
      {
        id: 'admin-sla-policies',
        label: 'SLA Policies',
        moduleId: 'administration',
        iconName: 'Clock',
        description: 'Set up business-calendar SLA policies, MTTA/MTTR thresholds, and regulatory breach alert triggers.',
      },
      {
        id: 'admin-departments',
        label: 'Departments & Teams',
        moduleId: 'administration',
        iconName: 'Building2',
        badgeKey: 'departments',
        description: 'Manage banking units, departmental SLAs, cross-department connections, and personnel.',
      },
      {
        id: 'admin-taxonomy',
        label: 'Taxonomy',
        moduleId: 'administration',
        iconName: 'Tag',
        description: 'Configure ticket categories, classification tiers, technical severities, and custom tags.',
      },
      {
        id: 'admin-integrations',
        label: 'Integrations',
        moduleId: 'administration',
        iconName: 'Share2',
        description: 'Active Directory / LDAP sync, SIEM ingestion endpoints, vulnerability scanners, and webhooks.',
      },
      {
        id: 'admin-settings',
        label: 'Settings',
        moduleId: 'administration',
        iconName: 'Sliders',
        description: 'Platform security configuration, session management, and immutable audit logs.',
      },
    ],
  },
];

/**
 * Check whether a user's roles allow accessing a specific destination.
 */
export function canUserAccessDestination(user: BankUser | null, destinationId: DestinationId | string): boolean {
  if (!user || !user.isActive) return false;

  // Global access is granted only by server-synchronized RBAC roles.
  if (
    user.roles.includes('PLATFORM_ADMIN') ||
    user.roles.includes('CISO')
  ) {
    return true;
  }

  // Find module and item
  for (const module of NAVIGATION_MODULES) {
    const item = module.items.find((i) => i.id === destinationId);
    if (item) {
      // Check module level role restriction
      if (module.allowedRoles && module.allowedRoles.length > 0) {
        const hasModuleRole = module.allowedRoles.some((r) => user.roles.includes(r));
        if (!hasModuleRole) return false;
      }

      // Check item level role restriction
      if (item.allowedRoles && item.allowedRoles.length > 0) {
        const hasItemRole = item.allowedRoles.some((r) => user.roles.includes(r));
        if (!hasItemRole) return false;
      }

      return true;
    }
  }

  // Legacy route allowances
  if (destinationId === 'departments' || destinationId === 'dept-admin') {
    return true;
  }

  return true;
}

/**
 * Check whether a user's roles allow accessing a specific module.
 */
export function canUserAccessModule(user: BankUser | null, moduleId: NavigationModuleId): boolean {
  if (!user || !user.isActive) return false;

  if (
    user.roles.includes('PLATFORM_ADMIN') ||
    user.roles.includes('CISO')
  ) {
    return true;
  }

  const module = NAVIGATION_MODULES.find((m) => m.id === moduleId);
  if (!module) return true;

  if (module.allowedRoles && module.allowedRoles.length > 0) {
    return module.allowedRoles.some((r) => user.roles.includes(r));
  }

  return true;
}

/**
 * Resolves any legacy route string into a canonical DestinationId and ViewMode.
 */
export function resolveLegacyRoute(route: string): { destinationId: DestinationId; viewMode?: ViewMode } {
  switch (route) {
    // Legacy view switchers mapped to Projects & Tasks
    case 'table':
    case 'tickets':
      return { destinationId: 'projects-tasks', viewMode: 'spreadsheet' };
    case 'board':
      return { destinationId: 'projects-tasks', viewMode: 'kanban' };
    case 'gantt':
      return { destinationId: 'projects-tasks', viewMode: 'gantt' };
    case 'calendar':
      return { destinationId: 'projects-tasks', viewMode: 'calendar' };
    case 'workload':
      return { destinationId: 'projects-tasks', viewMode: 'capacity' };

    // Legacy renamed modules
    case 'risk-register':
      return { destinationId: 'risk-management' };
    case 'cross-tasks':
      return { destinationId: 'workflows' };
    case 'soc-incidents':
      return { destinationId: 'security-incidents' };
    case 'ciso-dash':
      return { destinationId: 'executive-analytics' };
    case 'analyst-dash':
    case 'lead-dash':
      return { destinationId: 'operational-analytics' };
    case 'departments':
      return { destinationId: 'admin-departments' };
    case 'dept-admin':
      return { destinationId: 'dept-admin' };
    case 'request-forms':
      return { destinationId: 'admin-request-forms' };
    case 'automations':
      return { destinationId: 'admin-automations' };
    case 'admin-center':
      return { destinationId: 'admin-settings' };
    case 'assets':
      return { destinationId: 'asset-inventory' };
    case 'security-exceptions':
      return { destinationId: 'policy-exceptions' };

    default:
      return { destinationId: route as DestinationId };
  }
}
