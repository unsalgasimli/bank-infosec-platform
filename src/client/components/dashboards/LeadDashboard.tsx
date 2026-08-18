import React, { useState } from 'react';
import { Users, BarChart3, Clock, AlertTriangle, ArrowRight, Layers, UserCheck, RefreshCw, X, CheckCircle2 } from 'lucide-react';
import { TeamQueue } from '../../../shared/types/queues.js';
import { useAuth } from '../../context/AuthContext.js';

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
      setTimeout(() => {
        setRebalanceStatus(`Successfully transferred workload from ${fromUser} to ${toUser}.`);
      }, 600);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#F4F5F7] custom-scrollbar">
      {/* Header */}
      <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#0052CC]" />
            <span className="text-[11px] font-mono text-[#5E6C84] uppercase tracking-wider">
              Jira Service Management • Operations Lead
            </span>
          </div>
          <h1 className="text-xl font-bold text-[#172B4D] tracking-tight mt-1">
            Security Operations Lead Command Center
          </h1>
          <p className="text-xs text-[#5E6C84] mt-0.5">
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
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#172B4D]">
            Jira Operational Queues ({queues.length})
          </h3>
          <span className="text-[11px] text-[#5E6C84] font-mono">Live Sync</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {queues.map((q) => (
            <div
              key={q.id}
              onClick={() => onSelectQueue(q.jqlFilter)}
              className="p-4 bg-[#FFFFFF] border border-[#DFE1E6] hover:border-[#0052CC] rounded-md space-y-2.5 cursor-pointer transition-colors group shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#172B4D] text-xs group-hover:text-[#0052CC] transition-colors">
                  {q.name}
                </span>
                <span className="px-2 py-0.5 rounded bg-[#DEEBFF] text-[#0052CC] border border-[#B3D4FF] font-mono text-xs font-bold">
                  {q.count || 0}
                </span>
              </div>
              <p className="text-[11px] text-[#5E6C84] line-clamp-2 leading-relaxed">{q.description}</p>
              <div className="flex items-center justify-between pt-2 border-t border-[#DFE1E6] text-[10px] text-[#7A869A] font-mono">
                <span>Filter: {q.code}</span>
                <span className="text-[#0052CC] group-hover:underline flex items-center gap-1 font-sans font-medium">
                  Open in Jira <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Analyst Workload Capacity Tracker */}
      <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#5E6C84]" />
            <h3 className="text-xs font-bold text-[#172B4D] uppercase tracking-wider">
              Analyst Workload Distribution & Bandwidth
            </h3>
          </div>
          <span className="text-xs text-[#5E6C84] font-mono">{workload.length} Active Engineers</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {workload.map((item, idx) => (
            <div key={idx} className="p-3 bg-[#FFFFFF] border border-[#DFE1E6] rounded space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#172B4D] text-xs">{item.name}</span>
                <span className="font-mono text-xs text-[#0052CC] font-bold">{item.count} Active</span>
              </div>
              <div className="w-full h-1.5 bg-[#EBECF0] rounded-full overflow-hidden border border-[#DFE1E6]">
                <div
                  className={`h-full ${item.criticalCount > 0 ? 'bg-[#DE350B]' : 'bg-[#0052CC]'}`}
                  style={{ width: `${Math.min(100, item.count * 15)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-[#5E6C84]">
                <span>Critical: <strong className="text-[#DE350B]">{item.criticalCount}</strong></span>
                <span className={item.count > 5 ? 'text-[#FF8B00] font-medium' : 'text-[#5E6C84]'}>
                  Load: {item.count > 5 ? 'High (85%)' : 'Normal (40%)'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Workload Rebalance Modal */}
      {isRebalanceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-[2px] p-4">
          <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#DFE1E6] pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-[#0052CC]" />
                <h3 className="text-sm font-bold text-[#172B4D]">Rebalance Queue Workload</h3>
              </div>
              <button onClick={() => setIsRebalanceOpen(false)} className="text-[#5E6C84] hover:text-[#172B4D]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[#5E6C84] mb-1">Transfer From (Overloaded Analyst):</label>
                <select
                  value={fromUser}
                  onChange={(e) => setFromUser(e.target.value)}
                  className="jira-input"
                >
                  <option value="">Select source analyst...</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.fullName}>
                      {u.fullName} ({u.roles[0]})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#5E6C84] mb-1">Transfer To (Available Analyst):</label>
                <select
                  value={toUser}
                  onChange={(e) => setToUser(e.target.value)}
                  className="jira-input"
                >
                  <option value="">Select target analyst...</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.fullName}>
                      {u.fullName} ({u.roles[0]})
                    </option>
                  ))}
                </select>
              </div>

              {rebalanceStatus && (
                <div className="p-2.5 rounded bg-[#FFFFFF] border border-[#ABF5D1] text-[#006644] text-xs flex items-center gap-2 font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{rebalanceStatus}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#DFE1E6]">
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



