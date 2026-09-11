import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Network,
  Plus,
  Send,
  ShieldCheck,
  ShieldAlert,
  Shield,
  Lock,
  Download,
  FileCheck,
  Cpu,
  Layers,
  Clock,
  Check,
  XCircle,
  FileText,
  History,
  Info
} from 'lucide-react';
import { Badge } from '../common/Badge.js';
import { useI18n } from '../../context/I18nContext.js';
import { ThreatModelGovernanceEditor } from './ThreatModelGovernanceEditor.js';

export type ThreatModelSummary = {
  id: string;
  key: string;
  title: string;
  criticality: string;
  dataClassification: string;
  status: string;
  changeId?: string;
  releaseId?: string;
  revisionNumber?: number;
  tier?: number;
  updatedAt: string;
};

export type ThreatModelDetail = {
  model: ThreatModelSummary;
  components: any[];
  dataFlows: any[];
  trustBoundaries: any[];
  threats: any[];
  controls: any[];
  verifications: any[];
  approvals: any[];
  exceptions?: any[];
  evidence?: any[];
  enterpriseRisks?: any[];
  applicability?: any[];
  revisions?: any[];
  history: any[];
  releaseGate?: { allowed: boolean; blockers: string[] };
};

type Props = {
  detail: ThreatModelDetail | null;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
};

export type Tab =
  | 'overview'
  | 'readiness'
  | 'architecture-pro'
  | 'threats-pro'
  | 'controls-pro'
  | 'verification'
  | 'risks-pro'
  | 'approvals'
  | 'evidence'
  | 'history'
  | 'architecture'
  | 'data flows'
  | 'trust boundaries'
  | 'threats'
  | 'controls'
  | 'risks'
  | 'tickets';

const tabs: Array<{ id: Tab; label: string; description: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Overview', description: 'Release posture and the work requiring attention.', icon: Info },
  { id: 'readiness', label: 'Readiness & scope', description: 'Establish the authoritative scope and screening decision.', icon: ShieldCheck },
  { id: 'architecture-pro', label: 'Architecture & data', description: 'Map components, data, boundaries, and exposure.', icon: Network },
  { id: 'threats-pro', label: 'Threat analysis', description: 'Assess scenarios, findings, and security impact.', icon: ShieldAlert },
  { id: 'controls-pro', label: 'Controls', description: 'Define release-relevant safeguards and ownership.', icon: Layers },
  { id: 'verification', label: 'Assurance', description: 'Record independent control-testing evidence.', icon: FileCheck },
  { id: 'risks-pro', label: 'Risk decisions', description: 'Document exceptions, residual risk, and compliance context.', icon: AlertTriangle },
  { id: 'approvals', label: 'Approvals', description: 'Route the immutable revision through separation of duties.', icon: CheckCircle2 },
  { id: 'evidence', label: 'Evidence', description: 'Link clean, reviewable proof to the applicable record.', icon: FileText },
  { id: 'history', label: 'History', description: 'Inspect immutable revision and audit lineage.', icon: History },
];

const field = 'jira-input mt-1.5 w-full text-xs';
const threatCategories = [
  'SPOOFING',
  'TAMPERING',
  'REPUDIATION',
  'INFORMATION_DISCLOSURE',
  'DENIAL_OF_SERVICE',
  'ELEVATION_OF_PRIVILEGE',
  'BUSINESS_ABUSE',
  'FRAUD',
  'PRIVILEGE_ABUSE',
  'WORKFLOW_BYPASS',
  'REPLAY',
  'ACCOUNT_TAKEOVER',
  'API_ABUSE',
  'DATA_EXFILTRATION',
  'INSIDER_THREAT',
  'THIRD_PARTY_COMPROMISE',
];

const formatDataClassification = (val: string, t: (s: string) => string) => {
  const clean = (val || '').trim();
  switch (clean) {
    case 'CONFIDENTIAL_SECURITY_ONLY':
      return t('Confidential (Security only)');
    case 'CONFIDENTIAL':
      return t('Confidential');
    case 'HIGHLY_RESTRICTED_HR_LEGAL':
      return t('Highly Restricted (HR & Legal)');
    case 'RESTRICTED':
      return t('Restricted');
    case 'INTERNAL':
      return t('Internal');
    case 'PUBLIC':
      return t('Public');
    default:
      return t(clean.replaceAll('_', ' '));
  }
};

export const ThreatModelDetailPanel: React.FC<Props> = ({ detail, fetchWithAuth, onRefresh, onError }) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState(false);
  const [component, setComponent] = useState({ name: '', type: 'SERVICE', technology: '', securityZone: '' });
  const [boundary, setBoundary] = useState({ name: '', boundaryType: 'NETWORK', trustLevelFrom: '', trustLevelTo: '' });
  const [flow, setFlow] = useState({ name: '', sourceComponentId: '', destinationComponentId: '', protocol: 'HTTPS', port: '443', trustBoundaryId: '', dataTypes: '', crossesTrustBoundary: true });
  const [threat, setThreat] = useState({ title: '', description: '', attackScenario: '', categories: ['SPOOFING'], inherentLikelihood: '3', inherentImpact: '3', affectedComponentId: '' });
  const [control, setControl] = useState({ threatId: '', title: '', description: '', controlType: 'TECHNICAL', requiredBeforeRelease: true });
  const [verification, setVerification] = useState({ controlId: '', controlScopeVersion: 0, verificationType: 'MANUAL_SECURITY_TEST', testCase: '', expectedResult: '', result: 'PASS', evidenceIds: '', expiresAt: '', target: '', environment: '', buildReference: '', tool: '', toolVersion: '', configurationReference: '', runReference: '' });
  const [residual, setResidual] = useState({ threatId: '', residualLikelihood: '1', residualImpact: '1', residualRiskRationale: '' });
  const [enterpriseRisk, setEnterpriseRisk] = useState({ threatId: '', title: '', mitigationPlan: '', reviewDate: '' });
  const [evidence, setEvidence] = useState({ attachmentId: '', controlId: '', linkedEntityType: 'THREAT_MODEL' });
  const [approval, setApproval] = useState({ stage: 'APPSEC', decision: 'APPROVED', comments: '' });
  const pendingScrollHost = useRef<HTMLElement | null>(null);
  const pendingScrollTop = useRef<number | null>(null);
  const stageScrollRef = useRef<HTMLDivElement | null>(null);
  const [stageOverflow, setStageOverflow] = useState({ left: false, right: false });

  // The stage strip hides its scrollbar, so the edge fades are the overflow affordance.
  const updateStageOverflow = useCallback(() => {
    const node = stageScrollRef.current;
    if (!node) return;
    setStageOverflow({
      left: node.scrollLeft > 4,
      right: node.scrollLeft + node.clientWidth < node.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    updateStageOverflow();
    window.addEventListener('resize', updateStageOverflow);
    return () => window.removeEventListener('resize', updateStageOverflow);
  }, [activeTab, detail, updateStageOverflow]);

  // A tab replaces a substantial amount of DOM. Preserve the workspace viewport so
  // users do not lose their position in a long screening or architecture review.
  useLayoutEffect(() => {
    const host = pendingScrollHost.current;
    const top = pendingScrollTop.current;
    if (!host || top === null) return;
    const frame = window.requestAnimationFrame(() => {
      host.scrollTop = top;
      pendingScrollHost.current = null;
      pendingScrollTop.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab]);

  const changeTab = (event: React.MouseEvent<HTMLButtonElement>, tab: Tab) => {
    const scrollHost = event.currentTarget.closest('.custom-scrollbar') as HTMLElement | null;
    pendingScrollHost.current = scrollHost;
    pendingScrollTop.current = scrollHost?.scrollTop ?? null;
    setActiveTab(tab);
  };

  const counts = useMemo(
    () =>
      detail
        ? {
            critical: detail.threats.filter((item) => item.inherentScore >= 16).length,
            high: detail.threats.filter((item) => item.inherentScore >= 10 && item.inherentScore < 16).length,
            pending: detail.controls.filter((item) => item.status !== 'VERIFIED').length,
          }
        : null,
    [detail]
  );

  const getTabBadge = (tabId: Tab) => {
    if (!detail) return null;
    switch (tabId) {
      case 'threats-pro':
        return detail.threats.length;
      case 'controls-pro':
        return detail.controls.length;
      case 'verification':
        return detail.verifications.length;
      case 'risks-pro':
        return (detail.exceptions || []).length + (detail.enterpriseRisks || []).length;
      case 'approvals':
        return detail.approvals.length;
      case 'evidence':
        return (detail.evidence || []).length;
      case 'history':
        return (detail.revisions || []).length + (detail.history || []).length;
      default:
        return null;
    }
  };

  if (!detail) {
    return (
      <main className="bg-semantic-panel border border-semantic-jira-border rounded-xl min-h-[560px] grid place-items-center text-center p-10 shadow-sm">
        <div className="max-w-md space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-semantic-jira-brand-surface/70 border border-semantic-jira-info-border flex items-center justify-center mx-auto text-semantic-jira-brand shadow-xs">
            <Network className="w-7 h-7" />
          </div>
          <div className="font-bold text-base text-semantic-jira-primary">{t('Select a Threat Model')}</div>
          <p className="text-xs text-semantic-jira-muted leading-relaxed">
            {t('Architecture, data flows, controls, evidence, approvals, and release decisions remain in one auditable record.')}
          </p>
        </div>
      </main>
    );
  }

  const post = async (path: string, body?: unknown) => {
    setBusy(true);
    onError('');
    try {
      const response = await fetchWithAuth(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Threat Model operation failed.');
      await onRefresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Threat Model operation failed.');
    } finally {
      setBusy(false);
    }
  };

  const createComponent = (event: React.FormEvent) => {
    event.preventDefault();
    void post(`/api/threat-models/${detail.model.id}/components`, component).then(() =>
      setComponent({ name: '', type: 'SERVICE', technology: '', securityZone: '' })
    );
  };

  const createBoundary = (event: React.FormEvent) => {
    event.preventDefault();
    void post(`/api/threat-models/${detail.model.id}/trust-boundaries`, {
      ...boundary,
      authenticationRequired: true,
      encryptionRequired: true,
    }).then(() => setBoundary({ name: '', boundaryType: 'NETWORK', trustLevelFrom: '', trustLevelTo: '' }));
  };

  const createFlow = (event: React.FormEvent) => {
    event.preventDefault();
    void post(`/api/threat-models/${detail.model.id}/data-flows`, {
      ...flow,
      port: flow.port || undefined,
      dataTypes: flow.dataTypes.split(',').map((value) => value.trim()).filter(Boolean),
      encryptionInTransit: true,
      direction: 'ONE_WAY',
    }).then(() =>
      setFlow({
        name: '',
        sourceComponentId: '',
        destinationComponentId: '',
        protocol: 'HTTPS',
        port: '443',
        trustBoundaryId: '',
        dataTypes: '',
        crossesTrustBoundary: true,
      })
    );
  };

  const createThreat = (event: React.FormEvent) => {
    event.preventDefault();
    void post(`/api/threat-models/${detail.model.id}/threats`, {
      ...threat,
      inherentLikelihood: Number(threat.inherentLikelihood),
      inherentImpact: Number(threat.inherentImpact),
      affectedComponentId: threat.affectedComponentId || undefined,
    }).then(() =>
      setThreat({
        title: '',
        description: '',
        attackScenario: '',
        categories: ['SPOOFING'],
        inherentLikelihood: '3',
        inherentImpact: '3',
        affectedComponentId: '',
      })
    );
  };

  const createControl = (event: React.FormEvent) => {
    event.preventDefault();
    void post(`/api/threat-models/${detail.model.id}/controls`, {
      ...control,
      threatId: control.threatId || undefined,
    }).then(() =>
      setControl({
        threatId: '',
        title: '',
        description: '',
        controlType: 'TECHNICAL',
        requiredBeforeRelease: true,
      })
    );
  };

  const recordVerification = (event: React.FormEvent) => {
    event.preventDefault();
    void post(`/api/threat-models/${detail.model.id}/verifications`, {
      ...verification,
      controlScopeVersion: Number(verification.controlScopeVersion),
      evidenceIds: verification.evidenceIds.split(',').map((value) => value.trim()).filter(Boolean),
      expiresAt: verification.expiresAt ? new Date(verification.expiresAt).toISOString() : undefined,
    }).then(() =>
      setVerification({
        controlId: '',
        controlScopeVersion: 0,
        verificationType: 'MANUAL_SECURITY_TEST',
        testCase: '',
        expectedResult: '',
        result: 'PASS',
        evidenceIds: '',
        expiresAt: '',
        target: '',
        environment: '',
        buildReference: '',
        tool: '',
        toolVersion: '',
        configurationReference: '',
        runReference: '',
      })
    );
  };

  const assessResidual = (event: React.FormEvent) => {
    event.preventDefault();
    void post(`/api/threat-models/${detail.model.id}/residual-risk`, {
      ...residual,
      residualLikelihood: Number(residual.residualLikelihood),
      residualImpact: Number(residual.residualImpact),
    }).then(() =>
      setResidual({
        threatId: '',
        residualLikelihood: '1',
        residualImpact: '1',
        residualRiskRationale: '',
      })
    );
  };

  const raiseEnterpriseRisk = (event: React.FormEvent) => {
    event.preventDefault();
    void post(`/api/threat-models/${detail.model.id}/enterprise-risks`, {
      ...enterpriseRisk,
      threatId: enterpriseRisk.threatId || undefined,
      reviewDate: enterpriseRisk.reviewDate ? new Date(enterpriseRisk.reviewDate).toISOString() : undefined,
    }).then(() =>
      setEnterpriseRisk({ threatId: '', title: '', mitigationPlan: '', reviewDate: '' })
    );
  };

  const linkEvidence = (event: React.FormEvent) => {
    event.preventDefault();
    void post(`/api/threat-models/${detail.model.id}/evidence`, {
      ...evidence,
      controlId: evidence.controlId || undefined,
    });
  };

  return (
    <main className="threat-model-workspace bg-semantic-panel border border-semantic-jira-border rounded-2xl shadow-sm min-h-[560px] xl:min-h-0 overflow-hidden flex flex-col">
      {/* Model identity header: key, status, revision, policy tier and classification
          share one row; the release gate sits at the end as the single verdict chip. */}
      <div className="shrink-0 px-4 py-3 border-b border-semantic-jira-border bg-semantic-panel">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="font-mono text-sm font-bold text-semantic-jira-brand tracking-tight">
            {detail.model.key}
          </span>
          <Badge type="SEVERITY" value={detail.model.criticality} size="sm" />
          <span className="text-caption font-medium px-2 py-0.5 rounded capitalize bg-semantic-jira-surface text-semantic-jira-muted border border-semantic-jira-border/60">
            {t(detail.model.status.toLowerCase().replaceAll('_', ' '))}
          </span>
          <span className="font-mono text-micro font-semibold px-2 py-0.5 rounded bg-semantic-jira-surface border border-semantic-jira-border text-semantic-jira-muted">
            v{detail.model.revisionNumber || 1}
          </span>
          {detail.model.tier != null ? (
            <span
              title={t('Policy-derived tier')}
              className="font-mono font-bold text-micro px-1.5 py-0.5 rounded bg-semantic-jira-brand-surface text-semantic-jira-brand border border-semantic-jira-info-border"
            >
              TM-{detail.model.tier}
            </span>
          ) : (
            <span
              title={t('Security screening required')}
              className="inline-flex items-center gap-1 text-micro font-semibold px-1.5 py-0.5 rounded bg-semantic-warning-surface text-semantic-warning border border-semantic-warning-border"
            >
              <Shield className="w-3 h-3" />
              {t('Security screening required')}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-caption font-mono text-semantic-jira-muted">
            <Lock className="w-3 h-3" />
            <span>{formatDataClassification(detail.model.dataClassification, t)}</span>
          </span>
          <div
            className={`ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider border shadow-xs ${
              detail.releaseGate?.allowed
                ? 'border-semantic-success-border bg-semantic-success-surface text-semantic-success'
                : 'border-semantic-danger-border bg-semantic-danger-surface text-semantic-danger'
            }`}
          >
            {detail.releaseGate?.allowed ? (
              <ShieldCheck className="w-3.5 h-3.5" />
            ) : (
              <ShieldAlert className="w-3.5 h-3.5" />
            )}
            <span>
              {detail.releaseGate?.allowed ? t('RELEASE GATE: ALLOWED') : t('RELEASE GATE: BLOCKED')}
            </span>
          </div>
        </div>
        <h2 className="text-lg font-bold text-semantic-jira-primary tracking-tight mt-1.5 truncate">
          {detail.model.title}
        </h2>
      </div>

      {/* Tab Navigation Strip with Count Pills */}
      <div
        className="threat-model-stage-nav relative px-3 py-2 border-b border-semantic-jira-border bg-semantic-jira-surface/40"
        aria-label="Threat model workflow"
      >
        <div aria-hidden="true" className={`tm-stage-fade tm-stage-fade-left ${stageOverflow.left ? 'is-visible' : ''}`} />
        <div aria-hidden="true" className={`tm-stage-fade tm-stage-fade-right ${stageOverflow.right ? 'is-visible' : ''}`} />
        <div
          ref={stageScrollRef}
          className="threat-model-stage-scroll"
          role="tablist"
          aria-label={t('Threat model stages')}
          onScroll={updateStageOverflow}
        >
          {tabs.map((tab, index) => {
            const isActive = activeTab === tab.id;
            const badgeCount = getTabBadge(tab.id);
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                title={t(tab.description)}
                onClick={(event) => changeTab(event, tab.id)}
                className={`threat-model-stage ${isActive ? 'threat-model-stage-active' : ''}`}
              >
                <span className="threat-model-stage-index">{index + 1}</span>
                <Icon className="w-3.5 h-3.5" />
                <span>{t(tab.label)}</span>
                {typeof badgeCount === 'number' && badgeCount > 0 && (
                  <span className="threat-model-stage-count">{badgeCount}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content Body: scrolls independently on wide screens so the workflow
          stage rail and model header stay anchored while content moves. */}
      <div className="p-4 text-xs space-y-4 flex-1 min-h-0 xl:overflow-y-auto custom-scrollbar bg-semantic-jira-surface/20">
        {activeTab === 'overview' && <Overview detail={detail} counts={counts} onSelectTab={setActiveTab} />}
        {activeTab === 'readiness' && (
          <ThreatModelGovernanceEditor
            key={`${detail.model.id}:screening`}
            detail={detail}
            fetchWithAuth={fetchWithAuth}
            onRefresh={onRefresh}
            initialSection="screening"
            allowedSections={['screening', 'scope', 'requirements', 'versions']}
          />
        )}
        {activeTab === 'architecture-pro' && (
          <ThreatModelGovernanceEditor
            key={`${detail.model.id}:architecture`}
            detail={detail}
            fetchWithAuth={fetchWithAuth}
            onRefresh={onRefresh}
            initialSection="architecture"
            allowedSections={['architecture', 'data']}
          />
        )}
        {activeTab === 'threats-pro' && (
          <ThreatModelGovernanceEditor
            key={`${detail.model.id}:threat-content`}
            detail={detail}
            fetchWithAuth={fetchWithAuth}
            onRefresh={onRefresh}
            initialSection="threat content"
            allowedSections={['threat content', 'analysis', 'findings', 'threat state']}
          />
        )}
        {activeTab === 'controls-pro' && (
          <ThreatModelGovernanceEditor
            key={`${detail.model.id}:control-catalog`}
            detail={detail}
            fetchWithAuth={fetchWithAuth}
            onRefresh={onRefresh}
            initialSection="control catalog"
            allowedSections={['control catalog']}
          />
        )}
        {activeTab === 'risks-pro' && (
          <ThreatModelGovernanceEditor
            key={`${detail.model.id}:exceptions`}
            detail={detail}
            fetchWithAuth={fetchWithAuth}
            onRefresh={onRefresh}
            initialSection="exceptions"
            allowedSections={['exceptions', 'emergency', 'compliance', 'access & retention']}
          />
        )}
        {activeTab === 'verification' && (
          <AssuranceWorkbench
            detail={detail}
            verification={verification}
            setVerification={setVerification}
            recordVerification={recordVerification}
            busy={busy}
          />
        )}
        {activeTab === 'approvals' && (
          <ApprovalsPipelineView
            detail={detail}
            approval={approval}
            setApproval={setApproval}
            post={post}
            busy={busy}
          />
        )}
        {activeTab === 'evidence' && (
          <EvidenceView
            detail={detail}
            evidence={evidence}
            setEvidence={setEvidence}
            linkEvidence={linkEvidence}
            fetchWithAuth={fetchWithAuth}
            onError={onError}
            busy={busy}
            setBusy={setBusy}
          />
        )}
        {activeTab === 'history' && (
          <HistoryView detail={detail} />
        )}
        {activeTab === 'architecture' && (
          <>
            <Dfd components={detail.components} flows={detail.dataFlows} />
            <Form title={t('Add component')} onSubmit={createComponent} submit={t('Add component')} busy={busy}>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Name')}
                <input
                  className={field}
                  required
                  value={component.name}
                  onChange={(e) => setComponent({ ...component, name: e.target.value })}
                />
              </label>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Type')}
                <select
                  className={field}
                  value={component.type}
                  onChange={(e) => setComponent({ ...component, type: e.target.value })}
                >
                  {[
                    'PROCESS',
                    'SERVICE',
                    'API',
                    'DATABASE',
                    'DATASTORE',
                    'QUEUE',
                    'EXTERNAL_SYSTEM',
                    'USER',
                    'ADMIN',
                    'THIRD_PARTY',
                    'NETWORK_ZONE',
                    'CLOUD_SERVICE',
                    'DEVICE',
                    'OTHER',
                  ].map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Technology')}
                <input
                  className={field}
                  value={component.technology}
                  onChange={(e) => setComponent({ ...component, technology: e.target.value })}
                />
              </label>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Security zone')}
                <input
                  className={field}
                  required
                  value={component.securityZone}
                  onChange={(e) => setComponent({ ...component, securityZone: e.target.value })}
                />
              </label>
            </Form>
            <Records
              title="Components"
              items={detail.components}
              render={(item) => `${item.name} · ${item.type}${item.technology ? ` · ${item.technology}` : ''}`}
            />
          </>
        )}
        {activeTab === 'data flows' && (
          <>
            <Form title={t('Connect components with a structured data flow')} onSubmit={createFlow} submit={t('Add data flow')} busy={busy}>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Flow name')}
                <input
                  className={field}
                  required
                  value={flow.name}
                  onChange={(e) => setFlow({ ...flow, name: e.target.value })}
                />
              </label>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Source')}
                <select
                  className={field}
                  required
                  value={flow.sourceComponentId}
                  onChange={(e) => setFlow({ ...flow, sourceComponentId: e.target.value })}
                >
                  <option value="">{t('Select')}</option>
                  {detail.components.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Destination')}
                <select
                  className={field}
                  required
                  value={flow.destinationComponentId}
                  onChange={(e) => setFlow({ ...flow, destinationComponentId: e.target.value })}
                >
                  <option value="">{t('Select')}</option>
                  {detail.components.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Protocol')}
                <input
                  className={field}
                  value={flow.protocol}
                  onChange={(e) => setFlow({ ...flow, protocol: e.target.value })}
                />
              </label>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Port')}
                <input
                  className={field}
                  inputMode="numeric"
                  value={flow.port}
                  onChange={(e) => setFlow({ ...flow, port: e.target.value })}
                />
              </label>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Data types (comma-separated)')}
                <input
                  className={field}
                  value={flow.dataTypes}
                  onChange={(e) => setFlow({ ...flow, dataTypes: e.target.value })}
                />
              </label>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Trust boundary')}
                <select
                  className={field}
                  value={flow.trustBoundaryId}
                  onChange={(e) => setFlow({ ...flow, trustBoundaryId: e.target.value })}
                >
                  <option value="">{t('None')}</option>
                  {detail.trustBoundaries.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
            </Form>
            <Records
              title="Data flows"
              items={detail.dataFlows}
              render={(item) => `${item.name} · ${item.protocol || 'protocol not recorded'} · ${item.crossesTrustBoundary ? 'crosses trust boundary' : 'internal'}`}
            />
          </>
        )}
        {activeTab === 'trust boundaries' && (
          <>
            <Form title={t('Add trust boundary')} onSubmit={createBoundary} submit={t('Add boundary')} busy={busy}>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Name')}
                <input
                  className={field}
                  required
                  value={boundary.name}
                  onChange={(e) => setBoundary({ ...boundary, name: e.target.value })}
                />
              </label>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Type')}
                <input
                  className={field}
                  required
                  value={boundary.boundaryType}
                  onChange={(e) => setBoundary({ ...boundary, boundaryType: e.target.value })}
                />
              </label>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('From trust level')}
                <input
                  className={field}
                  value={boundary.trustLevelFrom}
                  onChange={(e) => setBoundary({ ...boundary, trustLevelFrom: e.target.value })}
                />
              </label>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('To trust level')}
                <input
                  className={field}
                  value={boundary.trustLevelTo}
                  onChange={(e) => setBoundary({ ...boundary, trustLevelTo: e.target.value })}
                />
              </label>
            </Form>
            <Records
              title="Trust boundaries"
              items={detail.trustBoundaries}
              render={(item) => `${item.name} · ${item.boundaryType} · ${item.trustLevelFrom || '?'} → ${item.trustLevelTo || '?'}`}
            />
          </>
        )}
        {activeTab === 'threats' && (
          <>
            <Form title={t('Add structured threat or banking abuse case')} onSubmit={createThreat} submit={t('Add threat')} busy={busy}>
              <label className="block text-xs font-semibold text-semantic-jira-muted sm:col-span-2">
                {t('Title')}
                <input
                  className={field}
                  required
                  value={threat.title}
                  onChange={(e) => setThreat({ ...threat, title: e.target.value })}
                />
              </label>
              <label className="block text-xs font-semibold text-semantic-jira-muted sm:col-span-2">
                {t('Description')}
                <textarea
                  className={`${field} min-h-[60px]`}
                  required
                  value={threat.description}
                  onChange={(e) => setThreat({ ...threat, description: e.target.value })}
                />
              </label>
              <label className="block text-xs font-semibold text-semantic-jira-muted sm:col-span-2">
                {t('Attack scenario')}
                <textarea
                  className={`${field} min-h-[60px]`}
                  required
                  value={threat.attackScenario}
                  onChange={(e) => setThreat({ ...threat, attackScenario: e.target.value })}
                />
              </label>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Category')}
                <select
                  className={field}
                  value={threat.categories[0]}
                  onChange={(e) => setThreat({ ...threat, categories: [e.target.value] })}
                >
                  {threatCategories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Inherent Likelihood')}
                <select
                  className={field}
                  value={threat.inherentLikelihood}
                  onChange={(e) => setThreat({ ...threat, inherentLikelihood: e.target.value })}
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Inherent Impact')}
                <select
                  className={field}
                  value={threat.inherentImpact}
                  onChange={(e) => setThreat({ ...threat, inherentImpact: e.target.value })}
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Affected component')}
                <select
                  className={field}
                  value={threat.affectedComponentId}
                  onChange={(e) => setThreat({ ...threat, affectedComponentId: e.target.value })}
                >
                  <option value="">{t('Unspecified')}</option>
                  {detail.components.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
            </Form>
            <ThreatTable threats={detail.threats} controls={detail.controls} />
          </>
        )}
        {activeTab === 'controls' && (
          <>
            <Form title={t('Add mitigation control')} onSubmit={createControl} submit={t('Create remediation control')} busy={busy}>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Threat')}
                <select
                  className={field}
                  required
                  value={control.threatId}
                  onChange={(e) => setControl({ ...control, threatId: e.target.value })}
                >
                  <option value="">{t('Select')}</option>
                  {detail.threats.map((item) => (
                    <option key={item.id} value={item.id}>{item.key} · {item.title}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Control title')}
                <input
                  className={field}
                  required
                  value={control.title}
                  onChange={(e) => setControl({ ...control, title: e.target.value })}
                />
              </label>
              <label className="block text-xs font-semibold text-semantic-jira-muted sm:col-span-2">
                {t('Description')}
                <textarea
                  className={`${field} min-h-[60px]`}
                  required
                  value={control.description}
                  onChange={(e) => setControl({ ...control, description: e.target.value })}
                />
              </label>
              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Type')}
                <input
                  className={field}
                  required
                  value={control.controlType}
                  onChange={(e) => setControl({ ...control, controlType: e.target.value })}
                />
              </label>
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="requiredBeforeRelease"
                  className="rounded border-semantic-jira-border text-semantic-jira-brand focus:ring-semantic-jira-brand"
                  checked={control.requiredBeforeRelease}
                  onChange={(e) => setControl({ ...control, requiredBeforeRelease: e.target.checked })}
                />
                <label htmlFor="requiredBeforeRelease" className="text-xs font-semibold text-semantic-jira-primary cursor-pointer">
                  {t('Required before release')}
                </label>
              </div>
            </Form>
            <ControlTable controls={detail.controls} threats={detail.threats} />
          </>
        )}
        {activeTab === 'tickets' && (
          <ControlTable
            controls={detail.controls.filter((item) => item.implementationTicketId)}
            threats={detail.threats}
          />
        )}
      </div>
    </main>
  );
};

/* =========================================================================
   OVERVIEW TAB COMPONENT
   ========================================================================= */
const Overview: React.FC<{
  detail: ThreatModelDetail;
  counts: { critical: number; high: number; pending: number } | null;
  onSelectTab: (tab: Tab) => void;
}> = ({ detail, counts, onSelectTab }) => {
  const { t } = useI18n();

  const totalThreats = detail.threats.length;
  const verifiedControls = detail.controls.filter((c) => c.status === 'VERIFIED').length;
  const totalControls = detail.controls.length;

  return (
    <div className="space-y-3.5">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-semantic-panel border border-semantic-jira-border rounded-xl px-3.5 py-3 shadow-sm space-y-0.5">
          <div className="text-caption font-semibold text-semantic-jira-muted">{t('Critical threats')}</div>
          <div className={`text-xl font-bold tracking-tight ${(counts?.critical || 0) > 0 ? 'text-semantic-danger' : 'text-semantic-jira-primary'}`}>
            {counts?.critical || 0}
          </div>
          <div className="text-micro text-semantic-jira-muted font-medium">
            {t('Inherent score')} &gt;= 16
          </div>
        </div>

        <div className="bg-semantic-panel border border-semantic-jira-border rounded-xl px-3.5 py-3 shadow-sm space-y-0.5">
          <div className="text-caption font-semibold text-semantic-jira-muted">{t('High threats')}</div>
          <div className={`text-xl font-bold tracking-tight ${(counts?.high || 0) > 0 ? 'text-semantic-warning' : 'text-semantic-jira-primary'}`}>
            {counts?.high || 0}
          </div>
          <div className="text-micro text-semantic-jira-muted font-medium">
            {t('Inherent score')} 10 - 15
          </div>
        </div>

        <div className="bg-semantic-panel border border-semantic-jira-border rounded-xl px-3.5 py-3 shadow-sm space-y-0.5">
          <div className="text-caption font-semibold text-semantic-jira-muted">{t('Controls pending verification')}</div>
          <div className={`text-xl font-bold tracking-tight ${(counts?.pending || 0) > 0 ? 'text-semantic-jira-brand' : 'text-semantic-jira-primary'}`}>
            {counts?.pending || 0}
          </div>
          <div className="text-micro text-semantic-jira-muted font-medium">
            {verifiedControls} / {totalControls} {t('verified')}
          </div>
        </div>

        <div className="bg-semantic-panel border border-semantic-jira-border rounded-xl px-3.5 py-3 shadow-sm space-y-0.5">
          <div className="text-caption font-semibold text-semantic-jira-muted">{t('Total Components')}</div>
          <div className="text-xl font-bold tracking-tight text-semantic-jira-primary">
            {detail.components.length}
          </div>
          <div className="text-micro text-semantic-jira-muted font-medium">
            {detail.dataFlows.length} {t('Data Flows').toLowerCase()}
          </div>
        </div>
      </div>

      {/* Release Gate Banner */}
      {detail.releaseGate?.blockers?.length ? (
        <div className="border border-semantic-danger-border bg-semantic-danger-surface rounded-xl p-4 shadow-xs space-y-2.5">
          <div className="flex items-center gap-2 font-bold text-xs text-semantic-danger uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{t('Release blockers')} ({detail.releaseGate.blockers.length})</span>
          </div>
          <ul className="space-y-1.5 text-xs text-semantic-danger font-medium pl-1">
            {detail.releaseGate.blockers.map((blocker) => (
              <li key={blocker} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-semantic-danger flex-shrink-0" />
                <span>{t(blocker)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : !detail.releaseGate?.allowed ? (
        <div role="alert" className="border border-semantic-danger-border bg-semantic-danger-surface rounded-xl p-4 text-xs text-semantic-danger font-semibold flex items-center gap-2.5">
          <ShieldAlert className="w-4 h-4 flex-shrink-0" />
          <span>{t('Release gate unavailable or blocked. Approval cannot be inferred.')}</span>
        </div>
      ) : (
        <div className="border border-semantic-success-border bg-semantic-success-surface rounded-xl p-4 flex items-center gap-2.5 text-xs text-semantic-success font-semibold shadow-xs">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{t('Current approved controls satisfy the release gate.')}</span>
        </div>
      )}

      {/* Model Scope & Context Card */}
      <div className="bg-semantic-panel border border-semantic-jira-border rounded-xl p-4 shadow-sm space-y-3.5">
        <div className="flex items-center justify-between pb-2 border-b border-semantic-jira-border/60">
          <div className="flex items-center gap-2 font-bold text-caption text-semantic-jira-primary uppercase tracking-wider">
            <Info className="w-4 h-4 text-semantic-jira-brand" />
            <span>{t('Model Scope & Context')}</span>
          </div>
          <span className="text-micro font-mono text-semantic-jira-muted">
            {t('Last updated')}: {new Date(detail.model.updatedAt).toLocaleDateString()}
          </span>
        </div>

        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded-lg bg-semantic-jira-surface/50 border border-semantic-jira-border/60">
            <div className="text-micro font-semibold text-semantic-jira-muted">{t('Data Classification')}</div>
            <div className="font-medium text-semantic-jira-primary mt-0.5">
              {formatDataClassification(detail.model.dataClassification, t)}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-semantic-jira-surface/50 border border-semantic-jira-border/60">
            <div className="text-micro font-semibold text-semantic-jira-muted">{t('Security Tier')}</div>
            <div className="font-medium text-semantic-jira-primary mt-0.5">
              {detail.model.tier != null ? `Tier TM-${detail.model.tier}` : t('Screening required')}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-semantic-jira-surface/50 border border-semantic-jira-border/60">
            <div className="text-micro font-semibold text-semantic-jira-muted">{t('Linked Project')}</div>
            <div className="font-mono font-medium text-semantic-jira-brand mt-0.5 truncate">
              {(detail.model as any).projectId || t('None')}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-semantic-jira-surface/50 border border-semantic-jira-border/60">
            <div className="text-micro font-semibold text-semantic-jira-muted">{t('Linked Change')}</div>
            <div className="font-mono font-medium text-semantic-jira-primary mt-0.5 truncate">
              {detail.model.changeId || t('None')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   ASSURANCE WORKBENCH TAB COMPONENT (VERIFICATION)
   ========================================================================= */
const AssuranceWorkbench: React.FC<{
  detail: ThreatModelDetail;
  verification: any;
  setVerification: React.Dispatch<React.SetStateAction<any>>;
  recordVerification: (event: React.FormEvent) => void;
  busy: boolean;
}> = ({ detail, verification, setVerification, recordVerification, busy }) => {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      {/* Reproducibility Context Box */}
      <VerificationExecutionContext value={verification} onChange={setVerification} />

      {/* Verification Recording Form */}
      <Form
        title={t('Record independent control verification')}
        onSubmit={recordVerification}
        submit={t('Record verification')}
        busy={busy}
      >
        <label className="block text-xs font-semibold text-semantic-jira-muted">
          {t('Control')}
          <select
            className={field}
            required
            value={verification.controlId}
            onChange={(e) =>
              setVerification({
                ...verification,
                controlId: e.target.value,
                controlScopeVersion: detail.controls.find((item) => item.id === e.target.value)?.scopeVersion || 1,
              })
            }
          >
            <option value="">{t('Select control')}</option>
            {detail.controls.map((item) => (
              <option key={item.id} value={item.id}>{item.title} · {item.status}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-semantic-jira-muted">
          {t('Method')}
          <select
            className={field}
            value={verification.verificationType}
            onChange={(e) => setVerification({ ...verification, verificationType: e.target.value })}
          >
            {[
              'MANUAL_SECURITY_TEST',
              'SAST',
              'DAST',
              'SCA',
              'API_SECURITY_TEST',
              'PENETRATION_TEST',
              'CODE_REVIEW',
              'ARCHITECTURE_REVIEW',
              'CONFIGURATION_REVIEW',
              'IAM_REVIEW',
              'INFRASTRUCTURE_TEST',
              'CONTROL_ATTESTATION',
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-semantic-jira-muted sm:col-span-2">
          {t('Test case')}
          <textarea
            className={`${field} min-h-[60px]`}
            required
            value={verification.testCase}
            onChange={(e) => setVerification({ ...verification, testCase: e.target.value })}
          />
        </label>
        <label className="block text-xs font-semibold text-semantic-jira-muted sm:col-span-2">
          {t('Expected result')}
          <textarea
            className={`${field} min-h-[60px]`}
            required
            value={verification.expectedResult}
            onChange={(e) => setVerification({ ...verification, expectedResult: e.target.value })}
          />
        </label>
        <label className="block text-xs font-semibold text-semantic-jira-muted">
          {t('Result')}
          <select
            className={field}
            value={verification.result}
            onChange={(e) => setVerification({ ...verification, result: e.target.value })}
          >
            {['PASS', 'FAIL', 'PARTIAL', 'NOT_RUN', 'EXPIRED'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-semantic-jira-muted">
          {t('Evidence IDs (required for PASS)')}
          <input
            className={field}
            value={verification.evidenceIds}
            onChange={(e) => setVerification({ ...verification, evidenceIds: e.target.value })}
          />
        </label>
        <label className="block text-xs font-semibold text-semantic-jira-muted sm:col-span-2">
          {t('Expires at')}
          <input
            className={field}
            type="datetime-local"
            value={verification.expiresAt}
            onChange={(e) => setVerification({ ...verification, expiresAt: e.target.value })}
          />
        </label>
      </Form>

      {/* Verification History Table */}
      <section className="space-y-2">
        <h3 className="font-bold text-semantic-jira-primary uppercase tracking-wider text-caption">
          {t('Verification history')}
        </h3>
        {detail.verifications.length ? (
          <div className="divide-y divide-semantic-jira-border border border-semantic-jira-border rounded-xl overflow-hidden bg-semantic-panel shadow-sm">
            {detail.verifications.map((item) => (
              <div key={item.id} className="p-4 text-xs space-y-2 hover:bg-semantic-jira-hover/40 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-semantic-jira-primary">
                      {item.verificationType}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-micro font-bold uppercase tracking-wider border ${
                        item.result === 'PASS'
                          ? 'border-semantic-success-border bg-semantic-success-surface text-semantic-success'
                          : item.result === 'FAIL'
                          ? 'border-semantic-danger-border bg-semantic-danger-surface text-semantic-danger'
                          : 'border-semantic-jira-border bg-semantic-jira-surface text-semantic-jira-muted'
                      }`}
                    >
                      {item.result}
                    </span>
                  </div>
                  <span className="text-micro font-mono text-semantic-jira-muted">
                    {item.executedAt ? new Date(item.executedAt).toLocaleString() : ''}
                  </span>
                </div>
                {item.testCase && (
                  <div className="text-xs text-semantic-jira-muted">
                    <span className="font-semibold text-semantic-jira-primary">{t('Test case')}: </span>
                    {item.testCase}
                  </div>
                )}
                <div className="flex items-center gap-3 text-micro text-semantic-jira-muted">
                  <span>{item.evidenceIds?.length || 0} {t('evidence item(s)')}</span>
                  {item.executionContext?.target && (
                    <span>· {t('Target')}: <span className="font-mono">{item.executionContext.target}</span></span>
                  )}
                  {item.executionContext?.environment && (
                    <span>· {t('Env')}: <span className="font-mono">{item.executionContext.environment}</span></span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-semantic-jira-border rounded-xl p-5 text-center text-xs text-semantic-jira-muted bg-semantic-jira-surface/30">
            {t('No verifications recorded yet.')}
          </div>
        )}
      </section>
    </div>
  );
};

/* =========================================================================
   APPROVALS PIPELINE TAB COMPONENT
   ========================================================================= */
const STAGES = [
  {
    id: 'APPSEC',
    title: 'Application Security',
    role: 'Vulnerability analysis, threat validation & defensive design',
  },
  {
    id: 'SECURITY_ARCHITECTURE',
    title: 'Security Architecture',
    role: 'Network zoning, cryptographic standards & trust boundaries',
  },
  {
    id: 'RISK_AUTHORITY',
    title: 'Risk Authority',
    role: 'Residual risk acceptance, waiver compliance & CISO sign-off',
  },
];

const ApprovalsPipelineView: React.FC<{
  detail: ThreatModelDetail;
  approval: any;
  setApproval: React.Dispatch<React.SetStateAction<any>>;
  post: (path: string, body?: unknown) => Promise<void>;
  busy: boolean;
}> = ({ detail, approval, setApproval, post, busy }) => {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      {/* Submit for Review Action Card */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-semantic-panel border border-semantic-jira-border rounded-xl shadow-sm">
        <div className="space-y-0.5">
          <h4 className="font-bold text-sm text-semantic-jira-primary">{t('Submit Model for Review')}</h4>
          <p className="text-xs text-semantic-jira-muted">
            {t('Transitions the model into review state for AppSec and Architecture.')}
          </p>
        </div>
        <button
          className="jira-btn-primary flex items-center gap-1.5"
          disabled={busy || detail.model.status === 'APPROVED'}
          onClick={() => void post(`/api/threat-models/${detail.model.id}/submit`)}
        >
          <Send className="w-4 h-4" />
          <span>{t('Submit for review')}</span>
        </button>
      </div>

      {/* 3-Stage Governance Pipeline Cards */}
      <div className="space-y-2">
        <h4 className="font-bold text-caption text-semantic-jira-primary uppercase tracking-wider">
          {t('Approval Stages')}
        </h4>
        <div className="grid md:grid-cols-3 gap-3">
          {STAGES.map((stage) => {
            const stageApproval = (detail.approvals || []).find((a: any) => a.stage === stage.id);
            const isApproved = stageApproval?.decision === 'APPROVED';
            const isRejected = stageApproval?.decision === 'REJECTED';
            const isChanges = stageApproval?.decision === 'CHANGES_REQUESTED';

            return (
              <div
                key={stage.id}
                className={`rounded-xl border p-4 space-y-2.5 transition-all shadow-xs ${
                  isApproved
                    ? 'bg-semantic-success-surface/40 border-semantic-success-border'
                    : isRejected
                    ? 'bg-semantic-danger-surface/40 border-semantic-danger-border'
                    : isChanges
                    ? 'bg-semantic-warning-surface/40 border-semantic-warning-border'
                    : 'bg-semantic-panel border-semantic-jira-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-semantic-jira-primary">{t(stage.title)}</span>
                  {isApproved ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-micro font-bold border border-semantic-success-border bg-semantic-success-surface text-semantic-success">
                      <Check className="w-3 h-3" />
                      {t('Approved')}
                    </span>
                  ) : isRejected ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-micro font-bold border border-semantic-danger-border bg-semantic-danger-surface text-semantic-danger">
                      <XCircle className="w-3 h-3" />
                      {t('Rejected')}
                    </span>
                  ) : isChanges ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-micro font-bold border border-semantic-warning-border bg-semantic-warning-surface text-semantic-warning">
                      <AlertTriangle className="w-3 h-3" />
                      {t('Changes requested')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-micro font-semibold border border-semantic-jira-border bg-semantic-jira-surface text-semantic-jira-muted">
                      <Clock className="w-3 h-3" />
                      {t('Pending review')}
                    </span>
                  )}
                </div>

                <p className="text-micro text-semantic-jira-muted leading-relaxed">
                  {stage.role}
                </p>

                {stageApproval && (
                  <div className="pt-2 border-t border-semantic-jira-border/40 text-micro text-semantic-jira-muted space-y-1">
                    <div>{new Date(stageApproval.decidedAt).toLocaleString()}</div>
                    {stageApproval.comments && (
                      <div className="italic text-semantic-jira-primary line-clamp-2">
                        "{stageApproval.comments}"
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Record Approval Decision Form */}
      <Form
        title={t('Independent approval decision')}
        onSubmit={(event) => {
          event.preventDefault();
          void post(`/api/threat-models/${detail.model.id}/approve`, approval);
        }}
        submit={t('Record approval')}
        busy={busy}
      >
        <label className="block text-xs font-semibold text-semantic-jira-muted">
          {t('Stage')}
          <select
            className={field}
            value={approval.stage}
            onChange={(e) => setApproval({ ...approval, stage: e.target.value })}
          >
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>{t(s.title)}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-semantic-jira-muted">
          {t('Decision')}
          <select
            className={field}
            value={approval.decision}
            onChange={(e) => setApproval({ ...approval, decision: e.target.value })}
          >
            <option value="APPROVED">{t('Approved')}</option>
            <option value="CHANGES_REQUESTED">{t('Changes requested')}</option>
            <option value="REJECTED">{t('Rejected')}</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-semantic-jira-muted sm:col-span-2">
          {t('Comments')}
          <textarea
            className={`${field} min-h-[60px]`}
            value={approval.comments}
            placeholder={t('Add findings analysis, remediation updates, or test notes...')}
            onChange={(e) => setApproval({ ...approval, comments: e.target.value })}
          />
        </label>
      </Form>

      {/* Approval History List */}
      <section className="space-y-2">
        <h4 className="font-bold text-caption text-semantic-jira-primary uppercase tracking-wider">
          {t('Approval history')}
        </h4>
        {detail.approvals.length ? (
          <div className="divide-y divide-semantic-jira-border border border-semantic-jira-border rounded-xl overflow-hidden bg-semantic-panel shadow-sm">
            {detail.approvals.map((item) => (
              <div key={item.id || JSON.stringify(item)} className="p-3.5 text-xs flex items-center justify-between hover:bg-semantic-jira-hover/40 transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-semantic-jira-primary">{item.stage}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-micro font-bold uppercase tracking-wider border ${
                        item.decision === 'APPROVED'
                          ? 'border-semantic-success-border bg-semantic-success-surface text-semantic-success'
                          : item.decision === 'REJECTED'
                          ? 'border-semantic-danger-border bg-semantic-danger-surface text-semantic-danger'
                          : 'border-semantic-warning-border bg-semantic-warning-surface text-semantic-warning'
                      }`}
                    >
                      {item.decision}
                    </span>
                  </div>
                  {item.comments && (
                    <div className="text-semantic-jira-muted italic text-micro">
                      "{item.comments}"
                    </div>
                  )}
                </div>
                <span className="text-micro font-mono text-semantic-jira-muted">
                  {item.decidedAt ? new Date(item.decidedAt).toLocaleString() : ''}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-semantic-jira-border rounded-xl p-5 text-center text-xs text-semantic-jira-muted bg-semantic-jira-surface/30">
            {t('No structured records yet.')}
          </div>
        )}
      </section>
    </div>
  );
};

/* =========================================================================
   EVIDENCE TAB COMPONENT
   ========================================================================= */
const EvidenceView: React.FC<{
  detail: ThreatModelDetail;
  evidence: any;
  setEvidence: React.Dispatch<React.SetStateAction<any>>;
  linkEvidence: (event: React.FormEvent) => void;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
  onError: (message: string) => void;
  busy: boolean;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({ detail, evidence, setEvidence, linkEvidence, fetchWithAuth, onError, busy, setBusy }) => {
  const { t } = useI18n();

  const downloadItem = (item: any) => {
    setBusy(true);
    void fetchWithAuth(`/api/threat-models/${detail.model.id}/evidence/${item.id}/download`)
      .then(async (response) => {
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || 'Download denied.');
        }
        const url = URL.createObjectURL(await response.blob());
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `evidence-${item.attachmentId}.bin`;
        anchor.click();
        URL.revokeObjectURL(url);
      })
      .catch((cause) => onError(cause.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="space-y-4">
      {/* Link Evidence Form */}
      <Form
        title={t('Link clean ticket evidence')}
        onSubmit={linkEvidence}
        submit={t('Link evidence')}
        busy={busy}
      >
        <label className="block text-xs font-semibold text-semantic-jira-muted">
          {t('Clean attachment ID')}
          <input
            className={field}
            required
            value={evidence.attachmentId}
            onChange={(e) => setEvidence({ ...evidence, attachmentId: e.target.value })}
          />
        </label>
        <label className="block text-xs font-semibold text-semantic-jira-muted">
          {t('Control (optional)')}
          <select
            className={field}
            value={evidence.controlId}
            onChange={(e) => setEvidence({ ...evidence, controlId: e.target.value })}
          >
            <option value="">{t('Threat Model evidence')}</option>
            {detail.controls.map((item) => (
              <option key={item.id} value={item.id}>{item.title}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-semantic-jira-muted sm:col-span-2">
          {t('Linked entity type')}
          <input
            className={field}
            value={evidence.linkedEntityType}
            onChange={(e) => setEvidence({ ...evidence, linkedEntityType: e.target.value })}
          />
        </label>
      </Form>

      {/* Evidence Repository Table */}
      <section className="space-y-2">
        <h4 className="font-bold text-caption text-semantic-jira-primary uppercase tracking-wider">
          {t('Evidence Repository')}
        </h4>
        {Array.isArray(detail.evidence) && detail.evidence.length > 0 ? (
          <div className="divide-y divide-semantic-jira-border border border-semantic-jira-border rounded-xl overflow-hidden bg-semantic-panel shadow-sm">
            {detail.evidence.map((item) => (
              <div
                key={item.id}
                className="p-4 text-xs flex flex-wrap items-center justify-between gap-3 hover:bg-semantic-jira-hover/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-semantic-jira-brand-surface border border-semantic-jira-info-border flex items-center justify-center text-semantic-jira-brand flex-shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="font-bold text-semantic-jira-primary flex items-center gap-2">
                      <span>{item.linkedEntityType}</span>
                      <span className="font-mono text-micro px-1.5 py-0.5 rounded bg-semantic-jira-surface border border-semantic-jira-border text-semantic-jira-muted">
                        ID: {item.attachmentId}
                      </span>
                      {item.classification && (
                        <span className="text-micro font-semibold px-2 py-0.5 rounded bg-semantic-jira-brand-surface text-semantic-jira-brand border border-semantic-jira-info-border">
                          {item.classification}
                        </span>
                      )}
                    </div>
                    {item.controlId && (
                      <div className="text-micro text-semantic-jira-muted">
                        {t('Control')}: {detail.controls.find((c) => c.id === item.controlId)?.title || item.controlId}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  className="jira-btn-secondary text-xs flex items-center gap-1.5"
                  disabled={busy}
                  onClick={() => downloadItem(item)}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('Download')}</span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-semantic-jira-border rounded-xl p-5 text-center text-xs text-semantic-jira-muted bg-semantic-jira-surface/30">
            {t('No evidence linked yet.')}
          </div>
        )}
      </section>
    </div>
  );
};

/* =========================================================================
   HISTORY TAB COMPONENT
   ========================================================================= */
const HistoryView: React.FC<{ detail: ThreatModelDetail }> = ({ detail }) => {
  const { t } = useI18n();

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* Revision History */}
      <section className="space-y-2">
        <h4 className="font-bold text-caption text-semantic-jira-primary uppercase tracking-wider">
          {t('Versioned revision history')}
        </h4>
        {Array.isArray(detail.revisions) && detail.revisions.length > 0 ? (
          <div className="divide-y divide-semantic-jira-border border border-semantic-jira-border rounded-xl overflow-hidden bg-semantic-panel shadow-sm">
            {detail.revisions.map((item) => (
              <div key={item.id || item.revisionNumber} className="p-3.5 text-xs space-y-1 hover:bg-semantic-jira-hover/40 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-semantic-jira-brand">
                      v{item.revisionNumber}
                    </span>
                    <span className="text-micro font-semibold px-2 py-0.5 rounded bg-semantic-jira-surface border border-semantic-jira-border text-semantic-jira-muted">
                      {item.status}
                    </span>
                  </div>
                  <span className="text-micro font-mono text-semantic-jira-muted">
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
                  </span>
                </div>
                <p className="text-semantic-jira-primary text-micro">
                  {item.changeReason || t('Initial revision')}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-semantic-jira-border rounded-xl p-5 text-center text-xs text-semantic-jira-muted bg-semantic-jira-surface/30">
            {t('No revisions recorded yet.')}
          </div>
        )}
      </section>

      {/* Audit History */}
      <section className="space-y-2">
        <h4 className="font-bold text-caption text-semantic-jira-primary uppercase tracking-wider">
          {t('Immutable audit history')}
        </h4>
        {Array.isArray(detail.history) && detail.history.length > 0 ? (
          <div className="divide-y divide-semantic-jira-border border border-semantic-jira-border rounded-xl overflow-hidden bg-semantic-panel shadow-sm max-h-[480px] overflow-y-auto custom-scrollbar">
            {detail.history.map((item, index) => (
              <div key={item.id || index} className="p-3 text-xs flex items-center justify-between hover:bg-semantic-jira-hover/40 transition-colors">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-micro px-1.5 py-0.5 rounded bg-semantic-jira-surface border border-semantic-jira-border text-semantic-jira-primary">
                      {item.action}
                    </span>
                    <span className="text-semantic-jira-muted font-medium">{item.entityType}</span>
                  </div>
                </div>
                <span className="text-micro font-mono text-semantic-jira-muted">
                  {item.occurredAt ? new Date(item.occurredAt).toLocaleString() : ''}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-semantic-jira-border rounded-xl p-5 text-center text-xs text-semantic-jira-muted bg-semantic-jira-surface/30">
            {t('No audit events recorded.')}
          </div>
        )}
      </section>
    </div>
  );
};

/* =========================================================================
   SUB-COMPONENTS & HELPERS
   ========================================================================= */
const Form: React.FC<{
  title: string;
  onSubmit: (event: React.FormEvent) => void;
  submit: string;
  busy: boolean;
  children: React.ReactNode;
}> = ({ title, onSubmit, submit, busy, children }) => (
  <form onSubmit={onSubmit} className="border border-semantic-jira-border bg-semantic-panel rounded-xl p-4 shadow-sm space-y-3.5">
    <div className="font-bold text-semantic-jira-primary uppercase tracking-wider text-caption pb-2 border-b border-semantic-jira-border/60">
      {title}
    </div>
    <div className="grid md:grid-cols-2 gap-3">{children}</div>
    <div className="pt-2">
      <button disabled={busy} className="jira-btn-primary flex items-center gap-1.5" type="submit">
        <Plus className="w-4 h-4" />
        <span>{submit}</span>
      </button>
    </div>
  </form>
);

const VerificationExecutionContext: React.FC<{ value: any; onChange: (value: any) => void }> = ({ value, onChange }) => {
  const { t } = useI18n();

  return (
    <section className="border border-semantic-jira-info-border bg-semantic-jira-brand-surface/40 rounded-xl p-4 space-y-3">
      <div>
        <h3 className="font-bold text-semantic-jira-primary uppercase tracking-wider text-caption">
          {t('Reproducibility context')}
        </h3>
        <p className="mt-1 text-xs text-semantic-jira-muted leading-relaxed">
          {t('A PASS requires target, environment, and an immutable build or deployment reference. Tool, configuration, and run references preserve an independently repeatable result.')}
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-3.5 mt-2">
        {[
          ['target', t('Test target'), 'API, service, host, or control instance'],
          ['environment', t('Environment'), 'production, staging, or CI'],
          ['buildReference', t('Immutable build / deployment reference'), 'commit SHA, artifact digest, or release ID'],
          ['tool', t('Tool / procedure'), 'scanner, test suite, or review procedure'],
          ['toolVersion', t('Tool version'), 'e.g. v2.4.1'],
          ['configurationReference', t('Configuration reference'), 'policy, config digest, or pipeline link'],
          ['runReference', t('Run reference'), 'run ID, ticket, or immutable log ID'],
        ].map(([name, label, placeholder]) => (
          <label key={name} className="block text-xs font-semibold text-semantic-jira-muted">
            {label}
            <input
              className={field}
              value={value[name] || ''}
              placeholder={placeholder}
              onChange={(event) => onChange({ ...value, [name]: event.target.value })}
            />
          </label>
        ))}
      </div>
    </section>
  );
};

const Records: React.FC<{ title: string; items: any[]; render: (item: any) => string }> = ({ title, items, render }) => {
  const { t } = useI18n();
  return (
    <section className="space-y-2">
      <h3 className="font-bold text-semantic-jira-primary uppercase tracking-wider text-caption">{t(title)}</h3>
      {items.length ? (
        <div className="divide-y divide-semantic-jira-border border border-semantic-jira-border rounded-xl overflow-hidden bg-semantic-panel shadow-sm">
          {items.map((item) => (
            <div key={item.id || JSON.stringify(item)} className="px-4 py-3 text-xs text-semantic-jira-primary hover:bg-semantic-jira-hover/50 transition-colors">
              {render(item)}
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-dashed border-semantic-jira-border rounded-xl p-5 text-center text-xs text-semantic-jira-muted bg-semantic-jira-surface/30">
          {t('No structured records yet.')}
        </div>
      )}
    </section>
  );
};

const Dfd: React.FC<{ components: any[]; flows: any[] }> = ({ components, flows }) => {
  const { t } = useI18n();
  return (
    <section className="bg-semantic-panel border border-semantic-jira-border rounded-xl p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <Cpu className="w-4 h-4 text-semantic-jira-brand" />
        <h3 className="font-bold text-semantic-jira-primary uppercase tracking-wider text-caption">
          {t('Structured data-flow diagram')}
        </h3>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        {components.map((c) => (
          <div
            key={c.id}
            className="border border-semantic-jira-info-border bg-semantic-jira-brand-surface/50 rounded-lg p-3.5 space-y-1"
          >
            <div className="font-semibold text-xs text-semantic-jira-primary">{c.name}</div>
            <div className="text-micro font-mono text-semantic-jira-brand uppercase">{c.type}</div>
            <div className="text-micro text-semantic-jira-muted mt-2 pt-2 border-t border-semantic-jira-border/40 truncate">
              {flows.filter((flow) => flow.sourceComponentId === c.id || flow.destinationComponentId === c.id)
                .map((flow) => flow.name)
                .join(' · ') || t('No connected flows')}
            </div>
          </div>
        ))}
      </div>
      {!components.length && (
        <div className="text-xs text-semantic-jira-muted italic">
          {t('Add components to compose the diagram; use Data flows to connect them.')}
        </div>
      )}
    </section>
  );
};

const ThreatTable: React.FC<{ threats: any[]; controls: any[] }> = ({ threats, controls }) => {
  const { t } = useI18n();
  return (
    <section className="space-y-2">
      <h3 className="font-bold text-semantic-jira-primary uppercase tracking-wider text-caption">
        {t('Threat register')}
      </h3>
      {threats.length ? (
        <div className="divide-y divide-semantic-jira-border border border-semantic-jira-border rounded-xl overflow-hidden bg-semantic-panel shadow-sm">
          {threats.map((item) => (
            <div key={item.id} className="p-3.5 text-xs flex items-center justify-between hover:bg-semantic-jira-hover/40 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-semantic-jira-brand">{item.key}</span>
                  <span className="font-semibold text-semantic-jira-primary">{item.title}</span>
                  <span className="font-mono text-micro px-1.5 py-0.5 rounded bg-semantic-jira-surface border border-semantic-jira-border text-semantic-jira-muted">
                    {item.inherentScore}/25
                  </span>
                </div>
                <div className="flex items-center gap-2 text-micro text-semantic-jira-muted">
                  <span>{(item.categories || []).join(', ')}</span>
                  <span>·</span>
                  <span>{controls.filter((c) => c.threatId === item.id).length} {t('control(s)')}</span>
                </div>
              </div>
              <span className="text-caption font-medium px-2 py-0.5 rounded bg-semantic-jira-surface border border-semantic-jira-border text-semantic-jira-muted">
                {item.status}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-dashed border-semantic-jira-border rounded-xl p-5 text-center text-xs text-semantic-jira-muted bg-semantic-jira-surface/30">
          {t('No structured records yet.')}
        </div>
      )}
    </section>
  );
};

const ControlTable: React.FC<{ controls: any[]; threats: any[] }> = ({ controls, threats }) => {
  const { t } = useI18n();
  return (
    <section className="space-y-2">
      <h3 className="font-bold text-semantic-jira-primary uppercase tracking-wider text-caption">
        {t('Control and remediation tickets')}
      </h3>
      {controls.length ? (
        <div className="divide-y divide-semantic-jira-border border border-semantic-jira-border rounded-xl overflow-hidden bg-semantic-panel shadow-sm">
          {controls.map((item) => {
            const matchedThreat = threats.find((t) => t.id === item.threatId);
            return (
              <div key={item.id} className="p-3.5 text-xs flex items-center justify-between hover:bg-semantic-jira-hover/40 transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {matchedThreat && (
                      <span className="font-mono text-micro px-1.5 py-0.5 rounded bg-semantic-jira-brand-surface text-semantic-jira-brand border border-semantic-jira-info-border">
                        {matchedThreat.key}
                      </span>
                    )}
                    <span className="font-semibold text-semantic-jira-primary">{item.title}</span>
                    {item.requiredBeforeRelease && (
                      <span className="text-micro font-bold px-1.5 py-0.5 rounded border border-semantic-danger-border bg-semantic-danger-surface text-semantic-danger">
                        {t('Release blocking')}
                      </span>
                    )}
                  </div>
                  {item.implementationTicketId && (
                    <div className="text-micro font-mono text-semantic-jira-muted">
                      {t('Ticket')}: {item.implementationTicketId} ({item.implementationTicketStatus || 'open'})
                    </div>
                  )}
                </div>
                <span className="text-caption font-medium px-2 py-0.5 rounded bg-semantic-jira-surface border border-semantic-jira-border text-semantic-jira-muted">
                  {item.status}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="border border-dashed border-semantic-jira-border rounded-xl p-5 text-center text-xs text-semantic-jira-muted bg-semantic-jira-surface/30">
          {t('No structured records yet.')}
        </div>
      )}
    </section>
  );
};
