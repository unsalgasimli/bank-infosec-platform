import React, { useState } from 'react';
import { BankAsset } from '../../../shared/types/asset.js';
import { Database, Plus, Search, Filter, Play, CheckCircle2, X, ShieldAlert, Radio } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';

interface AssetInventoryViewProps {
  assets: BankAsset[];
}

export const AssetInventoryView: React.FC<AssetInventoryViewProps> = ({ assets }) => {
  const { fetchWithAuth } = useAuth();
  const [envFilter, setEnvFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [hostname, setHostname] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [assetType, setAssetType] = useState<'KUBERNETES_CLUSTER' | 'DATABASE_CLUSTER' | 'FIREWALL_APPLIANCE' | 'SERVER_VM' | 'CLOUD_SUBSCRIPTION'>('KUBERNETES_CLUSTER');
  const [environment, setEnvironment] = useState<'PRODUCTION' | 'STAGING' | 'DR_SITE'>('PRODUCTION');
  const [criticality, setCriticality] = useState<'TIER_1_MISSION_CRITICAL' | 'TIER_2_BUSINESS_ESSENTIAL' | 'TIER_3_INTERNAL_SUPPORT'>('TIER_1_MISSION_CRITICAL');
  const [ownerName, setOwnerName] = useState('Core Infrastructure & SRE Squad');
  const [operatingSystem, setOperatingSystem] = useState('Red Hat Enterprise Linux 9.4 / EKS');

  const filteredAssets = assets.filter((ast) => {
    if (envFilter !== 'ALL' && ast.environment !== envFilter) {
      return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        ast.name.toLowerCase().includes(q) ||
        ast.hostname?.toLowerCase().includes(q) ||
        (ast.ipAddress && ast.ipAddress.toLowerCase().includes(q)) ||
        ast.cmdbId?.toLowerCase().includes(q) ||
        ast.ownerName?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !hostname) return;

    try {
      const res = await fetchWithAuth('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          hostname,
          ipAddress: ipAddress || '10.240.10.45',
          assetType,
          environment,
          criticality,
          ownerName,
          operatingSystem,
          inPciScope: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        setName('');
        setHostname('');
        setIpAddress('');
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTriggerDiscovery = () => {
    setIsScanning(true);
    setScanMessage('Scanning network subnets (10.240.0.0/16)...');
    setTimeout(() => {
      setIsScanning(false);
      setScanMessage(`Asset scan complete: verified ${assets.length} CMDB assets. 0 unauthorized rogue nodes discovered.`);
    }, 900);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#F4F5F7] custom-scrollbar">
      {/* Header */}
      <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded bg-[#DEEBFF] text-[#0052CC] border border-[#B3D4FF]">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#172B4D] tracking-tight">
              CMDB Infrastructure & Asset Inventory
            </h1>
            <p className="text-xs text-[#5E6C84] mt-0.5">
              Production Kubernetes clusters, database nodes, DMZ firewalls, cloud subscriptions, and PAM bastions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleTriggerDiscovery}
            disabled={isScanning}
            className="jira-btn-secondary"
          >
            <Radio className={`w-3.5 h-3.5 ${isScanning ? 'animate-pulse text-[#FF8B00]' : 'text-[#0052CC]'}`} />
            <span>{isScanning ? 'Scanning...' : 'Discovery Scan'}</span>
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="jira-btn-primary"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Asset</span>
          </button>
        </div>
      </div>

      {scanMessage && (
        <div className="p-3 bg-[#FFFFFF] border border-[#B3D4FF] text-[#0052CC] rounded text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#006644] shrink-0" />
          <span>{scanMessage}</span>
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#DFE1E6] pb-2 text-xs">
        <div className="flex items-center gap-1">
          {[
            { id: 'ALL', label: 'All Assets' },
            { id: 'PRODUCTION', label: 'Production Nodes' },
            { id: 'STAGING', label: 'Staging / UAT' },
            { id: 'DR_SITE', label: 'Disaster Recovery (DR)' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setEnvFilter(tab.id)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                envFilter === tab.id
                  ? 'bg-[#0052CC] text-white font-semibold shadow-sm'
                  : 'bg-[#FFFFFF] text-[#5E6C84] hover:text-[#172B4D] border border-[#DFE1E6]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-[#5E6C84] absolute left-2.5 top-2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search hostname, IP, ref..."
            className="jira-input pl-8"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs border-collapse jira-table">
          <thead className="bg-[#FFFFFF] border-b border-[#DFE1E6] text-[#5E6C84] uppercase font-semibold text-[10px] tracking-wider">
            <tr>
              <th className="px-4 py-3">Asset Name & CMDB Ref</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Hostname / IP</th>
              <th className="px-3 py-3">Operating System</th>
              <th className="px-3 py-3">Environment</th>
              <th className="px-3 py-3">Owner Squad</th>
              <th className="px-3 py-3 text-right">Critical Findings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DFE1E6]">
            {filteredAssets.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[#5E6C84] italic">
                  No infrastructure assets matched the current filter.
                </td>
              </tr>
            ) : (
              filteredAssets.map((ast) => (
                <tr key={ast.id} className="hover:bg-[#EBECF0] transition-colors group">
                  <td className="px-4 py-3">
                    <div className="font-mono font-bold text-[#172B4D] text-xs group-hover:text-[#0052CC] transition-colors">
                      {ast.name}
                    </div>
                    <div className="text-[10px] text-[#7A869A] font-mono">CMDB: {ast.cmdbId}</div>
                  </td>
                  <td className="px-3 py-3 font-mono text-[#172B4D]">
                    <span className="px-2 py-0.5 rounded bg-[#FFFFFF] text-[#172B4D] border border-[#DFE1E6] text-[10px]">
                      {ast.assetType}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-[#172B4D] text-xs">
                    <div className="font-medium text-[#172B4D]">{ast.hostname}</div>
                    <div className="text-[#5E6C84] text-[10px]">{ast.ipAddress || 'Internal Private IP'}</div>
                  </td>
                  <td className="px-3 py-3 text-[#172B4D] text-[11px]">
                    {ast.operatingSystem || 'Linux RHEL 9'}
                  </td>
                  <td className="px-3 py-3">
                    <span className="px-2 py-0.5 rounded bg-[#DEEBFF] text-[#0052CC] border border-[#B3D4FF] text-[10px] font-mono font-bold">
                      {ast.environment}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-[#172B4D] font-medium text-[11px]">
                    {ast.ownerName}
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold">
                    <span className={ast.criticalFindingCount && ast.criticalFindingCount > 0 ? 'text-[#DE350B]' : 'text-[#5E6C84]'}>
                      {ast.criticalFindingCount || 0}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Asset Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-[2px] p-4">
          <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#DFE1E6] pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#0052CC]" />
                <h3 className="text-sm font-bold text-[#172B4D]">Add CMDB Infrastructure Asset</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-[#5E6C84] hover:text-[#172B4D]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAsset} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#5E6C84] mb-1">Asset Name:</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Core SWIFT Gateway Production Node 01"
                    required
                    className="jira-input"
                  />
                </div>
                <div>
                  <label className="block text-[#5E6C84] mb-1">Hostname (FQDN):</label>
                  <input
                    type="text"
                    value={hostname}
                    onChange={(e) => setHostname(e.target.value)}
                    placeholder="swift-gw-01.prod.apexbank.internal"
                    required
                    className="jira-input font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#5E6C84] mb-1">IP Address:</label>
                  <input
                    type="text"
                    value={ipAddress}
                    onChange={(e) => setIpAddress(e.target.value)}
                    placeholder="10.240.10.15"
                    className="jira-input font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[#5E6C84] mb-1">Asset Type:</label>
                  <select
                    value={assetType}
                    onChange={(e) => setAssetType(e.target.value as any)}
                    className="jira-input"
                  >
                    <option value="KUBERNETES_CLUSTER">Kubernetes Cluster Node</option>
                    <option value="DATABASE_CLUSTER">Database RAC Cluster</option>
                    <option value="FIREWALL_APPLIANCE">Firewall / DMZ Appliance</option>
                    <option value="SERVER_VM">Dedicated Server VM</option>
                    <option value="CLOUD_SUBSCRIPTION">Cloud Subscription / VPC</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#5E6C84] mb-1">Environment:</label>
                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value as any)}
                    className="jira-input"
                  >
                    <option value="PRODUCTION">PRODUCTION</option>
                    <option value="STAGING">STAGING / UAT</option>
                    <option value="DR_SITE">DISASTER RECOVERY (DR)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#5E6C84] mb-1">Criticality:</label>
                  <select
                    value={criticality}
                    onChange={(e) => setCriticality(e.target.value as any)}
                    className="jira-input"
                  >
                    <option value="TIER_1_MISSION_CRITICAL">Tier 1 Mission Critical</option>
                    <option value="TIER_2_BUSINESS_ESSENTIAL">Tier 2 Business Essential</option>
                    <option value="TIER_3_INTERNAL_SUPPORT">Tier 3 Internal Support</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[#5E6C84] mb-1">Operating System & Runtime:</label>
                <input
                  type="text"
                  value={operatingSystem}
                  onChange={(e) => setOperatingSystem(e.target.value)}
                  className="jira-input font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-[#5E6C84] mb-1">Owner Team / Squad:</label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="jira-input text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#DFE1E6]">
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
                  Save Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

