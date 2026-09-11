import React, { useState } from 'react';
import { useI18n } from '../../context/I18nContext.js';
import type { ThreatModelDetail } from './ThreatModelDetailPanel.js';
import { ThreatArchitectureDiagram } from './ThreatArchitectureDiagram.js';
import { architectureComponentTypes, architectureExposures, architecturePrivileges, architectureHosting, architectureEnvironments, architectureIntegrity, architectureLogging } from '../../../shared/threat-architecture.js';

type Kind = 'component' | 'boundary' | 'flow';
type Props = { detail: ThreatModelDetail; mutable: boolean; fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>; onRefresh: () => Promise<void> };

const inputClass = 'jira-input mt-1 w-full text-xs';
const labelClass = 'block text-xs font-semibold text-semantic-jira-muted';

/** Human-readable select labels; keys go through the translation catalog. */
const componentTypeLabels: Record<string, string> = {
  PROCESS: 'Process', SERVICE: 'Service', API: 'API', DATABASE: 'Database', DATASTORE: 'Datastore', QUEUE: 'Queue',
  EXTERNAL_SYSTEM: 'External system', USER: 'User', ADMIN: 'Admin', THIRD_PARTY: 'Third party', NETWORK_ZONE: 'Network zone',
  CLOUD_SERVICE: 'Cloud service', DEVICE: 'Device', OTHER: 'Other', CLIENT: 'Client', MOBILE_APP: 'Mobile app', WEB_APP: 'Web app',
  MICROSERVICE: 'Microservice', API_GATEWAY: 'API gateway', CACHE: 'Cache', FILE_STORE: 'File store', OBJECT_STORAGE: 'Object storage',
  HSM_KMS: 'HSM / KMS', IDENTITY_PROVIDER: 'Identity provider',
};
const exposureLabels: Record<string, string> = { UNKNOWN: 'Not assessed', INTERNAL: 'Internal', INTERNET: 'Internet', THIRD_PARTY: 'Third party' };
const privilegeLabels: Record<string, string> = { UNKNOWN: 'Not assessed', NONE: 'None', STANDARD: 'Standard', PRIVILEGED: 'Privileged' };
const hostingLabels: Record<string, string> = { UNKNOWN: 'Not assessed', ON_PREMISES: 'On premises', PRIVATE_CLOUD: 'Private cloud', PUBLIC_CLOUD: 'Public cloud', HYBRID: 'Hybrid', THIRD_PARTY: 'Third party' };
const environmentLabels: Record<string, string> = { UNKNOWN: 'Not assessed', DEVELOPMENT: 'Development', TEST: 'Test', STAGING: 'Staging', PRODUCTION: 'Production', MIXED: 'Mixed' };
const integrityLabels: Record<string, string> = { UNKNOWN: 'Not assessed', NONE: 'None', TRANSPORT: 'Transport', MESSAGE: 'Message', BOTH: 'Transport + message' };
const loggingLabels: Record<string, string> = { UNKNOWN: 'Not assessed', NONE: 'None', METADATA: 'Metadata', SECURITY_EVENTS: 'Security events', FULL: 'Full' };
const classificationLabels: Record<string, string> = {
  PUBLIC: 'Public', INTERNAL: 'Internal', RESTRICTED: 'Restricted',
  CONFIDENTIAL_SECURITY_ONLY: 'Confidential (Security only)', HIGHLY_RESTRICTED_HR_LEGAL: 'Highly Restricted (HR & Legal)',
};
const criticalityLabels: Record<string, string> = { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
const directionLabels: Record<string, string> = { ONE_WAY: 'One way', BIDIRECTIONAL: 'Bidirectional' };
const kindLabels: Record<Kind, string> = { component: 'Component', boundary: 'Trust boundary', flow: 'Data flow' };

const empty = () => ({ name: '', description: '', type: 'SERVICE', securityZone: '', exposure: 'UNKNOWN', privileges: 'UNKNOWN', hosting: 'UNKNOWN', environment: 'UNKNOWN', boundaryType: 'NETWORK', authenticationRequired: true, encryptionRequired: true, encryptionInTransit: null, integrityProtection: 'UNKNOWN', internetExposure: null, thirdPartyInvolvement: null, logging: 'UNKNOWN', dataClassification: 'INTERNAL', dataTypes: [], dataTypesText: '', direction: 'ONE_WAY' });

export function ThreatArchitectureEditor({ detail, mutable, fetchWithAuth, onRefresh }: Props) {
  const { t } = useI18n();
  const [kind, setKind] = useState<Kind>('component');
  const [draft, setDraft] = useState<any>(empty);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const entities = kind === 'component' ? detail.components : kind === 'boundary' ? detail.trustBoundaries : detail.dataFlows;
  const current = entities.find((item) => item.id === draft.id);
  const stale = Boolean(draft.id && (!current || current.contentVersion !== draft.contentVersion));

  const choose = (id: string) => {
    const entity = entities.find((item) => item.id === id);
    setDraft(entity ? { ...entity, dataTypesText: (entity.dataTypes || []).join(', ') } : empty());
    setReason(''); setError(''); setNotice(''); setConfirmRemove(false);
  };

  const field = (name: string, label: string, required = false, multiline = false) => (
    <label className={labelClass}>
      {t(label)}
      {multiline ? (
        <textarea className={inputClass} required={required} value={draft[name] || ''} onChange={(event) => setDraft({ ...draft, [name]: event.target.value })} />
      ) : (
        <input className={inputClass} required={required} value={draft[name] || ''} onChange={(event) => setDraft({ ...draft, [name]: event.target.value })} />
      )}
    </label>
  );

  const entitySelect = (name: string, label: string, items: { id: string; name?: string }[], optional = false) => (
    <label className={labelClass}>
      {t(label)}
      <select className={inputClass} required={!optional} value={draft[name] || ''} onChange={(event) => setDraft({ ...draft, [name]: event.target.value })}>
        <option value="">{optional ? t('Not specified') : t('Select…')}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>{item.name || item.id}</option>
        ))}
      </select>
    </label>
  );

  const enumSelect = (name: string, label: string, labels: Record<string, string>, values: readonly string[]) => (
    <label className={labelClass}>
      {t(label)}
      <select className={inputClass} value={draft[name] ?? ''} onChange={(event) => setDraft({ ...draft, [name]: event.target.value })}>
        {values.map((value) => (
          <option key={value} value={value}>{t(labels[value] ?? value)}</option>
        ))}
      </select>
    </label>
  );

  const triState = (name: string, label: string) => (
    <label className={labelClass}>
      {t(label)}
      <select
        className={inputClass}
        value={draft[name] === null || draft[name] === undefined ? '' : String(draft[name])}
        onChange={(event) => setDraft({ ...draft, [name]: event.target.value === '' ? null : event.target.value === 'true' })}
      >
        <option value="">{t('Not assessed')}</option>
        <option value="true">{t('Yes')}</option>
        <option value="false">{t('No')}</option>
      </select>
    </label>
  );

  const checkbox = (name: string, label: string) => (
    <label className="flex items-center gap-2 text-xs font-semibold text-semantic-jira-muted cursor-pointer">
      <input
        type="checkbox"
        className="rounded border-semantic-jira-border text-semantic-jira-brand focus:ring-semantic-jira-brand"
        checked={draft[name] ?? true}
        onChange={(event) => setDraft({ ...draft, [name]: event.target.checked })}
      />
      {t(label)}
    </label>
  );

  const save = async (action: 'UPDATE' | 'DELETE') => {
    if (draft.id && !reason.trim()) { setError(t('A change reason is required.')); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const endpoint = draft.id ? `/architecture/${kind}/${draft.id}` : kind === 'component' ? '/components' : kind === 'boundary' ? '/trust-boundaries' : '/data-flows';
      const response = await fetchWithAuth(`/api/threat-models/${detail.model.id}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, action, reason, dataTypes: String(draft.dataTypesText || '').split(',').map((value: string) => value.trim()).filter(Boolean) }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || t('Architecture operation failed.'));
      const entity = result.entity || result.component || result.trustBoundary || result.dataFlow;
      setDraft(entity ? { ...entity, dataTypesText: (entity.dataTypes || []).join(', ') } : empty());
      setReason(''); setConfirmRemove(false);
      setNotice(result.deleted
        ? t('Unreferenced draft record removed; its previous content remains in audit.')
        : result.changed === false
          ? t('No content change.')
          : t('Saved. Security changes require re-screening and control verification.'));
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Operation failed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <ThreatArchitectureDiagram
        detail={detail}
        onSelect={(nextKind, entityId) => {
          const entity = (nextKind === 'component' ? detail.components : detail.dataFlows).find((item) => item.id === entityId);
          if (!entity) return;
          setKind(nextKind);
          setDraft({ ...entity, dataTypesText: (entity.dataTypes || []).join(', ') });
          setReason(''); setError(''); setNotice(''); setConfirmRemove(false);
        }}
      />

      {/* Record selector: what is being edited and which stored record. */}
      <div className="grid md:grid-cols-2 gap-3">
        <label className={labelClass}>
          {t('Record type')}
          <select
            className={inputClass}
            value={kind}
            disabled={busy}
            onChange={(event) => { setKind(event.target.value as Kind); setDraft(empty()); setReason(''); setConfirmRemove(false); setError(''); setNotice(''); }}
          >
            {(['component', 'boundary', 'flow'] as Kind[]).map((value) => (
              <option key={value} value={value}>{t(kindLabels[value])}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          {t('Existing record')}
          <select className={inputClass} value={draft.id || ''} disabled={busy} onChange={(event) => choose(event.target.value)}>
            <option value="">{t('Create new')}</option>
            {entities.map((item) => (
              <option key={item.id} value={item.id}>{item.name} · v{item.contentVersion}</option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div role="alert" className="text-xs border border-semantic-danger-border bg-semantic-danger-surface text-semantic-danger rounded-lg p-3 flex items-start gap-2">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="text-xs border border-semantic-success-border bg-semantic-success-surface text-semantic-success rounded-lg p-3 flex items-start gap-2">
          {notice}
        </div>
      )}
      {stale && (
        <div role="alert" className="text-xs border border-semantic-warning-border bg-semantic-warning-surface text-semantic-warning rounded-lg p-3 flex flex-wrap items-center gap-2">
          <span>{t('Server content changed; unsaved edits are preserved.')}</span>
          <button type="button" className="jira-btn-secondary !py-1 text-xs" onClick={() => choose(draft.id)}>
            {t('Discard edits and reload')}
          </button>
        </div>
      )}

      <form
        onSubmit={(event) => { event.preventDefault(); void save('UPDATE'); }}
        className="bg-semantic-panel border border-semantic-jira-border rounded-xl p-4 shadow-sm"
      >
        <fieldset disabled={!mutable || busy || stale} className="grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2 pb-2 border-b border-semantic-jira-border/60">
            <h4 className="font-bold text-semantic-jira-primary text-xs uppercase tracking-wider">
              {t(kindLabels[kind])} {draft.id ? `· v${draft.contentVersion}` : `· ${t('New')}`}
            </h4>
          </div>
          {field('name', 'Name', true)}
          {field('description', 'Description', false, true)}

          {kind === 'component' && (
            <>
              {enumSelect('type', 'Component type', componentTypeLabels, architectureComponentTypes)}
              {field('securityZone', 'Security zone', true)}
              {field('technology', 'Technology')}
              {field('assetId', 'Canonical asset ID')}
              {field('ownerId', 'Canonical owner ID')}
              {enumSelect('criticality', 'Criticality', criticalityLabels, ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])}
              {enumSelect('exposure', 'Exposure', exposureLabels, architectureExposures)}
              {field('authenticationMethod', 'Authentication method')}
              {enumSelect('privileges', 'Runtime privileges', privilegeLabels, architecturePrivileges)}
              {enumSelect('hosting', 'Hosting', hostingLabels, architectureHosting)}
              {enumSelect('environment', 'Environment', environmentLabels, architectureEnvironments)}
            </>
          )}

          {kind === 'boundary' && (
            <>
              {field('boundaryType', 'Boundary type', true)}
              {field('trustLevelFrom', 'Trust level from')}
              {field('trustLevelTo', 'Trust level to')}
              {checkbox('authenticationRequired', 'Authentication required')}
              {checkbox('encryptionRequired', 'Encryption required')}
              {field('notes', 'Boundary security assumptions', false, true)}
            </>
          )}

          {kind === 'flow' && (
            <>
              {entitySelect('sourceComponentId', 'Source', detail.components)}
              {entitySelect('destinationComponentId', 'Destination', detail.components)}
              {entitySelect('trustBoundaryId', 'Trust boundary', detail.trustBoundaries, true)}
              {field('protocol', 'Protocol')}
              <label className={labelClass}>
                {t('Port')}
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  max={65535}
                  value={draft.port ?? ''}
                  onChange={(event) => setDraft({ ...draft, port: event.target.value })}
                />
              </label>
              {field('authenticationMethod', 'Authentication method')}
              {field('authorizationContext', 'Authorization context', false, true)}
              {triState('encryptionInTransit', 'Encryption in transit')}
              {field('encryptionMechanism', 'Encryption mechanism')}
              {field('encryptionVersion', 'Encryption version')}
              {enumSelect('integrityProtection', 'Integrity protection', integrityLabels, architectureIntegrity)}
              {triState('internetExposure', 'Internet exposure')}
              {triState('thirdPartyInvolvement', 'Third-party involvement')}
              {enumSelect('logging', 'Logging coverage', loggingLabels, architectureLogging)}
              {field('purpose', 'Purpose', false, true)}
              {enumSelect('dataClassification', 'Data classification', classificationLabels, ['PUBLIC', 'INTERNAL', 'RESTRICTED', 'CONFIDENTIAL_SECURITY_ONLY', 'HIGHLY_RESTRICTED_HR_LEGAL'])}
              {field('dataTypesText', 'Data types (comma-separated)')}
              {enumSelect('direction', 'Direction', directionLabels, ['ONE_WAY', 'BIDIRECTIONAL'])}
              {field('notes', 'Flow security assumptions', false, true)}
            </>
          )}

          {draft.id && (
            <label className={labelClass}>
              {t('Reason for change')}
              <textarea
                className={inputClass}
                required
                maxLength={4000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          )}

          <div className="md:col-span-2 flex flex-wrap items-center gap-2 pt-1">
            <button type="submit" className="jira-btn-primary text-xs">
              {draft.id ? t('Save architecture changes') : t('Create architecture record')}
            </button>
            {draft.id && (
              <button type="button" className="jira-btn-subtle text-xs" onClick={() => setConfirmRemove(true)}>
                {t('Remove unreferenced draft record…')}
              </button>
            )}
          </div>
        </fieldset>
      </form>

      {confirmRemove && (
        <div role="alert" className="border border-semantic-danger-border bg-semantic-danger-surface/50 rounded-xl p-3.5 text-xs space-y-2">
          <p className="text-semantic-danger font-semibold">
            {t('Remove')} “{draft.name}”? {t('Linked records cannot be removed.')}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="jira-btn-primary text-xs"
              disabled={!mutable || busy || stale || !reason.trim()}
              onClick={() => void save('DELETE')}
            >
              {t('Confirm removal')}
            </button>
            <button type="button" className="jira-btn-subtle text-xs" disabled={busy} onClick={() => setConfirmRemove(false)}>
              {t('Cancel')}
            </button>
          </div>
        </div>
      )}

      <details className="bg-semantic-jira-surface/50 border border-semantic-jira-border rounded-xl p-3.5 text-xs">
        <summary className="font-semibold text-semantic-jira-primary cursor-pointer">{t('Persisted flow relationships')}</summary>
        <ul className="mt-2 space-y-1 text-semantic-jira-muted">
          {detail.dataFlows.map((flow) => (
            <li key={flow.id}>
              {detail.components.find((item) => item.id === flow.sourceComponentId)?.name || flow.sourceComponentId}
              {' → '}
              {detail.components.find((item) => item.id === flow.destinationComponentId)?.name || flow.destinationComponentId}
              {' · '}{flow.name}
              {' · '}
              {flow.crossesTrustBoundary
                ? `${t('Boundary')}: ${detail.trustBoundaries.find((item) => item.id === flow.trustBoundaryId)?.name || t('Missing')}`
                : t('Same zone')}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
