import React, { useState } from 'react';
import {
  Table as TableIcon,
  Layers,
  Calendar,
  Lightbulb,
  Users,
  LayoutDashboard,
  FileText,
  Zap,
  Flame,
  Shield,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Server,
  BookOpen,
  Settings,
  Building2,
} from 'lucide-react';
import { Ticket } from '../../../shared/types/ticket.js';

interface SidebarProps {
  activeView: string;
  onSelectView: (view: string) => void;
  tickets: Ticket[];
  applicationsCount?: number;
  assetsCount?: number;
  risksCount?: number;
  kbCount?: number;
  pendingApprovalsCount?: number;
  departmentsCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  tickets,
  applicationsCount = 0,
  assetsCount = 0,
  risksCount = 0,
  kbCount = 0,
  pendingApprovalsCount = 0,
  departmentsCount = 5,
}) => {
  // Track if user has seen the new Ideate feature
  const [hasVisitedIdeate, setHasVisitedIdeate] = useState<boolean>(() => {
    return localStorage.getItem('wrike_seen_ideate') === 'true';
  });

  const handleItemClick = (viewId: string) => {
    if (viewId === 'ideate' && !hasVisitedIdeate) {
      setHasVisitedIdeate(true);
      localStorage.setItem('wrike_seen_ideate', 'true');
    }
    onSelectView(viewId);
  };

  // 1. Core Views
  const primaryViews = [
    { id: 'table', label: 'Spreadsheet Table', icon: TableIcon, count: tickets.length },
    { id: 'board', label: 'Kanban Board', icon: Layers },
    { id: 'gantt', label: 'Gantt Timeline', icon: Calendar },
    {
      id: 'ideate',
      label: 'Brainstorm Ideate',
      icon: Lightbulb,
      isNew: !hasVisitedIdeate,
    },
    { id: 'workload', label: 'Resource Capacity', icon: Users },
    { id: 'ciso-dash', label: 'Executive Analytics', icon: LayoutDashboard },
  ];

  // 2. Multi-Department Governance (New Core Feature)
  const departmentGovernanceViews = [
    {
      id: 'departments',
      label: 'Bank Departments Hub',
      icon: Building2,
      count: departmentsCount,
      highlight: true,
    },
    {
      id: 'cross-tasks',
      label: 'Cross-Dept Pipelines',
      icon: Layers,
      count: tickets.filter((t) => t.isCrossDepartmentParent || t.crossDepartmentId).length,
    },
  ];

  // 3. Operations & Incident Management
  const operationsViews = [
    {
      id: 'soc-incidents',
      label: 'Incident Response (IR)',
      icon: Flame,
      count: tickets.filter((t) => t.category === 'INCIDENT').length,
    },
    {
      id: 'vulnerabilities',
      label: 'AppSec & Hardening',
      icon: Shield,
      count: tickets.filter((t) => t.category === 'VULNERABILITY').length,
    },
    {
      id: 'security-exceptions',
      label: 'Policy Exceptions',
      icon: Lock,
      count: tickets.filter((t) => t.category === 'SECURITY_EXCEPTION').length,
    },
    {
      id: 'approvals',
      label: 'Dual-Control Approvals',
      icon: CheckCircle2,
      count: pendingApprovalsCount,
      highlight: pendingApprovalsCount > 0,
    },
  ];

  // 4. CMDB, Governance & Tools
  const cmdbAndTools = [
    {
      id: 'risk-register',
      label: '5×5 Risk Register',
      icon: AlertTriangle,
      count: risksCount,
    },
    {
      id: 'applications',
      label: 'CMDB Asset Inventory',
      icon: Server,
      count: applicationsCount + assetsCount,
    },
    { id: 'request-forms', label: 'Dynamic Request Forms', icon: FileText },
    { id: 'automations', label: 'Automation & Blueprints', icon: Zap },
    {
      id: 'knowledge-base',
      label: 'SOPs & Knowledge Base',
      icon: BookOpen,
      count: kbCount,
    },
  ];

  return (
    <aside className="w-64 bg-[#FFFFFF] border-r border-[#E2E8F0] flex flex-col justify-between shrink-0 select-none shadow-sm">
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3.5 space-y-5">
        {/* Section 1: Core Views */}
        <div>
          <div className="px-2.5 mb-1.5 text-xs font-bold uppercase tracking-wider text-[#5A6A85]">
            Core Views
          </div>
          <div className="space-y-1">
            {primaryViews.map((view) => {
              const Icon = view.icon;
              const isActive = activeView === view.id;
              return (
                <button
                  key={view.id}
                  onClick={() => handleItemClick(view.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[#E6F7EF] text-[#007860] font-bold border border-[#B8EAD1]'
                      : 'text-[#2B3A57] hover:bg-[#F8FAFC] hover:text-[#162136]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-[#00B259]' : 'text-[#5A6A85]'}`} />
                    <span>{view.label}</span>
                  </div>

                  {/* Show NEW badge only if user has not visited ideate yet */}
                  {view.isNew && (
                    <span className="px-2 py-0.5 rounded-full bg-[#FAF5FF] text-[#722ED1] text-[10px] font-bold border border-[#EFDBFF]">
                      NEW
                    </span>
                  )}

                  {/* Show Count ONLY if count > 0 */}
                  {view.count !== undefined && view.count > 0 && !view.isNew && (
                    <span className="font-mono text-xs text-[#5A6A85] bg-[#F1F5F9] px-2 py-0.5 rounded-full border border-[#E2E8F0]">
                      {view.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: Banking Departments & Cross-Task Pipelines */}
        <div>
          <div className="px-2.5 mb-1.5 text-xs font-bold uppercase tracking-wider text-[#5A6A85]">
            Bank Multi-Department
          </div>
          <div className="space-y-1">
            {departmentGovernanceViews.map((view) => {
              const Icon = view.icon;
              const isActive = activeView === view.id || (view.id === 'departments' && activeView === 'dept-admin');
              return (
                <button
                  key={view.id}
                  onClick={() => handleItemClick(view.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[#E6F7EF] text-[#007860] font-bold border border-[#B8EAD1]'
                      : 'text-[#2B3A57] hover:bg-[#F8FAFC] hover:text-[#162136]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-[#00B259]' : 'text-[#5A6A85]'}`} />
                    <span>{view.label}</span>
                  </div>

                  {view.count !== undefined && view.count > 0 && (
                    <span
                      className={`font-mono text-xs px-2 py-0.5 rounded-full border shrink-0 ${
                        view.highlight
                          ? 'bg-[#E6F7EF] text-[#007860] border-[#B8EAD1] font-bold'
                          : 'text-[#5A6A85] bg-[#F1F5F9] border-[#E2E8F0]'
                      }`}
                    >
                      {view.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 3: Security Operations */}
        <div>
          <div className="px-2.5 mb-1.5 text-xs font-bold uppercase tracking-wider text-[#5A6A85]">
            Security Operations
          </div>
          <div className="space-y-1">
            {operationsViews.map((view) => {
              const Icon = view.icon;
              const isActive = activeView === view.id;
              return (
                <button
                  key={view.id}
                  onClick={() => handleItemClick(view.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[#E6F7EF] text-[#007860] font-bold border border-[#B8EAD1]'
                      : 'text-[#2B3A57] hover:bg-[#F8FAFC] hover:text-[#162136]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#00B259]' : 'text-[#5A6A85]'}`} />
                    <span className="truncate">{view.label}</span>
                  </div>

                  {/* Show Count ONLY if count > 0 */}
                  {view.count !== undefined && view.count > 0 && (
                    <span
                      className={`font-mono text-xs px-2 py-0.5 rounded-full border shrink-0 ${
                        view.highlight
                          ? 'bg-[#FFF7E6] text-[#D46B08] border-[#FFE7BA] font-bold'
                          : 'text-[#5A6A85] bg-[#F1F5F9] border-[#E2E8F0]'
                      }`}
                    >
                      {view.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 3: CMDB, Governance & Tools */}
        <div>
          <div className="px-2.5 mb-1.5 text-xs font-bold uppercase tracking-wider text-[#5A6A85]">
            Governance & Tools
          </div>
          <div className="space-y-1">
            {cmdbAndTools.map((view) => {
              const Icon = view.icon;
              const isActive = activeView === view.id;
              return (
                <button
                  key={view.id}
                  onClick={() => handleItemClick(view.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[#E6F7EF] text-[#007860] font-bold border border-[#B8EAD1]'
                      : 'text-[#2B3A57] hover:bg-[#F8FAFC] hover:text-[#162136]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#00B259]' : 'text-[#5A6A85]'}`} />
                    <span className="truncate">{view.label}</span>
                  </div>

                  {/* Show Count ONLY if count > 0 */}
                  {view.count !== undefined && view.count > 0 && (
                    <span className="font-mono text-xs text-[#5A6A85] bg-[#F1F5F9] px-2 py-0.5 rounded-full border border-[#E2E8F0] shrink-0">
                      {view.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className="p-3.5 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between text-xs text-[#5A6A85]">
        <button
          onClick={() => handleItemClick('admin-center')}
          className="flex items-center gap-2 hover:text-[#162136] font-bold"
        >
          <Settings className="w-4 h-4 text-[#00B259]" />
          <span>Space Settings</span>
        </button>
        <span className="text-xs font-mono font-bold text-[#007860]">v2026.4</span>
      </div>
    </aside>
  );
};
