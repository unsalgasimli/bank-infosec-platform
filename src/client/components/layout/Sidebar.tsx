import React, { useState } from 'react';
import {
  UserCheck,
  Briefcase,
  Headphones,
  Shield,
  Server,
  BookOpen,
  BarChart2,
  Settings,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  CheckSquare,
  Inbox,
  CheckCircle2,
  Layers,
  GitMerge,
  Flame,
  FileText,
  GitPullRequest,
  HelpCircle,
  Grid,
  ShieldAlert,
  AlertTriangle,
  Lock,
  TrendingUp,
  FileCheck,
  HardDrive,
  Cpu,
  Activity,
  Box,
  Network,
  Gauge,
  PieChart,
  FilePlus,
  Workflow,
  Zap,
  Clock,
  Building2,
  Tag,
  Share2,
  Sliders,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../context/I18nContext.js';
import { Ticket } from '../../../shared/types/ticket.js';
import {
  NAVIGATION_MODULES,
  NavigationModuleId,
  NavigationItem,
  DestinationId,
  canUserAccessDestination,
  canUserAccessModule,
} from '../../../shared/types/navigation.js';

interface SidebarProps {
  activeDestination: DestinationId | string;
  onSelectDestination: (destId: DestinationId | string) => void;
  tickets: Ticket[];
  applicationsCount?: number;
  assetsCount?: number;
  risksCount?: number;
  kbCount?: number;
  pendingApprovalsCount?: number;
  departmentsCount?: number;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

// Icon dictionary to render Lucide components dynamically
const ICON_COMPONENTS: Record<string, React.ComponentType<{ className?: string }>> = {
  UserCheck,
  Briefcase,
  Headphones,
  Shield,
  Server,
  BookOpen,
  BarChart2,
  Settings,
  LayoutDashboard,
  CheckSquare,
  Inbox,
  CheckCircle2,
  Layers,
  GitMerge,
  Flame,
  FileText,
  GitPullRequest,
  HelpCircle,
  Grid,
  ShieldAlert,
  AlertTriangle,
  Lock,
  TrendingUp,
  FileCheck,
  HardDrive,
  Cpu,
  Activity,
  Box,
  Network,
  Gauge,
  PieChart,
  FilePlus,
  Workflow,
  Zap,
  Clock,
  Building2,
  Tag,
  Share2,
  Sliders,
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeDestination,
  onSelectDestination,
  tickets,
  applicationsCount = 0,
  assetsCount = 0,
  risksCount = 0,
  kbCount = 0,
  pendingApprovalsCount = 0,
  departmentsCount = 0,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const { currentUser } = useAuth();
  const { t } = useI18n();

  // Collapsible state per module, defaulting to expanded
  const [collapsedModules, setCollapsedModules] = useState<Record<NavigationModuleId, boolean>>(() => {
    try {
      const saved = localStorage.getItem('aegis_collapsed_sidebar_modules');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {} as Record<NavigationModuleId, boolean>;
    }
  });

  const toggleModule = (modId: NavigationModuleId) => {
    setCollapsedModules((prev) => {
      const next = { ...prev, [modId]: !prev[modId] };
      try {
        localStorage.setItem('aegis_collapsed_sidebar_modules', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const getBadgeCount = (item: NavigationItem): number | undefined => {
    const isMyTask = (t: Ticket) =>
      t.statusCategory !== 'DONE' &&
      (t.assigneeId === currentUser?.id ||
        (!t.assigneeId &&
          ((t.targetDepartmentId && t.targetDepartmentId === currentUser?.departmentId) ||
            (t.departmentId && t.departmentId === currentUser?.departmentId) ||
            (t.assignmentGroupId && currentUser?.teamIds?.includes(t.assignmentGroupId)) ||
            t.participatingDepartmentIds?.includes(currentUser?.departmentId || ''))));

    switch (item.badgeKey) {
      case 'my-tasks':
        return tickets.filter(isMyTask).length;
      case 'my-requests':
        return tickets.filter((t) => t.reporterId === currentUser?.id && t.statusCategory !== 'DONE').length;
      case 'tasks':
        // If it is 'my-tasks' destination, count user's active & queue tasks
        if (item.id === 'my-tasks') {
          return tickets.filter(isMyTask).length;
        }
        return tickets.filter((t) => t.statusCategory !== 'DONE').length;
      case 'approvals':
        return pendingApprovalsCount;
      case 'incidents':
        return tickets.filter((t) => t.category === 'INCIDENT' && t.statusCategory !== 'DONE').length;
      case 'risks':
        return risksCount;
      case 'assets':
        return (applicationsCount || 0) + (assetsCount || 0);
      case 'kb':
        return kbCount;
      case 'departments':
        return departmentsCount;
      default:
        if (item.id === 'my-tasks') {
          return tickets.filter(isMyTask).length;
        }
        return undefined;
    }
  };

  return (
    <aside className={`app-sidebar fixed left-0 top-14 bottom-0 z-dsModal w-68 bg-semantic-panel border-r border-semantic-border flex flex-col justify-between shrink-0 select-none shadow-xs transition-transform duration-200 lg:static lg:translate-x-0 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      {/* Scrollable Navigation Modules Container */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
        {NAVIGATION_MODULES.filter((module) => module.id !== 'analytics').map((module) => {
          // Check module-level RBAC
          if (!canUserAccessModule(currentUser, module.id)) {
            return null;
          }

          // Filter visible items in module by RBAC
          const visibleItems = module.items.filter((item) =>
            canUserAccessDestination(currentUser, item.id)
          );

          if (visibleItems.length === 0) {
            return null;
          }

          const isCollapsed = Boolean(collapsedModules[module.id]);
          const ModuleIcon = ICON_COMPONENTS[module.iconName] || Briefcase;

          return (
            <div key={module.id} className="space-y-1">
              {/* Collapsible Module Section Header */}
              <button
                onClick={() => toggleModule(module.id)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-semantic-muted hover:text-semantic-strongest hover:bg-semantic-subtle transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <ModuleIcon className="w-3.5 h-3.5 text-semantic-placeholder group-hover:text-semantic-muted transition-colors" />
                  <span>{t(module.label)}</span>
                </div>
                {isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5 text-semantic-placeholder" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-semantic-placeholder" />
                )}
              </button>

              {/* Module Destinations List */}
              {!isCollapsed && (
                <div className="space-y-0.5 pl-1">
                  {visibleItems.map((item) => {
                    const ItemIcon = ICON_COMPONENTS[item.iconName] || FileText;
                    const isActive =
                      activeDestination === item.id ||
                      (item.id === 'admin-departments' && activeDestination === 'dept-admin') ||
                      (item.id === 'projects-tasks' &&
                        ['table', 'board', 'workload'].includes(activeDestination));

                    const count = getBadgeCount(item);

                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          onSelectDestination(item.id);
                          onCloseMobile?.();
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all group ${
                          isActive
                            ? 'bg-semantic-success-surface text-semantic-success font-bold border border-semantic-success-border'
                            : 'text-semantic-strong hover:bg-semantic-subtle hover:text-semantic-strongest'
                        }`}
                        title={t(item.description || '')}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <ItemIcon
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? 'text-semantic-brand' : 'text-semantic-muted group-hover:text-semantic-strong'
                            }`}
                          />
                          <span className="truncate">{t(item.label)}</span>
                        </div>

                        {/* Optional Numeric Badge */}
                        {count !== undefined && count > 0 && (
                          <span
                            className={`font-mono text-label px-2 py-0.2 rounded-full border shrink-0 font-bold ${
                              item.id === 'approvals'
                                ? 'bg-semantic-warning-surface text-semantic-warning border-semantic-warning-border'
                                : isActive
                                ? 'bg-semantic-panel text-semantic-success border-semantic-success-border'
                                : 'text-semantic-muted bg-semantic-neutral-surface border-semantic-border'
                            }`}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sidebar Footer: Space Settings Shortcut & Version */}
      <div className="p-3 border-t border-semantic-border bg-semantic-subtle flex items-center justify-between text-xs text-semantic-muted">
        {canUserAccessDestination(currentUser, 'admin-settings') ? (
          <button
            onClick={() => {
              onSelectDestination('admin-settings');
              onCloseMobile?.();
            }}
            className="flex items-center gap-2 text-semantic-secondary hover:text-semantic-strongest font-bold text-xs transition-colors"
          >
            <Settings className="w-4 h-4 text-semantic-brand" />
            <span>{t('Space Settings')}</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-semantic-muted font-medium">
            <span className="w-2 h-2 rounded-full bg-semantic-brand" />
            <span>{t('Apex Bank GRC')}</span>
          </div>
        )}
        <span className="text-xs font-mono font-bold text-semantic-success">v2026.4</span>
      </div>
    </aside>
  );
};
