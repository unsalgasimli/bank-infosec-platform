import React, { useState } from 'react';
import {
  Network,
  Server,
  Box,
  Activity,
  Flame,
  Shield,
  ArrowRight,
  Search,
  CheckCircle2,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { BankApplication, BankAsset } from '../../../shared/types/asset.js';
import { Ticket } from '../../../shared/types/ticket.js';

interface CMDBRelationshipMapViewProps {
  applications: BankApplication[];
  assets: BankAsset[];
  tickets: Ticket[];
  onSelectTicket?: (ticket: Ticket) => void;
}

export const CMDBRelationshipMapView: React.FC<CMDBRelationshipMapViewProps> = ({
  applications,
  assets,
  tickets,
  onSelectTicket,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('app-core-bank');
  const [filterType, setFilterType] = useState<'ALL' | 'CRITICAL' | 'HAS_INCIDENTS'>('ALL');

  const selectedApp = applications.find((a) => a.id === selectedNodeId);
  const selectedAsset = assets.find((ast) => ast.id === selectedNodeId);

  const linkedTickets = tickets.filter(
    (t) => t.applicationId === selectedNodeId || t.assetId === selectedNodeId
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FFFFFF] overflow-hidden select-none">
      {/* Header Toolbar */}
      <div className="bg-[#FFFFFF] border-b border-[#E2E8F0] px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#EBF4FD] text-[#0073D3] border border-[#BAE0FD] flex items-center justify-center font-bold">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-[#162136]">CMDB Service & Asset Relationship Topology</h1>
            <p className="text-xs text-[#64748B]">
              Visual dependency mapping linking Business Services, Applications, Infrastructure CIs, and active security cases.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-0.5 text-xs">
            {(['ALL', 'CRITICAL', 'HAS_INCIDENTS'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterType(mode)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  filterType === mode
                    ? 'bg-[#0073D3] text-white shadow-xs'
                    : 'text-[#64748B] hover:text-[#162136]'
                }`}
              >
                {mode === 'ALL' ? 'All CIs' : mode === 'CRITICAL' ? 'Tier 1 Only' : 'Incident Hotspots'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Canvas & Detail Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Interactive Node Map */}
        <div className="flex-1 bg-[#F8FAFC] p-6 overflow-auto custom-scrollbar relative">
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Level 1: Business Services Tier */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-[#007860]" />
                <span>Tier-1 Banking Business Services</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { id: 'svc-core', name: 'Core Transaction Clearing', appRef: 'app-core-bank', status: 'HEALTHY' },
                  { id: 'svc-swift', name: 'SWIFT Interbank Rail', appRef: 'app-swift', status: 'DEGRADED' },
                  { id: 'svc-mobile', name: 'Customer Mobile Banking', appRef: 'app-mobile-bank', status: 'HEALTHY' },
                ].map((svc) => (
                  <div
                    key={svc.id}
                    onClick={() => setSelectedNodeId(svc.appRef)}
                    className={`wrike-card p-4 cursor-pointer transition-all border ${
                      selectedNodeId === svc.appRef
                        ? 'border-[#0073D3] ring-2 ring-[#0073D3]/20 bg-[#FFFFFF]'
                        : 'hover:border-[#CBD5E1] bg-[#FFFFFF]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-[#162136]">{svc.name}</span>
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          svc.status === 'HEALTHY' ? 'bg-[#00B259]' : 'bg-[#FA8C16]'
                        }`}
                      />
                    </div>
                    <div className="text-[11px] text-[#64748B] font-mono">Maps to: {svc.appRef}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Connecting Connector Line */}
            <div className="flex items-center justify-center text-xs text-[#94A3B8] font-mono font-bold">
              <span>↓ Host Application Layer ↓</span>
            </div>

            {/* Level 2: Banking Applications */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                <Box className="w-3.5 h-3.5 text-[#0073D3]" />
                <span>Applications & Microservices</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {applications.map((app) => {
                  const isSelected = selectedNodeId === app.id;
                  const appTickets = tickets.filter((t) => t.applicationId === app.id);
                  const hasCrit = appTickets.some((t) => t.technicalSeverity === 'CRITICAL');

                  return (
                    <div
                      key={app.id}
                      onClick={() => setSelectedNodeId(app.id)}
                      className={`wrike-card p-4 cursor-pointer transition-all border ${
                        isSelected
                          ? 'border-[#0073D3] ring-2 ring-[#0073D3]/20 bg-[#FFFFFF]'
                          : 'hover:border-[#CBD5E1] bg-[#FFFFFF]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs font-bold text-[#0073D3]">{app.code}</span>
                        <span className="text-[10px] font-mono font-bold bg-[#F1F5F9] px-1.5 py-0.2 rounded border border-[#E2E8F0]">
                          {app.criticality}
                        </span>
                      </div>
                      <div className="font-bold text-xs text-[#162136] truncate">{app.name}</div>
                      <div className="mt-2 pt-2 border-t border-[#F1F5F9] flex items-center justify-between text-[11px]">
                        <span className="text-[#64748B]">{app.environment}</span>
                        {appTickets.length > 0 && (
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold font-mono ${
                              hasCrit ? 'bg-[#FDE8EB] text-[#CF1322]' : 'bg-[#EBF4FD] text-[#0073D3]'
                            }`}
                          >
                            {appTickets.length} cases
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Connecting Connector Line */}
            <div className="flex items-center justify-center text-xs text-[#94A3B8] font-mono font-bold">
              <span>↓ Infrastructure & Network CIs ↓</span>
            </div>

            {/* Level 3: Infrastructure Assets */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-[#722ED1]" />
                <span>Physical & Virtual CIs</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {assets.map((asset) => {
                  const isSelected = selectedNodeId === asset.id;

                  return (
                    <div
                      key={asset.id}
                      onClick={() => setSelectedNodeId(asset.id)}
                      className={`wrike-card p-4 cursor-pointer transition-all border ${
                        isSelected
                          ? 'border-[#722ED1] ring-2 ring-[#722ED1]/20 bg-[#FFFFFF]'
                          : 'hover:border-[#CBD5E1] bg-[#FFFFFF]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs font-bold text-[#722ED1]">{asset.cmdbId || asset.name}</span>
                        <span className="text-[10px] font-mono text-[#64748B]">{asset.ipAddress}</span>
                      </div>
                      <div className="font-bold text-xs text-[#162136] truncate">{asset.businessService || asset.name}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right CI Detail Inspector Panel */}
        <div className="w-80 bg-[#FFFFFF] border-l border-[#E2E8F0] p-5 flex flex-col justify-between overflow-y-auto custom-scrollbar shrink-0 shadow-xs">
          <div className="space-y-4">
            <div className="border-b border-[#E2E8F0] pb-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">CI Inspector</div>
              <h3 className="text-base font-bold text-[#162136] mt-0.5">
                {selectedApp?.name || selectedAsset?.name || 'Selected Item'}
              </h3>
              <div className="font-mono text-xs text-[#0073D3] font-bold mt-0.5">
                {selectedApp?.code || selectedAsset?.cmdbId || selectedNodeId}
              </div>
            </div>

            {selectedApp && (
              <div className="space-y-2.5 text-xs">
                <div>
                  <span className="text-[#64748B]">Criticality Tier:</span>
                  <div className="font-bold font-mono text-[#162136]">{selectedApp.criticality}</div>
                </div>
                <div>
                  <span className="text-[#64748B]">Data Classification:</span>
                  <div className="font-bold font-mono text-[#007860]">{selectedApp.dataClassification}</div>
                </div>
                <div>
                  <span className="text-[#64748B]">Tech Stack:</span>
                  <div className="font-mono text-[#162136] mt-0.5">{selectedApp.techStack?.join(', ') || 'N/A'}</div>
                </div>
                <div>
                  <span className="text-[#64748B]">Connected DBs:</span>
                  <div className="font-mono text-[#162136] mt-0.5">{selectedApp.connectedDatabases?.join(', ') || 'None'}</div>
                </div>
              </div>
            )}

            {/* Linked Active Incidents & Findings */}
            <div className="pt-3 border-t border-[#E2E8F0] space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                Linked Security Tickets ({linkedTickets.length})
              </div>
              {linkedTickets.length === 0 ? (
                <div className="text-xs text-[#64748B] italic py-2">No active tickets linked to this CI.</div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                  {linkedTickets.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => onSelectTicket && onSelectTicket(t)}
                      className="p-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#0073D3] text-xs cursor-pointer transition-colors"
                    >
                      <div className="font-mono font-bold text-[#0073D3] text-[11px]">{t.key}</div>
                      <div className="font-semibold text-[#162136] truncate">{t.title}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-[#E2E8F0]">
            <div className="text-[11px] text-[#64748B] font-mono">
              Topology Sync: <strong className="text-[#00B259]">LIVE REAL-TIME</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
