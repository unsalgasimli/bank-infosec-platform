import React, { useEffect, useRef, useState } from 'react';
import {
  FilePlus2,
  ShieldCheck,
  Search,
  Filter,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Layers,
  AlertTriangle,
  RotateCcw,
  Settings2,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../context/I18nContext.js';
import { Badge } from '../common/Badge.js';
import { ThreatModelDetailPanel, type ThreatModelDetail, type ThreatModelSummary } from './ThreatModelDetailPanel.js';
import { ThreatModelGovernancePanel } from './ThreatModelGovernancePanel.js';

export const ThreatModelWorkspace: React.FC = () => {
  const { fetchWithAuth, currentUser } = useAuth();
  const { t } = useI18n();
  const [models, setModels] = useState<ThreatModelSummary[]>([]);
  const [detail, setDetail] = useState<ThreatModelDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [showGovernance, setShowGovernance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const listSequence = useRef(0);
  const requestSequence = useRef(0);
  const requestedModelIdRef = useRef<string | null>(new URLSearchParams(window.location.search).get('modelId'));
  const filterFormRef = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState({ title: '', serviceId: '', assetId: '', projectId: '', changeId: '', releaseId: '', criticality: 'HIGH' });
  type ScopeField = 'serviceId' | 'assetId' | 'projectId' | 'changeId' | 'releaseId';
  const scopeFields: Array<{ value: ScopeField; label: string }> = [
    { value: 'serviceId', label: t('Service / CMDB') },
    { value: 'assetId', label: t('Asset / CI') },
    { value: 'projectId', label: t('Project') },
    { value: 'changeId', label: t('Change request') },
    { value: 'releaseId', label: t('Release') },
  ];
  const [scopeType, setScopeType] = useState<ScopeField>('serviceId');
  const [scopeId, setScopeId] = useState('');
  type ScopeOption = { value: string; label: string };
  const [scopeOptions, setScopeOptions] = useState<Record<ScopeField, ScopeOption[]>>({ serviceId: [], assetId: [], projectId: [], changeId: [], releaseId: [] });
  const [loadingScopeOptions, setLoadingScopeOptions] = useState(false);
  const [scopeOptionsError, setScopeOptionsError] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const sequence = ++listSequence.current;
    setLoading(true);
    setError('');
    try {
      const response = await fetchWithAuth(`/api/threat-models?limit=50&offset=${offset}&${filters}`);
      const data = await response.json();
      if (sequence !== listSequence.current) return;
      if (!response.ok || !data.success) throw new Error(data.error || t('Threat Models could not be loaded.'));
      const loadedModels = Array.isArray(data.threatModels) ? data.threatModels : [];
      setModels(loadedModels);
      if (loadedModels.length > 0) {
        setDetail((prev) => {
          // A project deep link loads its exact model independently. Do not let
          // the ordinary first-page selection race and replace that record.
          if (!requestedModelIdRef.current && (!prev || !loadedModels.some((m: any) => m.id === prev.model.id))) {
            void select(loadedModels[0]);
          }
          return prev;
        });
      } else {
        setDetail(null);
      }
    } catch (cause) {
      if (sequence !== listSequence.current) return;
      setError(cause instanceof Error ? cause.message : t('Threat Models could not be loaded.'));
      setModels([]);
      setDetail(null);
    } finally {
      if (sequence === listSequence.current) setLoading(false);
    }
  };

  const select = async (model: ThreatModelSummary) => {
    const sequence = ++requestSequence.current;
    setError('');
    setLoadingDetail(true);
    try {
      const [detailResponse, gateResponse] = await Promise.all([
        fetchWithAuth(`/api/threat-models/${model.id}`),
        fetchWithAuth(`/api/threat-models/${model.id}/release-gate`)
      ]);
      const data = await detailResponse.json();
      const gate = await gateResponse.json();
      if (sequence !== requestSequence.current) return;
      if (!detailResponse.ok || !data.success) throw new Error(data.error || t('Threat Model could not be loaded.'));
      setDetail({ ...data, releaseGate: gateResponse.ok && gate.success ? gate.releaseGate : undefined });
    } catch (cause) {
      if (sequence === requestSequence.current) {
        setDetail(null);
        setError(cause instanceof Error ? cause.message : t('Threat Model could not be loaded.'));
      }
    } finally {
      if (sequence === requestSequence.current) setLoadingDetail(false);
    }
  };

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedModelId = requestedModelIdRef.current || query.get('modelId');
    if (requestedModelId) {
      void select({ id: requestedModelId } as ThreatModelSummary);
      return;
    }
    const linkedScope = scopeFields.map(({ value }) => [value, query.get(value) || ''] as const).find(([, value]) => value);
    if (linkedScope) {
      setScopeType(linkedScope[0]);
      setScopeId(linkedScope[1]);
      setError('');
      setForm((current) => ({ ...current, title: query.get('title') || current.title }));
      setCreating(true);
    }
  }, []);

  useEffect(() => {
    if (!creating) return;
    const controller = new AbortController();
    const endpoint = '/api/threat-models/scope-options';
    setLoadingScopeOptions(true);
    setScopeOptionsError('');
    void fetchWithAuth(endpoint, { signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Linked records could not be loaded.');
      const options = data.scopeOptions || {};
      if (!controller.signal.aborted) {
        setScopeOptions({
          serviceId: options.serviceId || [],
          assetId: options.assetId || [],
          projectId: options.projectId || [],
          changeId: options.changeId || [],
          releaseId: options.releaseId || []
        });
      }
    }).catch((cause) => {
      if (!controller.signal.aborted) setScopeOptionsError(cause instanceof Error ? cause.message : 'Linked records could not be loaded.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingScopeOptions(false);
    });
    return () => controller.abort();
  }, [creating, fetchWithAuth]);

  useEffect(() => {
    void load();
  }, [offset, filters]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (creatingDraft) return;
    setError('');
    setCreatingDraft(true);
    try {
      const linkedScope = Object.fromEntries(scopeFields.map(({ value }) => [value, value === scopeType ? scopeId.trim() : '']));
      const response = await fetchWithAuth('/api/threat-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          ...linkedScope,
          technicalOwnerId: currentUser?.id,
          businessOwnerId: currentUser?.id,
          dataClassification: 'CONFIDENTIAL_SECURITY_ONLY'
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Threat Model could not be created.');
      if (!data.model) throw new Error('The server did not return the created Threat Model. Please refresh and check the model list.');
      setCreating(false);
      setForm({ title: '', serviceId: '', assetId: '', projectId: '', changeId: '', releaseId: '', criticality: 'HIGH' });
      setScopeType('serviceId');
      setScopeId('');
      await load();
      await select(data.model);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Threat Model could not be created.');
    } finally {
      setCreatingDraft(false);
    }
  };

  const handleResetFilters = () => {
    if (filterFormRef.current) {
      filterFormRef.current.reset();
    }
    setOffset(0);
    setFilters('');
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-semantic-jira-surface custom-scrollbar">
      {/* Top Banner / Header */}
      <div className="bg-semantic-panel border border-semantic-jira-border rounded-xl p-5 flex flex-wrap gap-4 items-center justify-between shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-lg bg-semantic-jira-brand-surface text-semantic-jira-brand border border-semantic-jira-info-border shadow-xs">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-semantic-jira-primary tracking-tight">{t('Threat Modeling')}</h1>
            <p className="text-xs text-semantic-jira-muted mt-0.5">
              {t('Versioned architecture security reviews, verification evidence, risk decisions, and server-enforced release gates.')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className={`jira-btn-subtle flex items-center gap-1.5 transition-colors ${showGovernance ? 'bg-semantic-jira-hover text-semantic-jira-primary font-semibold' : ''}`}
            onClick={() => setShowGovernance(!showGovernance)}
          >
            <Settings2 className="w-4 h-4 text-semantic-jira-muted" />
            <span>{t('Governance settings')}</span>
          </button>
          <button
            type="button"
            className="jira-btn-primary flex items-center gap-1.5"
            onClick={() => { setError(''); setCreating(true); }}
          >
            <FilePlus2 className="w-4 h-4" />
            <span>{t('New Threat Model')}</span>
          </button>
        </div>
      </div>

      {/* Global Error Notice */}
      {error && (
        <div className="text-xs border border-semantic-danger-border bg-semantic-danger-surface text-semantic-danger rounded-lg p-3.5 flex items-start gap-2 shadow-xs">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button type="button" onClick={() => setError('')} className="text-semantic-danger hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter Toolbar Card */}
      <div className="bg-semantic-panel border border-semantic-jira-border rounded-xl p-4 shadow-sm space-y-3">
        <form
          ref={filterFormRef}
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const params = new URLSearchParams();
            new FormData(event.currentTarget).forEach((value, key) => {
              const entered = String(value).trim();
              if (entered) {
                params.set(key, ['reviewDueBefore', 'exceptionExpiresBefore'].includes(key) ? new Date(entered).toISOString() : entered);
              }
            });
            setOffset(0);
            setFilters(params.toString());
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
            <div>
              <label className="text-caption font-semibold text-semantic-jira-muted block mb-1">
                {t('Search')}
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-semantic-jira-muted absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  name="q"
                  maxLength={200}
                  className="jira-input !pl-8 text-xs w-full"
                  placeholder={t('Model, threat, control, compliance')}
                />
              </div>
            </div>

            <div>
              <label className="text-caption font-semibold text-semantic-jira-muted block mb-1">
                {t('Status')}
              </label>
              <select name="status" className="jira-input text-xs w-full">
                <option value="">{t('All')}</option>
                {[
                  { val: 'DRAFT', label: t('Draft') },
                  { val: 'IN_REVIEW', label: t('In review') },
                  { val: 'CHANGES_REQUIRED', label: t('Changes required') },
                  { val: 'APPROVED', label: t('Approved') },
                  { val: 'REVIEW_REQUIRED', label: t('Review required') },
                  { val: 'RETIRED', label: t('Retired') },
                  { val: 'ARCHIVED', label: t('Archived') },
                ].map(({ val, label }) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-caption font-semibold text-semantic-jira-muted block mb-1">
                {t('Tier')}
              </label>
              <select name="tier" className="jira-input text-xs w-full">
                <option value="">{t('All')}</option>
                {[0, 1, 2, 3].map((value) => (
                  <option key={value} value={value}>TM-{value}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-caption font-semibold text-semantic-jira-muted block mb-1">
                {t('Inherent risk')}
              </label>
              <select name="risk" className="jira-input text-xs w-full">
                <option value="">{t('All')}</option>
                {[
                  { val: 'CRITICAL', label: t('Critical') },
                  { val: 'HIGH', label: t('High') },
                  { val: 'MEDIUM', label: t('Medium') },
                  { val: 'LOW', label: t('Low') },
                ].map(({ val, label }) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-caption font-semibold text-semantic-jira-muted block mb-1">
                {t('Owner')}
              </label>
              <input
                name="ownerId"
                maxLength={64}
                className="jira-input text-xs w-full"
                placeholder={t('e.g. secops-lead')}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="jira-btn-primary flex-1 flex items-center justify-center gap-1.5 text-xs h-[34px]"
                disabled={loading}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>{t('Apply filters')}</span>
              </button>
              {filters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  title={t('Reset filters')}
                  className="jira-btn-secondary px-2.5 text-xs h-[34px] flex items-center justify-center text-semantic-jira-muted hover:text-semantic-jira-primary"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Advanced Filters Expandable Card */}
          <div className="border-t border-semantic-jira-border/60 pt-2.5">
            <button
              type="button"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="flex items-center gap-1.5 text-caption font-semibold text-semantic-jira-brand hover:underline"
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>{t('Scope, relationships and due dates')}</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
            </button>

            {showAdvancedFilters && (
              <div className="mt-3 p-3.5 rounded-lg bg-semantic-jira-surface/70 border border-semantic-jira-border/70 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="text-caption text-semantic-jira-muted block mb-1">{t('Application / service ID')}</label>
                    <input name="serviceId" maxLength={64} className="jira-input text-xs w-full" placeholder="svc-core-banking" />
                  </div>
                  <div>
                    <label className="text-caption text-semantic-jira-muted block mb-1">{t('CMDB asset ID')}</label>
                    <input name="assetId" maxLength={64} className="jira-input text-xs w-full" placeholder="AST-10293" />
                  </div>
                  <div>
                    <label className="text-caption text-semantic-jira-muted block mb-1">{t('Classification')}</label>
                    <select name="classification" className="jira-input text-xs w-full">
                      <option value="">{t('All authorized')}</option>
                      {[
                        { val: 'PUBLIC', label: t('Public') },
                        { val: 'INTERNAL', label: t('Internal') },
                        { val: 'RESTRICTED', label: t('Restricted') },
                        { val: 'CONFIDENTIAL_SECURITY_ONLY', label: t('Confidential (Security only)') },
                        { val: 'HIGHLY_RESTRICTED_HR_LEGAL', label: t('Highly restricted (HR/Legal)') },
                      ].map(({ val, label }) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-caption text-semantic-jira-muted block mb-1">{t('Threat ID / key')}</label>
                    <input name="threatId" maxLength={64} className="jira-input text-xs w-full" placeholder="THR-01" />
                  </div>
                  <div>
                    <label className="text-caption text-semantic-jira-muted block mb-1">{t('Control ID')}</label>
                    <input name="controlId" maxLength={64} className="jira-input text-xs w-full" placeholder="CTL-SEC-01" />
                  </div>
                  <div>
                    <label className="text-caption text-semantic-jira-muted block mb-1">{t('Compliance requirement ID')}</label>
                    <input name="complianceId" maxLength={64} className="jira-input text-xs w-full" placeholder="PCI-DSS-Req-6.5" />
                  </div>
                  <div>
                    <label className="text-caption text-semantic-jira-muted block mb-1">{t('Threat due on / before')}</label>
                    <input name="threatDueBefore" type="date" className="jira-input text-xs w-full" />
                  </div>
                  <div>
                    <label className="text-caption text-semantic-jira-muted block mb-1">{t('Review due before (local time)')}</label>
                    <input name="reviewDueBefore" type="datetime-local" className="jira-input text-xs w-full" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-caption text-semantic-jira-muted block mb-1">{t('Approved / expired exception before (local time)')}</label>
                    <input name="exceptionExpiresBefore" type="datetime-local" className="jira-input text-xs w-full" />
                  </div>
                </div>
                <p className="text-micro text-semantic-jira-muted">
                  {t('Relationships and dates match the current revision only. Filters never widen your authorized scope.')}
                </p>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Slide-down Governance Settings Panel */}
      {showGovernance && (
        <ThreatModelGovernancePanel fetchWithAuth={fetchWithAuth} currentUser={currentUser} onError={setError} />
      )}

      {/* Main Master-Detail Area */}
      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-5 items-start">
        {/* Left Sidebar: Threat Models List */}
        <aside className="bg-semantic-panel border border-semantic-jira-border rounded-xl overflow-hidden shadow-sm flex flex-col">
          <div className="px-4 py-3.5 border-b border-semantic-jira-border bg-semantic-jira-surface/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-semantic-jira-brand" />
              <span className="text-xs font-bold text-semantic-jira-primary uppercase tracking-wider">
                {t('Models')}
              </span>
            </div>
            <span className="text-micro font-bold px-2 py-0.5 rounded-full bg-semantic-jira-brand-surface text-semantic-jira-brand border border-semantic-jira-info-border">
              {models.length}
            </span>
          </div>

          <div className="divide-y divide-semantic-jira-border min-h-[300px] max-h-[700px] overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="p-8 text-center text-xs text-semantic-jira-muted flex flex-col items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-semantic-jira-brand border-t-transparent rounded-full animate-spin" />
                <span>{t('Loading models...')}</span>
              </div>
            ) : models.length === 0 ? (
              <div className="p-8 text-center text-xs text-semantic-jira-muted">
                {t('No Threat Models are visible in your authorized scope.')}
              </div>
            ) : (
              models.map((model) => {
                const isSelected = detail?.model.id === model.id;
                return (
                  <button
                    key={model.id}
                    className={`w-full text-left p-3.5 transition-colors border-l-[3px] ${
                      isSelected
                        ? 'bg-semantic-jira-brand-surface/40 border-l-semantic-jira-brand'
                        : 'border-l-transparent hover:bg-semantic-jira-hover/70'
                    }`}
                    onClick={() => void select(model)}
                    disabled={loadingDetail}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-semantic-jira-brand tracking-tight">
                        {model.key}
                      </span>
                      <Badge type="SEVERITY" value={model.criticality} size="sm" />
                    </div>
                    <div className="text-xs font-semibold text-semantic-jira-primary mt-1 line-clamp-1">
                      {model.title}
                    </div>
                    <div className="flex items-center gap-2 text-micro text-semantic-jira-muted mt-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-semantic-panel border border-semantic-jira-border font-mono">
                        v{model.revisionNumber || 1}
                      </span>
                      <span>•</span>
                      <span className="capitalize">{t(model.status.toLowerCase().replaceAll('_', ' '))}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Integrated Sidebar Pagination Footer */}
          <div className="p-3 border-t border-semantic-jira-border bg-semantic-jira-surface/60 flex items-center justify-between text-xs text-semantic-jira-muted">
            <button
              type="button"
              className="jira-btn-subtle text-xs !py-1 !px-2.5 flex items-center gap-1 font-medium"
              disabled={loading || offset === 0}
              onClick={() => setOffset((value) => Math.max(0, value - 50))}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>{t('Previous')}</span>
            </button>
            <span className="text-micro font-mono font-semibold px-2 py-0.5 rounded bg-semantic-panel border border-semantic-jira-border">
              {t('Page')} {Math.floor(offset / 50) + 1}
            </span>
            <button
              type="button"
              className="jira-btn-subtle text-xs !py-1 !px-2.5 flex items-center gap-1 font-medium"
              disabled={loading || models.length < 50}
              onClick={() => setOffset((value) => value + 50)}
            >
              <span>{t('Next')}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </aside>

        {/* Right Content: Threat Model Detail Panel */}
        <ThreatModelDetailPanel
          key={detail?.model.id || 'none'}
          detail={detail}
          fetchWithAuth={fetchWithAuth}
          onRefresh={async () => {
            if (detail) {
              await load();
              await select(detail.model);
            }
          }}
          onError={setError}
        />
      </div>

      {/* Modal: Create Threat Model */}
      {creating && (
        <div className="fixed inset-0 z-dsDialog grid place-items-center bg-semantic-modal-tint/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={create}
            className="w-full max-w-2xl bg-semantic-panel border border-semantic-jira-border rounded-xl p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            aria-busy={creatingDraft}
          >
            <div className="flex items-start justify-between border-b border-semantic-jira-border pb-3">
              <div>
                <h3 className="font-bold text-base text-semantic-jira-primary">{t('Create Threat Model')}</h3>
                <p className="text-xs text-semantic-jira-muted mt-0.5">
                  {t('Link it to one real service, asset, project, change, or release before documenting the architecture.')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="text-semantic-jira-muted hover:text-semantic-jira-primary p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div role="alert" className="text-xs border border-semantic-danger-border bg-semantic-danger-surface text-semantic-danger rounded-lg p-3">
                {error}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block text-xs font-semibold text-semantic-jira-muted sm:col-span-2">
                {t('Title')}
                <input
                  className="jira-input mt-1.5 w-full text-xs"
                  required
                  placeholder={t('e.g. Core Payment Gateway Integration')}
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                />
              </label>

              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Link to')}
                <select
                  className="jira-input mt-1.5 w-full text-xs"
                  value={scopeType}
                  onChange={(event) => {
                    setScopeType(event.target.value as ScopeField);
                    setScopeId('');
                  }}
                >
                  {scopeFields.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Select record')}
                <select
                  className="jira-input mt-1.5 w-full text-xs"
                  required
                  value={scopeId}
                  disabled={loadingScopeOptions}
                  onChange={(event) => setScopeId(event.target.value)}
                >
                  <option value="">{loadingScopeOptions ? t('Loading records...') : t('Select an authorized record...')}</option>
                  {scopeOptions[scopeType].map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-semibold text-semantic-jira-muted">
                {t('Criticality')}
                <select
                  className="jira-input mt-1.5 w-full text-xs"
                  value={form.criticality}
                  onChange={(event) => setForm({ ...form, criticality: event.target.value })}
                >
                  <option value="CRITICAL">{t('Critical')}</option>
                  <option value="HIGH">{t('High')}</option>
                  <option value="MEDIUM">{t('Medium')}</option>
                  <option value="LOW">{t('Low')}</option>
                </select>
              </label>
            </div>

            {scopeOptionsError ? (
              <p role="alert" className="text-xs text-semantic-danger">{scopeOptionsError}</p>
            ) : !loadingScopeOptions && scopeOptions[scopeType].length === 0 ? (
              <p className="text-xs text-semantic-jira-muted">{t('No authorized records are available for this link type.')}</p>
            ) : null}

            <div className="flex justify-end gap-2.5 pt-3 border-t border-semantic-jira-border">
              <button
                type="button"
                className="jira-btn-subtle"
                disabled={creatingDraft}
                onClick={() => setCreating(false)}
              >
                {t('Cancel')}
              </button>
              <button
                className="jira-btn-primary flex items-center gap-1.5"
                type="submit"
                disabled={creatingDraft}
              >
                <FilePlus2 className="w-4 h-4" />
                <span>{creatingDraft ? t('Creating draft...') : t('Create draft')}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

