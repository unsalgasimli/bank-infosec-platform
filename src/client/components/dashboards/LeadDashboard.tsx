import React from 'react';
import { Users, BarChart3, Clock, AlertTriangle, ArrowRight, Layers } from 'lucide-react';
import { TeamQueue } from '../../../shared/types/queues.js';

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
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-bank-950">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Security Operations Lead Command</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Analyst capacity tracking, team queues, and operational flow across security engineering units.
        </p>
      </div>

      {/* Queues Grid */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Operational Team Queues</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {queues.map((q) => (
            <div
              key={q.id}
              onClick={() => onSelectQueue(q.jqlFilter)}
              className="p-4 bg-bank-900 border border-slate-800 hover:border-blue-500/80 rounded-xl space-y-2 cursor-pointer transition-all hover:scale-[1.02] shadow-md group"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs group-hover:text-blue-400 transition-colors">
                  {q.name}
                </span>
                <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 font-mono text-xs font-bold">
                  {q.count || 0}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 line-clamp-2">{q.description}</p>
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[10px] text-slate-500 font-mono">
                <span>Filter: {q.code}</span>
                <span className="text-blue-400 group-hover:underline flex items-center gap-1 font-sans font-bold">
                  Open Queue <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Analyst Workload Capacity Tracker */}
      <div className="bg-bank-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Analyst Workload Distribution & Bandwidth
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">{workload.length} Active Engineers</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {workload.map((item, idx) => (
            <div key={idx} className="p-3 bg-bank-950 border border-slate-800 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200 text-xs">{item.name}</span>
                <span className="font-mono text-xs text-blue-400 font-bold">{item.count} Active</span>
              </div>
              <div className="w-full h-2 bg-bank-900 rounded-full overflow-hidden border border-slate-800">
                <div
                  className={`h-full ${item.criticalCount > 0 ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(100, item.count * 15)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>Critical Items: <strong className="text-red-400">{item.criticalCount}</strong></span>
                <span>Load: {item.count > 5 ? 'High' : 'Normal'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
