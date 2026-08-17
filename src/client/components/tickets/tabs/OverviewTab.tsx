import React from 'react';
import { Ticket } from '../../../shared/types/ticket.js';
import { BankApplication, BankAsset } from '../../../shared/types/asset.js';
import { Badge } from '../../common/Badge.js';
import { Shield, AlertTriangle, FileCode, CheckCircle, ExternalLink, Flame, Terminal, FileText } from 'lucide-react';

interface OverviewTabProps {
  ticket: Ticket;
  application?: BankApplication;
  asset?: BankAsset;
  onOpenKB?: (slug: string) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  ticket,
  application,
  asset,
  onOpenKB,
}) => {
  const finding = ticket.findingDetails;
  const incident = ticket.incidentDetails;
  const exception = ticket.exceptionDetails;

  return (
    <div className="space-y-6">
      {/* Description Card */}
      <div className="bg-bank-900 border border-slate-800 rounded-xl p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Description</h3>
        <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-line font-normal">
          {ticket.description}
        </div>
      </div>

      {/* Vulnerability Finding Specifics */}
      {finding && (
        <div className="bg-bank-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Security Finding Analysis & Telemetry
              </h3>
            </div>
            {finding.scannerSource && (
              <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 text-xs font-mono font-semibold">
                Source: {finding.scannerSource}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            {finding.cweId && (
              <div className="p-2.5 bg-bank-950 rounded-lg border border-slate-800">
                <div className="text-slate-400 font-medium">CWE ID</div>
                <div className="font-mono font-bold text-blue-400 text-sm mt-0.5">{finding.cweId}</div>
                <div className="text-[11px] text-slate-400 truncate mt-0.5">{finding.cweName}</div>
              </div>
            )}
            {finding.cveId && (
              <div className="p-2.5 bg-bank-950 rounded-lg border border-slate-800">
                <div className="text-slate-400 font-medium">CVE Identifier</div>
                <div className="font-mono font-bold text-red-400 text-sm mt-0.5">{finding.cveId}</div>
              </div>
            )}
            {finding.cvssScore && (
              <div className="p-2.5 bg-bank-950 rounded-lg border border-slate-800">
                <div className="text-slate-400 font-medium">CVSS v3.1 Score</div>
                <div className="font-mono font-bold text-amber-400 text-sm mt-0.5">{finding.cvssScore} / 10.0</div>
              </div>
            )}
            {finding.owaspCategory && (
              <div className="p-2.5 bg-bank-950 rounded-lg border border-slate-800">
                <div className="text-slate-400 font-medium">OWASP Top 10</div>
                <div className="font-semibold text-slate-200 truncate mt-0.5">{finding.owaspCategory}</div>
              </div>
            )}
          </div>

          {/* CVSS Vector */}
          {finding.cvssVector && (
            <div className="p-3 bg-bank-950 rounded-lg border border-slate-800 text-xs font-mono">
              <span className="text-slate-400">CVSS Vector: </span>
              <span className="text-slate-200 font-bold">{finding.cvssVector}</span>
            </div>
          )}

          {/* Code Locus / Component */}
          {(finding.filePath || finding.endpoint) && (
            <div className="p-3 bg-bank-950 rounded-lg border border-slate-800 space-y-2 text-xs">
              {finding.filePath && (
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="text-slate-400">File:</span>
                  <span className="font-mono text-slate-200 truncate">{finding.filePath}:{finding.codeLine}</span>
                </div>
              )}
              {finding.endpoint && (
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="text-slate-400">Endpoint:</span>
                  <span className="font-mono text-cyan-300 truncate">{finding.endpoint}</span>
                  {finding.httpParameter && <span className="text-slate-400">Param: [{finding.httpParameter}]</span>}
                </div>
              )}
            </div>
          )}

          {/* Proof of Concept */}
          {finding.proofOfConcept && (
            <div className="space-y-1.5">
              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">Proof of Concept / Exploit Payload</div>
              <pre className="p-3 bg-bank-950 border border-slate-800 rounded-lg text-xs font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap">
                {finding.proofOfConcept}
              </pre>
            </div>
          )}

          {/* Remediation Recommendation */}
          {finding.remediationRecommendation && (
            <div className="p-3 bg-blue-950/30 border border-blue-900/60 rounded-lg space-y-1 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-blue-400">
                <CheckCircle className="w-4 h-4" />
                <span>Standard Remediation Guidance</span>
              </div>
              <p className="text-slate-300 leading-relaxed">{finding.remediationRecommendation}</p>
            </div>
          )}

          {/* Compensating Controls */}
          {finding.compensatingControls && (
            <div className="p-3 bg-amber-950/20 border border-amber-900/60 rounded-lg space-y-1 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                <span>Active Compensating Controls</span>
              </div>
              <p className="text-slate-300 leading-relaxed">{finding.compensatingControls}</p>
            </div>
          )}
        </div>
      )}

      {/* Incident Specifics */}
      {incident && (
        <div className="bg-bank-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-red-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Incident Response Telemetry & MITRE ATT&CK
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800 text-xs font-mono font-semibold">
              Type: {incident.incidentType}
            </span>
          </div>

          {/* MITRE Matrix Tags */}
          {incident.mitreAttack && incident.mitreAttack.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">MITRE ATT&CK Techniques</div>
              <div className="flex flex-wrap gap-2">
                {incident.mitreAttack.map((m, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-bank-950 border border-slate-700 text-xs font-mono">
                    <span className="text-red-400 font-bold">{m.techniqueId}</span>
                    <span className="text-slate-300">{m.techniqueName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* IOCs */}
          <div className="p-3 bg-bank-950 rounded-lg border border-slate-800 space-y-2 text-xs">
            <div className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">Indicators of Compromise (IOCs)</div>
            {incident.iocs?.ipAddresses && incident.iocs.ipAddresses.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Suspicious IPs:</span>
                <div className="flex flex-wrap gap-1">
                  {incident.iocs.ipAddresses.map((ip) => (
                    <span key={ip} className="px-1.5 py-0.5 rounded bg-slate-800 text-red-300 font-mono text-[11px] border border-slate-700">
                      {ip}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {incident.iocs?.urls && incident.iocs.urls.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Target URLs:</span>
                <span className="font-mono text-cyan-300 text-[11px] truncate">{incident.iocs.urls.join(', ')}</span>
              </div>
            )}
          </div>

          {/* Containment and Eradication */}
          {incident.containmentActions && (
            <div className="p-3 bg-purple-950/20 border border-purple-900/60 rounded-lg space-y-1 text-xs">
              <div className="font-bold text-purple-400">Active Containment Measures</div>
              <p className="text-slate-300 leading-relaxed">{incident.containmentActions}</p>
            </div>
          )}
        </div>
      )}

      {/* Security Exception Specifics */}
      {exception && (
        <div className="bg-bank-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Security Policy Exemption Details
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 text-xs font-mono font-semibold">
              Control: {exception.requestedControlId}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-bank-950 rounded-lg border border-slate-800">
              <div className="text-slate-400 font-medium">Business Justification</div>
              <div className="text-slate-200 mt-1">{exception.businessJustification}</div>
            </div>
            <div className="p-3 bg-bank-950 rounded-lg border border-slate-800">
              <div className="text-slate-400 font-medium">Compensating Controls</div>
              <div className="text-slate-200 mt-1">{exception.compensatingControls}</div>
            </div>
          </div>
        </div>
      )}

      {/* Linked Application and Asset Card */}
      {(application || asset) && (
        <div className="bg-bank-900 border border-slate-800 rounded-xl p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Affected Banking Infrastructure</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {application && (
              <div className="p-3 bg-bank-950 border border-slate-800 rounded-lg space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{application.name}</span>
                  <span className="px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 font-mono text-[10px]">{application.criticality}</span>
                </div>
                <div className="text-slate-400 text-[11px]">{application.description}</div>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] text-slate-500">Tech Stack:</span>
                  <span className="text-[10px] font-mono text-slate-300">{application.techStack.join(', ')}</span>
                </div>
              </div>
            )}
            {asset && (
              <div className="p-3 bg-bank-950 border border-slate-800 rounded-lg space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white font-mono">{asset.name}</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">{asset.assetType}</span>
                </div>
                <div className="text-slate-400 font-mono text-[11px]">IP: {asset.ipAddress || 'Internal'} | Host: {asset.hostname}</div>
                <div className="text-[10px] text-slate-500">CMDB Ref: {asset.cmdbId}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
