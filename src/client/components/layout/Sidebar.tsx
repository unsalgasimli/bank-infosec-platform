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
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';

interface SidebarProps {
  activeView: string;
  onSelectView: (view: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onSelectView }) => {
  const { currentUser } = useAuth();

  const sections = [
    {
      title: 'COMMAND CENTERS',
      items: [
        { id: 'ciso-dash', label: 'CISO Executive GRC', icon: LayoutDashboard },
        { id: 'lead-dash', label: 'Team Lead Operations', icon: BarChart3 },
        { id: 'analyst-dash', label: 'My Security Workspace', icon: UserCheck },
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
      title: 'ASSURANCE & SYSTEM',
      items: [
        { id: 'knowledge-base', label: 'Security Playbooks (KB)', icon: BookOpen },
        { id: 'admin-center', label: 'Admin & Audit Trail', icon: Settings },
      ],
    },
  ];

  return (
    <aside className="w-60 bg-bank-900 border-r border-slate-800 flex flex-col h-[calc(100vh-3.25rem)] select-none">
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {sections.map((section, idx) => (
          <div key={idx} className="space-y-0.5">
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {section.title}
            </div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectView(item.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-white font-semibold border-l-2 border-blue-500 rounded-l-none'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                  }`}
                  id={`nav-${item.id}`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.alert && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer System Status */}
      <div className="p-3 border-t border-slate-800 bg-bank-950 flex items-center justify-between text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>System Healthy</span>
        </div>
        <span className="text-slate-600">v1.0</span>
      </div>
    </aside>
  );
};

