import { useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';

type Props = {
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
  connector?: any;
  onClose: () => void;
  onSaved: () => Promise<void>;
  t: (key: string) => string;
};

const readJson = async (response: Response): Promise<any> => {
  const body = await response.text();
  try { return body ? JSON.parse(body) : {}; }
  catch { throw new Error(`Discovery API returned a non-JSON response (${response.status}).`); }
};

/** Dedicated, password-free CMDB AD connector form. Bind secrets never enter the browser. */
export const ActiveDirectoryConnectorModal: React.FC<Props> = ({ fetchWithAuth, connector, onClose, onSaved, t }) => {
  const [form, setForm] = useState(() => ({ name: connector?.name || 'Active Directory', environment: connector?.environment || 'PRODUCTION', ldapUrl: connector?.nonSecretConfiguration?.url || '', baseDn: connector?.nonSecretConfiguration?.baseDn || '', bindUser: connector?.nonSecretConfiguration?.bindUser || '', secretReference: '', tlsCaReference: connector?.nonSecretConfiguration?.tlsCaReference || '', enabled: connector ? Boolean(connector.enabled) : true }));
  const [replaceSecretReference, setReplaceSecretReference] = useState(false);
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const update = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const response = await fetchWithAuth(connector ? `/api/cmdb/discovery/connectors/${encodeURIComponent(connector.id)}` : '/api/cmdb/discovery/connectors', { method: connector ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(connector ? { version: Number(connector.version) } : {}),
        name: form.name, connectorType: 'ACTIVE_DIRECTORY', environment: form.environment, ldapUrl: form.ldapUrl, baseDn: form.baseDn, bindUser: form.bindUser, ...(!connector || replaceSecretReference ? { secretReference: form.secretReference } : {}), tlsCaReference: form.tlsCaReference || undefined, tlsVerifyCertificates: true, endpointAllowPrivateNetwork: true, enabled: form.enabled, requestTimeoutMs: 30000, scheduleMinutes: 0,
      }) });
      const data = await readJson(response); if (!response.ok || !data.success) throw new Error(data.error || t('Could not save connector.'));
      await onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('Could not save connector.')); } finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-modal overflow-y-auto bg-slate-950/45 p-3 sm:p-6"><div className="flex min-h-full items-center justify-center"><form onSubmit={(event) => void save(event)} aria-modal="true" role="dialog" className="wrike-card flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl shadow-2xl"><div className="flex items-start justify-between border-b border-semantic-border px-6 py-5"><div><h2 className="text-xl font-bold text-semantic-primary">{t(connector ? 'Edit Active Directory' : 'Add Active Directory')}</h2><p className="mt-1 text-sm text-semantic-muted">{t('Read-only LDAPS discovery for computers, identities, groups and OU relationships. The bind password remains in the server-side secret store.')}</p></div><button type="button" onClick={onClose} aria-label={t('Close')} className="jira-btn-subtle p-2"><X className="h-4 w-4" /></button></div><div className="space-y-4 px-6 py-5">{error && <div className="flex gap-2 text-sm text-semantic-danger"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}<div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="text-sm text-semantic-muted">{t('Name')}<input required value={form.name} onChange={(event) => update('name', event.target.value)} className="jira-input mt-1 w-full" /></label><label className="text-sm text-semantic-muted">{t('Environment')}<select value={form.environment} onChange={(event) => update('environment', event.target.value)} className="jira-input mt-1 w-full"><option>PRODUCTION</option><option>DR</option><option>UAT</option><option>TEST</option><option>DEV</option></select></label><label className="text-sm text-semantic-muted sm:col-span-2">{t('LDAPS URL')}<input required type="url" value={form.ldapUrl} onChange={(event) => update('ldapUrl', event.target.value)} className="jira-input mt-1 w-full" placeholder="ldaps://dc.bank.local:636" /></label><label className="text-sm text-semantic-muted">{t('Base DN')}<input required value={form.baseDn} onChange={(event) => update('baseDn', event.target.value)} className="jira-input mt-1 w-full" placeholder="DC=bank,DC=local" /></label><label className="text-sm text-semantic-muted">{t('Read-only bind user')}<input required value={form.bindUser} onChange={(event) => update('bindUser', event.target.value)} className="jira-input mt-1 w-full" placeholder="svc_cmdb_ad@bank.local" /></label>{connector && <label className="flex items-center gap-2 text-sm text-semantic-primary sm:col-span-2"><input type="checkbox" checked={replaceSecretReference} onChange={(event) => setReplaceSecretReference(event.target.checked)} />{t('Replace server-side bind secret reference')}</label>}{(!connector || replaceSecretReference) && <label className="text-sm text-semantic-muted sm:col-span-2">{t('Bind secret reference')}<input required value={form.secretReference} onChange={(event) => update('secretReference', event.target.value)} className="jira-input mt-1 w-full" placeholder="env://LDAP_BIND_PASSWORD" /><span className="mt-1 block text-xs">{t('Use a server-resolved env:// reference. Do not enter a password here.')}</span></label>}<label className="text-sm text-semantic-muted sm:col-span-2">{t('Enterprise CA reference')}<input value={form.tlsCaReference} onChange={(event) => update('tlsCaReference', event.target.value)} className="jira-input mt-1 w-full" placeholder="file:///run/secrets/ad-ca.pem" /></label></div><label className="flex items-center gap-2 text-sm text-semantic-primary"><input type="checkbox" checked={form.enabled} onChange={(event) => update('enabled', event.target.checked)} />{t('Enable connector after save')}</label></div><div className="flex justify-end gap-3 border-t border-semantic-border px-6 py-4"><button type="button" onClick={onClose} className="jira-btn-subtle">{t('Cancel')}</button><button type="submit" disabled={saving} className="jira-btn-primary">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{t('Save Active Directory')}</button></div></form></div></div>;
};
