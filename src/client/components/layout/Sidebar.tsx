import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  ShieldCheck,
  Boxes,
  PlugZap,
  RefreshCw,
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
  ShieldCheck,
  Boxes,
  PlugZap,
  RefreshCw,
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
  const navigationRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);
  const previousActiveModuleRef = useRef<NavigationModuleId | undefined>(undefined);
  const [scrollEdges, setScrollEdges] = useState({ top: false, bottom: false });

  const activeModuleId = useMemo(() => {
    const activeItem = NAVIGATION_MODULES.flatMap((module) => module.items).find((item) =>
      activeDestination === item.id ||
      (item.id === 'admin-departments' && activeDestination === 'dept-admin') ||
      (item.id === 'projects-tasks' && ['table', 'board', 'workload'].includes(activeDestination)),
    );
    return activeItem?.moduleId;
  }, [activeDestination]);

  // Open the newly active section once when navigation moves between modules,
  // while still allowing the user to collapse that section afterwards.
  useEffect(() => {
    if (activeModuleId && previousActiveModuleRef.current !== activeModuleId) {
      setCollapsedModules((prev) => {
        if (!prev[activeModuleId]) return prev;
        const next = { ...prev, [activeModuleId]: false };
        try {
          localStorage.setItem('aegis_collapsed_sidebar_modules', JSON.stringify(next));
        } catch {}
        return next;
      });
    }
    previousActiveModuleRef.current = activeModuleId;
  }, [activeModuleId]);

  useEffect(() => {
    const navigation = navigationRef.current;
    if (!navigation) return;

    const updateScrollEdges = () => {
      const maxScrollTop = navigation.scrollHeight - navigation.clientHeight;
      setScrollEdges({
        top: navigation.scrollTop > 2,
        bottom: maxScrollTop > 2 && navigation.scrollTop < maxScrollTop - 2,
      });
    };

    updateScrollEdges();
    navigation.addEventListener('scroll', updateScrollEdges, { passive: true });
    const resizeObserver = new ResizeObserver(updateScrollEdges);
    resizeObserver.observe(navigation);
    return () => {
      navigation.removeEventListener('scroll', updateScrollEdges);
      resizeObserver.disconnect();
    };
  }, [activeDestination]);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeDestination]);

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
    <aside aria-label="Primary navigation" className={`app-sidebar fixed left-0 top-14 z-dsModal h-[calc(100dvh-3.5rem)] w-68 min-h-0 bg-semantic-panel border-r border-semantic-border flex flex-col shrink-0 select-none shadow-xs transition-transform duration-200 lg:static lg:translate-x-0 ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      {/* Scrollable Navigation Modules Container */}
      <div className="relative min-h-0 flex-1">
        <div ref={navigationRef} className="sidebar-navigation h-full overflow-y-auto overscroll-contain p-3 space-y-2.5" tabIndex={0}>
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
            <section key={module.id} className="sidebar-module">
              {/* Collapsible Module Section Header */}
              <button
                onClick={() => toggleModule(module.id)}
                aria-expanded={!isCollapsed}
                aria-controls={`sidebar-module-${module.id}`}
                className="sidebar-module-header group"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <ModuleIcon className="h-[15px] w-[15px] shrink-0 text-semantic-placeholder transition-colors group-hover:text-semantic-muted" />
                  <span>{t(module.label)}</span>
                </div>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-semantic-placeholder transition-transform duration-180 ease-out ${isCollapsed ? '-rotate-90' : 'rotate-0'}`} />
              </button>

              {/* Module Destinations List */}
              <div id={`sidebar-module-${module.id}`} className={`sidebar-module-content grid transition-[grid-template-rows,opacity] duration-180 ease-out ${isCollapsed ? 'grid-rows-[0fr] opacity-0 invisible pointer-events-none' : 'grid-rows-[1fr] opacity-100 visible'}`} aria-hidden={isCollapsed}>
                <div className="min-h-0 space-y-0.5 pl-1 pt-0.5">
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
                        ref={isActive ? activeItemRef : undefined}
                        type="button"
                        onClick={() => {
                          onSelectDestination(item.id);
                          onCloseMobile?.();
                        }}
                        aria-current={isActive ? 'page' : undefined}
                        className={`sidebar-nav-item group ${
                          isActive
                            ? 'sidebar-nav-item-active'
                            : 'text-semantic-strong'
                        }`}
                        title={t(item.description || '')}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <ItemIcon
                            className={`h-[18px] w-[18px] shrink-0 transition-transform duration-150 ${
                              isActive ? 'text-semantic-brand' : 'text-semantic-muted group-hover:scale-[1.01] group-hover:text-semantic-strong'
                            }`}
                          />
                          <span className="truncate">{t(item.label)}</span>
                        </div>

                        {/* Optional Numeric Badge */}
                        {count !== undefined && count > 0 && item.id !== 'configuration-items' && item.id !== 'asset-inventory' && (
                          <span
                            className={`sidebar-badge ${
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
              </div>
            </section>
          );
        })}
        </div>
        <div aria-hidden="true" className={`sidebar-edge-fade sidebar-edge-fade-top ${scrollEdges.top ? 'is-visible' : ''}`} />
        <div aria-hidden="true" className={`sidebar-edge-fade sidebar-edge-fade-bottom ${scrollEdges.bottom ? 'is-visible' : ''}`} />
      </div>

      {/* Sidebar Footer: Space Settings Shortcut & Version */}
      <div className="sidebar-footer shrink-0 p-3 flex items-center justify-between text-xs text-semantic-muted">
        {canUserAccessDestination(currentUser, 'admin-settings') ? (
          <button
            onClick={() => {
              onSelectDestination('admin-settings');
              onCloseMobile?.();
            }}
            className="sidebar-footer-action flex items-center gap-2 text-semantic-secondary hover:text-semantic-strongest font-bold text-xs transition-colors"
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
        <span className="font-mono text-[11px] font-semibold tracking-wide text-semantic-placeholder">v2026.4</span>
      </div>
    </aside>
  );
};
