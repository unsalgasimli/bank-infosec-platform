import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, GitBranch, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import type { BankApplication, BankAsset } from '../../../shared/types/asset.js';
import type { BusinessPriority, TechnicalSeverity, TicketCategory } from '../../../shared/types/ticket.js';
import type { ProjectBlueprint } from '../../../shared/types/blueprints.js';
import { CustomSelect } from '../common/CustomSelect.js';

interface TicketCreateModalProps { isOpen: boolean; onClose: () => void; applications: BankApplication[]; assets: BankAsset[]; onCreated: (ticket: any) => void }
interface Metadata {
  departments: Array<{ id: string; name: string; code: string }>;
  teams: Array<{ id: string; name: string; code: string; departmentId: string }>;
  users: Array<{ id: string; fullName: string; title: string; departmentId: string; teamIds: string[]; roles: string[] }>;
  workflows: Array<{ id: string; name: string; version: number }>;
  slaPolicies: Array<{ id: string; name: string; description: string; isDefault: boolean }>;
  categories: TicketCategory[]; severities: TechnicalSeverity[]; priorities: BusinessPriority[]; projectCodes: string[];
}
interface PreviewTask {
  id: string; title: string; departmentName: string; assigneeName: string; technicalSeverity: TechnicalSeverity;
  dependsOnTaskId?: string; slaPolicyName?: string;
}
interface CustomTask {
  id: string; title: string; description: string; targetDepartment: string; teamId?: string; assigneeId: string;
  technicalSeverity: TechnicalSeverity; businessPriority: BusinessPriority; category: TicketCategory; slaPolicyId: string;
  durationDays: number; offsetDays: number; dependsOnTaskId: string | null; tags: string[];
}
const humanize = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const readApiResponse = async (response: Response, operation: string) => {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    const requestId = response.headers.get('x-request-id');
    throw new Error(`${operation} service returned an invalid response (${response.status}). Verify that the current API server is running.${requestId ? ` Request ID: ${requestId}` : ''}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${operation} service returned malformed JSON (${response.status}).`);
  }
};

export const TicketCreateModal: React.FC<TicketCreateModalProps> = ({ isOpen, onClose, applications = [], assets = [], onCreated }) => {
  const { fetchWithAuth } = useAuth();
  const [tab, setTab] = useState<'TEMPLATE' | 'CUSTOM_GRAPH' | 'FAST_SINGLE'>('TEMPLATE');
  const [templates, setTemplates] = useState<ProjectBlueprint[]>([]);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [customTitle, setCustomTitle] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customTasks, setCustomTasks] = useState<CustomTask[]>([]);
  const [single, setSingle] = useState({ title: '', description: '', category: '', severity: '', priority: '', assigneeId: '', slaPolicyId: '', applicationId: '', assetId: '' });
  const selectedTemplate = templates.find((item) => item.id === templateId);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true); setError('');
    Promise.all([fetchWithAuth('/api/workflow-templates'), fetchWithAuth('/api/workflow-templates/metadata')])
      .then(async ([templateResponse, metadataResponse]) => {
        const [templateData, metadataData] = await Promise.all([
          readApiResponse(templateResponse, 'Workflow template'),
          readApiResponse(metadataResponse, 'Task metadata'),
        ]);
        if (!templateResponse.ok || !templateData.success) throw new Error(templateData.error || 'Workflow templates could not be loaded.');
        if (!metadataResponse.ok || !metadataData.success) throw new Error(metadataData.error || 'Task metadata could not be loaded.');
        if (cancelled) return;
        const nextTemplates = templateData.blueprints as ProjectBlueprint[];
        const nextMetadata = metadataData.metadata as Metadata;
        setTemplates(nextTemplates); setMetadata(nextMetadata); setTemplateId(nextTemplates[0]?.id || '');
        setSingle((current) => ({ ...current, category: nextMetadata.categories[0] || '', severity: nextMetadata.severities[0] || '', priority: nextMetadata.priorities[0] || '', assigneeId: nextMetadata.users[0]?.id || '', slaPolicyId: nextMetadata.slaPolicies.find((item) => item.isDefault)?.id || nextMetadata.slaPolicies[0]?.id || '' }));
      }).catch((reason) => { if (!cancelled) setError(reason.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, fetchWithAuth, reloadToken]);

  useEffect(() => {
    if (!isOpen || !templateId) return;
    let cancelled = false;
    setPreviewLoading(true); setError('');
    fetchWithAuth(`/api/workflow-templates/${templateId}/preview`).then(async (response) => ({ response, data: await readApiResponse(response, 'Routing preview') }))
      .then(({ response, data }) => { if (!response.ok || !data.success) throw new Error(data.error || 'Routing preview failed.'); if (!cancelled) setPreview(data.preview.tasks); })
      .catch((reason) => { if (!cancelled) { setPreview([]); setError(reason.message); } }).finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, templateId, fetchWithAuth]);

  const paramsValid = useMemo(() => (selectedTemplate?.parameters || []).every((field) => !field.required || parameters[field.id]?.trim()), [selectedTemplate, parameters]);
  if (!isOpen) return null;

  const submit = async (path: string, body: unknown) => {
    setSubmitting(true); setError('');
    try {
      const response = await fetchWithAuth(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await readApiResponse(response, 'Create Work');
      if (!response.ok || !data.success) throw new Error(data.error || data.details?.[0]?.message || 'Task creation failed.');
      const ticket = data.ticket || data.tickets?.[0] || data.createdTickets?.[0];
      if (ticket) onCreated(ticket);
      onClose();
    } catch (reason: any) { setError(reason.message || 'Backend service could not create the work item.'); }
    finally { setSubmitting(false); }
  };

  const addStep = () => {
    if (!metadata) return;
    const department = metadata.departments[0];
    const assignee = metadata.users.find((user) => user.departmentId === department?.id);
    const sla = metadata.slaPolicies.find((item) => item.isDefault) || metadata.slaPolicies[0];
    if (!department || !assignee || !sla || !metadata.categories[0] || !metadata.severities[0] || !metadata.priorities[0]) return setError('Administrator must configure an active department, assignee, SLA, category, severity and priority.');
    setCustomTasks((current) => [...current, { id: crypto.randomUUID(), title: '', description: '', targetDepartment: department.id, assigneeId: assignee.id, technicalSeverity: metadata.severities[0], businessPriority: metadata.priorities[0], category: metadata.categories[0], slaPolicyId: sla.id, durationDays: 1, offsetDays: 0, dependsOnTaskId: current.at(-1)?.id || null, tags: [] }]);
  };
  const updateStep = (index: number, values: Partial<CustomTask>) => setCustomTasks((current) => current.map((task, taskIndex) => taskIndex === index ? { ...task, ...values } : task));
  const userOptions = (departmentId?: string) => metadata?.users.filter((user) => !departmentId || user.departmentId === departmentId).map((user) => ({ value: user.id, label: user.fullName, sublabel: user.title })) || [];
  const departmentOptions = metadata?.departments.map((item) => ({ value: item.id, label: item.name, sublabel: item.code })) || [];
  const options = (values: string[] = []) => values.map((value) => ({ value, label: humanize(value) }));

  const templateContent = <div className="h-full flex">
    <aside className="w-72 bg-[#F8FAFC] border-r border-[#E2E8F0] p-4 overflow-y-auto"><p className="section-label">Active templates</p>{templates.length === 0 ? <p className="empty-box">No active templates configured.</p> : templates.map((item) => <button key={item.id} type="button" onClick={() => { setTemplateId(item.id); setParameters({}); }} className={`w-full p-3 mb-2 rounded-xl border text-left ${templateId === item.id ? 'border-[#00B259] bg-white ring-1 ring-[#00B259]/20' : 'border-[#E2E8F0] bg-white'}`}><strong className="block truncate text-[#162136]">{item.shortName || item.title}</strong><span className="text-[10px] text-[#5A6A85]">{item.defaultTasks.length} tasks · v{item.version || 1}</span></button>)}</aside>
    <section className="flex-1 p-5 overflow-y-auto">{selectedTemplate && <><div className="flex justify-between border-b border-[#E2E8F0] pb-3"><div><p className="text-[10px] font-mono font-bold text-[#00A653] uppercase">{selectedTemplate.domain}</p><h3 className="text-base font-bold text-[#162136]">{selectedTemplate.title}</h3><p className="text-[11px] text-[#5A6A85] mt-1 max-w-2xl">{selectedTemplate.description}</p></div><span className="pill">{selectedTemplate.defaultTasks.length} linked tasks</span></div>
      <div className="grid grid-cols-2 gap-3 py-4">{selectedTemplate.parameters?.map((field) => <label key={field.id}><b className="field-label">{field.label}{field.required ? ' *' : ''}</b>{field.type === 'TEXTAREA' ? <textarea rows={2} value={parameters[field.id] || ''} onChange={(e) => setParameters((current) => ({ ...current, [field.id]: e.target.value }))} placeholder={field.placeholder} className="wrike-input mt-1 text-xs resize-none" /> : <input value={parameters[field.id] || ''} onChange={(e) => setParameters((current) => ({ ...current, [field.id]: e.target.value }))} placeholder={field.placeholder} className="wrike-input mt-1 text-xs" />}</label>)}</div>
      <div className="flex justify-between mb-2"><p className="section-label">Validated routing preview</p><span className="text-[9px] font-mono text-[#0073D3]">FINISH-TO-START</span></div>
      {previewLoading ? <p className="py-8 text-center text-[#5A6A85]"><Loader2 className="icon-spin" />Resolving live routing…</p> : <div className="space-y-2">{preview.map((task, index) => <div key={task.id} className="p-3 rounded-lg border border-[#E2E8F0] grid grid-cols-[28px_minmax(0,1fr)_190px_110px] items-center gap-3"><span className="step-number">{index + 1}</span><div className="min-w-0"><b className="block truncate">{task.title}</b><small className="text-[#5A6A85]">{task.dependsOnTaskId ? `Depends on ${task.dependsOnTaskId}` : 'Can start immediately'}</small></div><div className="min-w-0"><b className="block truncate">{task.departmentName}</b><small className="text-[#5A6A85] block truncate">{task.assigneeName}</small></div><div className="text-right"><b className="text-[#B42318] text-[9px]">{humanize(task.technicalSeverity)}</b><small className="text-[#5A6A85] block truncate">{task.slaPolicyName || 'Template SLA'}</small></div></div>)}</div>}</>}</section>
  </div>;

  const customContent = <div className="h-full flex">
    <aside className="w-72 sidebar"><p className="section-label">Workflow details</p><label><b className="field-label">Title *</b><input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} className="wrike-input mt-1 text-xs" placeholder="Workflow name" /></label><label><b className="field-label">Description *</b><textarea rows={5} value={customDescription} onChange={(e) => setCustomDescription(e.target.value)} className="wrike-input mt-1 text-xs resize-none" placeholder="Scope and expected outcome" /></label><p className="text-[10px] text-[#5A6A85]">All references and dependency cycles are validated before tickets are created.</p></aside>
    <section className="flex-1 p-5 overflow-y-auto"><div className="flex justify-between mb-3"><p className="section-label">Task graph ({customTasks.length})</p><button type="button" onClick={addStep} className="wrike-btn-primary px-3 py-1.5"><Plus className="w-3.5 h-3.5" />Add step</button></div>{customTasks.length === 0 ? <button type="button" onClick={addStep} className="empty-action">Add the first workflow step</button> : <div className="space-y-3">{customTasks.map((task, index) => <div key={task.id} className="rounded-xl border border-[#E2E8F0] p-3 space-y-2"><div className="flex gap-2 items-center"><span className="step-number">{index + 1}</span><input value={task.title} onChange={(e) => updateStep(index, { title: e.target.value })} className="wrike-input text-xs font-bold flex-1" placeholder="Task summary *" /><button type="button" onClick={() => setCustomTasks((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="p-1 text-[#8D99AE] hover:text-red-600"><Trash2 className="w-4 h-4" /></button></div><textarea rows={2} value={task.description} onChange={(e) => updateStep(index, { description: e.target.value })} className="wrike-input text-xs resize-none" placeholder="Definition of done" /><div className="grid grid-cols-3 gap-2">
      <SelectField label="Department" value={task.targetDepartment} choices={departmentOptions} change={(value) => updateStep(index, { targetDepartment: value, teamId: undefined, assigneeId: metadata?.users.find((user) => user.departmentId === value)?.id || '' })} />
      <SelectField label="Team" value={task.teamId || ''} choices={[{ value: '', label: 'Department queue' }, ...(metadata?.teams.filter((team) => team.departmentId === task.targetDepartment).map((team) => ({ value: team.id, label: team.name })) || [])]} change={(value) => updateStep(index, { teamId: value || undefined })} />
      <SelectField label="Assignee" value={task.assigneeId} choices={userOptions(task.targetDepartment)} change={(value) => updateStep(index, { assigneeId: value })} />
      <SelectField label="Category" value={task.category} choices={options(metadata?.categories)} change={(value) => updateStep(index, { category: value as TicketCategory })} />
      <SelectField label="Severity" value={task.technicalSeverity} choices={options(metadata?.severities)} change={(value) => updateStep(index, { technicalSeverity: value as TechnicalSeverity })} />
      <SelectField label="Priority" value={task.businessPriority} choices={options(metadata?.priorities)} change={(value) => updateStep(index, { businessPriority: value as BusinessPriority })} />
      <SelectField label="SLA policy" value={task.slaPolicyId} choices={metadata?.slaPolicies.map((item) => ({ value: item.id, label: item.name })) || []} change={(value) => updateStep(index, { slaPolicyId: value })} />
      <SelectField label="Depends on" value={task.dependsOnTaskId || ''} choices={[{ value: '', label: 'No dependency' }, ...customTasks.filter((candidate) => candidate.id !== task.id).map((candidate, candidateIndex) => ({ value: candidate.id, label: candidate.title || `Step ${candidateIndex + 1}` }))]} change={(value) => updateStep(index, { dependsOnTaskId: value || null })} />
      <label><b className="mini-label">Duration (days)</b><input type="number" min={1} max={365} value={task.durationDays} onChange={(e) => updateStep(index, { durationDays: Number(e.target.value) })} className="wrike-input text-xs py-1" /></label>
    </div></div>)}</div>}</section>
  </div>;

  const singleContent = <div className="h-full flex"><aside className="w-72 sidebar"><p className="section-label">Target context</p><SelectField label="Application" value={single.applicationId} choices={[{ value: '', label: 'General / none' }, ...applications.map((item) => ({ value: item.id, label: item.name }))]} change={(value) => setSingle({ ...single, applicationId: value })} /><SelectField label="Asset" value={single.assetId} choices={[{ value: '', label: 'None' }, ...assets.map((item) => ({ value: item.id, label: item.name }))]} change={(value) => setSingle({ ...single, assetId: value })} /></aside><section className="flex-1 p-6 overflow-y-auto space-y-4"><label><b className="field-label">Summary *</b><input value={single.title} onChange={(e) => setSingle({ ...single, title: e.target.value })} className="wrike-input mt-1 text-xs font-bold" placeholder="Clear, actionable summary" /></label><label><b className="field-label">Description *</b><textarea rows={5} value={single.description} onChange={(e) => setSingle({ ...single, description: e.target.value })} className="wrike-input mt-1 text-xs resize-none" placeholder="Scope, evidence and acceptance criteria" /></label><div className="grid grid-cols-3 gap-3"><SelectField label="Category" value={single.category} choices={options(metadata?.categories)} change={(value) => setSingle({ ...single, category: value })} /><SelectField label="Severity" value={single.severity} choices={options(metadata?.severities)} change={(value) => setSingle({ ...single, severity: value })} /><SelectField label="Priority" value={single.priority} choices={options(metadata?.priorities)} change={(value) => setSingle({ ...single, priority: value })} /><SelectField label="Assignee" value={single.assigneeId} choices={userOptions()} change={(value) => setSingle({ ...single, assigneeId: value })} /><div className="col-span-2"><SelectField label="SLA policy" value={single.slaPolicyId} choices={metadata?.slaPolicies.map((item) => ({ value: item.id, label: item.name, sublabel: item.description })) || []} change={(value) => setSingle({ ...single, slaPolicyId: value })} /></div></div></section></div>;

  const disabled = submitting || loading || previewLoading || (tab === 'TEMPLATE' ? !selectedTemplate || !paramsValid || !preview.length : tab === 'CUSTOM_GRAPH' ? !customTitle.trim() || !customDescription.trim() || !customTasks.length || customTasks.some((task) => !task.title.trim() || !task.description.trim() || !task.assigneeId) : !single.title.trim() || !single.description.trim() || !single.assigneeId || !single.slaPolicyId);
  const launch = () => tab === 'TEMPLATE'
    ? submit(`/api/workflow-templates/${templateId}/launch`, { parameters, idempotencyKey: crypto.randomUUID() })
    : tab === 'CUSTOM_GRAPH'
      ? submit('/api/workflow-templates/custom/launch', { title: customTitle, description: customDescription, workflowId: metadata?.workflows[0]?.id, slaPolicyId: metadata?.slaPolicies.find((item) => item.isDefault)?.id, tasks: customTasks })
      : submit('/api/tickets', { projectCode: metadata?.projectCodes[0], category: single.category, title: single.title, description: single.description, technicalSeverity: single.severity, businessPriority: single.priority, assigneeId: single.assigneeId, slaPolicyId: single.slaPolicyId, applicationId: single.applicationId || undefined, assetId: single.assetId || undefined, tags: ['SINGLE_TASK'] });

  return <div className="fixed inset-0 bg-[#162136]/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"><style>{`.section-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#5A6A85}.field-label{display:block;font-size:11px;color:#162136}.mini-label{display:block;font-size:9px;color:#5A6A85}.sidebar{background:#F8FAFC;border-right:1px solid #E2E8F0;padding:16px;display:flex;flex-direction:column;gap:12px;overflow-y:auto}.pill{padding:4px 10px;border-radius:999px;background:#E6F7EF;color:#007860;border:1px solid #B8EAD1;font-weight:700;font-size:10px;height:max-content}.step-number{width:24px;height:24px;border-radius:999px;background:#00B259;color:white;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0}.empty-box{border:1px dashed #CBD5E1;border-radius:8px;padding:16px;color:#5A6A85}.empty-action{width:100%;height:128px;border:2px dashed #CBD5E1;border-radius:12px;color:#5A6A85}.empty-action:hover{border-color:#00B259;color:#007860}.icon-spin{width:16px;height:16px;animation:spin 1s linear infinite;display:inline;margin-right:8px}@keyframes spin{to{transform:rotate(360deg)}}`}</style><div className="w-[1120px] h-[720px] max-w-[96vw] max-h-[92vh] bg-white rounded-2xl border border-[#E2E8F0] shadow-2xl flex flex-col overflow-hidden text-xs"><header className="h-16 px-6 border-b border-[#E2E8F0] flex items-center justify-between shrink-0"><div className="flex items-center gap-3"><span className="w-8 h-8 rounded-lg bg-[#00B259] text-white flex items-center justify-center"><Plus className="w-4 h-4" /></span><div><h2 className="text-sm font-bold">Create Work & Workflows</h2><p className="text-[10px] text-[#5A6A85]">Backend-routed tasks, SLA and dependency orchestration</p></div></div><div className="flex items-center gap-3"><div className="flex bg-[#F4F6FB] border border-[#E2E8F0] rounded-lg p-1 font-semibold">{([['TEMPLATE', Sparkles, 'Templates'], ['CUSTOM_GRAPH', GitBranch, 'Custom Graph'], ['FAST_SINGLE', FileText, 'Single Task']] as const).map(([value, Icon, label]) => <button key={value} type="button" onClick={() => { setTab(value); setError(''); }} className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 ${tab === value ? 'bg-[#00B259] text-white' : 'text-[#5A6A85]'}`}><Icon className="w-3.5 h-3.5" />{label}</button>)}</div><button type="button" onClick={onClose} className="p-2 text-[#5A6A85]"><X className="w-4 h-4" /></button></div></header>{error && <div className="mx-5 mt-3 px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /><span className="flex-1">{error}</span><button type="button" onClick={() => setReloadToken((value) => value + 1)} className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-[10px] font-bold hover:bg-red-100">Retry</button></div>}<main className="flex-1 min-h-0 overflow-hidden">{loading ? <div className="h-full flex items-center justify-center text-[#5A6A85]"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading live task configuration…</div> : tab === 'TEMPLATE' ? templateContent : tab === 'CUSTOM_GRAPH' ? customContent : singleContent}</main><footer className="h-16 px-6 border-t border-[#E2E8F0] flex justify-between items-center shrink-0"><span className="text-[11px] text-[#007860] font-semibold flex gap-2"><CheckCircle2 className="w-4 h-4" />{tab === 'TEMPLATE' ? `${preview.length} routed tasks validated` : tab === 'CUSTOM_GRAPH' ? `${customTasks.length} graph steps configured` : 'Workflow and SLA applied by backend'}</span><div className="flex gap-2"><button type="button" onClick={onClose} className="wrike-btn-secondary px-4 py-2">Cancel</button><button type="button" disabled={disabled} onClick={launch} className="wrike-btn-primary px-4 py-2 disabled:opacity-50">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}{submitting ? 'Creating…' : tab === 'TEMPLATE' ? 'Launch workflow' : tab === 'CUSTOM_GRAPH' ? 'Launch graph' : 'Create task'}</button></div></footer></div></div>;
};

const SelectField = ({ label, value, choices, change }: { label: string; value: string; choices: Array<{ value: string; label: string; sublabel?: string }>; change: (value: string) => void }) => <label><b className="mini-label">{label}</b><CustomSelect size="sm" value={value} options={choices} onChange={change} /></label>;
