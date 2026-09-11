import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Copy, Database, Filter, Layers3, Loader2, Pencil, Plus, RefreshCw, Save, Search, ServerCog, Settings2, ShieldAlert, ShieldCheck, SlidersHorizontal, Trash2, UsersRound, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../context/I18nContext.js';
import { DirectoryAssignmentSelect } from '../common/DirectoryAssignmentSelect.js';
import { ViewportOverlay } from '../common/ViewportOverlay.js';
import { AssetDiscoverySourceCards } from './AssetDiscoverySourceCards.js';

type Mode = 'all' | 'assets' | 'applications' | 'business-services';
type Tab = 'overview' | 'identity' | 'infrastructure' | 'network' | 'storage' | 'sources' | 'security' | 'provenance' | 'relationships' | 'conflicts' | 'history';
type PostureFilter = '' | 'missing-cortex' | 'cortex-offline' | 'partially-protected' | 'vcenter-without-cortex' | 'ad-without-cortex' | 'cortex-only' | 'identity-conflict' | 'stale-assets';
type CorrelationState = 'VERIFIED' | 'AUTO_CORRELATED' | 'NEEDS_REVIEW' | 'CONFLICT' | 'UNMATCHED' | 'MANUAL';
type CustomFieldType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'SELECT' | 'MULTI_SELECT' | 'USER';
export type CustomField = {
  id: string;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  description?: string;
  displayOrder: number;
  isActive: boolean;
  isSystem?: boolean;
  version: number;
};

// Every explorer mode is a filtered view of the same PostgreSQL-backed
// canonical CI inventory.  In particular, do not use the legacy /cis route
// for the registry: it cannot provide the governed owner assignment flow.
const endpoint = (_mode: Mode) => '/api/cmdb/assets';
const sourceLabel = (value: string) => (value === 'VCENTER' ? 'vCenter' : value === 'ACTIVE_DIRECTORY' ? 'AD' : value === 'CORTEX' ? 'Cortex XDR' : value);
const sourceIcon = (value: string) => (value === 'VCENTER' ? ServerCog : value === 'ACTIVE_DIRECTORY' ? UsersRound : ShieldCheck);
const dateLabel = (value?: string) =>
  value
    ? new Date(value).toLocaleString([], {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—';
const shortDateLabel = (value?: string) => (value ? new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—');

const statusMeta: Record<CorrelationState, { label: string; className: string }> = {
  VERIFIED: {
    label: 'Verified',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  AUTO_CORRELATED: {
    label: 'Auto-correlated',
    className: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  NEEDS_REVIEW: {
    label: 'Needs review',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  CONFLICT: {
    label: 'Conflict',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  UNMATCHED: {
    label: 'Unmatched',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  MANUAL: {
    label: 'Manual',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  },
};

const postureMeta = (state?: string) =>
  state === 'PROTECTED'
    ? {
        label: 'Protected',
        className: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      }
    : state === 'PARTIALLY_PROTECTED'
      ? {
          label: 'Partial',
          className: 'text-amber-800 bg-amber-50 border-amber-200',
        }
      : state === 'UNPROTECTED'
        ? {
            label: 'Unprotected',
            className: 'text-rose-700 bg-rose-50 border-rose-200',
          }
        : {
            label: 'Not reported',
            className: 'text-slate-500 bg-slate-100 border-slate-200',
          };

const correlationState = (row?: any): CorrelationState => row?.correlationState || (row?.sourceCount ? 'VERIFIED' : 'MANUAL');
const assetOwner = (row: any, t: (key: string) => string) => row?.ownerName || row?.technicalOwnerName || row?.businessOwnerName || (row?.typeId === 'directory_user' ? row?.displayName || row?.name : '') || row?.discoveredOwnerNames?.join(', ') || t('Unassigned');

const Badge: React.FC<{
  children: React.ReactNode;
  className?: string;
  title?: string;
}> = ({ children, className = '', title }) => (
  <span title={title} className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold leading-4 ${className}`}>
    {children}
  </span>
);

const MultiSelect: React.FC<{
  label: string;
  values: string[];
  options: Array<{ value: string; label: string }>;
  onChange: (values: string[]) => void;
  fieldLabel?: boolean;
}> = ({ label, values, options, onChange, fieldLabel = false }) => {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const visible = options.filter((option) => option.label.toLowerCase().includes(term.toLowerCase()));
  const caption = values.length ? `${label} · ${values.length}` : label;
  return (
    <div className={`relative min-w-0 ${fieldLabel ? '' : 'min-w-[150px] flex-1'}`}>
      {fieldLabel && <div className="mb-1 text-xs font-semibold text-semantic-muted">{label}</div>}
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="jira-input flex min-h-9 w-full items-center justify-between gap-2 text-left text-xs">
        <span className={values.length ? 'font-semibold text-semantic-primary' : 'text-semantic-muted'}>{caption}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-30 w-full min-w-[230px] rounded-md border border-semantic-border bg-semantic-panel p-2 shadow-xl" role="listbox">
          <input autoFocus className="jira-input mb-2 w-full" value={term} onChange={(event) => setTerm(event.target.value)} placeholder={`Search ${label.toLowerCase()}`} />
          <div className="max-h-52 overflow-y-auto custom-scrollbar">
            {visible.length ? (
              visible.map((option) => (
                <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-semantic-subtle">
                  <input type="checkbox" checked={values.includes(option.value)} onChange={(event) => onChange(event.currentTarget.checked ? [...values, option.value] : values.filter((value) => value !== option.value))} />
                  <span className="truncate">{option.label}</span>
                </label>
              ))
            ) : (
              <p className="px-2 py-3 text-xs text-semantic-muted">No matching options.</p>
            )}
          </div>
          {values.length > 0 && (
            <button type="button" className="mt-2 border-t border-semantic-border pt-2 text-xs font-semibold text-semantic-info" onClick={() => onChange([])}>
              Clear {label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const Field: React.FC<{
  label: string;
  value?: React.ReactNode;
  copy?: string;
}> = ({ label, value, copy }) => (
  <div className="min-w-0 rounded-md border border-semantic-border bg-semantic-panel p-3">
    <div className="text-[11px] font-semibold uppercase tracking-wide text-semantic-muted">{label}</div>
    <div className="mt-1 flex min-h-5 items-center gap-2 break-words text-sm font-medium text-semantic-primary">
      {value || '—'}
      {copy && (
        <button type="button" className="text-semantic-muted hover:text-semantic-info" title="Copy value" onClick={() => void navigator.clipboard?.writeText(copy)}>
          <Copy className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  </div>
);

const customFieldTypeLabel = (type: CustomFieldType) =>
  ({
    TEXT: 'Text',
    NUMBER: 'Number',
    BOOLEAN: 'Yes / No',
    DATE: 'Date',
    SELECT: 'Single select',
    MULTI_SELECT: 'Multi-select',
    USER: 'Directory user',
  })[type];
const formatCustomFieldValue = (field: CustomField, value: unknown, users: any[]) => {
  if (value === undefined || value === null || value === '') return '—';
  if (field.type === 'USER') return users.find((user) => user.id === value)?.fullName || String(value);
  if (Array.isArray(value)) return value.join(', ');
  if (field.type === 'BOOLEAN') return value ? 'Yes' : 'No';
  return String(value);
};

const CustomFieldInput: React.FC<{
  field: CustomField;
  value: unknown;
  users: any[];
  onChange: (value: unknown) => void;
}> = ({ field, value, users, onChange }) => {
  const className = 'jira-input mt-1 w-full';
  if (field.type === 'BOOLEAN')
    return (
      <label className="mt-3 flex items-center gap-2 text-sm font-medium text-semantic-primary">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.currentTarget.checked)} />
        Yes
      </label>
    );
  if (field.type === 'SELECT' || field.type === 'USER')
    return (
      <select className={className} value={String(value || '')} onChange={(event) => onChange(event.currentTarget.value || null)}>
        <option value="">Not set</option>
        {field.type === 'USER'
          ? users
              .filter((user) => user.isActive !== false)
              .map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName}
                  {user.username ? ` (@${user.username})` : ''}
                </option>
              ))
          : field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
      </select>
    );
  if (field.type === 'MULTI_SELECT')
    return (
      <select multiple className={`${className} min-h-24`} value={Array.isArray(value) ? value : []} onChange={(event) => onChange([...event.currentTarget.selectedOptions].map((option) => option.value))}>
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  return <input className={className} type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'} value={value == null ? '' : String(value)} onChange={(event) => onChange(field.type === 'NUMBER' ? (event.currentTarget.value === '' ? null : Number(event.currentTarget.value)) : event.currentTarget.value || null)} />;
};

const editableAssetFields = ['name', 'displayName', 'environment', 'ownerUserId', 'technicalOwnerUserId', 'businessOwnerUserId', 'departmentId', 'ownerSectionId', 'hostname', 'fqdn', 'ipAddress', 'serialNumber', 'assetTag', 'operatingSystem', 'osVersion', 'vendor', 'manufacturer', 'model', 'criticality'] as const;
const AssetEditForm: React.FC<{
  asset: any;
  fields: CustomField[];
  users: any[];
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}> = ({ asset, fields, users, fetchWithAuth, onClose, onSaved }) => {
  const [form, setForm] = useState<any>(() => Object.fromEntries(editableAssetFields.map((key) => [key, asset[key] ?? (key === 'environment' ? 'UNKNOWN' : key === 'criticality' ? 'MEDIUM' : '')])));
  const [customValues, setCustomValues] = useState<Record<string, unknown>>(() => ({ ...(asset.customFields || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const update = (key: string, value: unknown) => setForm((current: any) => ({ ...current, [key]: value }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const emptyToNull = (value: unknown) => (typeof value === 'string' && !value.trim() ? null : value);
      const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, key === 'name' || key === 'environment' || key === 'criticality' ? value : emptyToNull(value)]));
      const response = await fetchWithAuth(`/api/cmdb/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, version: asset.version }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not save asset details.');
      const editableFields = fields.filter((field) => field.key !== 'environment');
      const editableCustomValues = Object.fromEntries(editableFields.map((field) => [field.key, customValues[field.key]]));
      if (editableFields.length) {
        const customResponse = await fetchWithAuth(`/api/cmdb/assets/${asset.id}/custom-fields`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: data.asset.version,
            values: editableCustomValues,
          }),
        });
        const customData = await customResponse.json();
        if (!customResponse.ok || !customData.success) throw new Error(customData.error || 'Asset details were saved, but custom fields could not be saved. Refresh and try again.');
      }
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save asset details.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <form className="space-y-4" onSubmit={(event) => void save(event)}>
      <div className="flex items-center justify-between rounded-md border border-semantic-info/30 bg-semantic-info-surface px-3 py-2 text-xs text-semantic-primary">
        <span>Operator fields are saved to the canonical CI. Discovery evidence remains unchanged.</span>
        <button type="button" className="text-semantic-info hover:underline" onClick={onClose}>
          Cancel
        </button>
      </div>
      {error && <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
      <section>
        <h3 className="text-sm font-bold text-semantic-primary">Ownership and classification</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-semantic-muted">
            Display name
            <input required className="jira-input mt-1 w-full" value={form.name} onChange={(event) => update('name', event.currentTarget.value)} />
          </label>
          <label className="text-xs font-semibold text-semantic-muted">
            Environment
            <select className="jira-input mt-1 w-full" value={form.environment} onChange={(event) => update('environment', event.currentTarget.value)}>
              {['PRODUCTION', 'DR', 'UAT', 'STAGING', 'TEST', 'DEV', 'UNKNOWN'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-semantic-muted">
            Primary owner
            <DirectoryAssignmentSelect kind="user" value={form.ownerUserId || ''} onChange={(value) => update('ownerUserId', value)} allowEmpty emptyLabel="Unassigned" placeholder="Select primary owner…" className="mt-1" />
          </label>
          <label className="text-xs font-semibold text-semantic-muted">
            Technical owner
            <DirectoryAssignmentSelect kind="user" value={form.technicalOwnerUserId || ''} onChange={(value) => update('technicalOwnerUserId', value)} allowEmpty emptyLabel="Unassigned" placeholder="Select technical owner…" className="mt-1" />
          </label>
          <label className="text-xs font-semibold text-semantic-muted">
            Business owner
            <DirectoryAssignmentSelect kind="user" value={form.businessOwnerUserId || ''} onChange={(value) => update('businessOwnerUserId', value)} allowEmpty emptyLabel="Unassigned" placeholder="Select business owner…" className="mt-1" />
          </label>
          <label className="text-xs font-semibold text-semantic-muted">
            Responsible department
            <DirectoryAssignmentSelect kind="department" value={form.departmentId || ''} onChange={(value) => update('departmentId', value)} allowEmpty emptyLabel="Unassigned" placeholder="Search department…" className="mt-1" />
          </label>
          <label className="text-xs font-semibold text-semantic-muted">
            Responsible section
            <DirectoryAssignmentSelect kind="section" value={form.ownerSectionId || ''} departmentId={form.departmentId || undefined} onChange={(value) => update('ownerSectionId', value)} allowEmpty emptyLabel="Unassigned" placeholder="Search section…" className="mt-1" />
          </label>
          <label className="text-xs font-semibold text-semantic-muted">
            Criticality
            <select className="jira-input mt-1 w-full" value={form.criticality} onChange={(event) => update('criticality', event.currentTarget.value)}>
              {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section>
        <h3 className="text-sm font-bold text-semantic-primary">Identity and infrastructure</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(
            [
              ['hostname', 'Host name'],
              ['fqdn', 'FQDN'],
              ['ipAddress', 'IP address'],
              ['serialNumber', 'Serial number'],
              ['assetTag', 'Asset tag'],
              ['operatingSystem', 'Operating system'],
              ['osVersion', 'OS version'],
              ['vendor', 'Vendor'],
              ['manufacturer', 'Manufacturer'],
              ['model', 'Model'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-xs font-semibold text-semantic-muted">
              {label}
              <input className="jira-input mt-1 w-full" value={form[key]} onChange={(event) => update(key, event.currentTarget.value)} />
            </label>
          ))}
        </div>
      </section>
      {fields.filter((field) => field.key !== 'environment').length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-semantic-primary">Custom operator fields</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {fields
              .filter((field) => field.key !== 'environment')
              .map((field) => (
                <label key={field.id} className="text-xs font-semibold text-semantic-muted">
                  {field.label}
                  <CustomFieldInput
                    field={field}
                    value={customValues[field.key]}
                    users={users}
                    onChange={(value) =>
                      setCustomValues((current) => ({
                        ...current,
                        [field.key]: value,
                      }))
                    }
                  />
                </label>
              ))}
          </div>
        </section>
      )}
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-semantic-border bg-semantic-panel py-3">
        <button type="button" className="jira-btn-subtle" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" disabled={saving} className="jira-btn-primary">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          <Save className="h-4 w-4" />
          Save changes
        </button>
      </div>
    </form>
  );
};

export const CustomFieldManager: React.FC<{
  fields: CustomField[];
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onSaved: () => Promise<void>;
  t: (key: string) => string;
}> = ({ fields, fetchWithAuth, onClose, onSaved, t }) => {
  const empty = {
    key: '',
    label: '',
    type: 'TEXT' as CustomFieldType,
    options: '',
    description: '',
    displayOrder: String(fields.length),
  };
  const [editing, setEditing] = useState<CustomField | undefined>();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const start = (field?: CustomField) => {
    if (field?.isSystem) return;
    setEditing(field);
    setForm(
      field
        ? {
            key: field.key,
            label: field.label,
            type: field.type,
            options: field.options.join(', '),
            description: field.description || '',
            displayOrder: String(field.displayOrder),
          }
        : empty,
    );
    setError('');
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        key: form.key.trim(),
        label: form.label.trim(),
        type: form.type,
        options: ['SELECT', 'MULTI_SELECT'].includes(form.type)
          ? form.options
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : [],
        description: form.description.trim(),
        displayOrder: Number(form.displayOrder) || 0,
        ...(editing ? { version: editing.version } : {}),
      };
      const response = await fetchWithAuth(editing ? `/api/cmdb/custom-fields/${editing.id}` : '/api/cmdb/custom-fields', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not save custom field.');
      await onSaved();
      start();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save custom field.');
    } finally {
      setSaving(false);
    }
  };
  const remove = async (field: CustomField) => {
    if (!window.confirm(`Remove the custom column "${field.label}"? Existing values will remain in audit history.`)) return;
    setError('');
    try {
      const response = await fetchWithAuth(`/api/cmdb/custom-fields/${field.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: field.version }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not remove custom field.');
      await onSaved();
      if (editing?.id === field.id) start();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove custom field.');
    }
  };
  return (
    <ViewportOverlay>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-semantic-modal-tint/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Manage custom fields">
      <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-semantic-border-strong bg-semantic-panel shadow-2xl">
        <header className="flex items-start justify-between border-b border-semantic-border px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-semantic-primary">Manage custom columns</h2>
            <p className="mt-1 text-xs text-semantic-muted">Define operator-owned fields such as Risk owner or Asset owner, then fill them on each asset.</p>
          </div>
          <button type="button" className="jira-btn-subtle" onClick={onClose}>
            <X className="h-4 w-4" />
            {t('Close')}
          </button>
        </header>
        <div className="grid gap-5 p-5 lg:grid-cols-[1.1fr_.9fr]">
          {' '}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-semantic-primary">Active fields</h3>
              <button type="button" className="jira-btn-primary" onClick={() => start()}>
                <Plus className="h-4 w-4" />
                Add field
              </button>
            </div>
            {fields.length ? (
              fields.map((field) => (
                <div key={field.id} className="flex items-center justify-between gap-3 rounded-lg border border-semantic-border p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-semantic-primary">{field.label}</div>
                    <div className="mt-1 text-[11px] text-semantic-muted">
                      <code>{field.key}</code> · {customFieldTypeLabel(field.type)}
                      {field.options.length ? ` · ${field.options.length} options` : ''}
                    </div>
                  </div>
                  {field.isSystem ? (
                    <span className="text-[11px] font-semibold text-semantic-muted">Protected</span>
                  ) : (
                    <div className="flex shrink-0 gap-1">
                      <button type="button" className="jira-btn-subtle p-2" title="Edit" onClick={() => start(field)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" className="jira-btn-subtle p-2 text-semantic-danger" title="Remove" onClick={() => void remove(field)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-dashed border-semantic-border p-6 text-center text-xs text-semantic-muted">No custom columns yet.</p>
            )}
          </div>
          <form className="rounded-lg border border-semantic-border bg-semantic-subtle p-4" onSubmit={(event) => void save(event)}>
            <h3 className="text-sm font-semibold text-semantic-primary">{editing ? 'Edit custom field' : 'New custom field'}</h3>
            {error && <p className="mt-2 text-xs text-semantic-danger">{error}</p>}
            <label className="mt-3 block text-xs font-semibold text-semantic-muted">
              Label
              <input required className="jira-input mt-1 w-full" value={form.label} onChange={(event) => setForm({ ...form, label: event.currentTarget.value })} placeholder="Risk owner" />
            </label>
            <label className="mt-3 block text-xs font-semibold text-semantic-muted">
              Key
              <input
                required
                pattern="[a-z][a-z0-9_]*"
                className="jira-input mt-1 w-full font-mono"
                value={form.key}
                onChange={(event) =>
                  setForm({
                    ...form,
                    key: event.currentTarget.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                  })
                }
                placeholder="risk_owner"
              />
            </label>
            <label className="mt-3 block text-xs font-semibold text-semantic-muted">
              Type
              <select
                className="jira-input mt-1 w-full"
                value={form.type}
                onChange={(event) =>
                  setForm({
                    ...form,
                    type: event.currentTarget.value as CustomFieldType,
                    options: ['SELECT', 'MULTI_SELECT'].includes(event.currentTarget.value) ? form.options : '',
                  })
                }
              >
                {(['TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'SELECT', 'MULTI_SELECT', 'USER'] as CustomFieldType[]).map((type) => (
                  <option key={type} value={type}>
                    {customFieldTypeLabel(type)}
                  </option>
                ))}
              </select>
            </label>
            {['SELECT', 'MULTI_SELECT'].includes(form.type) && (
              <label className="mt-3 block text-xs font-semibold text-semantic-muted">
                Options
                <span className="mt-1 block text-[11px] font-normal">Comma separated</span>
                <input required className="jira-input mt-1 w-full" value={form.options} onChange={(event) => setForm({ ...form, options: event.currentTarget.value })} placeholder="Production, UAT, DR" />
              </label>
            )}
            <label className="mt-3 block text-xs font-semibold text-semantic-muted">
              Description
              <textarea className="jira-input mt-1 min-h-16 w-full" value={form.description} onChange={(event) => setForm({ ...form, description: event.currentTarget.value })} />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="jira-btn-subtle" onClick={() => start()}>
                {editing ? 'Cancel edit' : 'Clear'}
              </button>
              <button type="submit" disabled={saving} className="jira-btn-primary">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? 'Save changes' : 'Create field'}
              </button>
            </div>
          </form>
        </div>
      </section>
      </div>
    </ViewportOverlay>
  );
};

export const CMDBExplorerView: React.FC<{
  mode?: Mode;
  initialCiId?: string;
}> = ({ mode = 'all', initialCiId }) => {
  const { fetchWithAuth, allUsers } = useAuth();
  const { t } = useI18n();
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const listParam = (key: string) => (initialParams.get(key) || '').split(',').filter(Boolean);
  const [viewMode, setViewMode] = useState(mode);
  const [rows, setRows] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [connectors, setConnectors] = useState<any[]>([]);
  const [coverage, setCoverage] = useState<any>();
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customFieldManagerOpen, setCustomFieldManagerOpen] = useState(false);
  const [savingCustomValues, setSavingCustomValues] = useState(false);
  const [search, setSearch] = useState(initialParams.get('q') || '');
  const [appliedSearch, setAppliedSearch] = useState(initialParams.get('q') || '');
  const [owner, setOwner] = useState(initialParams.get('owner') || '');
  const [appliedOwner, setAppliedOwner] = useState(initialParams.get('owner') || '');
  const [operatingSystem, setOperatingSystem] = useState(initialParams.get('os') || '');
  const [appliedOperatingSystem, setAppliedOperatingSystem] = useState(initialParams.get('os') || '');
  const [typeIds, setTypeIds] = useState<string[]>(listParam('type'));
  const [appliedTypeIds, setAppliedTypeIds] = useState<string[]>(listParam('type'));
  const [sourceTypes, setSourceTypes] = useState<string[]>(listParam('source'));
  const [appliedSourceTypes, setAppliedSourceTypes] = useState<string[]>(listParam('source'));
  const [connectorIds, setConnectorIds] = useState<string[]>(listParam('connector'));
  const [appliedConnectorIds, setAppliedConnectorIds] = useState<string[]>(listParam('connector'));
  const [environment, setEnvironment] = useState(initialParams.get('environment') || '');
  const [appliedEnvironment, setAppliedEnvironment] = useState(initialParams.get('environment') || '');
  const [lifecycleState, setLifecycleState] = useState(initialParams.get('lifecycle') || '');
  const [appliedLifecycleState, setAppliedLifecycleState] = useState(initialParams.get('lifecycle') || '');
  const [criticality, setCriticality] = useState(initialParams.get('criticality') || '');
  const [appliedCriticality, setAppliedCriticality] = useState(initialParams.get('criticality') || '');
  const [posture, setPosture] = useState<PostureFilter>((initialParams.get('posture') as PostureFilter) || '');
  const [appliedPosture, setAppliedPosture] = useState<PostureFilter>((initialParams.get('posture') as PostureFilter) || '');
  const [searchMode, setSearchMode] = useState<'auto' | 'exact' | 'contains'>((initialParams.get('searchMode') as 'auto' | 'exact' | 'contains') || 'auto');
  const [appliedSearchMode, setAppliedSearchMode] = useState<'auto' | 'exact' | 'contains'>((initialParams.get('searchMode') as 'auto' | 'exact' | 'contains') || 'auto');
  const [page, setPage] = useState(Number(initialParams.get('page') || 1));
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<any>();
  const [detail, setDetail] = useState<any>();
  const [detailError, setDetailError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [editingAsset, setEditingAsset] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(owner || operatingSystem || typeIds.length || sourceTypes.length || connectorIds.length || environment || lifecycleState || criticality || posture));
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState(initialParams.get('sortBy') || 'updatedAt');
  const [sortDirection, setSortDirection] = useState(initialParams.get('sortDirection') === 'asc' ? 'asc' : 'desc');
  const latestLoadId = useRef(0);
  const latestDetailRequestId = useRef(0);
  const size = 25;
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    asset: true,
    type: true,
    identity: true,
    ip: true,
    environment: true,
    owner: true,
    sources: true,
    correlation: true,
    posture: true,
    lastSeen: true,
    lifecycle: true,
    criticality: true,
  });

  const pageCursors = useRef(new Map<number, string>());
  const [hasNextPage, setHasNextPage] = useState(false);
  const usesCanonicalAssetApi = ['all', 'assets', 'applications', 'business-services'].includes(viewMode);
  const load = async (nextPage = page, restart = false) => {
    const loadId = ++latestLoadId.current;
    if (restart) pageCursors.current.clear();
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(size),
        sortBy,
        sortDirection,
      });
      if (appliedSearch) q.set('search', appliedSearch);
      if (appliedSearch && appliedSearchMode !== 'auto') q.set('searchMode', appliedSearchMode);
      if (usesCanonicalAssetApi) {
        const cursor = pageCursors.current.get(nextPage);
        if (nextPage > 1 && !cursor) throw new Error(t('Refresh the inventory to start a new page sequence.'));
        q.set('pagination', 'cursor');
        q.set('includeTotal', cursor ? 'false' : 'true');
        if (cursor) q.set('cursor', cursor);
        if (appliedOwner) q.set('owner', appliedOwner);
        if (appliedOperatingSystem) q.set('operatingSystem', appliedOperatingSystem);
        if (appliedEnvironment) q.set('environment', appliedEnvironment);
        if (appliedLifecycleState) q.set('lifecycleState', appliedLifecycleState);
        if (appliedCriticality) q.set('criticality', appliedCriticality);
        if (appliedPosture) q.set('posture', appliedPosture);
        appliedTypeIds.forEach((value) => q.append('typeIds', value));
        if (viewMode === 'applications') q.append('typeIds', 'application');
        if (viewMode === 'business-services') q.append('typeIds', 'business_service');
        appliedSourceTypes.forEach((value) => q.append('sourceTypes', value));
        appliedConnectorIds.forEach((value) => q.append('sourceConnectorIds', value));
      }
      const [assetsResponse, taxonomyResponse, connectorResponse, customFieldsResponse] = await Promise.all([fetchWithAuth(`${endpoint(viewMode)}?${q}`), fetchWithAuth('/api/cmdb/types'), fetchWithAuth('/api/cmdb/discovery/connectors'), fetchWithAuth('/api/cmdb/custom-fields')]);
      const data = await assetsResponse.json();
      const taxonomyData = await taxonomyResponse.json();
      const connectorData = await connectorResponse.json();
      const customFieldsData = await customFieldsResponse.json();
      if (!assetsResponse.ok || !data.success) throw new Error(data.error || t('Could not load CMDB records.'));
      if (loadId !== latestLoadId.current) return;
      setRows(data.assets || data.cis || data.applications || data.businessServices || []);
      if (data.total !== null && data.total !== undefined) setTotal(Number(data.total));
      if (usesCanonicalAssetApi) {
        if (data.currentCursor) pageCursors.current.set(nextPage, data.currentCursor);
        if (data.nextCursor) pageCursors.current.set(nextPage + 1, data.nextCursor);
        else pageCursors.current.delete(nextPage + 1);
        setHasNextPage(Boolean(data.hasNext));
      }
      setTypes(taxonomyData.types || []);
      if (connectorResponse.ok && connectorData.success) setConnectors(connectorData.connectors || []);
      if (customFieldsResponse.ok && customFieldsData.success) setCustomFields(customFieldsData.fields || []);
      setPage(nextPage);
      setSelectedRows([]);
      if (usesCanonicalAssetApi) {
        const coverageResponse = await fetchWithAuth('/api/cmdb/discovery/coverage');
        const coverageData = await coverageResponse.json();
        if (loadId !== latestLoadId.current) return;
        if (coverageResponse.ok && coverageData.success) setCoverage(coverageData);
      }
    } catch (cause) {
      if (loadId === latestLoadId.current) setError(cause instanceof Error ? cause.message : t('Could not load CMDB records.'));
    } finally {
      if (loadId === latestLoadId.current) setLoading(false);
    }
  };
  const open = async (row: any, startEditing = false) => {
    const requestId = ++latestDetailRequestId.current;
    setSelected(row);
    setDetail(undefined);
    setDetailError('');
    setEditingAsset(startEditing);
    setTab('overview');
    try {
      const [assetResponse, subResponse] = await Promise.all([fetchWithAuth(`/api/cmdb/assets/${row.id}`), fetchWithAuth(`/api/cmdb/assets/${row.id}/subresources`)]);
      const assetData = await assetResponse.json();
      const subData = await subResponse.json();
      if (!assetResponse.ok || !assetData.success || !subResponse.ok || !subData.success) throw new Error(assetData.error || subData.error);
      if (requestId !== latestDetailRequestId.current) return;
      setDetail({ ...subData, asset: assetData.asset });
    } catch (cause) {
      if (requestId === latestDetailRequestId.current) setDetailError(cause instanceof Error ? cause.message : t('Could not load asset detail.'));
    }
  };
  const refreshSelectedAsset = async () => {
    if (!selected?.id || !usesCanonicalAssetApi) return;
    const [assetResponse, subResponse] = await Promise.all([fetchWithAuth(`/api/cmdb/assets/${selected.id}`), fetchWithAuth(`/api/cmdb/assets/${selected.id}/subresources`)]);
    const assetData = await assetResponse.json();
    const subData = await subResponse.json();
    if (!assetResponse.ok || !assetData.success || !subResponse.ok || !subData.success) throw new Error(assetData.error || subData.error || 'Could not refresh asset details.');
    setDetail({ ...subData, asset: assetData.asset });
    setSelected(assetData.asset);
    setRows((current) => current.map((row) => (row.id === assetData.asset.id ? { ...row, ...assetData.asset } : row)));
    setEditingAsset(false);
  };
  useEffect(() => {
    setViewMode(mode);
  }, [mode]);
  useEffect(() => {
    void load(1, true);
  }, [viewMode, appliedSearch, appliedSearchMode, appliedOwner, appliedOperatingSystem, appliedTypeIds, appliedSourceTypes, appliedConnectorIds, appliedEnvironment, appliedLifecycleState, appliedCriticality, appliedPosture, sortBy, sortDirection]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (appliedSearch) params.set('q', appliedSearch);
    if (appliedSearch && appliedSearchMode !== 'auto') params.set('searchMode', appliedSearchMode);
    if (usesCanonicalAssetApi && appliedOwner) params.set('owner', appliedOwner);
    if (usesCanonicalAssetApi && appliedOperatingSystem) params.set('os', appliedOperatingSystem);
    if (appliedTypeIds.length) params.set('type', appliedTypeIds.join(','));
    if (appliedSourceTypes.length) params.set('source', appliedSourceTypes.join(','));
    if (appliedConnectorIds.length) params.set('connector', appliedConnectorIds.join(','));
    if (appliedEnvironment) params.set('environment', appliedEnvironment);
    if (appliedLifecycleState) params.set('lifecycle', appliedLifecycleState);
    if (appliedCriticality) params.set('criticality', appliedCriticality);
    if (appliedPosture) params.set('posture', appliedPosture);
    if (page > 1) params.set('page', String(page));
    if (sortBy !== 'updatedAt') params.set('sortBy', sortBy);
    if (sortDirection !== 'desc') params.set('sortDirection', sortDirection);
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [appliedSearch, appliedSearchMode, appliedOwner, appliedOperatingSystem, appliedTypeIds, appliedSourceTypes, appliedConnectorIds, appliedEnvironment, appliedLifecycleState, appliedCriticality, appliedPosture, page, sortBy, sortDirection, viewMode]);
  useEffect(() => {
    const row = rows.find((item) => item.id === initialCiId);
    if (row) void open(row);
  }, [initialCiId, rows]);
  const clear = () => {
    setSearch('');
    setAppliedSearch('');
    setOwner('');
    setAppliedOwner('');
    setOperatingSystem('');
    setAppliedOperatingSystem('');
    setTypeIds([]);
    setAppliedTypeIds([]);
    setSourceTypes([]);
    setAppliedSourceTypes([]);
    setConnectorIds([]);
    setAppliedConnectorIds([]);
    setEnvironment('');
    setAppliedEnvironment('');
    setLifecycleState('');
    setAppliedLifecycleState('');
    setCriticality('');
    setAppliedCriticality('');
    setPosture('');
    setAppliedPosture('');
    setSearchMode('auto');
    setAppliedSearchMode('auto');
    setPage(1);
  };
  const apply = () => {
    setAppliedSearch(search.trim());
    setAppliedOwner(owner.trim());
    setAppliedOperatingSystem(operatingSystem.trim());
    setAppliedTypeIds(typeIds);
    setAppliedSourceTypes(sourceTypes);
    setAppliedConnectorIds(connectorIds);
    setAppliedEnvironment(environment);
    setAppliedLifecycleState(lifecycleState);
    setAppliedCriticality(criticality);
    setAppliedPosture(posture);
    setAppliedSearchMode(searchMode);
    setPage(1);
  };
  const typeOptions = types.map((type) => ({
    value: type.id,
    label: type.name,
  }));
  const connectorOptions = connectors
    .filter((connector) => !sourceTypes.length || sourceTypes.includes(connector.connectorType))
    .map((connector) => ({
      value: connector.id,
      label: connector.name || connector.id,
    }));
  const asset = detail?.asset;
  const security = detail?.cortexSecurity || asset?.cortexSecurity;
  const tabs: Tab[] = ['overview', 'identity', 'infrastructure', ...(usesCanonicalAssetApi ? (['network', 'storage', 'sources', 'security', 'provenance'] as Tab[]) : []), 'relationships', ...(usesCanonicalAssetApi ? (['conflicts'] as Tab[]) : []), 'history'];
  const tabValue = tab === 'identity' ? detail?.identifiers : tab === 'network' ? detail?.network : tab === 'storage' ? detail?.storage : tab === 'provenance' ? detail?.provenance : tab === 'relationships' ? detail?.relationships : tab === 'conflicts' ? detail?.conflicts : detail?.history;
  const columns = [
    { key: 'asset', label: 'Asset' },
    { key: 'type', label: 'Type' },
    { key: 'identity', label: 'Primary identity' },
    { key: 'ip', label: 'IP' },
    { key: 'environment', label: 'Environment' },
    { key: 'owner', label: 'Owner' },
    { key: 'sources', label: 'Sources' },
    { key: 'correlation', label: 'Correlation' },
    { key: 'posture', label: 'Security posture' },
    { key: 'lastSeen', label: 'Last seen' },
    { key: 'lifecycle', label: 'Lifecycle' },
    { key: 'criticality', label: 'Criticality' },
    ...customFields.map((field) => ({
      key: `custom:${field.key}`,
      label: field.label,
    })),
  ];
  const toggleSort = (key: string) => {
    if (!['asset', 'type', 'identity', 'ip', 'owner', 'sources', 'correlation', 'posture', ...customFields.map((field) => `custom:${field.key}`)].includes(key)) {
      const next = key === 'lastSeen' ? 'lastSeenAt' : key === 'lifecycle' ? 'lifecycleState' : key;
      setSortBy(next);
      setSortDirection((value) => (sortBy === next ? (value === 'asc' ? 'desc' : 'asc') : 'asc'));
    }
  };
  const selectedAll = rows.length > 0 && rows.every((row) => selectedRows.includes(row.id));
  const coverageNumber = (key: string) => coverage?.[key] ?? '—';
  const summary = [
    {
      label: 'Total assets',
      value: total,
      hint: appliedSearch || appliedOperatingSystem || typeIds.length || sourceTypes.length ? `${total} matching this view` : 'Canonical inventory',
      icon: Layers3,
      color: 'text-semantic-info',
    },
    {
      label: 'Verified',
      value: coverageNumber('fullyCorrelatedVcenterAdCortex'),
      hint: 'Cross-source coverage',
      icon: CheckCircle2,
      color: 'text-emerald-600',
    },
    {
      label: 'Needs review',
      value: coverageNumber('reconciliationRequired'),
      hint: 'Open review cases',
      icon: CircleHelp,
      color: 'text-amber-600',
    },
    {
      label: 'Conflicts',
      value: coverageNumber('identityConflicts'),
      hint: 'Identity conflicts',
      icon: ShieldAlert,
      color: 'text-rose-600',
    },
    {
      label: 'Stale / unseen',
      value: coverageNumber('staleOrUnseen'),
      hint: 'Lifecycle or source stale',
      icon: RefreshCw,
      color: 'text-slate-600',
    },
  ];
  return (
    <main className="flex-1 space-y-4 overflow-y-auto bg-semantic-subtle p-4 md:p-6 custom-scrollbar">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-semantic-info">
            <Database className="h-4 w-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider">{t('Assets & CMDB')}</span>
          </div>
          <h1 key={viewMode} className="mt-1 text-2xl font-bold tracking-tight text-semantic-primary">
            {t(viewMode === 'assets' ? 'Unified IT Asset Intelligence' : 'Configuration Items')}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-semantic-muted">{t(viewMode === 'assets' ? 'One operational inventory for correlated vCenter, Active Directory and Cortex XDR evidence.' : 'Governed configuration records and service relationships.')}</p>
        </div>
        <button type="button" className="jira-btn-subtle" onClick={() => void load(1, true)}>
          <RefreshCw className="h-4 w-4" />
          {t('Refresh')}
        </button>
      </header>
      <nav className="wrike-card flex flex-wrap gap-1 p-1.5">
        {(['all', 'assets', 'applications', 'business-services'] as Mode[]).map((entry) => (
          <button key={entry} onClick={() => setViewMode(entry)} className={`rounded px-3 py-2 text-xs font-bold ${entry === viewMode ? 'bg-semantic-info-surface text-semantic-info' : 'text-semantic-muted hover:bg-semantic-subtle'}`}>
            {t(entry === 'all' ? 'All records' : entry === 'assets' ? 'Infrastructure' : entry === 'applications' ? 'Applications' : 'Business Services')}
          </button>
        ))}
      </nav>
      {viewMode === 'assets' && (
        <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          {summary.map(({ label, value, hint, icon: Icon, color }) => (
            <article key={label} className="wrike-card min-w-0 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-bold uppercase tracking-wide text-semantic-muted">{t(label)}</span>
                <Icon className={`h-4 w-4 shrink-0 ${color}`} />
              </div>
              <div key={String(value)} className="mt-1 text-2xl font-bold text-semantic-primary">
                {value}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-semantic-muted">{t(hint)}</p>
            </article>
          ))}
        </section>
      )}
      <section className="wrike-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-semantic-border bg-semantic-subtle/60 p-3">
          <label className="relative min-w-[280px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-semantic-muted" aria-hidden="true" />
            <input aria-label="Global asset search" className="jira-input h-10 w-full !pl-10 pr-10" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && apply()} placeholder={t('Search hostname, IP, serial, user, VM or source ID')} />
            {search && (
              <button type="button" aria-label={t('Clear search')} className="absolute right-3 top-1/2 -translate-y-1/2 text-semantic-muted hover:text-semantic-primary" onClick={() => setSearch('')}>
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <button type="button" className={`jira-btn-subtle ${advancedOpen ? 'bg-semantic-info-surface text-semantic-info' : ''}`} onClick={() => setAdvancedOpen((value) => !value)}>
            <SlidersHorizontal className="h-4 w-4" />
            {t('Advanced')}
            <ChevronDown className={`h-3.5 w-3.5 ${advancedOpen ? 'rotate-180' : ''}`} />
          </button>
          <button type="button" className="jira-btn-primary" onClick={apply}>
            {t('Apply')}
          </button>
        </div>
        {advancedOpen && (
          <div className="grid gap-x-3 gap-y-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <MultiSelect fieldLabel label={t('Type')} values={typeIds} options={typeOptions} onChange={setTypeIds} />
            <MultiSelect
              fieldLabel label={t('Source')} values={sourceTypes}
              options={[
                { value: 'VCENTER', label: 'vCenter' },
                { value: 'ACTIVE_DIRECTORY', label: 'Active Directory' },
                { value: 'CORTEX', label: 'Cortex XDR' },
                { value: 'SMB_PRINTER', label: 'SMB printer' },
                { value: 'LIBRENMS', label: 'LibreNMS' },
              ]}
              onChange={(values) => {
                setSourceTypes(values);
                setConnectorIds((current) => current.filter((id) => connectors.some((connector) => connector.id === id && values.includes(connector.connectorType))));
              }}
            />
            <MultiSelect fieldLabel label={t('Connector')} values={connectorIds} options={connectorOptions} onChange={setConnectorIds} />
            <label className="text-xs font-semibold text-semantic-muted">
              {t('Search behavior')}
              <select className="jira-input mt-1" value={searchMode} onChange={(event) => setSearchMode(event.currentTarget.value as 'auto' | 'exact' | 'contains')}>
                <option value="auto">{t('Smart match')}</option>
                <option value="exact">{t('Exact identifier')}</option>
                <option value="contains">{t('Contains text')}</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-semantic-muted">
              {t('Owner')}
              <input className="jira-input mt-1" value={owner} onChange={(event) => setOwner(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && apply()} placeholder={t('Name, AD user or identity')} />
            </label>
            <label className="text-xs font-semibold text-semantic-muted">
              {t('Operating system')}
              <input className="jira-input mt-1" value={operatingSystem} onChange={(event) => setOperatingSystem(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && apply()} placeholder={t('Windows Server, RHEL, Ubuntu…')} />
            </label>
            <label className="text-xs font-semibold text-semantic-muted">
              {t('Environment')}
              <select className="jira-input mt-1" value={environment} onChange={(event) => setEnvironment(event.target.value)}>
                <option value="">{t('All environments')}</option>
                {['PRODUCTION', 'DR', 'UAT', 'STAGING', 'TEST', 'DEV', 'UNKNOWN'].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-semantic-muted">
              {t('Lifecycle')}
              <select className="jira-input mt-1" value={lifecycleState} onChange={(event) => setLifecycleState(event.target.value)}>
                <option value="">{t('All lifecycle states')}</option>
                {['ACTIVE', 'DISCOVERED', 'STALE', 'DECOMMISSION_CANDIDATE', 'RETIRED'].map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-semantic-muted">
              {t('Criticality')}
              <select className="jira-input mt-1" value={criticality} onChange={(event) => setCriticality(event.target.value)}>
                <option value="">{t('All criticality')}</option>
                {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-semantic-muted">
              {t('Cortex posture')}
              <select className="jira-input mt-1 w-full" value={posture} onChange={(event) => setPosture(event.target.value as PostureFilter)}>
                <option value="">{t('All Cortex postures')}</option>
                <option value="missing-cortex">{t('Missing Cortex')}</option>
                <option value="cortex-offline">{t('Cortex offline')}</option>
                <option value="partially-protected">{t('Partially protected')}</option>
                <option value="vcenter-without-cortex">{t('vCenter but no Cortex')}</option>
                <option value="ad-without-cortex">{t('AD but no Cortex')}</option>
                <option value="cortex-only">{t('Cortex only')}</option>
                <option value="identity-conflict">{t('Identity conflict')}</option>
                <option value="stale-assets">{t('Stale assets')}</option>
              </select>
            </label>
          </div>
        )}
        {(
          appliedSearch || appliedTypeIds.length || appliedSourceTypes.length || appliedConnectorIds.length || appliedOwner || appliedOperatingSystem || appliedEnvironment || appliedLifecycleState || appliedCriticality || appliedPosture
        ) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-semantic-border bg-semantic-subtle/40 px-3 py-2 text-xs">
            {appliedSearch && (
              <Badge className="bg-sky-50 text-sky-700 border-sky-200">
                {t(appliedSearchMode === 'exact' ? 'Exact identifier' : appliedSearchMode === 'contains' ? 'Contains text' : 'Search')}: {appliedSearch}
                <button
                  className="ml-1"
                  onClick={() => {
                    setSearch('');
                    setAppliedSearch('');
                    setSearchMode('auto');
                    setAppliedSearchMode('auto');
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {appliedTypeIds.map((value) => (
              <Badge key={value} className="bg-slate-50 text-slate-700 border-slate-200">
                Type: {types.find((type) => type.id === value)?.name || value}
                <button className="ml-1" onClick={() => {
                  const next = appliedTypeIds.filter((item) => item !== value);
                  setTypeIds(next);
                  setAppliedTypeIds(next);
                }}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {appliedSourceTypes.map((value) => (
              <Badge key={value} className="bg-slate-50 text-slate-700 border-slate-200">
                Source: {sourceLabel(value)}
                <button className="ml-1" onClick={() => {
                  const next = appliedSourceTypes.filter((item) => item !== value);
                  setSourceTypes(next);
                  setAppliedSourceTypes(next);
                }}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {appliedConnectorIds.map((value) => <Badge key={value} className="bg-slate-50 text-slate-700 border-slate-200">{t('Connector')}: {connectors.find((connector) => connector.id === value)?.name || value}<button className="ml-1" onClick={() => { const next = appliedConnectorIds.filter((item) => item !== value); setConnectorIds(next); setAppliedConnectorIds(next); }}><X className="h-3 w-3" /></button></Badge>)}
            {appliedOwner && <Badge className="bg-slate-50 text-slate-700 border-slate-200">{t('Owner')}: {appliedOwner}<button className="ml-1" onClick={() => { setOwner(''); setAppliedOwner(''); }}><X className="h-3 w-3" /></button></Badge>}
            {appliedOperatingSystem && <Badge className="bg-slate-50 text-slate-700 border-slate-200">{t('Operating system')}: {appliedOperatingSystem}<button className="ml-1" onClick={() => { setOperatingSystem(''); setAppliedOperatingSystem(''); }}><X className="h-3 w-3" /></button></Badge>}
            {appliedEnvironment && <Badge className="bg-slate-50 text-slate-700 border-slate-200">{t('Environment')}: {appliedEnvironment}<button className="ml-1" onClick={() => { setEnvironment(''); setAppliedEnvironment(''); }}><X className="h-3 w-3" /></button></Badge>}
            {appliedLifecycleState && <Badge className="bg-slate-50 text-slate-700 border-slate-200">{t('Lifecycle')}: {appliedLifecycleState.replaceAll('_', ' ')}<button className="ml-1" onClick={() => { setLifecycleState(''); setAppliedLifecycleState(''); }}><X className="h-3 w-3" /></button></Badge>}
            {appliedCriticality && <Badge className="bg-slate-50 text-slate-700 border-slate-200">{t('Criticality')}: {appliedCriticality}<button className="ml-1" onClick={() => { setCriticality(''); setAppliedCriticality(''); }}><X className="h-3 w-3" /></button></Badge>}
            {appliedPosture && <Badge className="bg-slate-50 text-slate-700 border-slate-200">{t('Cortex posture')}: {t(appliedPosture.replaceAll('-', ' '))}<button className="ml-1" onClick={() => { setPosture(''); setAppliedPosture(''); }}><X className="h-3 w-3" /></button></Badge>}
            <button type="button" className="text-xs font-semibold text-semantic-info" onClick={clear}>{t('Clear all')}</button>
          </div>
        )}
      </section>
      {error && (
        <div className="wrike-card flex items-start gap-2 border-rose-200 p-3 text-sm text-semantic-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      <section className="wrike-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-semantic-border px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-semantic-primary">
            <Filter className="h-4 w-4 text-semantic-info" />
            {loading ? (
              t('Loading inventory…')
            ) : (
              <>
                {total} {t('matching records')}
              </>
            )}
            {selectedRows.length > 0 && <Badge className="bg-sky-50 text-sky-700 border-sky-200">{selectedRows.length} selected</Badge>}
          </div>
          <div className="relative">
            <button type="button" className="jira-btn-subtle" onClick={() => setColumnMenuOpen((value) => !value)}>
              <Settings2 className="h-4 w-4" />
              {t('Columns')}
            </button>
            {columnMenuOpen && (
              <div className="absolute right-0 top-9 z-20 w-56 rounded-md border border-semantic-border-strong bg-semantic-panel p-2 shadow-xl">
                {columns.map((column) => (
                  <label key={column.key} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={visibleColumns[column.key]}
                      onChange={() =>
                        setVisibleColumns((current) => ({
                          ...current,
                          [column.key]: !current[column.key],
                        }))
                      }
                    />
                    {t(column.label)}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        {loading ? (
          <div className="p-12 text-center text-sm text-semantic-muted">
            <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />
            {t('Loading persisted CMDB records…')}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <Layers3 className="mx-auto h-7 w-7 text-semantic-muted" />
            <p className="mt-2 text-sm font-semibold text-semantic-primary">{t('No assets match these filters')}</p>
            <p className="mt-1 text-xs text-semantic-muted">{t('Try clearing one filter or broadening the search.')}</p>
            <button type="button" className="jira-btn-subtle mt-3" onClick={clear}>
              {t('Clear all filters')}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] w-full table-fixed text-left text-xs">
              <thead className="sticky top-0 z-10 bg-semantic-subtle text-[11px] uppercase tracking-wide text-semantic-muted">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input type="checkbox" aria-label="Select visible rows" checked={selectedAll} onChange={(event) => setSelectedRows(event.currentTarget.checked ? rows.map((row) => row.id) : [])} />
                  </th>
                  {columns
                    .filter((column) => visibleColumns[column.key])
                    .map((column) => (
                      <th key={column.key} className={`${column.key === 'asset' ? 'w-[220px]' : column.key === 'identity' ? 'w-[165px]' : column.key === 'sources' ? 'w-[150px]' : 'w-[105px]'} px-2 py-2`}>
                        <button type="button" className="inline-flex items-center gap-1 text-left hover:text-semantic-primary" onClick={() => toggleSort(column.key)}>
                          {t(column.label)}
                          {sortBy === (column.key === 'lastSeen' ? 'lastSeenAt' : column.key === 'lifecycle' ? 'lifecycleState' : column.key) && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                        </button>
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const state = correlationState(row);
                  const stateInfo = statusMeta[state];
                  const postureInfo = postureMeta(row.cortexSecurity?.protection_state);
                  return (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      onClick={() => void open(row)}
                      onDoubleClick={() => void open(row, true)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          void open(row, true);
                        }
                      }}
                      className="cursor-pointer border-t border-semantic-border align-top hover:bg-semantic-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-semantic-info"
                      title="Double-click to open editable asset details"
                    >
                      <td className="px-3 py-3" onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
                        <input type="checkbox" aria-label={`Select ${row.displayName || row.name}`} checked={selectedRows.includes(row.id)} onChange={(event) => setSelectedRows(event.currentTarget.checked ? [...selectedRows, row.id] : selectedRows.filter((id) => id !== row.id))} />
                      </td>
                      {visibleColumns.asset && (
                        <td className="px-2 py-3">
                          <div className="truncate font-semibold text-semantic-primary" title={row.displayName || row.name}>
                            {row.displayName || row.name}
                          </div>
                          <div className="mt-0.5 truncate font-mono text-[10px] text-semantic-info" title={row.ciNumber}>
                            {row.ciNumber || '—'}
                          </div>
                        </td>
                      )}
                      {visibleColumns.type && <td className="px-2 py-3 text-semantic-muted">{types.find((type) => type.id === row.typeId)?.name || row.typeId || '—'}</td>}
                      {visibleColumns.identity && (
                        <td className="px-2 py-3">
                          <div className="truncate font-medium text-semantic-primary" title={row.fqdn || row.hostname || row.name}>
                            {row.fqdn || row.hostname || row.name || '—'}
                          </div>
                          <div className="mt-0.5 truncate text-[10px] text-semantic-muted">{row.operatingSystem || row.serialNumber || 'No secondary identity'}</div>
                        </td>
                      )}
                      {visibleColumns.ip && <td className="px-2 py-3 font-mono text-[11px] text-semantic-muted">{row.ipAddress || '—'}</td>}
                      {visibleColumns.environment && (
                        <td className="px-2 py-3">
                          <Badge className="bg-slate-50 text-slate-700 border-slate-200">{row.environment || 'UNKNOWN'}</Badge>
                        </td>
                      )}
                      {visibleColumns.owner && (
                        <td className="max-w-[140px] truncate px-2 py-3 text-semantic-muted" title={assetOwner(row, t)}>
                          {assetOwner(row, t)}
                        </td>
                      )}
                      {visibleColumns.sources && (
                        <td className="px-2 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(row.sourceCoverage || []).length ? (
                              row.sourceCoverage.map((source: string) => {
                                const Icon = sourceIcon(source);
                                return (
                                  <Badge key={source} className="bg-sky-50 text-sky-700 border-sky-200" title={sourceLabel(source)}>
                                    <Icon className="mr-1 h-3 w-3" />
                                    {sourceLabel(source)}
                                  </Badge>
                                );
                              })
                            ) : (
                              <span className="text-semantic-muted">No source evidence</span>
                            )}
                          </div>
                        </td>
                      )}
                      {visibleColumns.correlation && (
                        <td className="px-2 py-3">
                          <Badge className={stateInfo.className}>{stateInfo.label}</Badge>
                          {row.correlationConfidence != null && <div className="mt-1 text-[10px] text-semantic-muted">{Math.round(row.correlationConfidence)}% confidence</div>}
                        </td>
                      )}
                      {visibleColumns.posture && (
                        <td className="px-2 py-3">
                          <Badge className={postureInfo.className}>{postureInfo.label}</Badge>
                          {row.openFindingCount > 0 && (
                            <div className="mt-1 text-[10px] text-rose-600">
                              {row.openFindingCount} open finding
                              {row.openFindingCount === 1 ? '' : 's'}
                            </div>
                          )}
                        </td>
                      )}
                      {visibleColumns.lastSeen && (
                        <td className="whitespace-nowrap px-2 py-3 text-semantic-muted" title={dateLabel(row.lastSeenAt)}>
                          {shortDateLabel(row.lastSeenAt)}
                        </td>
                      )}
                      {visibleColumns.lifecycle && <td className="px-2 py-3 text-semantic-muted">{(row.lifecycleState || row.lifecycleStatus || '—').replaceAll('_', ' ')}</td>}
                      {visibleColumns.criticality && <td className="px-2 py-3 font-semibold text-semantic-muted">{row.criticality || '—'}</td>}
                      {customFields
                        .filter((field) => visibleColumns[`custom:${field.key}`])
                        .map((field) => (
                          <td key={`custom:${field.key}`} className="px-2 py-3 text-semantic-muted">
                            {formatCustomFieldValue(field, row.customFields?.[field.key], allUsers)}
                          </td>
                        ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-semantic-border px-3 py-2 text-xs text-semantic-muted">
          <span key={`${page}-${total}`}>{total ? `${(page - 1) * size + 1}–${Math.min(page * size, total)} of ${total}` : '0 records'}</span>
          <span className="flex items-center gap-1">
            <button type="button" aria-label={t('Previous page')} disabled={loading || page <= 1} className="jira-btn-subtle disabled:opacity-40" onClick={() => void load(Math.max(1, page - 1))}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span key={page}>Page {page}</span>
            <button type="button" aria-label={t('Next page')} disabled={loading || (viewMode === 'assets' ? !hasNextPage : page * size >= total)} className="jira-btn-subtle disabled:opacity-40" onClick={() => void load(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </span>
        </footer>
      </section>
      {selected && (
        <ViewportOverlay>
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/30"
          role="dialog"
          aria-modal="true"
          aria-label="Asset details"
          onClick={() => {
            latestDetailRequestId.current += 1;
            setSelected(undefined);
            setDetail(undefined);
            setDetailError('');
            setEditingAsset(false);
          }}
        >
          <aside className="h-full w-full max-w-[720px] overflow-y-auto border-l border-semantic-border-strong bg-semantic-panel text-semantic-primary shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <header className="sticky top-0 z-10 border-b border-semantic-border bg-semantic-panel px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-mono text-[11px] text-semantic-info">{asset?.ciNumber}</div>
                  <h2 className="mt-1 truncate text-lg font-bold text-semantic-primary" title={asset?.name}>
                    {asset?.name}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge className={statusMeta[correlationState(asset)].className}>{statusMeta[correlationState(asset)].label}</Badge>
                    <Badge className={postureMeta(security?.protection_state).className}>{postureMeta(security?.protection_state).label}</Badge>
                    <span className="text-xs text-semantic-muted">{assetOwner(asset || {}, t)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {usesCanonicalAssetApi && (
                    <button type="button" className="jira-btn-subtle" onClick={() => setEditingAsset((value) => !value)}>
                      <Pencil className="h-4 w-4" />
                      {editingAsset ? 'View details' : 'Edit'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="jira-btn-subtle"
                    onClick={() => {
                      latestDetailRequestId.current += 1;
                      setSelected(undefined);
                      setDetail(undefined);
                      setDetailError('');
                      setEditingAsset(false);
                    }}
                  >
                    <X className="h-4 w-4" />
                    {t('Close')}
                  </button>
                </div>
              </div>
            </header>
            {!editingAsset && (
              <nav className="sticky top-[101px] z-10 flex gap-4 overflow-x-auto border-b border-semantic-border bg-semantic-panel px-5 pt-3">
                {tabs.map((name) => (
                  <button type="button" key={name} onClick={() => setTab(name)} className={`whitespace-nowrap border-b-2 pb-2 text-xs font-bold ${tab === name ? 'border-semantic-info text-semantic-info' : 'border-transparent text-semantic-muted'}`}>
                    {t(name === 'sources' ? 'Discovery Sources' : name === 'security' ? 'Cortex Security' : name[0].toUpperCase() + name.slice(1))}
                  </button>
                ))}
              </nav>
            )}
            <div className="space-y-4 p-5">
              {!detail && !detailError ? (
                <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-semantic-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading asset details…
                </div>
              ) : detailError ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">Could not load asset details</p>
                      <p className="mt-1 text-xs">{detailError}</p>
                      <button type="button" className="jira-btn-subtle mt-3" onClick={() => void open(selected, editingAsset)}>
                        <RefreshCw className="h-4 w-4" />
                        Retry
                      </button>
                    </div>
                  </div>
                </div>
              ) : editingAsset ? (
                <AssetEditForm asset={asset} fields={customFields} users={allUsers} fetchWithAuth={fetchWithAuth} onClose={() => setEditingAsset(false)} onSaved={refreshSelectedAsset} />
              ) : (
                <>
                  {tab === 'overview' && (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Environment" value={asset?.environment} />
                        <Field label="Lifecycle" value={(asset?.lifecycleState || asset?.lifecycleStatus || '—').replaceAll('_', ' ')} />
                        <Field label="Owner" value={assetOwner(asset || {}, t)} />
                        <Field label="Last seen" value={dateLabel(asset?.lastSeenAt)} />
                        <Field label="Source coverage" value={`${asset?.sourceCount || 0} source record${asset?.sourceCount === 1 ? '' : 's'}`} />
                        <Field label="Correlation confidence" value={asset?.correlationConfidence != null ? `${Math.round(asset.correlationConfidence)}%` : 'Not exposed'} />
                      </div>
                      <div className="rounded-md border border-semantic-border bg-semantic-subtle p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-semantic-primary">
                          <CircleHelp className="h-4 w-4 text-semantic-info" />
                          {t('Why this asset exists')}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-semantic-muted">{asset?.sourceCount ? t('This canonical record is backed by persisted source evidence. Review the source and provenance tabs to see which systems contributed each value.') : t('This canonical record has no linked discovery source evidence.')}</p>
                      </div>
                    </>
                  )}
                  {tab === 'identity' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Hostname" value={asset?.hostname} copy={asset?.hostname} />
                      <Field label="FQDN" value={asset?.fqdn} copy={asset?.fqdn} />
                      <Field label="IP address" value={asset?.ipAddress} copy={asset?.ipAddress} />
                      <Field label="Serial number" value={asset?.serialNumber} copy={asset?.serialNumber} />
                      <Field label="Asset tag" value={asset?.assetTag} copy={asset?.assetTag} />
                      <Field label="External reference" value={asset?.externalReference} copy={asset?.externalReference} />
                    </div>
                  )}
                  {tab === 'infrastructure' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Hostname" value={asset?.hostname} />
                      <Field label="Operating system" value={[asset?.operatingSystem, asset?.osVersion].filter(Boolean).join(' ')} />
                      <Field label="Manufacturer" value={asset?.manufacturer} />
                      <Field label="Model" value={asset?.model} />
                      <Field label="CPU" value={asset?.cpuCount != null ? `${asset.cpuCount} vCPU` : undefined} />
                      <Field label="Memory" value={asset?.memoryBytes != null ? `${Math.round(asset.memoryBytes / 1024 / 1024 / 1024)} GB` : undefined} />
                    </div>
                  )}
                  {tab === 'sources' && <AssetDiscoverySourceCards sources={detail.sources || []} provenance={detail.provenance || []} t={t} />}
                  {tab === 'security' && (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Protection state" value={security?.protection_state?.replaceAll('_', ' ') || 'Not reported'} />
                        <Field label="Agent status" value={security?.agent_status || 'Not reported'} />
                        <Field label="Isolation state" value={security?.isolation_status || 'Not reported'} />
                        <Field label="Last Cortex seen" value={dateLabel(security?.cortex_last_seen_at)} />
                      </div>
                      <div className="rounded-md border border-semantic-border p-3 text-xs">
                        <strong>{t('Open findings')}</strong>
                        {detail.findings?.length ? (
                          <div className="mt-2 space-y-2">
                            {detail.findings.map((finding: any) => (
                              <div key={finding.id} className="rounded bg-rose-50 p-2 text-rose-800">
                                {finding.title || finding.finding_type || finding.id}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1 text-semantic-muted">{t('No persisted open findings.')}</p>
                        )}
                      </div>
                    </div>
                  )}
                  {tab === 'conflicts' && (
                    <div className="space-y-3">
                      {detail.conflicts?.length ? (
                        <>
                          {detail.conflicts.map((conflict: any) => (
                            <div key={conflict.id} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <strong className="text-amber-900">{conflict.outcome === 'IDENTITY_CONFLICT' ? 'Identity conflict' : 'Correlation review required'}</strong>
                                <span className="font-mono text-[10px] text-amber-800">{conflict.id}</span>
                              </div>
                              <p className="mt-2 text-amber-900">{conflict.summary || 'Conflicting source evidence requires operator review.'}</p>
                              <p className="mt-2 text-amber-800">{t('Resolve this case from the Correlation Review workspace; no local merge is performed here.')}</p>
                            </div>
                          ))}
                        </>
                      ) : (
                        <p className="text-sm text-semantic-muted">{t('No persisted correlation conflicts for this asset.')}</p>
                      )}
                    </div>
                  )}
                  {tab === 'provenance' && (
                    <div className="space-y-2">
                      {Array.isArray(tabValue) && tabValue.length ? (
                        tabValue.map((entry: any, index: number) => (
                          <div key={`${entry.attributePath || 'entry'}-${index}`} className="rounded-md border border-semantic-border p-3 text-xs">
                            <div className="font-semibold text-semantic-primary">{entry.attributePath || entry.path || 'Observed attribute'}</div>
                            <div className="mt-1 text-semantic-muted">
                              {entry.connectorType || entry.sourceName || entry.connectorId || 'Source'} · {dateLabel(entry.observedAt || entry.lastSeenAt)}
                            </div>
                            <div className="mt-1 break-words">{String(entry.effectiveValue ?? entry.value ?? '—')}</div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-semantic-muted">{t('No persisted provenance entries.')}</p>
                      )}
                    </div>
                  )}
                  {['network', 'storage', 'relationships', 'history'].includes(tab) && (
                    <div className="space-y-2">
                      {Array.isArray(tabValue) && tabValue.length ? (
                        tabValue.map((entry: any, index: number) => (
                          <div key={`${entry.id || entry.name || 'record'}-${index}`} className="rounded-md border border-semantic-border p-3 text-xs">
                            <div className="font-semibold text-semantic-primary">{entry.name || entry.targetName || entry.sourceName || entry.id || 'Record'}</div>
                            <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-semantic-muted">{JSON.stringify(entry, null, 2)}</pre>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-semantic-muted">{t('No persisted records for this tab.')}</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>
        </ViewportOverlay>
      )}
    </main>
  );
};
