import React from 'react';
import { BankApplication } from '../../../shared/types/asset.js';
import { Server, ShieldAlert, Bug, ExternalLink } from 'lucide-react';
import { Badge } from '../common/Badge.js';

interface ApplicationCMDBViewProps {
  applications: BankApplication[];
}

export const ApplicationCMDBView: React.FC<ApplicationCMDBViewProps> = ({ applications }) => {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-bank-950">
      <div className="bg-bank-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-blue-950 text-blue-400 border border-blue-800">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Banking Application & Business Services Inventory
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Tier-1 core switches, web portals, payment APIs, repositories, and active risk ratings.
            </p>
          </div>
        </div>
        <span className="px-3 py-1 bg-blue-950 text-blue-300 border border-blue-800 rounded-full text-xs font-mono font-bold">
          {applications.length} Registered Apps
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {applications.map((app) => (
          <div
            key={app.id}
            className="p-5 bg-bank-900 border border-slate-800 rounded-xl space-y-3 shadow-md hover:border-slate-700 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-blue-400 text-sm">{app.code}</span>
                <span className="px-2 py-0.5 rounded bg-bank-950 text-slate-300 border border-slate-700 text-xs font-mono">
                  {app.criticality}
                </span>
              </div>
              <Badge type="CONFIDENTIALITY" value={app.dataClassification} />
            </div>

            <h3 className="text-sm font-bold text-white">{app.name}</h3>
            <p className="text-xs text-slate-400 leading-relaxed">{app.description}</p>

            <div className="p-3 bg-bank-950 rounded-lg border border-slate-800 space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-semibold">Tech Stack:</span>
                <span className="font-mono text-slate-300">{app.techStack.join(', ')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-semibold">Connected DBs:</span>
                <span className="text-slate-300">{app.connectedDatabases.join(', ')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-semibold">Git Repositories:</span>
                <span className="font-mono text-blue-300 text-[11px] truncate">{app.gitRepositories.join(', ')}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Bug className="w-3.5 h-3.5 text-red-400" />
                <span>Open Vulns: <strong className="text-white">{app.openVulnerabilitiesCount}</strong></span>
              </span>
              <span>Internet Exposed: <strong className={app.internetExposed ? 'text-amber-400' : 'text-emerald-400'}>{app.internetExposed ? 'YES' : 'NO (Internal Only)'}</strong></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
