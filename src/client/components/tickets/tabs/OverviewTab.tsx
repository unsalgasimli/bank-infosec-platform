import React from 'react';
import { Ticket } from '../../../../shared/types/ticket.js';
import { BankApplication, BankAsset } from '../../../../shared/types/asset.js';
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
    <div className="space-y-5">
      {/* Description Card */}
      <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-4 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#5E6C84] mb-2">Description</h3>
        <div className="text-xs text-[#172B4D] leading-relaxed whitespace-pre-line font-normal">
          {ticket.description}
        </div>
      </div>

      {/* Vulnerability Finding Specifics */}
      {finding && (
        <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#DFE1E6] pb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#0052CC]" />
              <h3 className="text-xs font-bold text-[#172B4D] uppercase tracking-wider">
                Security Finding Analysis & Telemetry
              </h3>
            </div>
            {finding.scannerSource && (
              <span className="px-2 py-0.5 rounded bg-[#FFFFFF] text-[#172B4D] border border-[#DFE1E6] text-[11px] font-mono">
                Source: {finding.scannerSource}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {finding.cweId && (
              <div className="p-2.5 bg-[#FFFFFF] rounded border border-[#DFE1E6]">
                <div className="text-[#5E6C84] text-[11px]">CWE ID</div>
                <div className="font-mono font-semibold text-[#0052CC] text-xs mt-0.5">{finding.cweId}</div>
                <div className="text-[11px] text-[#5E6C84] truncate mt-0.5">{finding.cweName}</div>
              </div>
            )}
            {finding.cveId && (
              <div className="p-2.5 bg-[#FFFFFF] rounded border border-[#DFE1E6]">
                <div className="text-[#5E6C84] text-[11px]">CVE Identifier</div>
                <div className="font-mono font-semibold text-[#DE350B] text-xs mt-0.5">{finding.cveId}</div>
              </div>
            )}
            {finding.cvssScore && (
              <div className="p-2.5 bg-[#FFFFFF] rounded border border-[#DFE1E6]">
                <div className="text-[#5E6C84] text-[11px]">CVSS v3.1 Score</div>
                <div className="font-mono font-semibold text-[#FF8B00] text-xs mt-0.5">{finding.cvssScore} / 10.0</div>
              </div>
            )}
            {finding.owaspCategory && (
              <div className="p-2.5 bg-[#FFFFFF] rounded border border-[#DFE1E6]">
                <div className="text-[#5E6C84] text-[11px]">OWASP Top 10</div>
                <div className="font-medium text-[#172B4D] truncate mt-0.5">{finding.owaspCategory}</div>
              </div>
            )}
          </div>

          {/* CVSS Vector */}
          {finding.cvssVector && (
            <div className="p-2.5 bg-[#FFFFFF] rounded border border-[#DFE1E6] text-xs font-mono">
              <span className="text-[#5E6C84]">CVSS Vector: </span>
              <span className="text-[#172B4D] font-semibold">{finding.cvssVector}</span>
            </div>
          )}

          {/* Code Locus / Component */}
          {(finding.filePath || finding.endpoint) && (
            <div className="p-3 bg-[#FFFFFF] rounded border border-[#DFE1E6] space-y-1.5 text-xs">
              {finding.filePath && (
                <div className="flex items-center gap-2">
                  <FileCode className="w-3.5 h-3.5 text-[#5E6C84] shrink-0" />
                  <span className="text-[#5E6C84]">File:</span>
                  <span className="font-mono text-[#172B4D] truncate">{finding.filePath}:{finding.codeLine}</span>
                </div>
              )}
              {finding.endpoint && (
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-[#5E6C84] shrink-0" />
                  <span className="text-[#5E6C84]">Endpoint:</span>
                  <span className="font-mono text-[#172B4D] truncate">{finding.endpoint}</span>
                  {finding.httpParameter && <span className="text-[#5E6C84]">Param: [{finding.httpParameter}]</span>}
                </div>
              )}
            </div>
          )}

          {/* Proof of Concept */}
          {finding.proofOfConcept && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-[#5E6C84] uppercase tracking-wider">Proof of Concept / Exploit Payload</div>
              <pre className="p-3 bg-[#FFFFFF] border border-[#DFE1E6] rounded text-xs font-mono text-[#172B4D] overflow-x-auto whitespace-pre-wrap">
                {finding.proofOfConcept}
              </pre>
            </div>
          )}

          {/* Remediation Recommendation */}
          {finding.remediationRecommendation && (
            <div className="p-3 bg-[#DEEBFF] border border-[#B3D4FF] rounded space-y-1 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-[#0052CC]">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Remediation Guidance</span>
              </div>
              <p className="text-[#172B4D] leading-relaxed">{finding.remediationRecommendation}</p>
            </div>
          )}

          {/* Compensating Controls */}
          {finding.compensatingControls && (
            <div className="p-3 bg-[#FFFAE6] border border-[#FFE380] rounded space-y-1 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-[#FF8B00]">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Compensating Controls</span>
              </div>
              <p className="text-[#172B4D] leading-relaxed">{finding.compensatingControls}</p>
            </div>
          )}
        </div>
      )}

      {/* Incident Specifics */}
      {incident && (
        <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#DFE1E6] pb-3">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-[#DE350B]" />
              <h3 className="text-xs font-bold text-[#172B4D] uppercase tracking-wider">
                Incident Response Telemetry & MITRE ATT&CK
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded bg-[#FFEBE6] text-[#DE350B] border border-[#FFBDAD] text-[11px] font-mono">
              Type: {incident.incidentType}
            </span>
          </div>

          {/* MITRE Matrix Tags */}
          {incident.mitreAttack && incident.mitreAttack.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-[#5E6C84] uppercase tracking-wider">MITRE ATT&CK Techniques</div>
              <div className="flex flex-wrap gap-1.5">
                {incident.mitreAttack.map((m: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#FFFFFF] border border-[#DFE1E6] text-xs font-mono">
                    <span className="text-[#DE350B] font-semibold">{m.techniqueId}</span>
                    <span className="text-[#172B4D]">{m.techniqueName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* IOCs */}
          <div className="p-3 bg-[#FFFFFF] rounded border border-[#DFE1E6] space-y-2 text-xs">
            <div className="font-semibold text-[#5E6C84] uppercase tracking-wider text-[11px]">Indicators of Compromise (IOCs)</div>
            {incident.iocs?.ipAddresses && incident.iocs.ipAddresses.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[#5E6C84]">Suspicious IPs:</span>
                <div className="flex flex-wrap gap-1">
                  {incident.iocs.ipAddresses.map((ip: string) => (
                    <span key={ip} className="px-1.5 py-0.5 rounded bg-[#FFFFFF] text-[#DE350B] font-mono text-[11px] border border-[#DFE1E6]">
                      {ip}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {incident.iocs?.urls && incident.iocs.urls.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[#5E6C84]">Target URLs:</span>
                <span className="font-mono text-[#172B4D] text-[11px] truncate">{incident.iocs.urls.join(', ')}</span>
              </div>
            )}
          </div>

          {/* Containment and Eradication */}
          {incident.containmentActions && (
            <div className="p-3 bg-[#FFFFFF] border border-[#DFE1E6] rounded space-y-1 text-xs">
              <div className="font-semibold text-[#172B4D]">Containment Measures</div>
              <p className="text-[#5E6C84] leading-relaxed">{incident.containmentActions}</p>
            </div>
          )}
        </div>
      )}

      {/* Security Exception Specifics */}
      {exception && (
        <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#DFE1E6] pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#FF8B00]" />
              <h3 className="text-xs font-bold text-[#172B4D] uppercase tracking-wider">
                Security Policy Exemption Details
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded bg-[#FFFAE6] text-[#FF8B00] border border-[#FFE380] text-[11px] font-mono">
              Control: {exception.requestedControlId}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-[#FFFFFF] rounded border border-[#DFE1E6]">
              <div className="text-[#5E6C84] font-semibold">Business Justification</div>
              <div className="text-[#172B4D] mt-1">{exception.businessJustification}</div>
            </div>
            <div className="p-3 bg-[#FFFFFF] rounded border border-[#DFE1E6]">
              <div className="text-[#5E6C84] font-semibold">Compensating Controls</div>
              <div className="text-[#172B4D] mt-1">{exception.compensatingControls}</div>
            </div>
          </div>
        </div>
      )}

      {/* Linked Application and Asset Card */}
      {(application || asset) && (
        <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-4 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#5E6C84] mb-2.5">Affected Infrastructure</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {application && (
              <div className="p-3 bg-[#FFFFFF] border border-[#DFE1E6] rounded space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#172B4D]">{application.name}</span>
                  <span className="px-1.5 py-0.5 rounded bg-[#FFFFFF] text-[#0052CC] font-mono text-[10px]">{application.criticality}</span>
                </div>
                <div className="text-[#5E6C84] text-[11px]">{application.description}</div>
                <div className="flex items-center gap-2 pt-1 text-[11px]">
                  <span className="text-[#5E6C84]">Tech Stack:</span>
                  <span className="font-mono text-[#172B4D]">{application.techStack.join(', ')}</span>
                </div>
              </div>
            )}
            {asset && (
              <div className="p-3 bg-[#FFFFFF] border border-[#DFE1E6] rounded space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#172B4D] font-mono">{asset.name}</span>
                  <span className="px-1.5 py-0.5 rounded bg-[#FFFFFF] text-[#172B4D] font-mono text-[10px]">{asset.assetType}</span>
                </div>
                <div className="text-[#5E6C84] font-mono text-[11px]">IP: {asset.ipAddress || 'Internal'} | Host: {asset.hostname}</div>
                <div className="text-[10px] text-[#7A869A]">CMDB Ref: {asset.cmdbId}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

