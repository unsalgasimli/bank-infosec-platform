import React, { useEffect, useState } from 'react';
import { Save, Plus, X, AlertCircle, ListChecks, ShieldCheck } from 'lucide-react';
import { useI18n } from '../../context/I18nContext.js';
import type { BankUser } from '../../../shared/types/auth.js';

type FetchWithAuth = (url: string, options?: RequestInit) => Promise<Response>;

const signalDefaults = ['internetExposed', 'customerData', 'confidentialData', 'financialTransactions', 'authenticationChange', 'authorizationChange', 'privilegedCapability', 'externalApi', 'trustBoundary', 'thirdPartyIntegration', 'cloudDeployment', 'newDataStore', 'cryptography', 'secretsHandling', 'paymentRelated', 'coreBankingRelated', 'iamPamRelated', 'criticalInfrastructure', 'materialArchitectureChange', 'highCriticalAsset', 'securityIncidentDriven'];
const dayDefaults = { CRITICAL: 1, HIGH: 14, MEDIUM: 30, LOW: 90 };
const exceptionDayDefaults = { CRITICAL: 30, HIGH: 90, MEDIUM: 180, LOW: 365 };
const verificationDayDefaults = { DEFAULT: 90, SAST: 30, SCA: 30, DAST: 30, PENETRATION_TEST: 180 };
const severityValues = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const approvalStageValues = [
  { id: 'APPSEC', label: 'Application Security' },
  { id: 'SECURITY_ARCHITECTURE', label: 'Security Architecture' },
  { id: 'RISK_AUTHORITY', label: 'Risk Authority' },
];

type PolicyTab = 'policy' | 'backlog';

/** Toggleable chip used for multi-value policy selections (replaces native multi-selects). */
const Chip: React.FC<{ active: boolean; onToggle: () => void; children: React.ReactNode }> = ({ active, onToggle, children }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onToggle}
    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
      active
        ? 'bg-semantic-jira-brand-surface border-semantic-jira-info-border text-semantic-jira-brand'
        : 'bg-semantic-panel border-semantic-jira-border text-semantic-jira-muted hover:text-semantic-jira-primary hover:border-semantic-jira-border-strong'
    }`}
  >
    {children}
  </button>
);

const SectionCard: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section className="rounded-xl border border-semantic-jira-border bg-semantic-jira-surface/40 p-4 space-y-3">
    <div>
      <h3 className="text-caption font-bold text-semantic-jira-primary uppercase tracking-wider">{title}</h3>
      {hint && <p className="text-micro text-semantic-jira-muted mt-0.5">{hint}</p>}
    </div>
    {children}
  </section>
);

/** Editable chip list: replaces the legacy comma-separated textarea for required signals. */
const SignalEditor: React.FC<{ values: string[]; onChange: (values: string[]) => void }> = ({ values, onChange }) => {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  const commit = () => {
    const next = draft.trim().replace(/,+$/, '');
    if (!next) return;
    if (!values.includes(next)) onChange([...values, next]);
    setDraft('');
  };
  return (
    <div className="rounded-lg border border-semantic-jira-border bg-semantic-panel p-2.5 space-y-2">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((signal) => (
            <span key={signal} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-semantic-jira-brand-surface border border-semantic-jira-info-border text-semantic-jira-brand font-mono text-micro font-semibold">
              {signal}
              <button
                type="button"
                aria-label={`${t('Remove')} ${signal}`}
                className="hover:text-semantic-danger"
                onClick={() => onChange(values.filter((value) => value !== signal))}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          className="jira-input text-xs flex-1 min-w-0"
          value={draft}
          placeholder={t('Add a screening signal, e.g. openAiEndpoint')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              commit();
            }
          }}
        />
        <button type="button" className="jira-btn-secondary text-xs !py-1.5" onClick={commit}>
          <Plus className="w-3.5 h-3.5" />
          <span>{t('Add')}</span>
        </button>
      </div>
    </div>
  );
};

const Thresholds: React.FC<{ label: string; values: Record<string, number>; onChange: (values: Record<string, number>) => void }> = ({ label, values, onChange }) => (
  <fieldset className="border border-semantic-jira-border rounded-lg p-2.5 bg-semantic-panel min-w-0">
    <legend className="px-1 text-caption font-semibold text-semantic-jira-muted">{label}</legend>
    <div className="grid grid-cols-2 gap-2">
      {Object.entries(values).map(([key, value]) => (
        <label key={key} className="text-micro font-semibold text-semantic-jira-muted">
          {key}
          <input
            className="jira-input mt-1 w-full text-xs"
            type="number"
            min="1"
            max="730"
            value={value}
            onChange={(event) => onChange({ ...values, [key]: Number(event.target.value) })}
          />
        </label>
      ))}
    </div>
  </fieldset>
);

const backlogStatusPill: Record<string, string> = {
  NOT_STARTED: 'jira-lozenge-todo',
  PLANNED: 'jira-lozenge-todo',
  IN_PROGRESS: 'jira-lozenge-inprogress',
  APPROVED: 'jira-lozenge-done',
  OVERDUE: 'jira-lozenge-blocked',
};

export const ThreatModelGovernancePanel: React.FC<{ fetchWithAuth: FetchWithAuth; currentUser?: BankUser | null; onError: (message: string) => void }> = ({ fetchWithAuth, currentUser, onError }) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<PolicyTab>('policy');
  const [policy, setPolicy] = useState<any>(null);
  const [backlog, setBacklog] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState({ systemName: '', tier: 'TIER_1', status: 'NOT_STARTED', criticality: 'HIGH', targetDate: '', notes: '' });
  const canAdmin = Boolean(currentUser?.roles.some((role) => ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'APPSEC_ANALYST', 'GRC_ANALYST'].includes(role)));
  const canPolicy = Boolean(currentUser?.roles.some((role) => ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER'].includes(role)));

  const load = async () => {
    if (!canAdmin) return;
    setLoading(true);
    try {
      const [policyRes, backlogRes] = await Promise.all([fetchWithAuth('/api/threat-model-policy'), fetchWithAuth('/api/threat-model-migration-backlog')]);
      const policyData = await policyRes.json();
      const backlogData = await backlogRes.json();
      if (policyData.success) setPolicy(policyData.policy?.policy || policyData.policy); else onError(policyData.error || t('Threat Model policy could not be loaded.'));
      if (backlogData.success) setBacklog(backlogData.backlog || []); else onError(backlogData.error || t('Migration backlog could not be loaded.'));
    } catch (error) {
      onError(error instanceof Error ? error.message : t('Threat Model governance data could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [canAdmin]);

  const savePolicy = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canPolicy || !policy) return;
    setBusy(true);
    try {
      const response = await fetchWithAuth('/api/threat-model-policy', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationId: 'org-bank', policy }) });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || t('Policy could not be saved.'));
      await load();
    } catch (error) {
      onError(error instanceof Error ? error.message : t('Policy could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  const saveBacklog = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canAdmin) return;
    setBusy(true);
    try {
      const response = await fetchWithAuth('/api/threat-model-migration-backlog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...item, organizationId: 'org-bank' }) });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || t('Backlog entry could not be saved.'));
      setItem({ systemName: '', tier: 'TIER_1', status: 'NOT_STARTED', criticality: 'HIGH', targetDate: '', notes: '' });
      await load();
    } catch (error) {
      onError(error instanceof Error ? error.message : t('Backlog entry could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  if (!canAdmin) {
    return (
      <div className="p-6">
        <div className="border border-semantic-warning-border bg-semantic-warning-surface text-semantic-warning rounded-lg p-4 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{t('Only governance administrators can access Threat Model policy administration.')}</span>
        </div>
      </div>
    );
  }

  const field = 'jira-input mt-1 w-full text-xs';
  const requiredStages: string[] = policy?.requiredApprovalStages || [];
  const blockingSeverities: string[] = policy?.releaseBlockingSeverities || [];

  return (
    <div>
      {/* Drawer section tabs */}
      <div role="tablist" aria-label={t('Governance settings')} className="flex items-center gap-1 px-4 pt-3 border-b border-semantic-jira-border bg-semantic-jira-surface/40">
        {([
          { id: 'policy' as PolicyTab, label: t('Release policy'), icon: ShieldCheck },
          { id: 'backlog' as PolicyTab, label: `${t('Migration backlog')} (${backlog.length})`, icon: ListChecks },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${
              tab === id
                ? 'border-semantic-jira-brand text-semantic-jira-brand'
                : 'border-transparent text-semantic-jira-muted hover:text-semantic-jira-primary'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {tab === 'policy' && (
        loading ? (
          <div className="p-8 text-center text-xs text-semantic-jira-muted flex flex-col items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-semantic-jira-brand border-t-transparent rounded-full animate-spin" />
            <span>{t('Loading...')}</span>
          </div>
        ) : policy ? (
          <form onSubmit={savePolicy} className="p-4 space-y-3.5">
            <div className="grid md:grid-cols-2 gap-3.5">
              <SectionCard title={t('Review cadence & release gate')} hint={t('How often approved models must be re-reviewed, and which severities block a release.')}>
                <label className="block text-xs font-semibold text-semantic-jira-muted">
                  {t('Review frequency (days)')}
                  <input className={field} type="number" min="1" max="730" value={policy.reviewFrequencyDays || 365} onChange={(event) => setPolicy({ ...policy, reviewFrequencyDays: Number(event.target.value) })} />
                </label>
                <div>
                  <div className="text-xs font-semibold text-semantic-jira-muted mb-1.5">{t('Release-blocking severities')}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {severityValues.map((value) => (
                      <Chip key={value} active={blockingSeverities.includes(value)} onToggle={() => setPolicy({ ...policy, releaseBlockingSeverities: blockingSeverities.includes(value) ? blockingSeverities.filter((entry) => entry !== value) : [...blockingSeverities, value] })}>
                        {value}
                      </Chip>
                    ))}
                  </div>
                </div>
              </SectionCard>

              <SectionCard title={t('Approval workflow')} hint={t('Every selected stage must approve the immutable revision before release.')}>
                <div className="space-y-1.5">
                  {approvalStageValues.map((stage) => {
                    const active = requiredStages.includes(stage.id);
                    return (
                      <button
                        key={stage.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setPolicy({ ...policy, requiredApprovalStages: active ? requiredStages.filter((entry) => entry !== stage.id) : [...requiredStages, stage.id] })}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
                          active
                            ? 'bg-semantic-jira-brand-surface/60 border-semantic-jira-info-border'
                            : 'bg-semantic-panel border-semantic-jira-border hover:border-semantic-jira-border-strong'
                        }`}
                      >
                        <span>
                          <span className={`block text-xs font-bold ${active ? 'text-semantic-jira-brand' : 'text-semantic-jira-primary'}`}>{t(stage.label)}</span>
                          <span className="block font-mono text-micro text-semantic-jira-muted">{stage.id}</span>
                        </span>
                        <span className={`text-micro font-bold px-2 py-0.5 rounded-full border ${active ? 'bg-semantic-success-surface border-semantic-success-border text-semantic-success' : 'bg-semantic-jira-surface border-semantic-jira-border text-semantic-jira-muted'}`}>
                          {active ? t('Required') : t('Optional')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </SectionCard>
            </div>

            <SectionCard title={t('Thresholds (days)')} hint={t('Severity-specific service levels applied server-side when screening, approving, and expiring records.')}>
              <div className="grid md:grid-cols-3 gap-3">
                <Thresholds label={t('Remediation SLA (days)')} values={policy.remediationSlaDays || dayDefaults} onChange={(values) => setPolicy({ ...policy, remediationSlaDays: values })} />
                <Thresholds label={t('Max exception duration (days)')} values={policy.maxExceptionDays || exceptionDayDefaults} onChange={(values) => setPolicy({ ...policy, maxExceptionDays: values })} />
                <Thresholds label={t('Verification expiry (days)')} values={policy.verificationExpirationDays || verificationDayDefaults} onChange={(values) => setPolicy({ ...policy, verificationExpirationDays: values })} />
              </div>
            </SectionCard>

            <SectionCard title={t('Required signals')} hint={t('Any of these signals during screening forces a security impact assessment before submission.')}>
              <SignalEditor values={policy.requiredSignals || signalDefaults} onChange={(values) => setPolicy({ ...policy, requiredSignals: values })} />
            </SectionCard>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
              {!canPolicy && (
                <span className="text-caption text-semantic-jira-muted mr-auto">{t('Only CISO or platform security administrators can change policy.')}</span>
              )}
              <button disabled={busy || !canPolicy} className="jira-btn-primary flex items-center gap-1.5">
                <Save className="w-4 h-4" />
                <span>{t('Save policy')}</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="p-8 text-center text-xs text-semantic-jira-muted">{t('Threat Model policy could not be loaded.')}</div>
        )
      )}

      {tab === 'backlog' && (
        <div className="p-4 grid lg:grid-cols-[minmax(0,1fr)_320px] gap-3.5 items-start">
          {/* Migration coverage list */}
          <section className="space-y-2 min-w-0">
            <h3 className="text-caption font-bold text-semantic-jira-primary uppercase tracking-wider">{t('Tier 1–3 migration backlog')}</h3>
            {backlog.length ? (
              <div className="divide-y divide-semantic-jira-border border border-semantic-jira-border rounded-xl overflow-hidden bg-semantic-panel">
                {backlog.map((entry) => (
                  <div key={entry.id} className="px-3.5 py-2.5 text-xs flex flex-wrap items-center gap-2 hover:bg-semantic-jira-hover/40 transition-colors">
                    <span className="font-bold text-semantic-jira-primary">{entry.systemName}</span>
                    <span className={`jira-lozenge ${backlogStatusPill[entry.status] || 'jira-lozenge-todo'}`}>{t(entry.status.replaceAll('_', ' ').toLowerCase())}</span>
                    <span className="font-mono text-micro text-semantic-jira-muted">{entry.tier.replaceAll('_', ' ')}</span>
                    <span className="text-micro text-semantic-jira-muted">· {entry.criticality}</span>
                    {entry.targetDate && <span className="text-micro text-semantic-jira-muted">· {t('target')} {entry.targetDate}</span>}
                    {entry.currentThreatModelKey && (
                      <span className="font-mono text-micro text-semantic-jira-brand ml-auto">{entry.currentThreatModelKey}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-dashed border-semantic-jira-border rounded-xl p-5 text-center text-xs text-semantic-jira-muted bg-semantic-jira-surface/30">
                {t('No authorized migration backlog entries.')}
              </div>
            )}
          </section>

          {/* Add or update entry */}
          <form onSubmit={saveBacklog} className="border border-semantic-jira-border rounded-xl p-3.5 grid grid-cols-2 gap-2.5 bg-semantic-jira-surface/40">
            <h3 className="col-span-2 text-xs font-bold text-semantic-jira-primary">{t('Add or update backlog entry')}</h3>
            <label className="col-span-2 text-xs font-semibold text-semantic-jira-muted">
              {t('System name')}
              <input required className={field} value={item.systemName} onChange={(event) => setItem({ ...item, systemName: event.target.value })} />
            </label>
            <label className="text-xs font-semibold text-semantic-jira-muted">
              {t('Tier')}
              <select className={field} value={item.tier} onChange={(event) => setItem({ ...item, tier: event.target.value })}>
                {['TIER_1', 'TIER_2', 'TIER_3'].map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-semantic-jira-muted">
              {t('Status')}
              <select className={field} value={item.status} onChange={(event) => setItem({ ...item, status: event.target.value })}>
                {['NOT_STARTED', 'PLANNED', 'IN_PROGRESS', 'APPROVED', 'OVERDUE'].map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-semantic-jira-muted">
              {t('Criticality')}
              <select className={field} value={item.criticality} onChange={(event) => setItem({ ...item, criticality: event.target.value })}>
                {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-semantic-jira-muted">
              {t('Target date')}
              <input className={field} type="date" value={item.targetDate} onChange={(event) => setItem({ ...item, targetDate: event.target.value })} />
            </label>
            <label className="col-span-2 text-xs font-semibold text-semantic-jira-muted">
              {t('Notes')}
              <textarea className={field} value={item.notes} onChange={(event) => setItem({ ...item, notes: event.target.value })} />
            </label>
            <button disabled={busy} className="col-span-2 jira-btn-primary flex items-center justify-center gap-1.5">
              <Plus className="w-4 h-4" />
              <span>{t('Save backlog entry')}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
