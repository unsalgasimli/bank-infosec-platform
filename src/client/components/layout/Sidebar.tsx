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
import { Ticket } from '../../../shared/types/ticket.js';
import {
  NAVIGATION_MODULES,
  NavigationModuleId,
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
  departmentsCount = 5,
}) => {
  const { currentUser } = useAuth();

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

  const getBadgeCount = (badgeKey?: string): number | undefined => {
    switch (badgeKey) {
      case 'tasks':
        return tickets.filter((t) => t.statusCategory !== 'DONE').length;
      case 'approvals':
        return pendingApprovalsCount;
      case 'incidents':
        return tickets.filter((t) => t.category === 'INCIDENT' && t.statusCategory !== 'DONE').length;
      case 'risks':
        return risksCount;
      case 'assets':
        return applicationsCount + assetsCount;
      case 'kb':
        return kbCount;
      case 'departments':
        return departmentsCount;
      default:
        return undefined;
    }
  };

  return (
    <aside className="w-68 bg-[#FFFFFF] border-r border-[#E2E8F0] flex flex-col justify-between shrink-0 select-none shadow-xs">
      {/* Scrollable Navigation Modules Container */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
        {NAVIGATION_MODULES.map((module) => {
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
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <ModuleIcon className="w-3.5 h-3.5 text-[#94A3B8] group-hover:text-[#64748B] transition-colors" />
                  <span>{module.label}</span>
                </div>
                {isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8]" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-[#94A3B8]" />
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
                        ['table', 'board', 'gantt', 'workload', 'calendar'].includes(activeDestination));

                    const count = getBadgeCount(item.badgeKey);

                    return (
                      <button
                        key={item.id}
                        onClick={() => onSelectDestination(item.id)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all group ${
                          isActive
                            ? 'bg-[#E6F7EF] text-[#007860] font-bold border border-[#B8EAD1]'
                            : 'text-[#334155] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
                        }`}
                        title={item.description}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <ItemIcon
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? 'text-[#00B259]' : 'text-[#64748B] group-hover:text-[#334155]'
                            }`}
                          />
                          <span className="truncate">{item.label}</span>
                        </div>

                        {/* Optional Numeric Badge */}
                        {count !== undefined && count > 0 && (
                          <span
                            className={`font-mono text-[11px] px-2 py-0.2 rounded-full border shrink-0 font-bold ${
                              item.id === 'approvals'
                                ? 'bg-[#FFF7E6] text-[#D46B08] border-[#FFE7BA]'
                                : isActive
                                ? 'bg-[#FFFFFF] text-[#007860] border-[#B8EAD1]'
                                : 'text-[#64748B] bg-[#F1F5F9] border-[#E2E8F0]'
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
      <div className="p-3 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between text-xs text-[#64748B]">
        {canUserAccessDestination(currentUser, 'admin-settings') ? (
          <button
            onClick={() => onSelectDestination('admin-settings')}
            className="flex items-center gap-2 text-[#475569] hover:text-[#0F172A] font-bold text-xs transition-colors"
          >
            <Settings className="w-4 h-4 text-[#00B259]" />
            <span>Space Settings</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-[#64748B] font-medium">
            <span className="w-2 h-2 rounded-full bg-[#00B259]" />
            <span>Apex Bank GRC</span>
          </div>
        )}
        <span className="text-xs font-mono font-bold text-[#007860]">v2026.4</span>
      </div>
    </aside>
  );
};
