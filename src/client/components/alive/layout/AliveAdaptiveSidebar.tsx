import React, { useState } from 'react';
import {
  UserCheck,
  Briefcase,
  Headphones,
  Shield,
  Server,
  BookOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  CheckSquare,
  Inbox,
  CheckCircle2,
  Layers,
  Flame,
  FileText,
  AlertTriangle,
  Workflow,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.js';
import { useI18n } from '../../../context/I18nContext.js';
import { Ticket } from '../../../../shared/types/ticket.js';
import {
  NAVIGATION_MODULES,
  NavigationItem,
  DestinationId,
  canUserAccessDestination,
  canUserAccessModule,
} from '../../../../shared/types/navigation.js';

interface AliveAdaptiveSidebarProps {
  activeDestination: DestinationId | string;
  onSelectDestination: (destId: DestinationId | string) => void;
  tickets: Ticket[];
  pendingApprovalsCount?: number;
  assetsCount?: number;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  UserCheck,
  Briefcase,
  Headphones,
  Shield,
  Server,
  BookOpen,
  Settings,
  LayoutDashboard,
  CheckSquare,
  Inbox,
  CheckCircle2,
  Layers,
  Flame,
  FileText,
  AlertTriangle,
  Workflow,
};

export const AliveAdaptiveSidebar: React.FC<AliveAdaptiveSidebarProps> = ({
  activeDestination,
  onSelectDestination,
  tickets,
  pendingApprovalsCount = 0,
  assetsCount = 0,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const { currentUser } = useAuth();
  const { t } = useI18n();
  const [isCompact, setIsCompact] = useState(false);

  const getBadgeCount = (item: NavigationItem): number | undefined => {
    switch (item.badgeKey) {
      case 'my-tasks':
        return tickets.filter(
          (t) =>
            t.statusCategory !== 'DONE' &&
            (t.assigneeId === currentUser?.id ||
              (!t.assigneeId &&
                ((t.targetDepartmentId && t.targetDepartmentId === currentUser?.departmentId) ||
                  (t.departmentId && t.departmentId === currentUser?.departmentId))))
        ).length;
      case 'my-requests':
        return tickets.filter((t) => t.reporterId === currentUser?.id && t.statusCategory !== 'DONE').length;
      case 'approvals':
        return pendingApprovalsCount;
      case 'incidents':
        return tickets.filter((t) => t.category === 'INCIDENT' && t.statusCategory !== 'DONE').length;
      case 'assets':
        return assetsCount;
      default:
        return undefined;
    }
  };

  return (
    <aside
      aria-label="Alive Adaptive Navigation"
      className={`fixed left-0 top-14 z-dsModal h-[calc(100dvh-3.5rem)] bg-semantic-panel border-r border-semantic-border flex flex-col shrink-0 select-none shadow-xs transition-all duration-200 ease-out lg:static lg:translate-x-0 ${
        isMobileOpen ? 'translate-x-0' : '-translate-x-full'
      } ${isCompact ? 'w-16' : 'w-64'}`}
    >
      {/* Scrollable Navigation Body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 space-y-4 custom-scrollbar">
        {NAVIGATION_MODULES.filter((mod) => mod.id !== 'analytics').map((module) => {
          if (!canUserAccessModule(currentUser, module.id)) return null;

          const visibleItems = module.items.filter((item) =>
            canUserAccessDestination(currentUser, item.id)
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={module.id} className="space-y-1">
              {!isCompact && (
                <div className="px-2.5 py-1 text-caption font-mono uppercase font-bold text-semantic-muted tracking-wider truncate">
                  {t(module.label)}
                </div>
              )}

              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = ICON_MAP[item.iconName] || FileText;
                  const isActive = activeDestination === item.id;
                  const count = getBadgeCount(item);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelectDestination(item.id);
                        onCloseMobile?.();
                      }}
                      title={isCompact ? t(item.label) : undefined}
                      className={`relative w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-semantic-selected text-[#00F576] font-bold border border-[#00F576]/25 shadow-xs'
                          : 'text-semantic-secondary hover:text-semantic-primary hover:bg-semantic-subtle border border-transparent'
                      } ${isCompact ? 'justify-center px-0' : ''}`}
                    >
                      {/* Active Indicator dot */}
                      {isActive && (
                        <span className="absolute left-1 w-1 h-3.5 rounded-full bg-[#00F576] shadow-[0_0_8px_rgba(0,245,118,0.6)]" />
                      )}

                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#00F576]' : 'text-semantic-muted'}`} />

                      {!isCompact && (
                        <>
                          <span className="truncate flex-1 text-left">{t(item.label)}</span>
                          {typeof count === 'number' && count > 0 && (
                            <span
                              className={`px-1.5 py-0.2 rounded-full font-mono text-caption font-bold ${
                                isActive
                                  ? 'bg-[#00F576]/15 text-[#00F576] border border-[#00F576]/30'
                                  : 'bg-semantic-subtle text-semantic-muted border border-semantic-border'
                              }`}
                            >
                              {count}
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer: Compact Toggle & System Status */}
      <div className="p-2.5 border-t border-semantic-border bg-semantic-subtle/40 flex items-center justify-between text-xs">
        {!isCompact ? (
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <span className="w-2 h-2 rounded-full bg-[#00F576] alive-status-pulse shrink-0" />
            <span className="text-caption font-mono text-semantic-muted truncate">
              {t('LDAPS PKI Live')}
            </span>
          </div>
        ) : (
          <div className="w-full flex justify-center mb-1">
            <span className="w-2 h-2 rounded-full bg-[#00F576] alive-status-pulse" />
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsCompact(!isCompact)}
          className="p-1 text-semantic-muted hover:text-semantic-primary rounded-lg hover:bg-semantic-hover transition-colors shrink-0"
          title={isCompact ? t('Expand sidebar') : t('Collapse to icons')}
        >
          {isCompact ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
};
