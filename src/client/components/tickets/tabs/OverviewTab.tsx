import React, { useState } from 'react';
import { Ticket } from '../../../../shared/types/ticket.js';
import { BankApplication, BankAsset } from '../../../../shared/types/asset.js';
import { Badge } from '../../common/Badge.js';
import { Shield, AlertTriangle, FileCode, CheckCircle, ExternalLink, Flame, Terminal, FileText, Copy, Check, Server, Globe } from 'lucide-react';

interface OverviewTabProps {
  ticket: Ticket;
  application?: BankApplication;
  asset?: BankAsset;
  cmdb?: Array<{ ci: any; relationship: string; impact: any }>;
  onOpenKB?: (slug: string) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  ticket,
  application,
  asset,
  cmdb = [],
  onOpenKB,
}) => {
  const finding = ticket.findingDetails;
  const incident = ticket.incidentDetails;
  const exception = ticket.exceptionDetails;
  const [copiedPoc, setCopiedPoc] = useState(false);

  const handleCopyPoc = () => {
    if (finding?.proofOfConcept) {
      navigator.clipboard.writeText(finding.proofOfConcept);
      setCopiedPoc(true);
      setTimeout(() => setCopiedPoc(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Description Card */}
      <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-5 shadow-xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-slate-400" />
          <span>Description</span>
        </h3>
        <div className="text-xs text-slate-800 leading-relaxed whitespace-pre-line font-normal bg-white p-4 rounded-lg border border-slate-200">
          {ticket.description || 'No description provided.'}
        </div>
      </div>

      {(ticket.resolutionCode || ticket.resolutionSummary) && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800">Resolution Outcome</h3>
          </div>
          <div className="mt-2 text-xs text-slate-800">
            <strong className="text-emerald-900 font-bold">{ticket.resolutionCode?.replaceAll('_', ' ') || 'Resolved'}</strong>
            {ticket.resolutionSummary && <p className="mt-1.5 whitespace-pre-line leading-relaxed text-slate-700">{ticket.resolutionSummary}</p>}
          </div>
        </div>
      )}

      {cmdb.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-5 shadow-xs">
          <div className="flex items-center gap-2"><Server className="h-4 w-4 text-blue-700" /><h3 className="text-xs font-bold uppercase tracking-wider text-blue-900">Affected Configuration Items &amp; Business Impact</h3></div>
          <div className="mt-3 space-y-2">{cmdb.map(({ ci, relationship, impact }) => <div key={ci.id} className="rounded-lg border border-blue-100 bg-white p-3 text-xs"><div className="font-bold text-slate-900">{ci.ciNumber} — {ci.name}</div><div className="mt-1 text-slate-600">{relationship.replaceAll('_', ' ')} · {ci.typeId} · {ci.environment} · {ci.criticality}</div><div className="mt-2 text-blue-800">Affected business services: {impact.affectedBusinessServices?.length || 0}; critical services: {impact.criticalServices?.length || 0}</div>{impact.affectedBusinessServices?.slice(0, 3).map((entry: any) => <div key={entry.ci.id} className="mt-1 font-mono text-[11px] text-slate-600">Impact path: {entry.path?.map((id: string) => id).join(' → ')}</div>)}</div>)}</div>
        </div>
      )}

      {/* Vulnerability Finding Specifics */}
      {finding && (
        <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-semantic-jira-brand" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Security Finding Analysis & Telemetry
              </h3>
            </div>
            {finding.scannerSource && (
              <span className="px-2.5 py-0.5 rounded-full bg-white text-slate-700 border border-slate-200 text-label font-mono font-medium shadow-xs">
                Source: {finding.scannerSource}
              </span>
            )}
          </div>

          {/* 4 KPI Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {finding.cweId && (
              <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs">
                <div className="text-slate-500 text-label font-medium">CWE ID</div>
                <div className="font-mono font-bold text-semantic-jira-brand text-sm mt-0.5">{finding.cweId}</div>
                <div className="text-label text-slate-500 truncate mt-0.5" title={finding.cweName}>{finding.cweName}</div>
              </div>
            )}
            {finding.cveId && (
              <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs">
                <div className="text-slate-500 text-label font-medium">CVE Identifier</div>
                <div className="font-mono font-bold text-rose-600 text-sm mt-0.5">{finding.cveId}</div>
                <div className="text-label text-slate-400 mt-0.5">National Vuln DB</div>
              </div>
            )}
            {finding.cvssScore && (
              <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs">
                <div className="text-slate-500 text-label font-medium">CVSS v3.1 Score</div>
                <div className="font-mono font-bold text-amber-600 text-sm mt-0.5">{finding.cvssScore} / 10.0</div>
                <div className="text-label text-slate-400 mt-0.5">Base Severity Metric</div>
              </div>
            )}
            {finding.owaspCategory && (
              <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs">
                <div className="text-slate-500 text-label font-medium">OWASP Top 10</div>
                <div className="font-bold text-slate-800 text-sm truncate mt-0.5" title={finding.owaspCategory}>{finding.owaspCategory}</div>
                <div className="text-label text-slate-400 mt-0.5">Application Security</div>
              </div>
            )}
          </div>

          {/* CVSS Vector */}
          {finding.cvssVector && (
            <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs font-mono flex items-center justify-between">
              <span className="text-slate-500 font-medium">CVSS Vector:</span>
              <span className="text-slate-900 font-bold">{finding.cvssVector}</span>
            </div>
          )}

          {/* Code Locus / Component */}
          {(finding.filePath || finding.endpoint) && (
            <div className="p-3.5 bg-white rounded-lg border border-slate-200 space-y-2 text-xs">
              {finding.filePath && (
                <div className="flex items-center gap-2">
                  <FileCode className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-slate-500 font-medium">File:</span>
                  <span className="font-mono text-slate-800 font-semibold truncate">{finding.filePath}:{finding.codeLine}</span>
                </div>
              )}
              {finding.endpoint && (
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-slate-500 font-medium">Endpoint:</span>
                  <span className="font-mono text-slate-800 font-semibold truncate">{finding.endpoint}</span>
                  {finding.httpParameter && <span className="text-slate-500 font-mono text-label">Param: [{finding.httpParameter}]</span>}
                </div>
              )}
            </div>
          )}

          {/* Proof of Concept */}
          {finding.proofOfConcept && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">Proof of Concept / Exploit Payload</div>
                <button
                  type="button"
                  onClick={handleCopyPoc}
                  className="flex items-center gap-1 text-label text-slate-500 hover:text-slate-800 font-semibold"
                >
                  {copiedPoc ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedPoc ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre className="p-3.5 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                {finding.proofOfConcept}
              </pre>
            </div>
          )}

          {/* Remediation Recommendation */}
          {finding.remediationRecommendation && (
            <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-lg space-y-1 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-blue-800">
                <CheckCircle className="w-3.5 h-3.5 text-blue-600" />
                <span>Remediation Guidance</span>
              </div>
              <p className="text-slate-800 leading-relaxed font-normal">{finding.remediationRecommendation}</p>
            </div>
          )}

          {/* Compensating Controls */}
          {finding.compensatingControls && (
            <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-lg space-y-1 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>Compensating Controls</span>
              </div>
              <p className="text-slate-800 leading-relaxed font-normal">{finding.compensatingControls}</p>
            </div>
          )}
        </div>
      )}

      {/* Incident Specifics */}
      {incident && (
        <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-rose-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Incident Response Telemetry & MITRE ATT&CK
              </h3>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-label font-mono font-bold">
              Type: {incident.incidentType}
            </span>
          </div>

          {/* MITRE Matrix Tags */}
          {incident.mitreAttack && incident.mitreAttack.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">MITRE ATT&CK Techniques</div>
              <div className="flex flex-wrap gap-2">
                {incident.mitreAttack.map((m: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-xs font-mono shadow-xs">
                    <span className="text-rose-600 font-bold">{m.techniqueId}</span>
                    <span className="text-slate-800 font-medium">{m.techniqueName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* IOCs */}
          <div className="p-4 bg-white rounded-lg border border-slate-200 space-y-2 text-xs">
            <div className="font-bold text-slate-700 uppercase tracking-wider text-label">Indicators of Compromise (IOCs)</div>
            {incident.iocs?.ipAddresses && incident.iocs.ipAddresses.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-slate-500 font-medium">Suspicious IPs:</span>
                <div className="flex flex-wrap gap-1.5">
                  {incident.iocs.ipAddresses.map((ip: string) => (
                    <span key={ip} className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-mono text-label font-semibold border border-rose-200">
                      {ip}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {incident.iocs?.urls && incident.iocs.urls.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium">Target URLs:</span>
                <span className="font-mono text-slate-800 text-label truncate">{incident.iocs.urls.join(', ')}</span>
              </div>
            )}
          </div>

          {/* Containment and Eradication */}
          {incident.containmentActions && (
            <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-1 text-xs">
              <div className="font-bold text-slate-800">Containment Measures</div>
              <p className="text-slate-600 leading-relaxed">{incident.containmentActions}</p>
            </div>
          )}
        </div>
      )}

      {/* Security Exception Specifics */}
      {exception && (
        <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Security Policy Exemption Details
              </h3>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-label font-mono font-bold">
              Control: {exception.requestedControlId}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-4 bg-white rounded-lg border border-slate-200">
              <div className="text-slate-500 font-bold uppercase tracking-wider text-label">Business Justification</div>
              <div className="text-slate-800 mt-1.5 leading-relaxed">{exception.businessJustification}</div>
            </div>
            <div className="p-4 bg-white rounded-lg border border-slate-200">
              <div className="text-slate-500 font-bold uppercase tracking-wider text-label">Compensating Controls</div>
              <div className="text-slate-800 mt-1.5 leading-relaxed">{exception.compensatingControls}</div>
            </div>
          </div>
        </div>
      )}

      {/* Linked Application and Asset Card */}
      {(application || asset) && (
        <div className="bg-slate-50/60 border border-slate-200 rounded-xl p-5 shadow-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-slate-400" />
            <span>Affected Infrastructure</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {application && (
              <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">{application.name}</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-mono text-caption font-bold border border-blue-200">{application.criticality}</span>
                </div>
                <div className="text-slate-500 text-label leading-relaxed">{application.description}</div>
                <div className="flex items-center gap-2 pt-1 text-label flex-wrap">
                  <span className="text-slate-500 font-medium">Tech Stack:</span>
                  <span className="font-mono text-slate-800 font-medium">{application.techStack.join(', ')}</span>
                </div>
              </div>
            )}
            {asset && (
              <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 font-mono">{asset.name}</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono text-caption font-bold border border-slate-200">{asset.assetType}</span>
                </div>
                <div className="text-slate-600 font-mono text-label">IP: {asset.ipAddress || 'Internal'} · Host: {asset.hostname}</div>
                <div className="text-caption text-slate-400">CMDB Ref: {asset.cmdbId}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
