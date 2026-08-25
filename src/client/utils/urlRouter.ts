import { DestinationId, ViewMode, resolveLegacyRoute } from '../../shared/types/navigation.js';

export const DESTINATION_TO_PATH: Record<DestinationId | string, string> = {
  // My Work
  'my-work-overview': '/my-work/overview',
  'my-tasks': '/my-work/tasks',
  'my-requests': '/my-work/requests',
  'approvals': '/my-work/approvals',

  // Work Management
  'projects-tasks': '/work-management/projects-tasks',
  'workflows': '/work-management/workflows',
  'ideate': '/work-management/ideate',

  // Service Management
  'service-incidents': '/service-management/incidents',
  'service-requests': '/service-management/requests',
  'service-changes': '/service-management/changes',
  'service-problems': '/service-management/problems',
  'service-catalog': '/service-management/catalog',

  // Security & GRC
  'vulnerabilities': '/security-grc/vulnerabilities',
  'security-incidents': '/security-grc/security-incidents',
  'policy-exceptions': '/security-grc/policy-exceptions',
  'risk-management': '/security-grc/risk-management',
  'audit-compliance': '/security-grc/audit-compliance',
  'dlp-investigations': '/security-grc/dlp',

  // Assets & CMDB
  'asset-inventory': '/assets-cmdb/inventory',
  'configuration-items': '/assets-cmdb/configuration-items',
  'business-services': '/assets-cmdb/business-services',
  'applications': '/assets-cmdb/applications',
  'relationship-map': '/assets-cmdb/relationship-map',

  // Knowledge
  'knowledge-base': '/knowledge',

  // Analytics
  'operational-analytics': '/analytics/operational',
  'executive-analytics': '/analytics/executive',

  // Administration
  'admin-request-forms': '/administration/request-forms',
  'admin-workflow-templates': '/administration/workflow-templates',
  'admin-automations': '/administration/automations',
  'admin-sla-policies': '/administration/sla-policies',
  'admin-departments': '/administration/departments',
  'admin-taxonomy': '/administration/taxonomy',
  'admin-integrations': '/administration/integrations',
  'admin-settings': '/administration/settings',
  'dept-admin': '/administration/departments/manage',
};

// Reverse map for path to destination lookup
export const PATH_TO_DESTINATION: Record<string, DestinationId | string> = Object.entries(
  DESTINATION_TO_PATH
).reduce((acc, [destId, path]) => {
  acc[path] = destId;
  return acc;
}, {} as Record<string, DestinationId | string>);

// Also add shorthand aliases (e.g. /my-tasks -> my-tasks, /incidents -> service-incidents, /table -> projects-tasks)
PATH_TO_DESTINATION['/'] = 'my-work-overview';
PATH_TO_DESTINATION['/overview'] = 'my-work-overview';
PATH_TO_DESTINATION['/tasks'] = 'my-tasks';
PATH_TO_DESTINATION['/requests'] = 'my-requests';
PATH_TO_DESTINATION['/approvals'] = 'approvals';
PATH_TO_DESTINATION['/projects-tasks'] = 'projects-tasks';
PATH_TO_DESTINATION['/table'] = 'projects-tasks';
PATH_TO_DESTINATION['/board'] = 'projects-tasks';
PATH_TO_DESTINATION['/gantt'] = 'projects-tasks';
// Calendar view was removed; keep old links useful by opening the task table.
PATH_TO_DESTINATION['/calendar'] = 'projects-tasks';
PATH_TO_DESTINATION['/workload'] = 'projects-tasks';
PATH_TO_DESTINATION['/workflows'] = 'workflows';
PATH_TO_DESTINATION['/cross-tasks'] = 'workflows';
PATH_TO_DESTINATION['/incidents'] = 'service-incidents';
PATH_TO_DESTINATION['/soc-incidents'] = 'security-incidents';
PATH_TO_DESTINATION['/service-catalog'] = 'service-catalog';
PATH_TO_DESTINATION['/catalog'] = 'service-catalog';
PATH_TO_DESTINATION['/vulnerabilities'] = 'vulnerabilities';
PATH_TO_DESTINATION['/risk-register'] = 'risk-management';
PATH_TO_DESTINATION['/risk-management'] = 'risk-management';
PATH_TO_DESTINATION['/compliance'] = 'audit-compliance';
PATH_TO_DESTINATION['/audit'] = 'audit-compliance';
PATH_TO_DESTINATION['/assets'] = 'asset-inventory';
PATH_TO_DESTINATION['/applications'] = 'applications';
PATH_TO_DESTINATION['/cmdb'] = 'relationship-map';
PATH_TO_DESTINATION['/ciso'] = 'executive-analytics';
PATH_TO_DESTINATION['/ciso-dash'] = 'executive-analytics';
PATH_TO_DESTINATION['/admin'] = 'admin-settings';
PATH_TO_DESTINATION['/admin-center'] = 'admin-settings';
PATH_TO_DESTINATION['/departments'] = 'admin-departments';

/**
 * Builds the canonical URL path and query string for the given state.
 */
export function buildUrl(
  destinationId: DestinationId | string,
  viewMode?: ViewMode,
  ticketIdOrKey?: string | null
): string {
  const basePath = DESTINATION_TO_PATH[destinationId] || `/${destinationId}`;
  const params = new URLSearchParams();

  if (viewMode && viewMode !== 'spreadsheet') {
    params.set('view', viewMode);
  }

  if (ticketIdOrKey) {
    params.set('ticket', ticketIdOrKey);
  }

  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

/**
 * Parses the current window.location pathname and search query into state.
 */
export function parseCurrentUrl(): {
  destinationId: DestinationId | string;
  viewMode: ViewMode;
  ticketIdOrKey: string | null;
} {
  const pathname = window.location.pathname.replace(/\/$/, '') || '/';
  const searchParams = new URLSearchParams(window.location.search);

  // Check direct path match
  let destinationId = PATH_TO_DESTINATION[pathname];

  // If not matched, try legacy route resolution or fallback
  if (!destinationId) {
    const cleanSegment = pathname.replace(/^\//, '').split('/')[0];
    const resolved = resolveLegacyRoute(cleanSegment);
    destinationId = resolved.destinationId || 'my-work-overview';
  }

  // Parse viewMode
  const rawView = searchParams.get('view');
  let viewMode: ViewMode = 'spreadsheet';
  if (rawView && ['spreadsheet', 'kanban', 'capacity'].includes(rawView)) {
    viewMode = rawView as ViewMode;
  } else if (pathname === '/board') {
    viewMode = 'kanban';
  } else if (pathname === '/workload') {
    viewMode = 'capacity';
  }

  const ticketIdOrKey = searchParams.get('ticket') || null;

  return {
    destinationId,
    viewMode,
    ticketIdOrKey,
  };
}

/**
 * Pushes the new state to browser history and updates document title.
 */
export function pushNavigationState(
  destinationId: DestinationId | string,
  viewMode?: ViewMode,
  ticketIdOrKey?: string | null
): void {
  const url = buildUrl(destinationId, viewMode, ticketIdOrKey);
  if (window.location.pathname + window.location.search !== url) {
    window.history.pushState({ destinationId, viewMode, ticketIdOrKey }, '', url);
  }

  // Format clean page title
  const formattedTitle = destinationId
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
  document.title = `Apex Bank GRC | ${formattedTitle}`;
}
