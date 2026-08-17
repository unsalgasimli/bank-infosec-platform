import React from 'react';
import { BankAsset } from '../../../shared/types/asset.js';
import { Database } from 'lucide-react';

interface AssetInventoryViewProps {
  assets: BankAsset[];
}

export const AssetInventoryView: React.FC<AssetInventoryViewProps> = ({ assets }) => {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-bank-950">
      <div className="bg-bank-900 border border-slate-800 rounded-lg p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded bg-bank-950 text-blue-400 border border-slate-800">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              CMDB Infrastructure & Asset Inventory
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Production Kubernetes clusters, database nodes, DMZ firewalls, cloud subscriptions, and PAM bastions.
            </p>
          </div>
        </div>
        <span className="px-2.5 py-1 bg-bank-950 text-blue-300 border border-slate-800 rounded font-mono text-xs font-semibold">
          {assets.length} Assets
        </span>
      </div>

      <div className="bg-bank-900 border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-bank-950 border-b border-slate-800 text-slate-400 uppercase font-semibold text-[10px] tracking-wider">
            <tr>
              <th className="px-4 py-2.5">Asset Name & CMDB Ref</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5">Hostname / IP</th>
              <th className="px-3 py-2.5">Criticality</th>
              <th className="px-3 py-2.5">Environment</th>
              <th className="px-3 py-2.5">Owner</th>
              <th className="px-3 py-2.5 text-right">Critical Findings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {assets.map((ast) => (
              <tr key={ast.id} className="hover:bg-slate-800/40 transition-colors">
                <td className="px-4 py-2.5">
                  <div className="font-mono font-semibold text-white text-xs">{ast.name}</div>
                  <div className="text-[10px] text-slate-500 font-mono">Ref: {ast.cmdbId}</div>
                </td>
                <td className="px-3 py-2.5 font-mono text-slate-300">
                  <span className="px-1.5 py-0.5 rounded bg-bank-950 text-slate-300 border border-slate-750 text-[10px]">
                    {ast.assetType}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono text-slate-300 text-xs">
                  <div>{ast.hostname}</div>
                  <div className="text-slate-500 text-[10px]">{ast.ipAddress || 'Internal'}</div>
                </td>
                <td className="px-3 py-2.5 font-mono">
                  <span className="text-amber-400 font-semibold">{ast.criticality}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="px-2 py-0.5 rounded bg-bank-950 text-blue-300 border border-slate-800 text-[10px] font-mono">
                    {ast.environment}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-300 font-medium">
                  {ast.ownerName}
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold text-red-400">
                  {ast.criticalFindingCount || 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

