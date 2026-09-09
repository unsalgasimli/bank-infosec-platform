import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Building2,
  GitBranch,
  UserCheck,
  Search,
  Filter,
  Layers3,
  Workflow,
  Sparkles,
  Plus,
  Grid3X3,
  List,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Copy,
  Code2,
  Trash2,
  Rocket,
  Eye,
  Check,
  ShieldCheck,
  Building,
  SlidersHorizontal,
  X,
  Clock,
  Users,
  ShieldAlert,
  HelpCircle,
  FolderOpen,
} from 'lucide-react';
import type {
  WorkflowCatalogTemplate,
  TemplateScope,
} from '../../../shared/types/orchestration.js';
import { useI18n } from '../../context/I18nContext.js';

interface WorkflowCatalogViewProps {
  catalog: {
    sections: Array<{ name: string; templates: WorkflowCatalogTemplate[] }>;
    templates: WorkflowCatalogTemplate[];
    permissions?: {
      canCreatePersonal: boolean;
      canCreateDepartment: boolean;
      canCreateCompany: boolean;
      canLaunchWorkflows: boolean;
    };
  };
  query: string;
  setQuery: (query: string) => void;
  onPreview: (template: WorkflowCatalogTemplate) => void;
  onLaunch: (template: WorkflowCatalogTemplate) => void;
  onEdit: (template: WorkflowCatalogTemplate) => void;
  onClone: (template: WorkflowCatalogTemplate) => void;
  onDelete: (template: WorkflowCatalogTemplate) => void;
  onNewWorkflow?: (scope?: TemplateScope) => void;
  directory?: {
    departments?: Array<{ id: string; name: string; code?: string }>;
  };
}

const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes}d`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes ? `${hours}s ${remainingMinutes}d` : `${hours}s`;
  const days = Math.floor(hours / 24);
  return `${days}g`;
};

const Metric = ({ value, label }: { value: string | number; label: string }) => {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center p-1">
      <div className="text-xs font-bold text-slate-800 dark:text-slate-100">{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-400">
        {t(label)}
      </div>
    </div>
  );
};

export const WorkflowCatalogView: React.FC<WorkflowCatalogViewProps> = ({
  catalog,
  query,
  setQuery,
  onPreview,
  onLaunch,
  onEdit,
  onClone,
  onDelete,
  onNewWorkflow,
  directory,
}) => {
  const { t } = useI18n();

  // Active scope filter: 'ALL' | 'COMPANY' | 'DEPARTMENT' | 'PERSONAL'
  const [selectedScope, setSelectedScope] = useState<'ALL' | 'COMPANY' | 'DEPARTMENT' | 'PERSONAL'>('ALL');
  // Selected department/branch filter (for department templates)
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  // Selected domain/category filter
  const [selectedDomain, setSelectedDomain] = useState<string>('ALL');
  // View mode
  const [viewMode, setViewMode] = useState<'GRID' | 'LIST'>('GRID');

  // Accordion open/close states for each section
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    'Company Templates': true,
    'Department / Branch Templates': true,
    'User Templates': true,
  });

  // Dropdown menus open/close
  const [isScopeMenuOpen, setIsScopeMenuOpen] = useState(false);
  const [isDeptMenuOpen, setIsDeptMenuOpen] = useState(false);
  const [isDomainMenuOpen, setIsDomainMenuOpen] = useState(false);

  const scopeDropdownRef = useRef<HTMLDivElement>(null);
  const deptDropdownRef = useRef<HTMLDivElement>(null);
  const domainDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (scopeDropdownRef.current && !scopeDropdownRef.current.contains(e.target as Node)) {
        setIsScopeMenuOpen(false);
      }
      if (deptDropdownRef.current && !deptDropdownRef.current.contains(e.target as Node)) {
        setIsDeptMenuOpen(false);
      }
      if (domainDropdownRef.current && !domainDropdownRef.current.contains(e.target as Node)) {
        setIsDomainMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Bank departments & regional branches list
  const departmentsList = useMemo(() => {
    const serverDepts = directory?.departments || [];
    if (serverDepts.length > 0) return serverDepts;
    return [
      { id: 'dept-infosec', name: 'İnformasiya Təhlükəsizliyi Şöbəsi', code: 'INFOSEC' },
      { id: 'dept-it-ops', name: 'İT və Şəbəkə İnfrastrukturu', code: 'IT-OPS' },
      { id: 'dept-risk', name: 'Risk İdarəetməsi və Uyğunluq', code: 'RISK' },
      { id: 'dept-audit', name: 'Daxili Audit Departamenti', code: 'AUDIT' },
      { id: 'dept-operations', name: 'Mərkəzi Əməliyyat və Klirinq', code: 'OPS' },
      { id: 'branch-nasimi', name: 'Nəsimi Filialı (Bakı)', code: 'BR-NAS' },
      { id: 'branch-sabail', name: 'Səbail Filialı (Bakı)', code: 'BR-SAB' },
      { id: 'branch-ahmadli', name: 'Əhmədli Filialı (Bakı)', code: 'BR-AHM' },
      { id: 'branch-ganja', name: 'Gəncə Regional Filialı', code: 'BR-GNJ' },
    ];
  }, [directory?.departments]);

  // Clean and filter templates for display
  const workflowCatalogTemplatesForDisplay = (templates: WorkflowCatalogTemplate[]) =>
    templates.filter(
      (template) => !(template.kind === 'BASIC_TICKET' && template.catalogGroup?.startsWith('IT ·')),
    );

  // All published templates from catalog
  const allTemplates = useMemo(() => {
    return catalog.sections.flatMap((sec) => workflowCatalogTemplatesForDisplay(sec.templates));
  }, [catalog.sections]);

  // Scope counts
  const counts = useMemo(() => {
    const company = allTemplates.filter((t) => t.scope === 'COMPANY').length;
    const department = allTemplates.filter((t) => t.scope === 'DEPARTMENT').length;
    const personal = allTemplates.filter((t) => t.scope === 'PERSONAL').length;
    return {
      all: allTemplates.length,
      company,
      department,
      personal,
    };
  }, [allTemplates]);

  // Available unique domains for filtering
  const availableDomains = useMemo(() => {
    const domains = new Set<string>();
    allTemplates.forEach((t) => {
      if (t.domain) domains.add(t.domain);
    });
    return Array.from(domains);
  }, [allTemplates]);

  // Toggle single section
  const toggleSection = (sectionName: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionName]: !prev[sectionName],
    }));
  };

  // Expand or collapse all sections
  const setAllSections = (open: boolean) => {
    setOpenSections({
      'Company Templates': open,
      'Department / Branch Templates': open,
      'User Templates': open,
    });
  };

  // Check if all are open
  const areAllOpen = Object.values(openSections).every(Boolean);

  // Filter templates based on current filters
  const filterTemplates = (templates: WorkflowCatalogTemplate[], sectionScope: TemplateScope) => {
    let filtered = workflowCatalogTemplatesForDisplay(templates);

    // Filter by department if specified
    if (sectionScope === 'DEPARTMENT' && selectedDeptId) {
      filtered = filtered.filter((t) => t.departmentId === selectedDeptId);
    }

    // Filter by domain/category
    if (selectedDomain !== 'ALL') {
      filtered = filtered.filter((t) => t.domain === selectedDomain);
    }

    return filtered.sort((left, right) =>
      `${left.kind === 'WORKFLOW' ? '1' : '2'}-${left.catalogGroup || ''}-${left.title}`.localeCompare(
        `${right.kind === 'WORKFLOW' ? '1' : '2'}-${right.catalogGroup || ''}-${right.title}`,
      ),
    );
  };

  // Section configs
  const sectionsConfig = [
    {
      name: 'Company Templates',
      scope: 'COMPANY' as TemplateScope,
      label: t('Company Templates'),
      badgeLabel: 'Mərkəzi Bank Standartı · Qlobal',
      subtitle: t('Centrally governed workflows available across the organization.'),
      theme: {
        icon: Building2,
        primary: 'text-emerald-600 dark:text-emerald-400',
        surface: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800/60',
        badge: 'bg-emerald-100/70 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
        borderHover: 'hover:border-emerald-300 dark:hover:border-emerald-700',
      },
      createLabel: '+ Yeni Şirkət Şablonu',
      canCreate: catalog.permissions?.canCreateCompany ?? true,
    },
    {
      name: 'Department / Branch Templates',
      scope: 'DEPARTMENT' as TemplateScope,
      label: t('Department / Branch Templates'),
      badgeLabel: 'Şöbə & Filial Səviyyəsi',
      subtitle: t('Templates managed for your department or branch.'),
      theme: {
        icon: GitBranch,
        primary: 'text-blue-600 dark:text-blue-400',
        surface: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-800/60',
        badge: 'bg-blue-100/70 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
        borderHover: 'hover:border-blue-300 dark:hover:border-blue-700',
      },
      createLabel: '+ Yeni Şöbə / Filial Şablonu',
      canCreate: catalog.permissions?.canCreateDepartment ?? true,
    },
    {
      name: 'User Templates',
      scope: 'PERSONAL' as TemplateScope,
      label: t('User Templates'),
      badgeLabel: 'Fərdi Avtomatlaşdırma',
      subtitle: t('Personal templates you can reuse and refine.'),
      theme: {
        icon: UserCheck,
        primary: 'text-purple-600 dark:text-purple-400',
        surface: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 ring-1 ring-purple-200 dark:ring-purple-800/60',
        badge: 'bg-purple-100/70 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
        borderHover: 'hover:border-purple-300 dark:hover:border-purple-700',
      },
      createLabel: '+ Yeni Fərdi Şablon',
      canCreate: catalog.permissions?.canCreatePersonal ?? true,
    },
  ];

  // Filter sections according to selectedScope
  const visibleSections = sectionsConfig.filter((sec) => {
    if (selectedScope === 'ALL') return true;
    return sec.scope === selectedScope;
  });

  const getActiveScopeName = () => {
    switch (selectedScope) {
      case 'COMPANY':
        return t('Company Templates');
      case 'DEPARTMENT':
        return t('Department / Branch Templates');
      case 'PERSONAL':
        return t('User Templates');
      default:
        return 'Bütün şablonlar (Hamısı)';
    }
  };

  const getActiveDeptName = () => {
    if (!selectedDeptId) return 'Bütün şöbə və filiallar';
    const dept = departmentsList.find((d) => d.id === selectedDeptId);
    return dept ? dept.name : 'Bütün şöbə və filiallar';
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 dark:bg-slate-950/40 p-4 sm:p-6">
      <div className="mx-auto max-w-[1500px]">
        {/* Top Header Banner */}
        <div className="mb-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-gradient-to-r from-white via-slate-50/50 to-emerald-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/20 p-5 sm:p-6 shadow-xs backdrop-blur-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-xs">
                  <Workflow className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {t('Universal iş orkestrləşdirməsi')} · {t('Workflow Catalog')}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('Start a governed request from an approved workflow template.')}
                  </p>
                </div>
              </div>
            </div>

            {/* Scope Badges / Stats Strip */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedScope('ALL')}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  selectedScope === 'ALL'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-300'
                }`}
              >
                <Layers3 className="h-3.5 w-3.5" />
                <span>{t('All Templates')}</span>
                <span className="rounded-full bg-slate-200/80 dark:bg-slate-700 px-1.5 py-0.2 text-[10px] font-extrabold text-slate-800 dark:text-slate-200">
                  {counts.all}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedScope('COMPANY')}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  selectedScope === 'COMPANY'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-emerald-300'
                }`}
              >
                <Building2 className="h-3.5 w-3.5 text-emerald-500" />
                <span>{t('Company Templates')}</span>
                <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.2 text-[10px] font-extrabold">
                  {counts.company}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedScope('DEPARTMENT')}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  selectedScope === 'DEPARTMENT'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-blue-300'
                }`}
              >
                <GitBranch className="h-3.5 w-3.5 text-blue-500" />
                <span>{t('Department / Branch Templates')}</span>
                <span className="rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 px-1.5 py-0.2 text-[10px] font-extrabold">
                  {counts.department}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedScope('PERSONAL')}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  selectedScope === 'PERSONAL'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-purple-300'
                }`}
              >
                <UserCheck className="h-3.5 w-3.5 text-purple-500" />
                <span>{t('User Templates')}</span>
                <span className="rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 px-1.5 py-0.2 text-[10px] font-extrabold">
                  {counts.personal}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Enterprise Toolbar: Search, Dropdowns & Controls */}
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          {/* Left: Interactive Dropdowns */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            {/* 1. Scope Selector Dropdown */}
            <div className="relative" ref={scopeDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setIsScopeMenuOpen((v) => !v);
                  setIsDeptMenuOpen(false);
                  setIsDomainMenuOpen(false);
                }}
                className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors shadow-2xs"
                title="Şablon səviyyəsini seçin"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
                <span>{getActiveScopeName()}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isScopeMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isScopeMenuOpen && (
                <div className="absolute left-0 top-full z-50 mt-1.5 w-72 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {t('Filter by Scope')}
                  </div>
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedScope('ALL');
                        setIsScopeMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
                        selectedScope === 'ALL'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-bold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Layers3 className="h-4 w-4 text-slate-500" />
                        <div>
                          <div>{t('All Templates')}</div>
                          <div className="text-[10px] font-normal text-slate-400">Şirkət, şöbə və istifadəçi</div>
                        </div>
                      </div>
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-400">
                        {counts.all}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedScope('COMPANY');
                        setIsScopeMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
                        selectedScope === 'COMPANY'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-bold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Building2 className="h-4 w-4 text-emerald-600" />
                        <div>
                          <div>{t('Company Templates')}</div>
                          <div className="text-[10px] font-normal text-slate-400">Mərkəzi bank standartları</div>
                        </div>
                      </div>
                      <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                        {counts.company}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedScope('DEPARTMENT');
                        setIsScopeMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
                        selectedScope === 'DEPARTMENT'
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 font-bold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <GitBranch className="h-4 w-4 text-blue-600" />
                        <div>
                          <div>{t('Department / Branch Templates')}</div>
                          <div className="text-[10px] font-normal text-slate-400">Departament və filiallar</div>
                        </div>
                      </div>
                      <span className="rounded-full bg-blue-100 dark:bg-blue-950 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-400">
                        {counts.department}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedScope('PERSONAL');
                        setIsScopeMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
                        selectedScope === 'PERSONAL'
                          ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 font-bold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <UserCheck className="h-4 w-4 text-purple-600" />
                        <div>
                          <div>{t('User Templates')}</div>
                          <div className="text-[10px] font-normal text-slate-400">Fərdi şablonlar</div>
                        </div>
                      </div>
                      <span className="rounded-full bg-purple-100 dark:bg-purple-950 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:text-purple-400">
                        {counts.personal}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Department & Branch Filter Dropdown (Active when looking at Department or All) */}
            {(selectedScope === 'ALL' || selectedScope === 'DEPARTMENT') && (
              <div className="relative" ref={deptDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsDeptMenuOpen((v) => !v);
                    setIsScopeMenuOpen(false);
                    setIsDomainMenuOpen(false);
                  }}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors shadow-2xs ${
                    selectedDeptId
                      ? 'border-blue-300 bg-blue-50/80 text-blue-800 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100'
                  }`}
                  title="Şöbə və ya filial üzrə süzgəc"
                >
                  <Building className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="max-w-[170px] truncate">{getActiveDeptName()}</span>
                  <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isDeptMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {isDeptMenuOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1.5 max-h-72 w-80 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100">
                    <div className="flex items-center justify-between px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <span>{t('Filter by Department / Branch')}</span>
                      {selectedDeptId && (
                        <button
                          type="button"
                          onClick={() => setSelectedDeptId('')}
                          className="text-[10px] font-semibold text-rose-600 hover:underline"
                        >
                          Təmizlə
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDeptId('');
                          setIsDeptMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
                          !selectedDeptId
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-bold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span>{t('All Departments & Branches')}</span>
                        {!selectedDeptId && <Check className="h-4 w-4 text-blue-600" />}
                      </button>

                      {departmentsList.map((dept) => (
                        <button
                          key={dept.id}
                          type="button"
                          onClick={() => {
                            setSelectedDeptId(dept.id);
                            setIsDeptMenuOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
                            selectedDeptId === dept.id
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-bold'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="truncate font-medium">{dept.name}</div>
                            {dept.code && (
                              <div className="text-[10px] font-mono text-slate-400">{dept.code}</div>
                            )}
                          </div>
                          {selectedDeptId === dept.id && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. Domain / Category Filter */}
            {availableDomains.length > 0 && (
              <div className="relative" ref={domainDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsDomainMenuOpen((v) => !v);
                    setIsScopeMenuOpen(false);
                    setIsDeptMenuOpen(false);
                  }}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors shadow-2xs ${
                    selectedDomain !== 'ALL'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100'
                  }`}
                  title="Domenə görə süzgəc"
                >
                  <Filter className="h-3.5 w-3.5 text-slate-400" />
                  <span>{selectedDomain === 'ALL' ? 'Domen: Hamısı' : t(selectedDomain.replaceAll('_', ' '))}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>

                {isDomainMenuOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1.5 w-60 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      {t('All Domains')}
                    </div>
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDomain('ALL');
                          setIsDomainMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-left text-xs font-semibold ${
                          selectedDomain === 'ALL'
                            ? 'bg-emerald-50 text-emerald-700 font-bold'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span>{t('All Domains')}</span>
                        {selectedDomain === 'ALL' && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                      </button>
                      {availableDomains.map((domain) => (
                        <button
                          key={domain}
                          type="button"
                          onClick={() => {
                            setSelectedDomain(domain);
                            setIsDomainMenuOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-left text-xs font-semibold ${
                            selectedDomain === domain
                              ? 'bg-emerald-50 text-emerald-700 font-bold'
                              : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span>{t(domain.replaceAll('_', ' '))}</span>
                          {selectedDomain === domain && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Search, View Mode & Accordion Controls */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Search Input */}
            <label className="flex flex-1 sm:w-[320px] items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 px-3 py-2 shadow-2xs transition focus-within:border-emerald-500 focus-within:ring-3 focus-within:ring-emerald-500/15">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('Search workflows, domains, owners, nodes...')}
                aria-label={t('Search workflow templates')}
                className="w-full border-0 bg-transparent text-xs text-slate-800 dark:text-slate-200 outline-none placeholder:text-slate-400"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="rounded-full p-0.5 text-slate-400 hover:text-slate-600"
                  aria-label="Təmizlə"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>

            {/* View Mode Toggle: Grid vs. List */}
            <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800 p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('GRID')}
                className={`rounded-lg p-1.5 transition-colors ${
                  viewMode === 'GRID'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-bold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Qrid görünüşü"
                aria-label="Qrid görünüşü"
              >
                <Grid3X3 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('LIST')}
                className={`rounded-lg p-1.5 transition-colors ${
                  viewMode === 'LIST'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-bold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Siyahı görünüşü"
                aria-label="Siyahı görünüşü"
              >
                <List className="h-4 w-4" />
              </button>
            </div>

            {/* Accordion Expand/Collapse All */}
            <button
              type="button"
              onClick={() => setAllSections(!areAllOpen)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors shadow-2xs"
              title={areAllOpen ? 'Bütün bölmələri bağla' : 'Bütün bölmələri aç'}
            >
              <span className="text-[11px] font-bold">{areAllOpen ? 'Hamısını bağla' : 'Hamısını aç'}</span>
              {areAllOpen ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
            </button>
          </div>
        </div>

        {/* Catalog Sections: Şirkət, Şöbə və Filial, İstifadəçi */}
        <div className="space-y-6">
          {visibleSections.map((sec) => {
            const rawSection = catalog.sections.find((s) => s.name === sec.name);
            const templates = rawSection ? filterTemplates(rawSection.templates, sec.scope) : [];
            const isOpen = Boolean(openSections[sec.name]);
            const Icon = sec.theme.icon;

            return (
              <section
                key={sec.name}
                className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs transition-all duration-200"
              >
                {/* Accordion Header */}
                <div
                  onClick={() => toggleSection(sec.name)}
                  className="flex cursor-pointer items-center justify-between border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-900/50 p-4 sm:p-5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors select-none"
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${sec.theme.surface} shadow-xs`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                          {sec.label}
                        </h3>
                        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${sec.theme.badge}`}>
                          {sec.badgeLabel}
                        </span>
                        <span className="rounded-full bg-slate-200/70 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          {templates.length} {templates.length === 1 ? 'şablon' : 'şablon'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                        {sec.subtitle}
                      </p>
                    </div>
                  </div>

                  {/* Header Actions */}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {sec.canCreate && onNewWorkflow && (
                      <button
                        type="button"
                        onClick={() => onNewWorkflow(sec.scope)}
                        className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                      >
                        <Plus className="h-3.5 w-3.5 text-emerald-600" />
                        <span>{sec.createLabel}</span>
                      </button>
                    )}

                    {/* Chevron Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleSection(sec.name)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                      aria-label={isOpen ? 'Bölməni bağla' : 'Bölməni aç'}
                    >
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Accordion Content */}
                {isOpen ? (
                  <div className="p-4 sm:p-5">
                    {templates.length > 0 ? (
                      viewMode === 'GRID' ? (
                        /* Grid View */
                        <div className="grid gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
                          {templates.map((template) => (
                            <article
                              key={template.id}
                              className={`group relative flex flex-col justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${sec.theme.borderHover}`}
                            >
                              <div>
                                {/* Card Header */}
                                <div className="flex items-start gap-3">
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 ring-1 ring-emerald-100 dark:ring-emerald-900/50">
                                    <Workflow className="h-5 w-5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <h4 className="truncate text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                      {t(template.title)}
                                    </h4>
                                    <p
                                      title={t(template.purpose)}
                                      className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400"
                                    >
                                      {t(template.purpose)}
                                    </p>
                                  </div>
                                  <span className="shrink-0 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-extrabold text-slate-600 dark:text-slate-300">
                                    v{template.publishedWorkflowVersion}
                                  </span>
                                </div>

                                {/* 4-Metric Grid Box */}
                                <div className="my-3.5 grid grid-cols-4 divide-x divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-800/50 py-2 text-center">
                                  <Metric
                                    value={formatDuration(template.estimatedDurationMinutes)}
                                    label="Duration"
                                  />
                                  <Metric value={template.departmentCount} label="Teams" />
                                  <Metric value={template.approvalCount} label="Approvals" />
                                  <Metric value={template.automationCount} label="Auto" />
                                </div>

                                {/* Scope & Domain Badges */}
                                <div className="mb-2.5 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
                                  <span className="min-w-0 truncate rounded-full bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 text-blue-700 dark:text-blue-300">
                                    {template.scope === 'COMPANY'
                                      ? t('Company')
                                      : template.scope === 'DEPARTMENT'
                                        ? t('Department / Branch')
                                        : t('User')}{' '}
                                    · {t(template.domain.replaceAll('_', ' '))}
                                  </span>
                                  <span className="shrink-0 text-[10px] text-slate-400">
                                    {template.runCount.toLocaleString()} {t('runs')} · {template.successRate}% {t('success')}
                                  </span>
                                </div>

                                <div className="mb-3 flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                                  <span
                                    className={`rounded-full px-2 py-0.5 ${
                                      template.kind === 'WORKFLOW'
                                        ? 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300'
                                        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                    }`}
                                  >
                                    {template.kind === 'WORKFLOW' ? t('Approval workflow') : t('Help Desk task')}
                                  </span>
                                  {template.catalogGroup && (
                                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300">
                                      {t(template.catalogGroup)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Card Actions */}
                              <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                                <button
                                  type="button"
                                  onClick={() => onPreview(template)}
                                  className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2 px-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition"
                                >
                                  {t('Preview')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onLaunch(template)}
                                  className="flex-1 rounded-xl bg-emerald-600 py-2 px-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                                >
                                  {t('Launch')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onClone(template)}
                                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-750 transition"
                                  title={t('Clone as an editable draft')}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                                {template.canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => onEdit(template)}
                                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-750 transition"
                                    title={t('Open published definition')}
                                  >
                                    <Code2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {template.canDelete && (
                                  <button
                                    type="button"
                                    onClick={() => onDelete(template)}
                                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-800 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition"
                                    title={t('Remove template from catalog')}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        /* Compact List View */
                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                          <table className="w-full text-left text-xs">
                            <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800 text-slate-500">
                              <tr>
                                <th className="py-2.5 px-4 font-bold uppercase tracking-wider text-[10px]">Şablon</th>
                                <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[10px]">Domen / Kateqoriya</th>
                                <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[10px]">Müddət</th>
                                <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[10px]">Təsdiqlər</th>
                                <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[10px]">İcralar</th>
                                <th className="py-2.5 px-4 font-bold uppercase tracking-wider text-[10px] text-right">Əməliyyat</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {templates.map((template) => (
                                <tr key={template.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-2.5">
                                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                                        <Workflow className="h-4 w-4" />
                                      </div>
                                      <div>
                                        <div className="font-bold text-slate-900 dark:text-white">{t(template.title)}</div>
                                        <div className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">{t(template.purpose)}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 px-3">
                                    <span className="rounded-full bg-blue-50 dark:bg-blue-950 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                                      {t(template.domain.replaceAll('_', ' '))}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 font-medium text-slate-700 dark:text-slate-300">
                                    {formatDuration(template.estimatedDurationMinutes)}
                                  </td>
                                  <td className="py-3 px-3 font-medium text-slate-700 dark:text-slate-300">
                                    {template.approvalCount} təsdiq
                                  </td>
                                  <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                                    {template.runCount} icra ({template.successRate}%)
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => onPreview(template)}
                                        className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                                      >
                                        {t('Preview')}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => onLaunch(template)}
                                        className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                                      >
                                        {t('Launch')}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    ) : (
                      /* Enterprise Empty State */
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 p-8 text-center">
                        <div className={`mb-3 flex h-14 w-14 items-center justify-center rounded-2xl ${sec.theme.surface} shadow-xs`}>
                          <Icon className="h-7 w-7" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                          {sec.name === 'Company Templates'
                            ? 'Mərkəzi şirkət şablonu tapılmadı'
                            : sec.name === 'Department / Branch Templates'
                              ? 'Bu şöbə və ya filial üçün şablon yoxdur'
                              : 'Hələ fərdi şablonunuz yoxdur'}
                        </h4>
                        <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                          {sec.name === 'Company Templates'
                            ? 'Təşkilat daxilində ümumi mərkəzi şablonlar yaratmaq üçün iş axını qurucusundan istifadə edin.'
                            : sec.name === 'Department / Branch Templates'
                              ? 'Şöbəniz və ya filialınız üçün xüsusi iş axını quraraq komanda təsdiqlərini və gündəlik prosesləri avtomatlaşdırın.'
                              : 'Tez-tez təkrarladığınız tapşırıqlar üçün fərdi şablon hazırlayın və istənilən vaxt bir kliklə icra edin.'}
                        </p>
                        {sec.canCreate && onNewWorkflow && (
                          <button
                            type="button"
                            onClick={() => onNewWorkflow(sec.scope)}
                            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                          >
                            <Plus className="h-4 w-4" />
                            <span>{sec.createLabel}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Collapsed Quick Hint */
                  <div
                    onClick={() => toggleSection(sec.name)}
                    className="cursor-pointer px-5 py-2.5 bg-slate-50/20 text-center text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition flex items-center justify-center gap-2"
                  >
                    <span>{templates.length} şablon mövcuddur · Açmaq üçün klikləyin</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};
