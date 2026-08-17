import React from 'react';
import {
  LayoutDashboard,
  ShieldAlert,
  Flame,
  Bug,
  Lock,
  Layers,
  FileCheck,
  CheckCircle2,
  Database,
  Server,
  BookOpen,
  Settings,
  Users,
  Eye,
  AlertOctagon,
  Inbox,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';

interface SidebarProps {
  activeView: string;
  onSelectView: (view: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onSelectView }) => {
  const { currentUser } = useAuth();

  const isSecSpecialist = currentUser?.roles.some((r) =>
    ['CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'SECURITY_ANALYST', 'SOC_ANALYST', 'APPSEC_ANALYST', 'VULN_ANALYST', 'GRC_ANALYST', 'DLP_ANALYST'].includes(r)
  );

  const sections = [
    {
      title: 'COMMAND CENTERS',
      items: [
        { id: 'ciso-dash', label: 'CISO Executive GRC', icon: LayoutDashboard, badge: 'Live' },
        { id: 'lead-dash', label: 'Team Lead Operations', icon: BarChart3 },
        { id: 'analyst-dash', label: 'My Security Workspace', icon: Sparkles },
      ],
    },
    {
      title: 'TICKETS & QUEUES',
      items: [
        { id: 'tickets', label: 'All Bank Tickets', icon: Layers },
        { id: 'my-tickets', label: 'My Assigned Tickets', icon: Inbox },
        { id: 'watched-tickets', label: 'Watched Tickets', icon: Eye },
        { id: 'overdue-tickets', label: 'SLA At Risk & Breached', icon: AlertOctagon, alert: true },
      ],
    },
    {
      title: 'SECURITY OPERATIONS',
      items: [
        { id: 'soc-incidents', label: 'SOC Incidents & SIEM', icon: Flame },
        { id: 'vulnerabilities', label: 'Vulnerability Management', icon: Bug },
        { id: 'dlp-investigations', label: 'DLP Forensics', icon: Lock },
      ],
    },
    {
      title: 'GOVERNANCE & RISK',
      items: [
        { id: 'risk-register', label: 'Enterprise Risk (5×5)', icon: ShieldAlert },
        { id: 'security-exceptions', label: 'Security Exceptions', icon: CheckCircle2 },
        { id: 'audit-findings', label: 'Audit & Compliance', icon: FileCheck },
        { id: 'approvals', label: 'Approvals Inbox', icon: CheckCircle2 },
      ],
    },
    {
      title: 'CMDB & ASSETS',
      items: [
        { id: 'applications', label: 'Banking Applications', icon: Server },
        { id: 'assets', label: 'CMDB Infrastructure Assets', icon: Database },
      ],
    },
    {
      title: 'ASSURANCE & INTEL',
      items: [
        { id: 'knowledge-base', label: 'Security Playbooks (KB)', icon: BookOpen },
        { id: 'admin-center', label: 'Admin & Audit Trail', icon: Settings },
      ],
    },
  ];

  return (
    <aside className="w-64 bg-bank-900/95 border-r border-slate-800 flex flex-col h-[calc(100vh-3.5rem)] select-none">
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {sections.map((section, idx) => (
          <div key={idx} className="space-y-1">
            <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
              {section.title}
            </div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectView(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40 shadow-sm font-bold'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  }`}
                  id={`nav-${item.id}`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-mono">
                      {item.badge}
                    </span>
                  )}
                  {item.alert && (
                    <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer System Status */}
      <div className="p-3 border-t border-slate-800/80 bg-bank-950/60 flex items-center justify-between text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
          <span>SOC Active 24/7</span>
        </div>
        <span className="text-slate-600">v1.0.0</span>
      </div>
    </aside>
  );
};
