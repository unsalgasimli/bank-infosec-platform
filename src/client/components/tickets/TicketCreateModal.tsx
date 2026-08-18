import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Sparkles,
  Shield,
  UserCheck,
  GitBranch,
  FileText,
  Flame,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { BankApplication, BankAsset } from '../../../shared/types/asset.js';
import { TechnicalSeverity, BusinessPriority, TicketCategory } from '../../../shared/types/ticket.js';
import { CustomSelect } from '../common/CustomSelect.js';

interface TicketCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  applications: BankApplication[];
  assets: BankAsset[];
  onCreated: (ticket: any) => void;
}

interface WorkflowSubTask {
  id: string;
  title: string;
  description: string;
  targetDepartment: 'HR_LEGAL' | 'IT_OPERATIONS' | 'SECOPS_SOC' | 'APPSEC_DEV' | 'GRC_COMPLIANCE' | 'CISO_EXECUTIVE';
  assigneeId: string;
  assigneeName: string;
  technicalSeverity: TechnicalSeverity;
  businessPriority: BusinessPriority;
  slaHours: number;
  category: TicketCategory;
  dependsOnIndex: number | null;
  offsetDays: number;
}

const WORKFLOW_TEMPLATES = [
  {
    id: 'hr-onboarding',
    title: 'New Employee Onboarding & Clearance',
    shortName: 'Employee Onboarding',
    domain: 'IAM & Governance',
    icon: UserCheck,
    primaryParamLabel: 'Employee Name & Role',
    placeholder: 'e.g. Aysel Aliyeva (Senior Payments Engineer)',
    tasks: [
      {
        id: 't-1',
        title: 'Step 1: HR Background & KYC Verification',
        targetDepartment: 'HR_LEGAL' as const,
        assigneeRole: 'HR Lead',
        technicalSeverity: 'MEDIUM' as TechnicalSeverity,
        businessPriority: 'P2_HIGH' as BusinessPriority,
        slaHours: 24,
        category: 'SECURITY_REVIEW' as TicketCategory,
        dependsOnIndex: null,
        offsetDays: 0,
      },
      {
        id: 't-2',
        title: 'Step 2: Active Directory & Hardware YubiKey Provisioning',
        targetDepartment: 'IT_OPERATIONS' as const,
        assigneeRole: 'IT Operations',
        technicalSeverity: 'HIGH' as TechnicalSeverity,
        businessPriority: 'P2_HIGH' as BusinessPriority,
        slaHours: 12,
        category: 'SECURITY_REVIEW' as TicketCategory,
        dependsOnIndex: 0,
        offsetDays: 1,
      },
      {
        id: 't-3',
        title: 'Step 3: DevSecOps Cloud IAM & Repo Access',
        targetDepartment: 'APPSEC_DEV' as const,
        assigneeRole: 'DevSecOps Lead',
        technicalSeverity: 'HIGH' as TechnicalSeverity,
        businessPriority: 'P2_HIGH' as BusinessPriority,
        slaHours: 8,
        category: 'SECURITY_REVIEW' as TicketCategory,
        dependsOnIndex: 1,
        offsetDays: 2,
      },
      {
        id: 't-4',
        title: 'Step 4: CISO Security Clearance & Dual-Control Sign-off',
        targetDepartment: 'CISO_EXECUTIVE' as const,
        assigneeRole: 'CISO',
        technicalSeverity: 'CRITICAL' as TechnicalSeverity,
        businessPriority: 'P1_URGENT' as BusinessPriority,
        slaHours: 4,
        category: 'SECURITY_REVIEW' as TicketCategory,
        dependsOnIndex: 2,
        offsetDays: 3,
      },
      {
        id: 't-5',
        title: 'Step 5: Mandatory Security & Anti-Phishing Training',
        targetDepartment: 'GRC_COMPLIANCE' as const,
        assigneeRole: 'GRC Specialist',
        technicalSeverity: 'LOW' as TechnicalSeverity,
        businessPriority: 'P3_MEDIUM' as BusinessPriority,
        slaHours: 48,
        category: 'SECURITY_REVIEW' as TicketCategory,
        dependsOnIndex: 3,
        offsetDays: 4,
      },
    ],
  },
  {
    id: 'swift-release',
    title: 'SWIFT Alliance Gateway Production Release',
    shortName: 'SWIFT Release Pipeline',
    domain: 'Payment Systems Security',
    icon: Shield,
    primaryParamLabel: 'Release Version / Patch ID',
    placeholder: 'e.g. SWIFT Alliance Gateway v7.6.2',
    tasks: [
      {
        id: 't-1',
        title: 'Step 1: AppSec Static & Dynamic Security Assessment',
        targetDepartment: 'APPSEC_DEV' as const,
        assigneeRole: 'AppSec Lead',
        technicalSeverity: 'HIGH' as TechnicalSeverity,
        businessPriority: 'P1_URGENT' as BusinessPriority,
        slaHours: 12,
        category: 'VULNERABILITY' as TicketCategory,
        dependsOnIndex: null,
        offsetDays: 0,
      },
      {
        id: 't-2',
        title: 'Step 2: DC1 Firewall Rule Verification & WAF Tuning',
        targetDepartment: 'SECOPS_SOC' as const,
        assigneeRole: 'SOC Lead',
        technicalSeverity: 'CRITICAL' as TechnicalSeverity,
        businessPriority: 'P1_URGENT' as BusinessPriority,
        slaHours: 6,
        category: 'SECURITY_REVIEW' as TicketCategory,
        dependsOnIndex: 0,
        offsetDays: 1,
      },
      {
        id: 't-3',
        title: 'Step 3: HSM Cryptographic Key Ceremony & Verification',
        targetDepartment: 'IT_OPERATIONS' as const,
        assigneeRole: 'Senior Infrastructure Engineer',
        technicalSeverity: 'CRITICAL' as TechnicalSeverity,
        businessPriority: 'P1_URGENT' as BusinessPriority,
        slaHours: 4,
        category: 'SECURITY_REVIEW' as TicketCategory,
        dependsOnIndex: 1,
        offsetDays: 2,
      },
      {
        id: 't-4',
        title: 'Step 4: CISO Executive Attestation & Regulator Filing',
        targetDepartment: 'CISO_EXECUTIVE' as const,
        assigneeRole: 'CISO',
        technicalSeverity: 'CRITICAL' as TechnicalSeverity,
        businessPriority: 'P1_URGENT' as BusinessPriority,
        slaHours: 2,
        category: 'SECURITY_REVIEW' as TicketCategory,
        dependsOnIndex: 2,
        offsetDays: 2,
      },
    ],
  },
  {
    id: 'zero-day-incident',
    title: 'Critical Zero-Day Rapid Containment & Patching',
    shortName: 'Zero-Day Containment',
    domain: 'Incident Response',
    icon: Flame,
    primaryParamLabel: 'Threat Identifier / CVE ID',
    placeholder: 'e.g. CVE-2026-3400 (Palo Alto GlobalProtect RCE)',
    tasks: [
      {
        id: 't-1',
        title: 'Step 1: SIEM IOC Threat Hunting & Query Verification',
        targetDepartment: 'SECOPS_SOC' as const,
        assigneeRole: 'SOC Analyst',
        technicalSeverity: 'CRITICAL' as TechnicalSeverity,
        businessPriority: 'P1_URGENT' as BusinessPriority,
        slaHours: 1,
        category: 'INCIDENT' as TicketCategory,
        dependsOnIndex: null,
        offsetDays: 0,
      },
      {
        id: 't-2',
        title: 'Step 2: Network Perimeter Isolation & Virtual Patching',
        targetDepartment: 'IT_OPERATIONS' as const,
        assigneeRole: 'Network Engineer',
        technicalSeverity: 'CRITICAL' as TechnicalSeverity,
        businessPriority: 'P1_URGENT' as BusinessPriority,
        slaHours: 2,
        category: 'INCIDENT' as TicketCategory,
        dependsOnIndex: 0,
        offsetDays: 0,
      },
      {
        id: 't-3',
        title: 'Step 3: Production Patch Deployment & Regression Testing',
        targetDepartment: 'APPSEC_DEV' as const,
        assigneeRole: 'DevSecOps Lead',
        technicalSeverity: 'CRITICAL' as TechnicalSeverity,
        businessPriority: 'P1_URGENT' as BusinessPriority,
        slaHours: 4,
        category: 'VULNERABILITY' as TicketCategory,
        dependsOnIndex: 1,
        offsetDays: 1,
      },
      {
        id: 't-4',
        title: 'Step 4: CISO Post-Incident Forensics Report & Central Bank Notice',
        targetDepartment: 'CISO_EXECUTIVE' as const,
        assigneeRole: 'CISO',
        technicalSeverity: 'HIGH' as TechnicalSeverity,
        businessPriority: 'P1_URGENT' as BusinessPriority,
        slaHours: 6,
        category: 'SECURITY_REVIEW' as TicketCategory,
        dependsOnIndex: 2,
        offsetDays: 1,
      },
    ],
  },
];

export const TicketCreateModal: React.FC<TicketCreateModalProps> = ({
  isOpen,
  onClose,
  applications = [],
  assets = [],
  onCreated,
}) => {
  const { currentUser, allUsers = [], fetchWithAuth } = useAuth();

  const [activeTab, setActiveTab] = useState<'TEMPLATE' | 'CUSTOM_GRAPH' | 'FAST_SINGLE'>('TEMPLATE');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('hr-onboarding');
  const [primaryParamValue, setPrimaryParamValue] = useState<string>('');

  // Single Task State
  const [singleTitle, setSingleTitle] = useState('');
  const [singleDesc, setSingleDesc] = useState('');
  const [singleCategory, setSingleCategory] = useState<TicketCategory>('VULNERABILITY');
  const [singleSeverity, setSingleSeverity] = useState<TechnicalSeverity>('HIGH');
  const [singlePriority, setSinglePriority] = useState<BusinessPriority>('P2_HIGH');
  const [singleAssigneeId, setSingleAssigneeId] = useState(currentUser?.id || allUsers[0]?.id || 'usr-ciso');
  const [singleAppId, setSingleAppId] = useState('');
  const [singleAssetId, setSingleAssetId] = useState('');

  // Custom Multi-Task State
  const [customWorkflowTitle, setCustomWorkflowTitle] = useState('');
  const [customWorkflowDesc, setCustomWorkflowDesc] = useState('');
  const [customTasks, setCustomTasks] = useState<WorkflowSubTask[]>([
    {
      id: 'ct-1',
      title: 'Step 1: Security Architecture Review & Risk Assessment',
      description: 'Audit network boundary controls, TLS 1.3 configs, and authentication flows.',
      targetDepartment: 'GRC_COMPLIANCE',
      assigneeId: allUsers[0]?.id || 'usr-ciso',
      assigneeName: allUsers[0]?.fullName || 'Unsal Gasimli',
      technicalSeverity: 'HIGH',
      businessPriority: 'P2_HIGH',
      slaHours: 24,
      category: 'SECURITY_REVIEW',
      dependsOnIndex: null,
      offsetDays: 0,
    },
    {
      id: 'ct-2',
      title: 'Step 2: Technical Hardening & WAF Policy Deployment',
      description: 'Deploy rate-limiting rules and enforce kernel-level isolation.',
      targetDepartment: 'APPSEC_DEV',
      assigneeId: allUsers[1]?.id || allUsers[0]?.id || 'usr-appsec-spec',
      assigneeName: allUsers[1]?.fullName || 'Leyla Aliyeva',
      technicalSeverity: 'HIGH',
      businessPriority: 'P2_HIGH',
      slaHours: 48,
      category: 'VULNERABILITY',
      dependsOnIndex: 0,
      offsetDays: 2,
    },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const currentTemplate = WORKFLOW_TEMPLATES.find((t) => t.id === selectedTemplateId) || WORKFLOW_TEMPLATES[0];

  const handleLaunchTemplate = async () => {
    try {
      setIsSubmitting(true);
      const paramVal = primaryParamValue.trim() || 'General Initiative';

      const tasksToCreate = currentTemplate.tasks.map((task, idx) => {
        let matchedUser = (allUsers || []).find((u) =>
          Array.isArray(u.roles) &&
          u.roles.some((r) => typeof r === 'string' && r.toLowerCase().includes(task.assigneeRole.toLowerCase()))
        );

        if (!matchedUser && allUsers && allUsers.length > 0) {
          matchedUser = allUsers[idx % allUsers.length];
        }

        return {
          title: `[${paramVal}] ${task.title}`,
          description: `Target: ${paramVal} | Department: ${task.targetDepartment}`,
          targetDepartment: task.targetDepartment,
          assigneeId: matchedUser?.id || currentUser?.id || 'usr-ciso',
          technicalSeverity: task.technicalSeverity,
          businessPriority: task.businessPriority,
          slaHours: task.slaHours,
          category: task.category,
          dependsOnIndex: task.dependsOnIndex,
          offsetDays: task.offsetDays,
          tags: ['TEMPLATE_INSTANCE', currentTemplate.id],
        };
      });

      const res = await fetchWithAuth('/api/tickets/multi-task-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateTitle: `${currentTemplate.title}: ${paramVal}`,
          description: `${currentTemplate.title} workflow for ${paramVal}`,
          tasks: tasksToCreate,
        }),
      });

      const data = await res.json();
      if (data.success) {
        if (data.tickets && data.tickets.length > 0) {
          onCreated(data.tickets[0]);
        }
        onClose();
      } else {
        alert(`Error: ${data.error || 'Failed to instantiate template'}`);
      }
    } catch (err) {
      console.error('Failed to launch template workflow', err);
      alert('Failed to connect to backend server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLaunchCustomGraph = async () => {
    if (!customWorkflowTitle.trim() || customTasks.length === 0) return;
    try {
      setIsSubmitting(true);

      const res = await fetchWithAuth('/api/tickets/multi-task-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateTitle: customWorkflowTitle.trim(),
          description: customWorkflowDesc.trim() || 'Custom multi-department task graph',
          tasks: customTasks,
        }),
      });

      const data = await res.json();
      if (data.success) {
        if (data.tickets && data.tickets.length > 0) {
          onCreated(data.tickets[0]);
        }
        onClose();
      } else {
        alert(`Error creating custom workflow: ${data.error || 'Failed'}`);
      }
    } catch (err) {
      console.error('Failed to launch custom workflow', err);
      alert('Failed to connect to backend server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLaunchSingle = async () => {
    if (!singleTitle.trim()) return;
    try {
      setIsSubmitting(true);
      const res = await fetchWithAuth('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectCode: 'SEC',
          category: singleCategory,
          title: singleTitle.trim(),
          description: singleDesc.trim() || singleTitle.trim(),
          technicalSeverity: singleSeverity,
          businessPriority: singlePriority,
          businessImpact: 'SIGNIFICANT',
          confidentiality: 'RESTRICTED',
          applicationId: singleAppId || undefined,
          assetId: singleAssetId || undefined,
          assigneeId: singleAssigneeId || currentUser?.id || 'usr-ciso',
          tags: ['SINGLE_TASK', singleCategory],
        }),
      });
      const data = await res.json();
      if (data.success) {
        onCreated(data.ticket);
        onClose();
      } else {
        alert(`Error: ${data.error || 'Failed to create task'}`);
      }
    } catch (err) {
      console.error('Failed to create single ticket', err);
      alert('Failed to connect to backend server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const addCustomTask = () => {
    const nextIdx = customTasks.length;
    const defaultUser = allUsers[nextIdx % (allUsers.length || 1)] || allUsers[0] || currentUser;
    setCustomTasks((prev) => [
      ...prev,
      {
        id: `ct-${Date.now()}`,
        title: `Step ${nextIdx + 1}: Cross-Team Action`,
        description: '',
        targetDepartment: 'SECOPS_SOC',
        assigneeId: defaultUser?.id || 'usr-ciso',
        assigneeName: defaultUser?.fullName || 'SOC Lead',
        technicalSeverity: 'HIGH',
        businessPriority: 'P2_HIGH',
        slaHours: 24,
        category: 'SECURITY_REVIEW',
        dependsOnIndex: nextIdx > 0 ? nextIdx - 1 : null,
        offsetDays: nextIdx,
      },
    ]);
  };

  const removeCustomTask = (index: number) => {
    setCustomTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const getDepartmentColor = (dept: string) => {
    switch (dept) {
      case 'HR_LEGAL':
        return 'bg-[#FFF7E6] text-[#D46B08] border-[#FFE7BA]';
      case 'IT_OPERATIONS':
        return 'bg-[#EBF4FD] text-[#0073D3] border-[#BAE0FD]';
      case 'APPSEC_DEV':
        return 'bg-[#F9F0FF] text-[#531DAB] border-[#EFDBFF]';
      case 'SECOPS_SOC':
        return 'bg-[#FDE8EB] text-[#CF1322] border-[#FFA39E]';
      case 'CISO_EXECUTIVE':
        return 'bg-[#E6F7EF] text-[#007860] border-[#B8EAD1]';
      case 'GRC_COMPLIANCE':
      default:
        return 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';
    }
  };

  return (
    <div className="fixed inset-0 bg-[#162136]/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      {/* Fixed Dimension Modal: 980px × 600px */}
      <div className="w-[980px] h-[600px] max-h-[90vh] bg-[#FFFFFF] rounded-2xl border border-[#E2E8F0] shadow-2xl flex flex-col overflow-hidden text-xs">
        {/* Fixed Header */}
        <div className="h-14 px-6 border-b border-[#E2E8F0] flex items-center justify-between bg-[#FFFFFF] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#00B259] text-white flex items-center justify-center font-bold text-sm shadow-sm">
              <Plus className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-[#162136] tracking-tight">
              Create Work & Workflows
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {/* Mode Switcher */}
            <div className="flex items-center bg-[#F4F6FB] border border-[#E2E8F0] rounded-lg p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('TEMPLATE')}
                className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'TEMPLATE'
                    ? 'bg-[#00B259] text-white shadow-xs'
                    : 'text-[#5A6A85] hover:text-[#162136]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Workflow Templates</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('CUSTOM_GRAPH')}
                className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'CUSTOM_GRAPH'
                    ? 'bg-[#00B259] text-white shadow-xs'
                    : 'text-[#5A6A85] hover:text-[#162136]'
                }`}
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span>Custom Graph</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('FAST_SINGLE')}
                className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'FAST_SINGLE'
                    ? 'bg-[#00B259] text-white shadow-xs'
                    : 'text-[#5A6A85] hover:text-[#162136]'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Single Task</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[#F4F6FB] text-[#5A6A85] hover:text-[#162136] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body: Fixed Height */}
        <div className="flex-1 flex overflow-hidden">
          {/* TAB 1: WORKFLOW TEMPLATES */}
          {activeTab === 'TEMPLATE' && (
            <div className="flex-1 flex overflow-hidden">
              {/* Left Template Picker */}
              <div className="w-64 bg-[#F8FAFC] border-r border-[#E2E8F0] p-3 flex flex-col space-y-1.5 shrink-0 overflow-y-auto custom-scrollbar">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#5A6A85] px-1 mb-0.5">
                  Templates
                </div>

                {WORKFLOW_TEMPLATES.map((tmpl) => {
                  const Icon = tmpl.icon;
                  const isSelected = selectedTemplateId === tmpl.id;
                  return (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => {
                        setSelectedTemplateId(tmpl.id);
                        setPrimaryParamValue('');
                      }}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all w-full ${
                        isSelected
                          ? 'border-[#00B259] bg-[#FFFFFF] shadow-sm ring-1 ring-[#00B259]/30'
                          : 'border-[#E2E8F0] bg-[#FFFFFF] hover:border-[#CBD5E1] hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-[#E6F7EF] text-[#007860] flex items-center justify-center shrink-0">
                          <Icon className="w-3.5 h-3.5 text-[#00B259]" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-xs text-[#162136] truncate">{tmpl.shortName}</h4>
                          <span className="text-[10px] text-[#5A6A85] font-medium">{tmpl.tasks.length} Subtasks</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Right Template Details & Sequence */}
              <div className="flex-1 bg-[#FFFFFF] p-5 overflow-y-auto custom-scrollbar space-y-4">
                {/* Headline Info */}
                <div className="flex items-center justify-between pb-1 border-b border-[#E2E8F0]">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-[#00B259] uppercase tracking-wider">
                      {currentTemplate.domain}
                    </span>
                    <h3 className="text-sm font-bold text-[#162136] mt-0.5">{currentTemplate.title}</h3>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#E6F7EF] text-[#007860] border border-[#B8EAD1] font-bold text-[10px]">
                    {currentTemplate.tasks.length} Linked Subtasks
                  </span>
                </div>

                {/* Primary Parameter Box */}
                <div>
                  <label className="font-bold text-[#162136] text-[11px] block mb-1">
                    {currentTemplate.primaryParamLabel} *
                  </label>
                  <input
                    type="text"
                    value={primaryParamValue}
                    onChange={(e) => setPrimaryParamValue(e.target.value)}
                    placeholder={currentTemplate.placeholder}
                    className="wrike-input text-xs py-2 bg-white"
                    autoFocus
                  />
                </div>

                {/* Task Sequence Tree */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#5A6A85] mb-2 flex items-center justify-between">
                    <span>Sequence & Dependencies</span>
                    <span className="font-mono text-[#0073D3]">Auto Finish-to-Start</span>
                  </div>

                  <div className="space-y-1.5">
                    {currentTemplate.tasks.map((task, idx) => (
                      <div
                        key={task.id}
                        className="px-3 py-2 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] shadow-xs flex items-center justify-between gap-3 hover:border-[#00B259] transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-5 h-5 rounded-full bg-[#00B259] text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                            {idx + 1}
                          </div>
                          <span className="font-semibold text-xs text-[#162136] truncate">{task.title}</span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`px-2 py-0.5 rounded-full font-mono text-[9px] font-bold border ${getDepartmentColor(task.targetDepartment)}`}>
                            {task.targetDepartment.replace('_', ' ')}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#F8FAFC] border border-[#E2E8F0] text-[#5A6A85] text-[9px] font-mono">
                            {task.assigneeRole}
                          </span>
                          <span className="text-[9px] font-mono font-bold text-[#E51739]">
                            {task.slaHours}h SLA
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CUSTOM MULTI-TASK GRAPH */}
          {activeTab === 'CUSTOM_GRAPH' && (
            <div className="flex-1 flex overflow-hidden">
              {/* Left Parameters */}
              <div className="w-64 bg-[#F8FAFC] border-r border-[#E2E8F0] p-4 flex flex-col space-y-3 shrink-0 overflow-y-auto custom-scrollbar">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#5A6A85]">
                  Workflow Details
                </div>

                <div>
                  <label className="font-bold text-[11px] text-[#162136] block mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={customWorkflowTitle}
                    onChange={(e) => setCustomWorkflowTitle(e.target.value)}
                    placeholder="e.g. Q4 Infrastructure Hardening"
                    className="wrike-input text-xs py-1.5 bg-white font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-[11px] text-[#162136] block mb-1">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={customWorkflowDesc}
                    onChange={(e) => setCustomWorkflowDesc(e.target.value)}
                    placeholder="Objectives and scope..."
                    className="wrike-input text-xs resize-none bg-white"
                  />
                </div>
              </div>

              {/* Right Subtask Builder */}
              <div className="flex-1 bg-[#FFFFFF] p-5 overflow-y-auto custom-scrollbar space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#5A6A85]">
                    Subtasks ({customTasks.length})
                  </span>
                  <button
                    type="button"
                    onClick={addCustomTask}
                    className="wrike-btn-primary text-xs py-1 px-3 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Step</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {customTasks.map((task, idx) => (
                    <div
                      key={task.id}
                      className="p-2.5 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] shadow-xs space-y-2 hover:border-[#00B259] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="w-5 h-5 rounded-full bg-[#00B259] text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                            {idx + 1}
                          </span>
                          <input
                            type="text"
                            value={task.title}
                            onChange={(e) => {
                              const updated = [...customTasks];
                              updated[idx].title = e.target.value;
                              setCustomTasks(updated);
                            }}
                            placeholder="Step action headline..."
                            className="wrike-input text-xs py-1 flex-1 font-bold"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => removeCustomTask(idx)}
                          disabled={customTasks.length <= 1}
                          className="p-1 text-[#8D99AE] hover:text-[#E51739] disabled:opacity-30 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-4 gap-2">
                        <div>
                          <label className="text-[9px] font-bold text-[#5A6A85] block mb-0.5">Department</label>
                          <CustomSelect
                            value={task.targetDepartment}
                            onChange={(val) => {
                              const updated = [...customTasks];
                              updated[idx].targetDepartment = val as any;
                              setCustomTasks(updated);
                            }}
                            size="sm"
                            options={[
                              { value: 'SECOPS_SOC', label: 'SecOps & SOC' },
                              { value: 'APPSEC_DEV', label: 'AppSec & Dev' },
                              { value: 'IT_OPERATIONS', label: 'IT Infra' },
                              { value: 'HR_LEGAL', label: 'HR & Legal' },
                              { value: 'GRC_COMPLIANCE', label: 'GRC' },
                              { value: 'CISO_EXECUTIVE', label: 'CISO' },
                            ]}
                          />
                        </div>

                        <div>
                          <label className="text-[9px] font-bold text-[#5A6A85] block mb-0.5">Assignee</label>
                          <CustomSelect
                            value={task.assigneeId}
                            onChange={(val) => {
                              const updated = [...customTasks];
                              updated[idx].assigneeId = val;
                              const u = (allUsers || []).find((user) => user.id === val);
                              if (u) updated[idx].assigneeName = u.fullName;
                              setCustomTasks(updated);
                            }}
                            size="sm"
                            options={(allUsers || []).map((u) => ({
                              value: u.id,
                              label: u.fullName,
                              sublabel: u.roles[0],
                            }))}
                          />
                        </div>

                        <div>
                          <label className="text-[9px] font-bold text-[#5A6A85] block mb-0.5">SLA Target</label>
                          <CustomSelect
                            value={String(task.slaHours)}
                            onChange={(val) => {
                              const updated = [...customTasks];
                              updated[idx].slaHours = Number(val);
                              setCustomTasks(updated);
                            }}
                            size="sm"
                            options={[
                              { value: '4', label: '4 Hours (P1)' },
                              { value: '12', label: '12 Hours (P1)' },
                              { value: '24', label: '24 Hours (P2)' },
                              { value: '72', label: '72 Hours (P3)' },
                              { value: '168', label: '7 Days (P4)' },
                            ]}
                          />
                        </div>

                        <div>
                          <label className="text-[9px] font-bold text-[#5A6A85] block mb-0.5">Depends On</label>
                          <CustomSelect
                            value={task.dependsOnIndex !== null ? String(task.dependsOnIndex) : ''}
                            onChange={(val) => {
                              const updated = [...customTasks];
                              updated[idx].dependsOnIndex = val === '' ? null : Number(val);
                              setCustomTasks(updated);
                            }}
                            size="sm"
                            options={[
                              { value: '', label: 'No Dependency' },
                              ...customTasks.slice(0, idx).map((_, pIdx) => ({
                                value: String(pIdx),
                                label: `Step ${pIdx + 1}`,
                              })),
                            ]}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SINGLE TASK */}
          {activeTab === 'FAST_SINGLE' && (
            <div className="flex-1 flex overflow-hidden">
              {/* Left Context */}
              <div className="w-64 bg-[#F8FAFC] border-r border-[#E2E8F0] p-4 flex flex-col space-y-3 shrink-0 overflow-y-auto custom-scrollbar">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#5A6A85]">
                  Target Context
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-[#5A6A85] block mb-1">Target Application</label>
                    <CustomSelect
                      value={singleAppId}
                      onChange={setSingleAppId}
                      size="sm"
                      options={[
                        { value: '', label: '-- None / General --' },
                        ...(applications || []).map((app) => ({
                          value: app.id,
                          label: app.name,
                          badge: app.criticality,
                        })),
                      ]}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-[#5A6A85] block mb-1">Infrastructure Asset</label>
                    <CustomSelect
                      value={singleAssetId}
                      onChange={setSingleAssetId}
                      size="sm"
                      options={[
                        { value: '', label: '-- None / App-Only --' },
                        ...(assets || []).map((ast) => ({
                          value: ast.id,
                          label: ast.name,
                          badge: ast.assetType,
                        })),
                      ]}
                    />
                  </div>
                </div>
              </div>

              {/* Right Form */}
              <div className="flex-1 bg-[#FFFFFF] p-5 overflow-y-auto custom-scrollbar space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <div>
                    <label className="font-bold text-xs text-[#162136] block mb-1">Summary *</label>
                    <input
                      type="text"
                      required
                      value={singleTitle}
                      onChange={(e) => setSingleTitle(e.target.value)}
                      placeholder="e.g. Implement Rate-Limiting on Public Login API"
                      className="wrike-input text-xs py-2 bg-white font-bold"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="font-bold text-[11px] text-[#162136] block mb-1">Description</label>
                    <textarea
                      rows={3}
                      value={singleDesc}
                      onChange={(e) => setSingleDesc(e.target.value)}
                      placeholder="Technical scope and remediation steps..."
                      className="wrike-input text-xs resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="font-bold text-[10px] text-[#5A6A85] block mb-1">Category</label>
                      <CustomSelect
                        value={singleCategory}
                        onChange={(val) => setSingleCategory(val as any)}
                        size="sm"
                        options={[
                          { value: 'VULNERABILITY', label: '🐞 Vulnerability' },
                          { value: 'INCIDENT', label: '🚨 Incident' },
                          { value: 'SECURITY_EXCEPTION', label: '🔒 Exception' },
                          { value: 'AUDIT_FINDING', label: '📋 Audit Finding' },
                        ]}
                      />
                    </div>

                    <div>
                      <label className="font-bold text-[10px] text-[#5A6A85] block mb-1">Severity</label>
                      <CustomSelect
                        value={singleSeverity}
                        onChange={(val) => setSingleSeverity(val as any)}
                        size="sm"
                        options={[
                          { value: 'CRITICAL', label: 'Critical (P1)' },
                          { value: 'HIGH', label: 'High (P2)' },
                          { value: 'MEDIUM', label: 'Medium (P3)' },
                          { value: 'LOW', label: 'Low (P4)' },
                        ]}
                      />
                    </div>

                    <div>
                      <label className="font-bold text-[10px] text-[#5A6A85] block mb-1">Assignee</label>
                      <CustomSelect
                        value={singleAssigneeId}
                        onChange={setSingleAssigneeId}
                        size="sm"
                        options={(allUsers || []).map((u) => ({
                          value: u.id,
                          label: u.fullName,
                          sublabel: u.roles[0],
                        }))}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Fixed Universal Footer */}
        <div className="h-14 px-6 border-t border-[#E2E8F0] flex items-center justify-between bg-[#FFFFFF] shrink-0">
          <div className="text-[11px] text-[#007860] font-semibold flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#00B259]" />
            <span>
              {activeTab === 'TEMPLATE'
                ? `${currentTemplate.tasks.length} tasks ready to instantiate`
                : activeTab === 'CUSTOM_GRAPH'
                ? `${customTasks.length} tasks configured`
                : 'Direct pipeline routing'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="wrike-btn-secondary text-xs py-1.5 px-3.5 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={
                activeTab === 'TEMPLATE'
                  ? handleLaunchTemplate
                  : activeTab === 'CUSTOM_GRAPH'
                  ? handleLaunchCustomGraph
                  : () => handleLaunchSingle()
              }
              disabled={
                isSubmitting ||
                (activeTab === 'TEMPLATE' && !primaryParamValue.trim()) ||
                (activeTab === 'CUSTOM_GRAPH' && !customWorkflowTitle.trim()) ||
                (activeTab === 'FAST_SINGLE' && !singleTitle.trim())
              }
              className="wrike-btn-primary text-xs py-1.5 px-4 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {isSubmitting
                  ? 'Creating...'
                  : activeTab === 'TEMPLATE'
                  ? 'Launch Workflow'
                  : activeTab === 'CUSTOM_GRAPH'
                  ? 'Create Graph'
                  : 'Create Task'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
