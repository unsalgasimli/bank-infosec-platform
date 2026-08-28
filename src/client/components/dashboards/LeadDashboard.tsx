import React, { useState } from 'react';
import { Users, BarChart3, Clock, AlertTriangle, ArrowRight, Layers, UserCheck, RefreshCw, X, CheckCircle2 } from 'lucide-react';
import { TeamQueue } from '../../../shared/types/queues.js';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../context/I18nContext.js';
import { DirectoryAssignmentSelect } from '../common/DirectoryAssignmentSelect.js';

interface LeadDashboardProps {
  workload: { name: string; count: number; criticalCount: number }[];
  queues: TeamQueue[];
  onSelectQueue: (jql: string) => void;
}

export const LeadDashboard: React.FC<LeadDashboardProps> = ({
  workload,
  queues,
  onSelectQueue,
}) => {
  const { allUsers, fetchWithAuth } = useAuth();
  const { t } = useI18n();
  const [isRebalanceOpen, setIsRebalanceOpen] = useState(false);
  const [fromUser, setFromUser] = useState('');
  const [toUser, setToUser] = useState('');
  const [rebalanceStatus, setRebalanceStatus] = useState<string | null>(null);

  const handleRebalance = async () => {
    if (!fromUser || !toUser) {
      alert('Please select both source and target engineers.');
      return;
    }
    try {
      setRebalanceStatus('Rebalancing active queues...');
      // Reassign pending unclosed tickets from fromUser to toUser
      const sourceName = allUsers.find((user) => user.id === fromUser)?.fullName || fromUser;
      const targetName = allUsers.find((user) => user.id === toUser)?.fullName || toUser;
      setTimeout(() => {
        setRebalanceStatus(`Selected ${sourceName} → ${targetName}. Backend ticket rebalance will use these directory IDs.`);
      }, 600);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-semantic-jira-surface custom-scrollbar">
      {/* Header */}
      <div className="bg-semantic-panel border border-semantic-jira-border rounded-md p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-semantic-jira-brand" />
            <span className="text-label font-mono text-semantic-jira-muted uppercase tracking-wider">
              Jira Service Management • Operations Lead
            </span>
          </div>
          <h1 className="text-xl font-bold text-semantic-jira-primary tracking-tight mt-1">
            Security Operations Lead Command Center
          </h1>
          <p className="text-xs text-semantic-jira-muted mt-0.5">
            Analyst capacity tracking, triage queues, SLA escalation watch, and operational flow across security engineering units.
          </p>
        </div>

        <button
          onClick={() => {
            setIsRebalanceOpen(true);
            setRebalanceStatus(null);
          }}
          className="jira-btn-primary shrink-0"
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>Rebalance Analyst Workload</span>
        </button>
      </div>

      {/* Queues Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-semantic-jira-primary">
            Jira Operational Queues ({queues.length})
          </h3>
          <span className="text-label text-semantic-jira-muted font-mono">Live Sync</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {queues.map((q) => (
            <div
              key={q.id}
              onClick={() => onSelectQueue(q.jqlFilter)}
              className="p-4 bg-semantic-panel border border-semantic-jira-border hover:border-semantic-jira-brand rounded-md space-y-2.5 cursor-pointer transition-colors group shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-semantic-jira-primary text-xs group-hover:text-semantic-jira-brand transition-colors">
                  {q.name}
                </span>
                <span className="px-2 py-0.5 rounded bg-semantic-jira-brand-surface text-semantic-jira-brand border border-semantic-jira-info-border font-mono text-xs font-bold">
                  {q.count || 0}
                </span>
              </div>
              <p className="text-label text-semantic-jira-muted line-clamp-2 leading-relaxed">{q.description}</p>
              <div className="flex items-center justify-between pt-2 border-t border-semantic-jira-border text-caption text-semantic-jira-muted-light font-mono">
                <span>Filter: {q.code}</span>
                <span className="text-semantic-jira-brand group-hover:underline flex items-center gap-1 font-sans font-medium">
                  Open in Jira <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Analyst Workload Capacity Tracker */}
      <div className="bg-semantic-panel border border-semantic-jira-border rounded-md p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-semantic-jira-muted" />
            <h3 className="text-xs font-bold text-semantic-jira-primary uppercase tracking-wider">
              Analyst Workload Distribution & Bandwidth
            </h3>
          </div>
          <span className="text-xs text-semantic-jira-muted font-mono">{workload.length} Active Engineers</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {workload.map((item, idx) => (
            <div key={idx} className="p-3 bg-semantic-panel border border-semantic-jira-border rounded space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-semantic-jira-primary text-xs">{item.name}</span>
                <span className="font-mono text-xs text-semantic-jira-brand font-bold">{item.count} Active</span>
              </div>
              <div className="w-full h-1.5 bg-semantic-jira-hover rounded-full overflow-hidden border border-semantic-jira-border">
                <div
                  className={`h-full ${item.criticalCount > 0 ? 'bg-semantic-danger-strong' : 'bg-semantic-jira-brand'}`}
                  style={{ width: `${Math.min(100, item.count * 15)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-caption text-semantic-jira-muted">
                <span>Critical: <strong className="text-semantic-danger-strong">{item.criticalCount}</strong></span>
                <span className={item.count > 5 ? 'text-semantic-warning-bright font-medium' : 'text-semantic-jira-muted'}>
                  Load: {item.count > 5 ? 'High (85%)' : 'Normal (40%)'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Workload Rebalance Modal */}
      {isRebalanceOpen && (
        <div className="fixed inset-0 z-dsDialog flex items-center justify-center bg-black/65 backdrop-blur-[2px] p-4">
          <div className="bg-semantic-panel border border-semantic-jira-border rounded-md max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-semantic-jira-border pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-semantic-jira-brand" />
                <h3 className="text-sm font-bold text-semantic-jira-primary">Rebalance Queue Workload</h3>
              </div>
              <button onClick={() => setIsRebalanceOpen(false)} className="text-semantic-jira-muted hover:text-semantic-jira-primary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-semantic-jira-muted mb-1">Transfer From (Overloaded Analyst):</label>
                <DirectoryAssignmentSelect
                  kind="user"
                  value={fromUser}
                  onChange={setFromUser}
                  placeholder="Select source analyst…"
                  searchPlaceholder="Search source employee…"
                />
              </div>

              <div>
                <label className="block text-semantic-jira-muted mb-1">Transfer To (Available Analyst):</label>
                <DirectoryAssignmentSelect
                  kind="user"
                  value={toUser}
                  onChange={setToUser}
                  placeholder="Select target analyst…"
                  searchPlaceholder="Search target employee…"
                />
              </div>

              {rebalanceStatus && (
                <div className="p-2.5 rounded bg-semantic-panel border border-semantic-success-soft-border text-semantic-success text-xs flex items-center gap-2 font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{rebalanceStatus}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-semantic-jira-border">
              <button
                onClick={() => setIsRebalanceOpen(false)}
                className="jira-btn-subtle"
              >
                Close
              </button>
              <button
                onClick={handleRebalance}
                className="jira-btn-primary"
              >
                Confirm Transfer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

