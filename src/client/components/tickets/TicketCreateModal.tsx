import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bookmark,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  FileCode,
  FileText,
  GitBranch,
  HelpCircle,
  Info,
  Layers,
  Link as LinkIcon,
  ListTodo,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Send,
  Server,
  Shield,
  Sliders,
  Sparkles,
  Tag,
  Terminal,
  Trash2,
  User,
  Users,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import type { BankApplication, BankAsset } from '../../../shared/types/asset.js';
import type {
  BusinessImpact,
  BusinessPriority,
  TechnicalSeverity,
  TicketCategory,
} from '../../../shared/types/ticket.js';
import { calculatePriorityFromImpactUrgency } from '../../../shared/types/ticket.js';
import type {
  BlueprintScope,
  DependencyEdgeType,
  GraphDependencyEdge,
  GraphNodeDefinition,
  GraphNodeType,
  ProjectBlueprint,
  WorkflowParameterDefinition,
} from '../../../shared/types/blueprints.js';
import type {
  ChecklistItem,
  EnterpriseTicketType,
  RecurringTaskConfig,
  RoutingStrategy,
  TicketUrgency,
} from '../../../shared/types/itsm.js';
import { CustomSelect, type SelectOption } from '../common/CustomSelect.js';

interface TicketCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  applications: BankApplication[];
  assets: BankAsset[];
  onCreated: (ticket: any) => void;
}

interface Metadata {
  directory: { source: 'ACTIVE_DIRECTORY'; ready: boolean; message?: string };
  departments: Array<{ id: string; name: string; code: string; color?: string }>;
  teams: Array<{ id: string; name: string; code: string; departmentId: string }>;
  users: Array<{ id: string; fullName: string; title: string; departmentId: string; teamIds: string[]; roles: string[]; managerId?: string }>;
  workflows: Array<{ id: string; name: string; version: number }>;
  slaPolicies: Array<{ id: string; name: string; description: string; isDefault: boolean }>;
  categories: TicketCategory[];
  severities: TechnicalSeverity[];
  priorities: BusinessPriority[];
  projectCodes: string[];
  workTypes: Array<{ value: EnterpriseTicketType; label: string }>;
}

interface PreviewTask {
  id: string;
  title: string;
  departmentName: string;
  assigneeName: string;
  technicalSeverity: TechnicalSeverity;
  dependsOnTaskId?: string;
  slaPolicyName?: string;
}

interface CustomGraphNode {
  id: string;
  type: GraphNodeType;
  title: string;
  description: string;
  targetDepartment: string;
  teamId?: string;
  assigneeId: string;
  assigneeRole?: string;
  routingStrategy?: RoutingStrategy;
  technicalSeverity: TechnicalSeverity;
  businessPriority: BusinessPriority;
  category: TicketCategory;
  slaPolicyId: string;
  durationDays: number;
  offsetDays: number;
  dependsOnTaskId: string | null;
  dependencyType: DependencyEdgeType;
  lagDays: number;
  approvalMode?: 'ANY_ONE' | 'ALL_UNANIMOUS' | 'MAJORITY' | 'N_OF_M';
  conditionExpression?: string;
  tags: string[];
}

const humanize = (value: string) =>
  value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

const readApiResponse = async (response: Response, operation: string) => {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    const requestId = response.headers.get('x-request-id');
    throw new Error(
      `${operation} service returned an invalid response (${response.status}). Verify that the current API server is running.${
        requestId ? ` Request ID: ${requestId}` : ''
      }`
    );
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${operation} service returned malformed JSON (${response.status}).`);
  }
};

const resolveScope = (item: ProjectBlueprint): BlueprintScope => {
  if (item.scope) return item.scope;
  if (item.ownerId) return 'PERSONAL';
  if (item.isCrossDepartment || !item.departmentId) return 'COMPANY';
  return 'DEPARTMENT';
};

const renderIcon = (iconName: string = '', className = 'w-4 h-4') => {
  switch (iconName.toLowerCase()) {
    case 'shield':
      return <Shield className={className} />;
    case 'users':
    case 'user':
      return <Users className={className} />;
    case 'server':
    case 'database':
      return <Server className={className} />;
    case 'zap':
    case 'bolt':
      return <Zap className={className} />;
    case 'bookmark':
      return <Bookmark className={className} />;
    case 'gitbranch':
    case 'workflow':
      return <GitBranch className={className} />;
    case 'lock':
      return <Lock className={className} />;
    case 'terminal':
      return <Terminal className={className} />;
    case 'filecode':
    case 'code':
      return <FileCode className={className} />;
    case 'building2':
    case 'building':
    case 'layers':
      return <Layers className={className} />;
    default:
      return <Workflow className={className} />;
  }
};

export const TicketCreateModal: React.FC<TicketCreateModalProps> = ({
  isOpen,
  onClose,
  applications = [],
  assets = [],
  onCreated,
}) => {
  const { currentUser, fetchWithAuth } = useAuth();
  const [tab, setTab] = useState<'TEMPLATE' | 'CUSTOM_GRAPH' | 'FAST_SINGLE'>('FAST_SINGLE');
  const [templates, setTemplates] = useState<ProjectBlueprint[]>([]);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [roleMessage, setRoleMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Accordion state for template scopes
  const [expandedSection, setExpandedSection] = useState<BlueprintScope | null>('COMPANY');
  const [templateSearch, setTemplateSearch] = useState('');

  // Single Task Mode: Simple vs Advanced
  const [isAdvancedSingle, setIsAdvancedSingle] = useState(false);
  const [single, setSingle] = useState<{
    workType: EnterpriseTicketType;
    title: string;
    description: string;
    category: TicketCategory;
    technicalSeverity: TechnicalSeverity;
    businessImpact: BusinessImpact;
    urgency: TicketUrgency;
    businessPriority: BusinessPriority;
    manualPriorityOverride: boolean;
    requesterId: string;
    reporterId: string;
    onBehalfOfUserId: string;
    assigneeId: string;
    targetDepartmentId: string;
    assignmentGroupId: string;
    routingStrategy: RoutingStrategy;
    slaPolicyId: string;
    applicationId: string;
    assetId: string;
    affectedServiceId: string;
    acceptanceCriteria: string;
    checklists: Array<{ id: string; text: string; isCompleted: boolean }>;
    confidentiality: string;
    isRecurring: boolean;
    recurringFrequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    estimatedHours: number;
    storyPoints: number;
    tags: string[];
  }>({
    workType: 'NORMAL_TASK',
    title: '',
    description: '',
    category: 'VULNERABILITY',
    technicalSeverity: 'MEDIUM',
    businessImpact: 'MODERATE',
    urgency: 'MEDIUM',
    businessPriority: 'P3_MEDIUM',
    manualPriorityOverride: false,
    requesterId: currentUser?.id || '',
    reporterId: currentUser?.id || '',
    onBehalfOfUserId: '',
    assigneeId: '',
    targetDepartmentId: '',
    assignmentGroupId: '',
    routingStrategy: 'DIRECT_USER',
    slaPolicyId: '',
    applicationId: '',
    assetId: '',
    affectedServiceId: '',
    acceptanceCriteria: '',
    checklists: [],
    confidentiality: 'INTERNAL',
    isRecurring: false,
    recurringFrequency: 'WEEKLY',
    estimatedHours: 4,
    storyPoints: 3,
    tags: [],
  });

  // Custom Graph tab state
  const [customTitle, setCustomTitle] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customNodes, setCustomNodes] = useState<CustomGraphNode[]>([]);
  const [graphValidationErrors, setGraphValidationErrors] = useState<string[]>([]);
  const [graphValidationWarnings, setGraphValidationWarnings] = useState<string[]>([]);

  // New Template Modal state
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [createScope, setCreateScope] = useState<BlueprintScope>('PERSONAL');
  const [newTitle, setNewTitle] = useState('');
  const [newShortName, setNewShortName] = useState('');
  const [newDomain, setNewDomain] = useState('Application Security');
  const [newDepartmentId, setNewDepartmentId] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newIconName, setNewIconName] = useState('Shield');
  const [newParamLabel, setNewParamLabel] = useState('Target Asset / Subject');
  const [newParamPlaceholder, setNewParamPlaceholder] = useState('e.g. Mobile Banking API / Node-01');
  const [newTasks, setNewTasks] = useState<CustomGraphNode[]>([]);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Auto-calculate priority from impact + urgency unless overridden
  useEffect(() => {
    if (!single.manualPriorityOverride) {
      const calculated = calculatePriorityFromImpactUrgency(single.businessImpact, single.urgency);
      setSingle((prev) => ({ ...prev, businessPriority: calculated }));
    }
  }, [single.businessImpact, single.urgency, single.manualPriorityOverride]);

  // Load Templates & Metadata on open
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([fetchWithAuth('/api/workflow-templates'), fetchWithAuth('/api/workflow-templates/metadata')])
      .then(async ([templateResponse, metadataResponse]) => {
        const [templateData, metadataData] = await Promise.all([
          readApiResponse(templateResponse, 'Workflow template'),
          readApiResponse(metadataResponse, 'Task metadata'),
        ]);
        if (!templateResponse.ok || !templateData.success)
          throw new Error(templateData.error || 'Workflow templates could not be loaded.');
        if (!metadataResponse.ok || !metadataData.success)
          throw new Error(metadataData.error || 'Task metadata could not be loaded.');
        if (cancelled) return;

        const nextTemplates = templateData.blueprints as ProjectBlueprint[];
        const nextMetadata = metadataData.metadata as Metadata;
        setTemplates(nextTemplates);
        setMetadata(nextMetadata);

        if (nextTemplates.length > 0 && !templateId) {
          const first = nextTemplates[0];
          setTemplateId(first.id);
          setExpandedSection(resolveScope(first));
        }

        const defaultSla = nextMetadata.slaPolicies.find((item) => item.isDefault) || nextMetadata.slaPolicies[0];
        const defaultDeptId = nextMetadata.departments.find((department) => department.id === currentUser?.departmentId)?.id || nextMetadata.departments[0]?.id || '';
        setSingle((current) => ({
          ...current,
          category: nextMetadata.categories[0] || 'VULNERABILITY',
          technicalSeverity: nextMetadata.severities[0] || 'MEDIUM',
          assigneeId: '',
          targetDepartmentId: defaultDeptId,
          routingStrategy: 'TEAM_QUEUE',
          slaPolicyId: defaultSla?.id || '',
          requesterId: currentUser?.id || nextMetadata.users[0]?.id || '',
          reporterId: currentUser?.id || nextMetadata.users[0]?.id || '',
        }));
      })
      .catch((reason) => {
        if (!cancelled) setError(reason.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, fetchWithAuth, reloadToken, currentUser]);

  // Routing Preview for Template Tab
  useEffect(() => {
    if (!isOpen || !templateId) return;
    let cancelled = false;
    setPreviewLoading(true);
    setError('');
    fetchWithAuth(`/api/workflow-templates/${templateId}/preview`)
      .then(async (response) => ({ response, data: await readApiResponse(response, 'Routing preview') }))
      .then(({ response, data }) => {
        if (!response.ok || !data.success) throw new Error(data.error || 'Routing preview failed.');
        if (!cancelled) setPreview(data.preview.tasks);
      })
      .catch((reason) => {
        if (!cancelled) {
          setPreview([]);
          setError(reason.message);
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, templateId, fetchWithAuth]);

  // Live Pre-flight Graph Validation
  useEffect(() => {
    if (tab !== 'CUSTOM_GRAPH' || customNodes.length === 0) {
      setGraphValidationErrors([]);
      setGraphValidationWarnings([]);
      return;
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const nodeIds = new Set(customNodes.map((n) => n.id));

    // Cycle detection
    const outgoing = new Map<string, string[]>();
    for (const n of customNodes) outgoing.set(n.id, []);
    for (const n of customNodes) {
      if (n.dependsOnTaskId && nodeIds.has(n.dependsOnTaskId)) {
        outgoing.get(n.dependsOnTaskId)?.push(n.id);
      }
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const checkCycle = (curr: string) => {
      if (visiting.has(curr)) {
        errors.push(`Cycle detected at step ${curr}`);
        return;
      }
      if (visited.has(curr)) return;
      visiting.add(curr);
      for (const next of outgoing.get(curr) || []) {
        checkCycle(next);
      }
      visiting.delete(curr);
      visited.add(curr);
    };

    for (const n of customNodes) {
      if (!visited.has(n.id)) checkCycle(n.id);
    }

    for (const n of customNodes) {
      if (!n.title.trim()) errors.push(`A title is required for all steps.`);
      if (!n.assigneeId && n.type === 'TASK') warnings.push(`Assignee is unassigned for "${n.title || 'Untitled Step'}".`);
    }

    setGraphValidationErrors(Array.from(new Set(errors)));
    setGraphValidationWarnings(Array.from(new Set(warnings)));
  }, [tab, customNodes]);

  const selectedTemplate = templates.find((item) => item.id === templateId);

  // Template Scopes Filtering
  const filteredTemplates = useMemo(() => {
    if (!templateSearch.trim()) return templates;
    const query = templateSearch.toLowerCase();
    return templates.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        (t.shortName && t.shortName.toLowerCase().includes(query)) ||
        t.domain.toLowerCase().includes(query)
    );
  }, [templates, templateSearch]);

  const companyTemplates = useMemo(
    () => filteredTemplates.filter((item) => resolveScope(item) === 'COMPANY'),
    [filteredTemplates]
  );
  const deptTemplates = useMemo(
    () => filteredTemplates.filter((item) => resolveScope(item) === 'DEPARTMENT'),
    [filteredTemplates]
  );
  const personalTemplates = useMemo(
    () => filteredTemplates.filter((item) => resolveScope(item) === 'PERSONAL'),
    [filteredTemplates]
  );

  // RBAC permissions
  const userRoles = useMemo(() => currentUser?.roles || [], [currentUser]);
  const canAddCompany = useMemo(
    () => userRoles.some((r) => ['PLATFORM_ADMIN', 'CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER'].includes(r)),
    [userRoles]
  );
  const canAddDept = useMemo(
    () =>
      userRoles.some((r) =>
        [
          'PLATFORM_ADMIN',
          'CISO',
          'INFOSEC_ADMIN',
          'INFOSEC_MANAGER',
          'DEPARTMENT_ADMIN',
          'DEPARTMENT_MANAGER',
          'TEAM_LEAD',
          'IT_ADMIN',
          'HR_ADMIN',
          'CORE_BANK_ADMIN',
          'LEGAL_ADMIN',
        ].includes(r)
      ),
    [userRoles]
  );
  const canAddPersonal = true;

  if (!isOpen) return null;

  const submit = async (path: string, body: unknown) => {
    setSubmitting(true);
    setError('');
    try {
      const response = await fetchWithAuth(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await readApiResponse(response, 'Create Work');
      if (!response.ok || !data.success)
        throw new Error(data.error || data.details?.[0]?.message || 'Operation failed.');
      const ticket = data.ticket || data.tickets?.[0] || data.createdTickets?.[0];
      if (ticket) onCreated(ticket);
      onClose();
    } catch (reason: any) {
      setError(reason.message || 'Backend service could not execute work orchestration.');
    } finally {
      setSubmitting(false);
    }
  };

  const addCustomStep = (
    setter: React.Dispatch<React.SetStateAction<CustomGraphNode[]>>,
    currentList: CustomGraphNode[],
    nodeType: GraphNodeType = 'TASK'
  ) => {
    if (!metadata) return;
    const dept = metadata.departments[0];
    const sla = metadata.slaPolicies.find((item) => item.isDefault) || metadata.slaPolicies[0];

    setter((curr) => [
      ...curr,
      {
        id: `node-${crypto.randomUUID().slice(0, 8)}`,
        type: nodeType,
        title: nodeType === 'APPROVAL' ? 'Management Sign-off Gate' : '',
        description: '',
        targetDepartment: dept?.id || '',
        assigneeId: '', // Default to Department Queue
        technicalSeverity: metadata.severities[0] || 'MEDIUM',
        businessPriority: metadata.priorities[0] || 'P2_HIGH',
        category: metadata.categories[0] || 'SECURITY_REVIEW',
        slaPolicyId: sla?.id || '',
        durationDays: nodeType === 'APPROVAL' ? 1 : 2,
        offsetDays: 0,
        dependsOnTaskId: curr.at(-1)?.id || null,
        dependencyType: 'FINISH_TO_START',
        lagDays: 0,
        approvalMode: 'ANY_ONE',
        tags: [nodeType],
      },
    ]);
  };

  const updateCustomStep = (
    setter: React.Dispatch<React.SetStateAction<CustomGraphNode[]>>,
    index: number,
    values: Partial<CustomGraphNode>
  ) => {
    setter((curr) => curr.map((task, idx) => (idx === index ? { ...task, ...values } : task)));
  };

  const handleCloneTemplate = async (tmpl: ProjectBlueprint) => {
    try {
      setLoading(true);
      const res = await fetchWithAuth(`/api/workflow-templates/${tmpl.id}/clone`, { method: 'POST' });
      const data = await readApiResponse(res, 'Clone template');
      if (data.success && data.blueprint) {
        setTemplates((prev) => [data.blueprint, ...prev]);
        setTemplateId(data.blueprint.id);
        setExpandedSection('PERSONAL');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to clone template');
    } finally {
      setLoading(false);
    }
  };

  const userOptions = (departmentId?: string, includeQueue = true) => {
    const dept = metadata?.departments.find((item) => item.id === departmentId);
    const defaultQueueOption: SelectOption = {
      value: '',
      label: dept ? dept.name : 'Departament növbəsi',
      sublabel: dept?.code,
      badge: 'NÖVBƏ',
      badgeColor: 'bg-[#E0F2FE] text-[#0369A1]',
    };

    const users: SelectOption[] =
      metadata?.users
        .filter((user) => !departmentId || user.departmentId === departmentId)
        .map((user) => {
          const department = metadata.departments.find((item) => item.id === user.departmentId);
          return {
            value: user.id,
            label: user.fullName,
            sublabel: [user.title, department?.name].filter(Boolean).join(' / '),
            badge: 'İŞÇİ',
            badgeColor: 'bg-[#F1F5F9] text-[#475569]',
          };
        }) || [];

    return includeQueue ? [defaultQueueOption, ...users] : users;
  };

  const departmentOptions =
    metadata?.departments.map((item) => ({
      value: item.id,
      label: item.name,
      sublabel: item.code,
    })) || [];

  const assignmentOptions: SelectOption[] = [
    ...(metadata?.departments.map((department) => ({
      value: `department:${department.id}`,
      label: department.name,
      sublabel: department.code,
      badge: 'NÖVBƏ',
      badgeColor: 'bg-[#E0F2FE] text-[#0369A1]',
    })) || []),
    ...(metadata?.users.map((user) => {
      const department = metadata.departments.find((item) => item.id === user.departmentId);
      return {
        value: user.id,
        label: user.fullName,
        sublabel: [user.title, department?.name].filter(Boolean).join(' / '),
        badge: 'İŞÇİ',
        badgeColor: 'bg-[#F1F5F9] text-[#475569]',
      };
    }) || []),
  ];

  const assignmentTargetValue = single.targetDepartmentId
    ? `department:${single.targetDepartmentId}`
    : single.assigneeId;

  const handleAssignmentTargetChange = (value: string) => {
    if (value.startsWith('department:')) {
      setSingle({
        ...single,
        assigneeId: '',
        targetDepartmentId: value.slice('department:'.length),
        routingStrategy: 'TEAM_QUEUE',
      });
      return;
    }
    setSingle({
      ...single,
      assigneeId: value,
      targetDepartmentId: '',
      routingStrategy: 'DIRECT_USER',
    });
  };

  const options = (values: string[] = []) => values.map((value) => ({ value, label: humanize(value) }));

  // ==========================================
  // TAB 1: TEMPLATES & REQUEST FORMS
  // ==========================================
  const renderTemplateSection = (
    scope: BlueprintScope,
    title: string,
    sectionIcon: React.ReactNode,
    items: ProjectBlueprint[],
    canAdd: boolean,
    badgeColor: string
  ) => {
    const isExpanded = expandedSection === scope;

    return (
      <div key={scope} className="mb-2.5 rounded-xl border border-[#E2E8F0] bg-white overflow-hidden shadow-2xs transition-all">
        <div
          onClick={() => setExpandedSection((curr) => (curr === scope ? null : scope))}
          className={`w-full px-3.5 py-2.5 flex items-center justify-between cursor-pointer select-none transition-colors ${
            isExpanded ? 'bg-[#F1F5F9] border-b border-[#E2E8F0]' : 'hover:bg-[#F8FAFC]'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs ${badgeColor}`}>
              {sectionIcon}
            </span>
            <span className="font-bold text-sm text-[#162136] truncate">{title}</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#E2E8F0] text-[#334155]">
              {items.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              title={canAdd ? `Add ${title} Template` : 'Admin role required'}
              onClick={(e) => {
                e.stopPropagation();
                setCreateScope(scope);
                setIsCreatingTemplate(true);
              }}
              className={`px-2 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${
                canAdd
                  ? 'bg-white hover:bg-[#00B259] text-[#334155] hover:text-white border border-[#CBD5E1] hover:border-[#00B259]'
                  : 'bg-[#F1F5F9] text-[#94A3B8] border border-[#E2E8F0] cursor-not-allowed'
              }`}
            >
              {canAdd ? <Plus className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5 text-[#94A3B8]" />}
              <span className="text-xs hidden sm:inline">Add</span>
            </button>
            <span className="text-[#64748B]">
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </span>
          </div>
        </div>

        {isExpanded && (
          <div className="p-2 space-y-1.5 bg-[#F8FAFC]">
            {items.length === 0 ? (
              <div className="p-4 text-center border border-dashed border-[#CBD5E1] rounded-lg bg-white">
                <p className="text-xs text-[#475569] mb-2">No {title.toLowerCase()} templates found.</p>
                <button
                  type="button"
                  onClick={() => {
                    setCreateScope(scope);
                    setIsCreatingTemplate(true);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#00B259] hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" /> Create {title} template
                </button>
              </div>
            ) : (
              items.map((item) => {
                const isSelected = templateId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-start justify-between gap-2 bg-white ${
                      isSelected
                        ? 'border-[#00B259] ring-1 ring-[#00B259]/25 shadow-xs'
                        : 'border-[#E2E8F0] hover:border-[#CBD5E1] hover:bg-slate-50/70'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setTemplateId(item.id);
                        setParameters({});
                      }}
                      className="min-w-0 flex-1 flex items-start gap-2 text-left"
                    >
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 font-bold transition-colors ${
                          isSelected ? 'bg-[#E6F7EF] text-[#00A653]' : 'bg-[#F1F5F9] text-[#64748B]'
                        }`}
                      >
                        {renderIcon(item.iconName || 'Workflow', 'w-4 h-4')}
                      </div>
                      <div className="min-w-0 flex-1">
                        <strong className={`block truncate text-xs ${isSelected ? 'text-[#007860] font-bold' : 'text-[#162136] font-semibold'}`}>
                          {item.shortName || item.title}
                        </strong>
                        <div className="flex items-center gap-1 text-[11px] text-[#475569] mt-0.5">
                          <span>{item.defaultTasks?.length || item.taskCount} steps</span>
                          <span>·</span>
                          <span className="font-mono text-[#007860]">v{item.version || 1}</span>
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      title="Clone as personal template"
                      onClick={() => handleCloneTemplate(item)}
                      className="p-1 text-[#94A3B8] hover:text-[#00B259] hover:bg-slate-100 rounded"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  };

  const templateContent = (
    <div className="h-full flex">
      <aside className="w-80 bg-[#F8FAFC] border-r border-[#E2E8F0] p-3.5 overflow-y-auto shrink-0 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-2.5 px-1">
            <p className="section-label">Enterprise Templates</p>
            <span className="text-xs text-[#475569] font-mono font-bold">{templates.length} total</span>
          </div>

          <div className="mb-3">
            <input
              type="text"
              placeholder="Search templates & domains…"
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              className="wrike-input text-xs py-1.5"
            />
          </div>

          {renderTemplateSection('COMPANY', 'Company-Wide', <Building2 className="w-3.5 h-3.5" />, companyTemplates, canAddCompany, 'bg-[#EFF6FF] text-[#2563EB]')}
          {renderTemplateSection('DEPARTMENT', 'Department', <Layers className="w-3.5 h-3.5" />, deptTemplates, canAddDept, 'bg-[#F0FDF4] text-[#16A34A]')}
          {renderTemplateSection('PERSONAL', 'Personal', <User className="w-3.5 h-3.5" />, personalTemplates, canAddPersonal, 'bg-[#FAF5FF] text-[#9333EA]')}
        </div>

        <button
          type="button"
          onClick={() => {
            setCreateScope('PERSONAL');
            setIsCreatingTemplate(true);
          }}
          className="w-full py-2 border border-dashed border-[#CBD5E1] hover:border-[#00B259] rounded-xl text-xs font-bold text-[#007860] bg-white hover:bg-[#E6F7EF] transition-colors flex items-center justify-center gap-1.5 mt-4"
        >
          <Plus className="w-3.5 h-3.5" /> New Template Designer
        </button>
      </aside>

      <section className="flex-1 p-6 overflow-y-auto">
        {selectedTemplate ? (
          <>
            <div className="flex justify-between border-b border-[#E2E8F0] pb-3.5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-[#00A653] uppercase">{selectedTemplate.domain}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#F1F5F9] text-[#334155] uppercase">
                    {resolveScope(selectedTemplate)}
                  </span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#E6F7EF] text-[#007860] uppercase">
                    {selectedTemplate.status || 'PUBLISHED'}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-[#162136] mt-1">{selectedTemplate.title}</h3>
                <p className="text-sm text-[#475569] mt-1 max-w-2xl">{selectedTemplate.description}</p>
              </div>
              <span className="pill">{selectedTemplate.defaultTasks.length} orchestrated steps</span>
            </div>

            {/* Dynamic Request Form Parameters */}
            <div className="py-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#007860] mb-2.5">
                Intake Request Parameters
              </h4>
              <div className="grid grid-cols-2 gap-4">
                {selectedTemplate.parameters && selectedTemplate.parameters.length > 0 ? (
                  selectedTemplate.parameters.map((field) => (
                    <label key={field.id}>
                      <b className="field-label">
                        {field.label}
                        {field.required ? ' *' : ''}
                      </b>
                      {field.type === 'TEXTAREA' ? (
                        <textarea
                          rows={2}
                          value={parameters[field.id] || ''}
                          onChange={(e) => setParameters((current) => ({ ...current, [field.id]: e.target.value }))}
                          placeholder={field.placeholder}
                          className="wrike-input mt-1 text-sm resize-none"
                        />
                      ) : (
                        <input
                          value={parameters[field.id] || ''}
                          onChange={(e) => setParameters((current) => ({ ...current, [field.id]: e.target.value }))}
                          placeholder={field.placeholder}
                          className="wrike-input mt-1 text-sm"
                        />
                      )}
                    </label>
                  ))
                ) : (
                  <label className="col-span-2">
                    <b className="field-label">Target Asset / Context Identifier</b>
                    <input
                      value={parameters.subject || ''}
                      onChange={(e) => setParameters((prev) => ({ ...prev, subject: e.target.value }))}
                      placeholder="e.g. Core SWIFT Gateway / Prod Node-01"
                      className="wrike-input mt-1 text-sm"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Pre-flight Validated Routing Preview */}
            <div className="flex justify-between items-center mb-2.5 pt-2 border-t border-[#F1F5F9]">
              <p className="section-label">Validated Orchestration Graph Preview</p>
              <span className="text-xs font-mono font-bold text-[#0073D3]">ATOMIC LAUNCH</span>
            </div>

            {previewLoading ? (
              <p className="py-8 text-center text-[#475569] text-sm flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#00B259]" />
                Resolving dynamic assignees and SLAs…
              </p>
            ) : (
              <div className="space-y-2.5">
                {preview.map((task, index) => (
                  <div
                    key={task.id}
                    className="p-3.5 rounded-xl border border-[#E2E8F0] grid grid-cols-[30px_minmax(0,1fr)_200px_120px] items-center gap-3 bg-white shadow-2xs"
                  >
                    <span className="step-number">{index + 1}</span>
                    <div className="min-w-0">
                      <b className="block truncate text-sm font-bold text-[#162136]">{task.title}</b>
                      <small className="text-xs text-[#475569] font-medium">
                        {task.dependsOnTaskId ? `Depends on ${task.dependsOnTaskId}` : 'Can start immediately'}
                      </small>
                    </div>
                    <div className="min-w-0">
                      <b className="block truncate text-sm font-bold text-[#162136]">{task.departmentName}</b>
                      <small className="text-xs text-[#475569] font-medium block truncate">{task.assigneeName}</small>
                    </div>
                    <div className="text-right">
                      <b className="text-[#B42318] text-xs font-bold">{humanize(task.technicalSeverity)}</b>
                      <small className="text-xs text-[#475569] block truncate font-medium">
                        {task.slaPolicyName || 'Template SLA'}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-[#475569] text-sm">
            Select a template from the sidebar or design a new one.
          </div>
        )}
      </section>
    </div>
  );

  // ==========================================
  // TAB 2: CUSTOM GRAPH ORCHESTRATOR
  // ==========================================
  const customContent = (
    <div className="h-full flex">
      <aside className="w-80 sidebar p-4 overflow-y-auto space-y-4">
        <p className="section-label">Workflow Details</p>
        <label>
          <b className="field-label">Workflow Title *</b>
          <input
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            className="wrike-input mt-1 text-xs font-bold"
            placeholder="e.g. Cross-Border Swift Cutover Protocol"
          />
        </label>
        <label>
          <b className="field-label">Description *</b>
          <textarea
            rows={4}
            value={customDescription}
            onChange={(e) => setCustomDescription(e.target.value)}
            className="wrike-input mt-1 text-xs resize-none"
            placeholder="Scope, expected outcome, rollback contingencies"
          />
        </label>

        {/* Pre-flight Live Validation Panel */}
        <div className="rounded-xl border border-[#CBD5E1] p-3 bg-white space-y-2">
          <div className="flex items-center justify-between">
            <b className="text-xs font-bold text-[#162136]">Pre-Flight Engine</b>
            {graphValidationErrors.length === 0 ? (
              <span className="text-[11px] font-bold text-[#00A653] flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Valid
              </span>
            ) : (
              <span className="text-[11px] font-bold text-[#E51739] flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> {graphValidationErrors.length} Issue(s)
              </span>
            )}
          </div>
          {graphValidationErrors.map((err, idx) => (
            <div key={idx} className="text-[11px] text-[#B42318] bg-red-50 p-1.5 rounded flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{err}</span>
            </div>
          ))}
          {graphValidationWarnings.map((warn, idx) => (
            <div key={idx} className="text-[11px] text-amber-700 bg-amber-50 p-1.5 rounded flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{warn}</span>
            </div>
          ))}
        </div>
      </aside>

      <section className="flex-1 p-5 overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <div>
            <p className="section-label">Orchestration Graph Nodes ({customNodes.length})</p>
            <p className="text-xs text-[#475569]">Support for tasks, approval gates, parallel branches, and delays</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => addCustomStep(setCustomNodes, customNodes, 'TASK')}
              className="wrike-btn-secondary px-2.5 py-1.5 text-xs flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add Task
            </button>
            <button
              type="button"
              onClick={() => addCustomStep(setCustomNodes, customNodes, 'APPROVAL')}
              className="wrike-btn-primary px-3 py-1.5 text-xs flex items-center gap-1.5"
            >
              <Shield className="w-3.5 h-3.5" /> Add Approval Gate
            </button>
          </div>
        </div>

        {customNodes.length === 0 ? (
          <div className="h-64 border-2 border-dashed border-[#CBD5E1] rounded-2xl flex flex-col items-center justify-center text-center p-6 bg-[#F8FAFC]">
            <GitBranch className="w-8 h-8 text-[#94A3B8] mb-2" />
            <b className="text-sm text-[#162136]">Graph Canvas is Empty</b>
            <p className="text-xs text-[#475569] max-w-sm mt-1 mb-4">
              Add task steps or approval gates to construct a multi-department enterprise orchestration graph.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => addCustomStep(setCustomNodes, customNodes, 'TASK')}
                className="wrike-btn-secondary px-3 py-1.5 text-xs"
              >
                + Task Node
              </button>
              <button
                type="button"
                onClick={() => addCustomStep(setCustomNodes, customNodes, 'APPROVAL')}
                className="wrike-btn-primary px-3 py-1.5 text-xs"
              >
                + Approval Gate Node
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {customNodes.map((node, index) => {
              const isApproval = node.type === 'APPROVAL';
              return (
                <div
                  key={node.id}
                  className={`rounded-xl border p-4 space-y-3 transition-all ${
                    isApproval ? 'border-amber-200 bg-amber-50/40 shadow-xs' : 'border-[#E2E8F0] bg-white'
                  }`}
                >
                  <div className="flex gap-2.5 items-center">
                    <span className="step-number">{index + 1}</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded font-mono ${
                      isApproval ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {node.type}
                    </span>
                    <input
                      value={node.title}
                      onChange={(e) => updateCustomStep(setCustomNodes, index, { title: e.target.value })}
                      className="wrike-input text-xs font-bold flex-1"
                      placeholder={isApproval ? 'Approval Gate Name (e.g. CISO High-Risk Waiver) *' : 'Task Summary *'}
                    />
                    <button
                      type="button"
                      onClick={() => setCustomNodes((curr) => curr.filter((_, i) => i !== index))}
                      className="p-1.5 text-[#8D99AE] hover:text-red-600 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <textarea
                    rows={2}
                    value={node.description}
                    onChange={(e) => updateCustomStep(setCustomNodes, index, { description: e.target.value })}
                    className="wrike-input text-xs resize-none"
                    placeholder="Instructions, expected verification and acceptance criteria"
                  />

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    <SelectField
                      label="Target Department"
                      value={node.targetDepartment}
                      choices={departmentOptions}
                      change={(val) => {
                        const currentAssignee = metadata?.users.find((u) => u.id === node.assigneeId);
                        const newAssigneeId = currentAssignee?.departmentId === val ? node.assigneeId : '';
                        updateCustomStep(setCustomNodes, index, {
                          targetDepartment: val,
                          teamId: undefined,
                          assigneeId: newAssigneeId,
                        });
                      }}
                    />
                    <SelectField
                      label="Assignee / Approver"
                      value={node.assigneeId}
                      choices={userOptions(node.targetDepartment)}
                      change={(val) => updateCustomStep(setCustomNodes, index, { assigneeId: val })}
                    />
                    <SelectField
                      label="Predecessor Dependency"
                      value={node.dependsOnTaskId || ''}
                      choices={[
                        { value: '', label: 'None (Root Node)' },
                        ...customNodes
                          .filter((c) => c.id !== node.id)
                          .map((c, i) => ({ value: c.id, label: `Step ${i + 1}: ${c.title || 'Untitled'}` })),
                      ]}
                      change={(val) => updateCustomStep(setCustomNodes, index, { dependsOnTaskId: val || null })}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
                    <SelectField
                      label="Dependency Type"
                      value={node.dependencyType || 'FINISH_TO_START'}
                      choices={[
                        { value: 'FINISH_TO_START', label: 'Finish-to-Start (FS)' },
                        { value: 'START_TO_START', label: 'Start-to-Start (SS)' },
                        { value: 'FINISH_TO_FINISH', label: 'Finish-to-Finish (FF)' },
                        { value: 'START_TO_FINISH', label: 'Start-to-Finish (SF)' },
                      ]}
                      change={(val) => updateCustomStep(setCustomNodes, index, { dependencyType: val as DependencyEdgeType })}
                    />
                    <SelectField
                      label="Severity"
                      value={node.technicalSeverity}
                      choices={options(metadata?.severities)}
                      change={(val) => updateCustomStep(setCustomNodes, index, { technicalSeverity: val as TechnicalSeverity })}
                    />
                    <SelectField
                      label="Priority"
                      value={node.businessPriority}
                      choices={options(metadata?.priorities)}
                      change={(val) => updateCustomStep(setCustomNodes, index, { businessPriority: val as BusinessPriority })}
                    />
                    <label>
                      <b className="mini-label">Duration (Days)</b>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={node.durationDays}
                        onChange={(e) => updateCustomStep(setCustomNodes, index, { durationDays: Number(e.target.value) })}
                        className="wrike-input text-xs py-1"
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );

  // ==========================================
  // TAB 3: SINGLE TASK / WORK ITEM
  // ==========================================
  const singleContent = (
    <div className="h-full flex">
      <aside className="w-72 sidebar p-4 overflow-y-auto space-y-4">
        <div className="flex items-center justify-between">
          <p className="section-label">Configuration Mode</p>
          <button
            type="button"
            onClick={() => setIsAdvancedSingle(!isAdvancedSingle)}
            className={`px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1 transition-all ${
              isAdvancedSingle
                ? 'bg-[#00B259] text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            {isAdvancedSingle ? 'Advanced Mode' : 'Simple Mode'}
          </button>
        </div>

        <SelectField
          label="Enterprise Work Type"
          value={single.workType}
          choices={metadata?.workTypes || [{ value: 'NORMAL_TASK', label: 'Normal Task' }]}
          change={(val) => setSingle({ ...single, workType: val as EnterpriseTicketType })}
        />

        <SelectField
          label="Requester (Intake Creator)"
          value={single.requesterId}
          choices={userOptions(undefined, false)}
          change={(val) => setSingle({ ...single, requesterId: val })}
        />

        {isAdvancedSingle && (
          <>
            <SelectField
              label="Reporter (Submitting On Behalf)"
              value={single.reporterId}
              choices={userOptions(undefined, false)}
              change={(val) => setSingle({ ...single, reporterId: val })}
            />

            <SelectField
              label="Routing Strategy"
              value={single.routingStrategy}
              choices={[
                { value: 'DIRECT_USER', label: 'Direct Named Assignee' },
                { value: 'REQUESTER_MANAGER', label: "Requester's Manager" },
                { value: 'DEPT_MANAGER', label: 'Department Head' },
                { value: 'SERVICE_OWNER', label: 'Affected Service Owner' },
                { value: 'ASSET_OWNER', label: 'Target Asset Owner' },
                { value: 'TEAM_QUEUE', label: 'Team Unassigned Queue' },
              ]}
              change={(val) => setSingle({ ...single, routingStrategy: val as RoutingStrategy })}
            />

            <SelectField
              label="Target Application"
              value={single.applicationId}
              choices={[{ value: '', label: 'None / General' }, ...applications.map((a) => ({ value: a.id, label: a.name }))]}
              change={(val) => setSingle({ ...single, applicationId: val })}
            />

            <SelectField
              label="Target Asset / CI"
              value={single.assetId}
              choices={[{ value: '', label: 'None' }, ...assets.map((a) => ({ value: a.id, label: a.name }))]}
              change={(val) => setSingle({ ...single, assetId: val })}
            />
          </>
        )}
      </aside>

      <section className="flex-1 p-6 overflow-y-auto space-y-4">
        <label>
          <b className="field-label">Summary / Title *</b>
          <input
            value={single.title}
            onChange={(e) => setSingle({ ...single, title: e.target.value })}
            className="wrike-input mt-1 text-sm font-bold"
            placeholder="Clear, actionable task summary"
          />
        </label>

        <label>
          <b className="field-label">Description *</b>
          <textarea
            rows={isAdvancedSingle ? 4 : 5}
            value={single.description}
            onChange={(e) => setSingle({ ...single, description: e.target.value })}
            className="wrike-input mt-1 text-xs resize-none"
            placeholder="Detailed description, business context, expected outcome"
          />
        </label>

        {/* Priority Matrix Row: Impact + Urgency -> Derived Priority */}
        {!metadata?.directory.ready && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{metadata?.directory.message || 'Live Active Directory data is required before selecting an assignee or department queue.'}</span>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_1.4fr] gap-3 bg-[#F8FAFC] p-3.5 rounded-xl border border-[#E2E8F0]">
          <SelectField
            label="Business Impact"
            value={single.businessImpact}
            choices={[
              { value: 'CATASTROPHIC', label: 'Catastrophic (4)' },
              { value: 'SIGNIFICANT', label: 'Significant (3)' },
              { value: 'MODERATE', label: 'Moderate (2)' },
              { value: 'MINOR', label: 'Minor (1)' },
              { value: 'NEGLIGIBLE', label: 'Negligible (1)' },
            ]}
            change={(val) => setSingle({ ...single, businessImpact: val as BusinessImpact, manualPriorityOverride: false })}
          />
          <SelectField
            label="Urgency"
            value={single.urgency}
            choices={[
              { value: 'CRITICAL', label: 'Critical (4)' },
              { value: 'HIGH', label: 'High (3)' },
              { value: 'MEDIUM', label: 'Medium (2)' },
              { value: 'LOW', label: 'Low (1)' },
            ]}
            change={(val) => setSingle({ ...single, urgency: val as TicketUrgency, manualPriorityOverride: false })}
          />
          <div>
            <b className="mini-label">Calculated Priority</b>
            <div className="mt-1 h-9 px-3 rounded-lg border border-[#CBD5E1] bg-white flex items-center justify-between">
              <span className={`text-xs font-bold ${
                single.businessPriority === 'P1_URGENT' ? 'text-[#B42318]' : single.businessPriority === 'P2_HIGH' ? 'text-amber-700' : 'text-[#007860]'
              }`}>
                {humanize(single.businessPriority)}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                MATRIX
              </span>
            </div>
          </div>
          <SelectField
            label="Assignee / Department Queue"
            value={assignmentTargetValue}
            choices={assignmentOptions}
            change={handleAssignmentTargetChange}
            disabled={!metadata?.directory.ready}
            placeholder="Live AD sync required"
          />
        </div>

        {/* SLA Policy & Category */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SelectField
            label="Category"
            value={single.category}
            choices={options(metadata?.categories)}
            change={(val) => setSingle({ ...single, category: val as TicketCategory })}
          />
          <SelectField
            label="SLA Policy"
            value={single.slaPolicyId}
            choices={[
              {
                value: '',
                label: 'Automatic / System Default',
                sublabel: 'Uses the configured default or built-in SLA thresholds',
              },
              ...(metadata?.slaPolicies.map((p) => ({ value: p.id, label: p.name, sublabel: p.description })) || []),
            ]}
            change={(val) => setSingle({ ...single, slaPolicyId: val })}
          />
        </div>

        {/* Advanced Mode: Checklists, Acceptance Criteria & Recurring */}
        {isAdvancedSingle && (
          <div className="space-y-4 pt-2 border-t border-[#F1F5F9]">
            <label>
              <b className="field-label">Acceptance Criteria (Definition of Done)</b>
              <textarea
                rows={2}
                value={single.acceptanceCriteria}
                onChange={(e) => setSingle({ ...single, acceptanceCriteria: e.target.value })}
                className="wrike-input mt-1 text-xs resize-none"
                placeholder="Explicit criteria required before moving to resolved..."
              />
            </label>

            <div>
              <div className="flex items-center justify-between mb-2">
                <b className="field-label flex items-center gap-1.5">
                  <ListTodo className="w-4 h-4 text-[#00B259]" /> Subtask Checklist ({single.checklists.length})
                </b>
                <button
                  type="button"
                  onClick={() =>
                    setSingle({
                      ...single,
                      checklists: [
                        ...single.checklists,
                        { id: `chk-${Date.now()}`, text: '', isCompleted: false },
                      ],
                    })
                  }
                  className="text-xs font-bold text-[#007860] hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Checklist Item
                </button>
              </div>
              <div className="space-y-2">
                {single.checklists.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.isCompleted}
                      onChange={(e) => {
                        const updated = [...single.checklists];
                        updated[idx].isCompleted = e.target.checked;
                        setSingle({ ...single, checklists: updated });
                      }}
                      className="rounded border-[#CBD5E1] text-[#00B259] focus:ring-[#00B259]"
                    />
                    <input
                      value={item.text}
                      onChange={(e) => {
                        const updated = [...single.checklists];
                        updated[idx].text = e.target.value;
                        setSingle({ ...single, checklists: updated });
                      }}
                      placeholder={`Checklist item ${idx + 1}...`}
                      className="wrike-input text-xs flex-1 py-1"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setSingle({
                          ...single,
                          checklists: single.checklists.filter((_, i) => i !== idx),
                        })
                      }
                      className="text-slate-400 hover:text-red-600 p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );

  const disabled =
    submitting ||
    loading ||
    previewLoading ||
    (tab === 'TEMPLATE'
      ? !selectedTemplate || !preview.length
      : tab === 'CUSTOM_GRAPH'
      ? !customTitle.trim() || !customNodes.length || graphValidationErrors.length > 0
      : !single.title.trim() || !single.description.trim());

  const launch = () =>
    tab === 'TEMPLATE'
      ? submit(`/api/workflow-templates/${templateId}/launch`, {
          parameters,
          idempotencyKey: crypto.randomUUID(),
        })
      : tab === 'CUSTOM_GRAPH'
      ? submit('/api/workflow-templates/custom/launch', {
          title: customTitle,
          description: customDescription,
          workflowId: metadata?.workflows[0]?.id,
          slaPolicyId: metadata?.slaPolicies.find((item) => item.isDefault)?.id,
          tasks: customNodes,
        })
      : submit('/api/orchestration/quick-work', {
          requestTypeId: 'request-standard-task',
          idempotencyKey: crypto.randomUUID(),
          values: {
            summary: single.title.trim(),
            description: single.description.trim(),
            requesterId: single.requesterId || currentUser?.id,
            workType: single.workType,
            category: single.category,
            technicalSeverity: single.technicalSeverity,
            businessImpact: single.businessImpact,
            urgency: single.urgency,
            businessPriority: single.businessPriority,
            reporterId: single.reporterId || undefined,
            onBehalfOfUserId: single.onBehalfOfUserId || undefined,
            assigneeId: single.assigneeId || undefined,
            targetDepartmentId: single.targetDepartmentId || undefined,
            assignmentGroupId: single.assignmentGroupId || undefined,
            routingStrategy: single.routingStrategy,
            applicationId: single.applicationId || undefined,
            assetId: single.assetId || undefined,
            acceptanceCriteria: single.acceptanceCriteria || undefined,
            checklists: single.checklists,
            labels: single.tags,
          },
        });

  return (
    <div className="fixed inset-0 bg-[#162136]/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 sm:p-6 select-none">
      <div className={`${tab === 'CUSTOM_GRAPH' ? 'w-screen h-screen max-w-none max-h-none rounded-none' : 'w-[1280px] h-[780px] max-w-[98vw] max-h-[94vh] rounded-2xl'} bg-white border border-[#CBD5E1] shadow-2xl flex flex-col overflow-hidden text-sm relative`}>
        <header className="h-16 px-6 border-b border-[#E2E8F0] flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#00B259] text-white flex items-center justify-center shadow-xs">
              <Plus className="w-4.5 h-4.5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-[#162136]">Create Enterprise Work</h2>
              <p className="text-xs text-[#475569]">
                Enterprise ITSM work intake, SLA multi-clocks, and graph orchestration
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-[#F4F6FB] border border-[#E2E8F0] rounded-lg p-1 font-semibold text-sm">
              {(
                [
                  ['TEMPLATE', Sparkles, 'Workflow Catalog'],
                  ['CUSTOM_GRAPH', GitBranch, 'Workflow Builder'],
                  ['FAST_SINGLE', FileText, 'Quick Work Item'],
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    if (value !== 'FAST_SINGLE') {
                      sessionStorage.setItem('orchestration-workspace-tab', value === 'CUSTOM_GRAPH' ? 'BUILDER' : 'CATALOG');
                      window.history.pushState({}, '', '/work-management/workflows');
                      window.dispatchEvent(new PopStateEvent('popstate'));
                      onClose();
                      return;
                    }
                    setTab(value);
                    setError('');
                  }}
                  className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all text-sm ${
                    tab === value ? 'bg-[#00B259] text-white shadow-xs font-bold' : 'text-[#475569] hover:text-[#162136]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
            <button type="button" onClick={onClose} className="p-2 text-[#475569] hover:text-[#162136] rounded-lg hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {error && (
          <div className="mx-6 mt-3 px-3.5 py-2.5 rounded-lg border border-red-200 bg-red-50 text-red-700 flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1 font-medium">{error}</span>
            <button
              type="button"
              onClick={() => setReloadToken((v) => v + 1)}
              className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-bold hover:bg-red-100"
            >
              Retry
            </button>
          </div>
        )}

        <main className="flex-1 min-h-0 overflow-hidden bg-white">
          {loading ? (
            <div className="h-full flex items-center justify-center text-[#475569] text-sm">
              <Loader2 className="w-5 h-5 animate-spin mr-2 text-[#00B259]" />
              Loading live task & routing metadata…
            </div>
          ) : tab === 'TEMPLATE' ? (
            templateContent
          ) : tab === 'CUSTOM_GRAPH' ? (
            customContent
          ) : (
            singleContent
          )}
        </main>

        <footer className="h-16 px-6 border-t border-[#E2E8F0] flex justify-between items-center shrink-0 bg-white">
          <span className="text-sm text-[#007860] font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4.5 h-4.5 text-[#00B259]" />
            {tab === 'TEMPLATE'
              ? `${preview.length} routed tasks validated`
              : tab === 'CUSTOM_GRAPH'
              ? `${customNodes.length} graph steps (${graphValidationErrors.length === 0 ? 'Verified' : 'Errors pending'})`
              : single.slaPolicyId
              ? 'Multi-clock SLA & priority matrix configured'
              : 'Priority matrix configured / Automatic SLA fallback active'}
          </span>
          <div className="flex gap-2.5">
            <button type="button" onClick={onClose} className="wrike-btn-secondary px-4 py-2">
              Cancel
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={launch}
              className="wrike-btn-primary px-5 py-2 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {submitting
                ? 'Launching…'
                : tab === 'TEMPLATE'
                ? 'Launch Workflow'
                : tab === 'CUSTOM_GRAPH'
                ? 'Launch Workflow'
                : 'Create Work Item'}
            </button>
          </div>
        </footer>
      </div>

      {/* ==================================================================== */}
      {/* MODAL: CREATE / DESIGN TEMPLATE                                      */}
      {/* ==================================================================== */}
      {isCreatingTemplate && (
        <div className="fixed inset-0 bg-[#162136]/70 backdrop-blur-xs flex items-center justify-center z-[60] p-4 sm:p-6 select-none">
          <div className="w-[980px] max-w-[96vw] h-[85vh] max-h-[840px] bg-white rounded-2xl border border-[#CBD5E1] shadow-2xl flex flex-col overflow-hidden text-sm">
            <header className="h-16 px-6 border-b border-[#E2E8F0] flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#E6F7EF] text-[#00B259] flex items-center justify-center shadow-xs">
                  <Plus className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#162136]">
                    Create New {createScope === 'COMPANY' ? 'Company' : createScope === 'DEPARTMENT' ? 'Department' : 'Personal'} Template
                  </h3>
                  <p className="text-xs text-[#475569]">Reusable enterprise workflow with automated multi-node routing</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreatingTemplate(false)}
                className="p-2 text-[#475569] hover:text-[#162136] rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-white custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SelectField
                  label="Scope *"
                  value={createScope}
                  choices={[
                    { value: 'PERSONAL', label: 'Personal (User Only)' },
                    { value: 'DEPARTMENT', label: 'Department Specific' },
                    { value: 'COMPANY', label: 'Company-Wide' },
                  ]}
                  change={(v) => setCreateScope(v as BlueprintScope)}
                />
                <div>
                  <label>
                    <b className="field-label">Template Title *</b>
                    <input
                      value={newTitle}
                      onChange={(e) => {
                        setNewTitle(e.target.value);
                        if (!newShortName) setNewShortName(e.target.value.slice(0, 24));
                      }}
                      className="wrike-input mt-1 text-sm"
                      placeholder="e.g. Core SWIFT Upgrade Protocol"
                    />
                  </label>
                </div>
                <div>
                  <label>
                    <b className="field-label">Short Name (Sidebar) *</b>
                    <input
                      value={newShortName}
                      onChange={(e) => setNewShortName(e.target.value)}
                      className="wrike-input mt-1 text-sm"
                      placeholder="e.g. SWIFT Upgrade"
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label>
                    <b className="field-label">Security / Business Domain</b>
                    <input
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      className="wrike-input mt-1 text-sm"
                      placeholder="e.g. Application Security, Core Banking"
                    />
                  </label>
                </div>
                <div>
                  <label>
                    <b className="field-label">Description</b>
                    <input
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      className="wrike-input mt-1 text-sm"
                      placeholder="Purpose, scope and requirements"
                    />
                  </label>
                </div>
              </div>

              {/* Tasks in Template */}
              <div>
                <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-2 mb-3">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#007860]">
                      Workflow Steps ({newTasks.length})
                    </h4>
                    <p className="text-xs text-[#475569]">Steps will be dynamically routed on launch</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => addCustomStep(setNewTasks, newTasks, 'TASK')}
                    className="wrike-btn-primary px-3 py-1 text-xs flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Step
                  </button>
                </div>

                {newTasks.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => addCustomStep(setNewTasks, newTasks, 'TASK')}
                    className="w-full py-8 border-2 border-dashed border-[#CBD5E1] rounded-xl text-[#475569] font-semibold text-sm flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Click here to add the first workflow step
                  </button>
                ) : (
                  <div className="space-y-3">
                    {newTasks.map((t, idx) => (
                      <div key={t.id} className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-2.5">
                        <div className="flex gap-2 items-center">
                          <span className="step-number">{idx + 1}</span>
                          <input
                            value={t.title}
                            onChange={(e) => updateCustomStep(setNewTasks, idx, { title: e.target.value })}
                            className="wrike-input text-xs font-bold flex-1 bg-white"
                            placeholder="Step summary *"
                          />
                          <button
                            type="button"
                            onClick={() => setNewTasks((curr) => curr.filter((_, i) => i !== idx))}
                            className="p-1 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                          <SelectField
                            label="Department"
                            value={t.targetDepartment}
                            choices={departmentOptions}
                            change={(val) => {
                              const currentAssignee = metadata?.users.find((u) => u.id === t.assigneeId);
                              const newAssigneeId = currentAssignee?.departmentId === val ? t.assigneeId : '';
                              updateCustomStep(setNewTasks, idx, { targetDepartment: val, assigneeId: newAssigneeId });
                            }}
                          />
                          <SelectField
                            label="Assignee"
                            value={t.assigneeId}
                            choices={userOptions(t.targetDepartment)}
                            change={(val) => updateCustomStep(setNewTasks, idx, { assigneeId: val })}
                          />
                          <SelectField
                            label="Severity"
                            value={t.technicalSeverity}
                            choices={options(metadata?.severities)}
                            change={(val) => updateCustomStep(setNewTasks, idx, { technicalSeverity: val as TechnicalSeverity })}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <footer className="h-16 px-6 border-t border-[#E2E8F0] flex justify-between items-center bg-white shrink-0">
              <span className="text-xs text-[#475569]">Saved templates are accessible in the Template catalog.</span>
              <div className="flex gap-2.5">
                <button type="button" onClick={() => setIsCreatingTemplate(false)} className="wrike-btn-secondary px-4 py-2">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingTemplate || !newTitle.trim() || !newTasks.length}
                  onClick={async () => {
                    setSavingTemplate(true);
                    try {
                      const res = await fetchWithAuth('/api/workflow-templates', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          title: newTitle,
                          shortName: newShortName || newTitle,
                          scope: createScope,
                          domain: newDomain,
                          description: newDescription || newTitle,
                          defaultTasks: newTasks,
                        }),
                      });
                      const data = await readApiResponse(res, 'Create template');
                      if (data.success && data.blueprint) {
                        setTemplates((prev) => [data.blueprint, ...prev]);
                        setTemplateId(data.blueprint.id);
                        setIsCreatingTemplate(false);
                      }
                    } catch (err: any) {
                      setError(err.message || 'Failed to save template');
                    } finally {
                      setSavingTemplate(false);
                    }
                  }}
                  className="wrike-btn-primary px-5 py-2 disabled:opacity-50"
                >
                  {savingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Template'}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

const SelectField = ({
  label,
  value,
  choices,
  change,
  disabled = false,
  placeholder,
}: {
  label: string;
  value: string;
  choices: SelectOption[];
  change: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) => (
  <div>
    <b className="mini-label">{label}</b>
    <CustomSelect size="md" value={value} options={choices} onChange={change} disabled={disabled} placeholder={placeholder} />
  </div>
);
