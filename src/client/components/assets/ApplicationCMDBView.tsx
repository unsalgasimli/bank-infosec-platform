import React, { useState } from 'react';
import { BankApplication } from '../../../shared/types/asset.js';
import { Server, Bug, Plus, Search, Filter, Globe, Database, GitBranch, X, ShieldAlert } from 'lucide-react';
import { Badge } from '../common/Badge.js';
import { useAuth } from '../../context/AuthContext.js';

interface ApplicationCMDBViewProps {
  applications: BankApplication[];
}

export const ApplicationCMDBView: React.FC<ApplicationCMDBViewProps> = ({ applications }) => {
  const { fetchWithAuth } = useAuth();
  const [criticalityFilter, setCriticalityFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Modal form state
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [criticality, setCriticality] = useState<'TIER_1_MISSION_CRITICAL' | 'TIER_2_BUSINESS_ESSENTIAL' | 'TIER_3_INTERNAL_SUPPORT'>('TIER_1_MISSION_CRITICAL');
  const [dataClassification, setDataClassification] = useState<'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'HIGHLY_RESTRICTED_HR_LEGAL'>('CONFIDENTIAL');
  const [techStack, setTechStack] = useState('Java 21 Spring Boot, React, Kafka');
  const [databases, setDatabases] = useState('Oracle 19c RAC, Redis Cluster');
  const [gitRepos, setGitRepos] = useState('github.com/apexbank/core-service');
  const [internetExposed, setInternetExposed] = useState(false);

  const filteredApps = applications.filter((app) => {
    if (criticalityFilter !== 'ALL' && app.criticality !== criticalityFilter) {
      return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        app.name.toLowerCase().includes(q) ||
        app.code.toLowerCase().includes(q) ||
        app.description.toLowerCase().includes(q) ||
        app.techStack.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleCreateApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !code) return;

    try {
      const res = await fetchWithAuth('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          code: code.toUpperCase(),
          description,
          criticality,
          dataClassification,
          techStack: techStack.split(',').map((s) => s.trim()),
          connectedDatabases: databases.split(',').map((s) => s.trim()),
          gitRepositories: gitRepos.split(',').map((s) => s.trim()),
          internetExposed,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        setName('');
        setCode('');
        setDescription('');
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-semantic-jira-surface custom-scrollbar">
      {/* Header */}
      <div className="bg-semantic-panel border border-semantic-jira-border rounded-md p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded bg-semantic-jira-brand-surface text-semantic-jira-brand border border-semantic-jira-info-border">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-semantic-jira-primary tracking-tight">
              Application & Service Inventory (CMDB)
            </h1>
            <p className="text-xs text-semantic-jira-muted mt-0.5">
              Banking switches, mobile APIs, payment gateways, git repositories, and active vulnerability postures.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="px-3 py-1 bg-semantic-jira-brand-surface text-semantic-jira-brand border border-semantic-jira-info-border rounded font-mono text-xs font-bold">
            {applications.length} Applications
          </span>
          <button
            onClick={() => setIsModalOpen(true)}
            className="jira-btn-primary"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Register Application</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-semantic-jira-border pb-2 text-xs">
        <div className="flex items-center gap-1">
          {[
            { id: 'ALL', label: 'All Applications' },
            { id: 'TIER_1_MISSION_CRITICAL', label: 'Tier 1 (Mission Critical)' },
            { id: 'TIER_2_BUSINESS_ESSENTIAL', label: 'Tier 2 (Essential)' },
            { id: 'TIER_3_INTERNAL_SUPPORT', label: 'Tier 3 (Internal)' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCriticalityFilter(tab.id)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                criticalityFilter === tab.id
                  ? 'bg-semantic-jira-brand text-white font-semibold shadow-sm'
                  : 'bg-semantic-panel text-semantic-jira-muted hover:text-semantic-jira-primary border border-semantic-jira-border'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-semantic-jira-muted absolute left-2.5 top-2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code, name, tech..."
            className="jira-input pl-8"
          />
        </div>
      </div>

      {/* Application Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {filteredApps.length === 0 ? (
          <div className="col-span-2 py-16 text-center text-semantic-jira-muted text-xs italic bg-semantic-panel rounded-md border border-semantic-jira-border">
            No banking applications found matching this filter.
          </div>
        ) : (
          filteredApps.map((app) => (
            <div
              key={app.id}
              className="p-5 bg-semantic-panel border border-semantic-jira-border rounded-md space-y-3 hover:border-semantic-jira-brand transition-colors shadow-sm group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-semantic-jira-brand text-xs group-hover:underline">{app.code}</span>
                  <span className="px-2 py-0.5 rounded bg-semantic-panel text-semantic-jira-muted border border-semantic-jira-border text-caption font-mono font-semibold">
                    {app.criticality.replace(/_/g, ' ')}
                  </span>
                </div>
                <Badge type="CONFIDENTIALITY" value={app.dataClassification} size="sm" />
              </div>

              <h3 className="text-sm font-bold text-semantic-jira-primary group-hover:text-semantic-jira-brand">{app.name}</h3>
              <p className="text-xs text-semantic-jira-muted leading-relaxed line-clamp-2">{app.description}</p>

              <div className="p-3 bg-semantic-panel rounded border border-semantic-jira-border space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-semantic-jira-muted text-label font-medium">Tech Stack:</span>
                  <span className="font-mono text-semantic-jira-primary text-label truncate">{app.techStack.join(', ')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-semantic-jira-muted text-label font-medium">Databases:</span>
                  <span className="font-mono text-semantic-jira-primary text-label truncate">{app.connectedDatabases.join(', ')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-semantic-jira-muted text-label font-medium">Git Repos:</span>
                  <span className="font-mono text-semantic-jira-brand text-label truncate">{app.gitRepositories.join(', ')}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-semantic-jira-border text-xs text-semantic-jira-muted">
                <span className="flex items-center gap-1.5">
                  <Bug className="w-3.5 h-3.5 text-semantic-danger-strong" />
                  <span>Open Findings: <strong className="text-semantic-jira-primary font-mono">{app.openVulnerabilitiesCount}</strong></span>
                </span>
                <span className="flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-semantic-jira-muted" />
                  <span>Internet Exposed: <strong className={app.internetExposed ? 'text-semantic-warning-bright' : 'text-semantic-jira-primary'}>{app.internetExposed ? 'YES (DMZ Ingress)' : 'NO (Internal Only)'}</strong></span>
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Register App Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-dsDialog flex items-center justify-center bg-black/65 backdrop-blur-[2px] p-4">
          <div className="bg-semantic-panel border border-semantic-jira-border rounded-md max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-semantic-jira-border pb-3">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-semantic-jira-brand" />
                <h3 className="text-sm font-bold text-semantic-jira-primary">Register Banking Application</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-semantic-jira-muted hover:text-semantic-jira-primary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateApp} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-semantic-jira-muted mb-1">Application Name:</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Apex Corporate Treasury Portal"
                    required
                    className="jira-input"
                  />
                </div>
                <div>
                  <label className="block text-semantic-jira-muted mb-1">Application Code:</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="APP-TREASURY"
                    required
                    className="jira-input font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-semantic-jira-muted mb-1">Description & Business Purpose:</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Handles corporate liquidity management and wire dispatch..."
                  rows={2}
                  className="jira-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-semantic-jira-muted mb-1">Tier Criticality:</label>
                  <select
                    value={criticality}
                    onChange={(e) => setCriticality(e.target.value as any)}
                    className="jira-input"
                  >
                    <option value="TIER_1_MISSION_CRITICAL">Tier 1 (Mission Critical / RTO 15m)</option>
                    <option value="TIER_2_BUSINESS_ESSENTIAL">Tier 2 (Business Essential / RTO 2h)</option>
                    <option value="TIER_3_INTERNAL_SUPPORT">Tier 3 (Internal Support)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-semantic-jira-muted mb-1">Data Classification:</label>
                  <select
                    value={dataClassification}
                    onChange={(e) => setDataClassification(e.target.value as any)}
                    className="jira-input"
                  >
                    <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                    <option value="HIGHLY_RESTRICTED_HR_LEGAL">RESTRICTED PII / LEGAL</option>
                    <option value="INTERNAL">INTERNAL</option>
                    <option value="PUBLIC">PUBLIC</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-semantic-jira-muted mb-1">Tech Stack (comma separated):</label>
                <input
                  type="text"
                  value={techStack}
                  onChange={(e) => setTechStack(e.target.value)}
                  className="jira-input font-mono"
                />
              </div>

              <div>
                <label className="block text-semantic-jira-muted mb-1">Databases (comma separated):</label>
                <input
                  type="text"
                  value={databases}
                  onChange={(e) => setDatabases(e.target.value)}
                  className="jira-input font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="internetExposed"
                  checked={internetExposed}
                  onChange={(e) => setInternetExposed(e.target.checked)}
                  className="rounded border-semantic-jira-border bg-semantic-panel text-semantic-jira-brand focus:ring-0"
                />
                <label htmlFor="internetExposed" className="text-semantic-jira-primary font-medium">
                  Internet Exposed (Accessible from Public DMZ / Internet)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-semantic-jira-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="jira-btn-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="jira-btn-primary"
                >
                  Register Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

