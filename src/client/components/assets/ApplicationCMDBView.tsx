import React from 'react';
import { BankApplication } from '../../../shared/types/asset.js';
import { Server, Bug } from 'lucide-react';
import { Badge } from '../common/Badge.js';

interface ApplicationCMDBViewProps {
  applications: BankApplication[];
}

export const ApplicationCMDBView: React.FC<ApplicationCMDBViewProps> = ({ applications }) => {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-bank-950">
      <div className="bg-bank-900 border border-slate-800 rounded-lg p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded bg-bank-950 text-blue-400 border border-slate-800">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Application & Service Inventory (CMDB)
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Core switches, web portals, payment APIs, repositories, and active vulnerability postures.
            </p>
          </div>
        </div>
        <span className="px-2.5 py-1 bg-bank-950 text-blue-300 border border-slate-800 rounded font-mono text-xs font-semibold">
          {applications.length} Applications
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {applications.map((app) => (
          <div
            key={app.id}
            className="p-4 bg-bank-900 border border-slate-800 rounded-lg space-y-2.5 hover:border-slate-700 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-blue-400 text-xs">{app.code}</span>
                <span className="px-1.5 py-0.2 rounded bg-bank-950 text-slate-300 border border-slate-700 text-[10px] font-mono">
                  {app.criticality}
                </span>
              </div>
              <Badge type="CONFIDENTIALITY" value={app.dataClassification} />
            </div>

            <h3 className="text-xs font-semibold text-white">{app.name}</h3>
            <p className="text-[11px] text-slate-400 leading-relaxed">{app.description}</p>

            <div className="p-2.5 bg-bank-950 rounded border border-slate-800 space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 text-[11px]">Tech Stack:</span>
                <span className="font-mono text-slate-300 text-[11px]">{app.techStack.join(', ')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 text-[11px]">Databases:</span>
                <span className="text-slate-300 text-[11px]">{app.connectedDatabases.join(', ')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 text-[11px]">Git Repos:</span>
                <span className="font-mono text-blue-300 text-[11px] truncate">{app.gitRepositories.join(', ')}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1.5 border-t border-slate-800 text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <Bug className="w-3.5 h-3.5 text-red-400" />
                <span>Open Findings: <strong className="text-white">{app.openVulnerabilitiesCount}</strong></span>
              </span>
              <span>Internet Exposed: <strong className={app.internetExposed ? 'text-amber-400' : 'text-slate-300'}>{app.internetExposed ? 'YES' : 'NO'}</strong></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

