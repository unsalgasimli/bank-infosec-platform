import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Building2,
  Landmark,
  Shield,
  ShieldCheck,
  Layers,
  Users,
  User,
  Check,
  CheckCircle2,
  Search,
  ChevronRight,
  ChevronDown,
  Lock,
  LogOut,
  X,
  Radio,
  Globe,
  FolderTree,
  ArrowRightLeft,
  ExternalLink,
  Laptop,
  Scale,
  FileCheck,
  Briefcase,
  Sparkles,
  Server,
} from 'lucide-react';
import { BankDepartment, BankUser } from '../../../shared/types/auth.js';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../context/I18nContext.js';

export type EnterpriseTab = 'company' | 'department' | 'user';

export interface BankCompanyEntity {
  id: string;
  name: string;
  shortName: string;
  code: string;
  subtitle: string;
  license: string;
  status: 'Aktiv' | 'Planlaşdırılır';
  type: string;
  departmentCount: number;
  employeeCount: string;
}

export const BANK_COMPANIES: BankCompanyEntity[] = [
  {
    id: 'apex-bank-main',
    name: 'Apex Bank ASC',
    shortName: 'Apex Bank',
    code: 'APEX-HQ',
    subtitle: 'Baş İdarə və Əsas Bankçılıq Əməliyyatları',
    license: 'AR Mərkəzi Bankı Lisenziyası №142',
    status: 'Aktiv',
    type: 'Əsas Təşkilat (Baş Ofis)',
    departmentCount: 8,
    employeeCount: '1,240+',
  },
  {
    id: 'apex-tech',
    name: 'Apex Tech & FinTech QSC',
    shortName: 'Apex Tech',
    code: 'APEX-TECH',
    subtitle: 'Rəqəmsal Həllər, Proqramlaşdırma və Open Banking Mərkəzi',
    license: 'İnnovasiya və Rəqəmsal İnfrastruktur Mərkəzi',
    status: 'Aktiv',
    type: 'Törəmə IT Təşkilatı',
    departmentCount: 4,
    employeeCount: '320+',
  },
  {
    id: 'apex-invest',
    name: 'Apex İnvestisiya Şirkəti QSC',
    shortName: 'Apex İnvest',
    code: 'APEX-INV',
    subtitle: 'Qiymətli Kağızlar, Anderraytinq və Aktivlərin İdarə Edilməsi',
    license: 'Maliyyə Bazarlarına Nəzarət Lisenziyası',
    status: 'Aktiv',
    type: 'İnvestisiya Holdinqi',
    departmentCount: 3,
    employeeCount: '85+',
  },
  {
    id: 'apex-leasing',
    name: 'Apex Lizinq ASC',
    shortName: 'Apex Lizinq',
    code: 'APEX-LSG',
    subtitle: 'Korporativ və Pərakəndə Maliyyə Lizinqi Xidmətləri',
    license: 'AR Qanunvericiliyinə uyğun maliyyə icarəsi',
    status: 'Aktiv',
    type: 'Lizinq Qrupu',
    departmentCount: 2,
    employeeCount: '60+',
  },
];

interface EnterpriseContextDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: EnterpriseTab;
  departments?: BankDepartment[];
  activeDepartmentId?: string | null;
  onSelectDepartment?: (deptId: string | null) => void;
  onOpenLdapModal?: () => void;
  onNavigate?: (view: string, id?: string) => void;
  align?: 'left' | 'right';
}

export const EnterpriseContextDropdown: React.FC<EnterpriseContextDropdownProps> = ({
  isOpen,
  onClose,
  initialTab = 'department',
  departments = [],
  activeDepartmentId = null,
  onSelectDepartment,
  onOpenLdapModal,
  onNavigate,
  align = 'left',
}) => {
  const { currentUser, allUsers, switchUser, logout } = useAuth();
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState<EnterpriseTab>(initialTab);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(() => {
    try {
      return localStorage.getItem('apex_active_company_id') || 'apex-bank-main';
    } catch {
      return 'apex-bank-main';
    }
  });

  const [deptSearchQuery, setDeptSearchQuery] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [expandedDeptId, setExpandedDeptId] = useState<string | null>(null);
  const [isSwitchingUser, setIsSwitchingUser] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Sync initial tab when opened
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Selected company object
  const activeCompany = useMemo(() => {
    return BANK_COMPANIES.find((c) => c.id === selectedCompanyId) || BANK_COMPANIES[0];
  }, [selectedCompanyId]);

  // Active department object
  const activeDepartment = useMemo(() => {
    if (!activeDepartmentId) return null;
    return departments.find((d) => d.id === activeDepartmentId) || null;
  }, [departments, activeDepartmentId]);

  // Filtered departments
  const filteredDepartments = useMemo(() => {
    if (!deptSearchQuery.trim()) return departments;
    const query = deptSearchQuery.toLowerCase();
    return departments.filter(
      (d) =>
        d.name.toLowerCase().includes(query) ||
        d.code.toLowerCase().includes(query) ||
        (d.managerName && d.managerName.toLowerCase().includes(query)) ||
        (d.sections && d.sections.some((s) => s.name.toLowerCase().includes(query) || s.code.toLowerCase().includes(query)))
    );
  }, [departments, deptSearchQuery]);

  // Filtered users for persona switcher
  const filteredUsers = useMemo(() => {
    if (!userSearchQuery.trim()) {
      return allUsers.slice(0, 10);
    }
    const query = userSearchQuery.toLowerCase();
    return allUsers.filter(
      (u) =>
        u.fullName.toLowerCase().includes(query) ||
        u.username.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query) ||
        u.title.toLowerCase().includes(query) ||
        (u.roles && u.roles.some((r) => r.toLowerCase().includes(query)))
    ).slice(0, 15);
  }, [allUsers, userSearchQuery]);

  const handleSelectCompany = (companyId: string) => {
    setSelectedCompanyId(companyId);
    try {
      localStorage.setItem('apex_active_company_id', companyId);
    } catch {}
  };

  const handleSelectDept = (deptId: string | null) => {
    if (onSelectDepartment) {
      onSelectDepartment(deptId);
    }
    onClose();
  };

  const handleSwitchUser = async (userId: string) => {
    if (userId === currentUser?.id) return;
    setIsSwitchingUser(true);
    try {
      await switchUser(userId);
      onClose();
    } catch (err) {
      console.error('Failed switching persona:', err);
    } finally {
      setIsSwitchingUser(false);
    }
  };

  const getDepartmentIcon = (code: string) => {
    switch (code?.toUpperCase()) {
      case 'INFOSEC':
      case 'SECURITY':
        return <ShieldCheck className="w-4 h-4 text-emerald-500" />;
      case 'IT':
      case 'INFRA':
        return <Server className="w-4 h-4 text-blue-500" />;
      case 'RISK':
        return <Scale className="w-4 h-4 text-amber-500" />;
      case 'DIGITAL':
      case 'DEVELOPMENT':
        return <Laptop className="w-4 h-4 text-purple-500" />;
      case 'AUDIT':
        return <FileCheck className="w-4 h-4 text-sky-500" />;
      default:
        return <Building2 className="w-4 h-4 text-semantic-brand" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Enterprise Organizational Context & User Governance"
      className={`absolute top-full mt-2.5 z-dsOverlay w-[94vw] sm:w-[540px] max-w-[560px] bg-semantic-panel rounded-2xl border border-semantic-border-strong shadow-2xl backdrop-blur-md overflow-hidden text-semantic-primary animate-in fade-in zoom-in-95 duration-150 ${
        align === 'right' ? 'right-0' : 'left-0 sm:left-2'
      }`}
    >
      {/* 1. Header Bar: Enterprise Brand Emblem & AD Connection Badge */}
      <div className="px-5 py-4 border-b border-semantic-border bg-semantic-subtle/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
            <Landmark className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-semantic-strong">
                {t('Apex Bank Müəssisə Strukturu')}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wide bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                AD Canlı
              </span>
            </div>
            <p className="text-[11px] text-semantic-secondary mt-0.5">
              {activeCompany.shortName} • {activeDepartment ? activeDepartment.name : t('Qlobal Görünüş (Bütün Şöbələr)')}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          type="button"
          aria-label={t('Close')}
          className="p-1.5 rounded-lg text-semantic-secondary hover:text-semantic-primary hover:bg-semantic-neutral-surface transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Three Segmented Tabs: Şirkət (Company) | Şöbə (Department) | İstifadəçi (User) */}
      <div className="px-4 pt-3 pb-2 border-b border-semantic-border bg-semantic-panel">
        <div className="grid grid-cols-3 p-1 rounded-xl bg-semantic-subtle border border-semantic-border/70 text-xs font-semibold select-none">
          <button
            type="button"
            onClick={() => setActiveTab('company')}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg transition-all ${
              activeTab === 'company'
                ? 'bg-semantic-panel text-semantic-primary shadow-sm font-bold border border-semantic-border/60'
                : 'text-semantic-secondary hover:text-semantic-primary'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>{t('Şirkət')}</span>
            <span className="px-1.5 py-0.2 rounded-full bg-semantic-subtle text-[10px] font-mono font-bold text-semantic-muted">
              {BANK_COMPANIES.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('department')}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg transition-all ${
              activeTab === 'department'
                ? 'bg-semantic-panel text-semantic-primary shadow-sm font-bold border border-semantic-border/60'
                : 'text-semantic-secondary hover:text-semantic-primary'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>{t('Şöbə')}</span>
            <span className="px-1.5 py-0.2 rounded-full bg-semantic-subtle text-[10px] font-mono font-bold text-semantic-muted">
              {departments.length || 8}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('user')}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg transition-all ${
              activeTab === 'user'
                ? 'bg-semantic-panel text-semantic-primary shadow-sm font-bold border border-semantic-border/60'
                : 'text-semantic-secondary hover:text-semantic-primary'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>{t('İstifadəçi')}</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          </button>
        </div>
      </div>

      {/* 3. Tab Body Container */}
      <div className="max-h-[430px] overflow-y-auto overscroll-contain p-4 space-y-4 custom-scrollbar">
        {/* TAB 1: ŞİRKƏT (COMPANY / HOLDING) */}
        {activeTab === 'company' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-semantic-muted">
                {t('Bank Qrupu və Törəmə Cəmiyyətlər')}
              </span>
              <span className="text-[11px] text-semantic-muted">
                {t('Cari Aktiv Təşkilat')}: <strong className="text-semantic-primary">{activeCompany.shortName}</strong>
              </span>
            </div>

            <div className="space-y-2.5">
              {BANK_COMPANIES.map((company) => {
                const isSelected = company.id === selectedCompanyId;
                return (
                  <div
                    key={company.id}
                    onClick={() => handleSelectCompany(company.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500/5 shadow-xs ring-1 ring-emerald-500/20'
                        : 'border-semantic-border bg-semantic-panel hover:bg-semantic-subtle hover:border-semantic-border-strong'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                            isSelected
                              ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                              : 'bg-semantic-subtle text-semantic-secondary border border-semantic-border'
                          }`}
                        >
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-semantic-strong leading-tight">
                              {company.name}
                            </span>
                            <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-semantic-subtle text-semantic-secondary border border-semantic-border">
                              {company.code}
                            </span>
                          </div>
                          <p className="text-xs text-semantic-secondary mt-1 leading-snug">
                            {company.subtitle}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-semantic-muted font-medium">
                            <span className="text-semantic-secondary">{company.type}</span>
                            <span>•</span>
                            <span>{company.license}</span>
                            <span>•</span>
                            <span className="font-mono">{company.departmentCount} {t('departament')}</span>
                            <span>•</span>
                            <span className="font-mono">{company.employeeCount} {t('əməkdaş')}</span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 mt-1">
                        {isSelected ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-semantic-border-strong hover:border-emerald-500" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: ŞÖBƏ (DEPARTMENTS & SECTIONS) */}
        {activeTab === 'department' && (
          <div className="space-y-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-semantic-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={deptSearchQuery}
                onChange={(e) => setDeptSearchQuery(e.target.value)}
                placeholder={t('Şöbə adı, kod (INFOSEC, IT...), müdir və ya bölmə axtar...')}
                className="w-full pl-9 pr-8 py-2 bg-semantic-subtle border border-semantic-border rounded-xl text-xs text-semantic-primary placeholder:text-semantic-placeholder focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
              {deptSearchQuery && (
                <button
                  onClick={() => setDeptSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-semantic-muted hover:text-semantic-primary"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Global All Departments Option */}
            <div
              onClick={() => handleSelectDept(null)}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                activeDepartmentId === null
                  ? 'border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500/20'
                  : 'border-semantic-border bg-semantic-panel hover:bg-semantic-subtle'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    activeDepartmentId === null
                      ? 'bg-emerald-500 text-white shadow-xs'
                      : 'bg-semantic-subtle text-semantic-secondary border border-semantic-border'
                  }`}
                >
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-semantic-strong">
                    {t('Bütün Şöbələr (Qlobal Konsolidasiya)')}
                  </div>
                  <div className="text-[11px] text-semantic-muted mt-0.5">
                    {t('Bank üzrə bütün departamentlərin işləri, tapşırıqları və hesabatları')}
                  </div>
                </div>
              </div>
              {activeDepartmentId === null && (
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              )}
            </div>

            {/* Departments List */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-semantic-muted">
                  {t('Bank Departamentləri və Şöbələri')} ({filteredDepartments.length})
                </span>
                {activeDepartment && (
                  <button
                    onClick={() => handleSelectDept(null)}
                    className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
                  >
                    {t('Bütün şöbələrə qayıt')}
                  </button>
                )}
              </div>

              {filteredDepartments.length === 0 ? (
                <div className="py-8 text-center text-semantic-muted text-xs">
                  {t('Axtarışa uyğun şöbə tapılmadı.')}
                </div>
              ) : (
                filteredDepartments.map((dept) => {
                  const isSelected = dept.id === activeDepartmentId;
                  const hasSections = dept.sections && dept.sections.length > 0;
                  const isExpanded = expandedDeptId === dept.id;

                  return (
                    <div
                      key={dept.id}
                      className={`rounded-xl border transition-all ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500/20'
                          : 'border-semantic-border bg-semantic-panel hover:bg-semantic-subtle/70'
                      }`}
                    >
                      <div
                        onClick={() => handleSelectDept(dept.id)}
                        className="p-3 flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              isSelected
                                ? 'bg-emerald-500 text-white shadow-xs'
                                : 'bg-semantic-subtle text-semantic-secondary border border-semantic-border'
                            }`}
                          >
                            {getDepartmentIcon(dept.code)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-semantic-strong truncate">
                                {dept.name}
                              </span>
                              <span className="px-1.5 py-0.2 rounded font-mono text-[9px] font-bold bg-semantic-subtle text-semantic-secondary border border-semantic-border">
                                {dept.code}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-semantic-muted">
                              {dept.managerName && (
                                <span>{t('Müdir')}: <strong className="text-semantic-secondary">{dept.managerName}</strong></span>
                              )}
                              {dept.activeTaskCount !== undefined && dept.activeTaskCount > 0 && (
                                <span className="px-1.5 py-0.2 rounded-full font-mono text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                  {dept.activeTaskCount} {t('tapşırıq')}
                                </span>
                              )}
                              {dept.memberCount !== undefined && (
                                <span className="font-mono">{dept.memberCount} {t('üzv')}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {hasSections && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedDeptId(isExpanded ? null : dept.id);
                              }}
                              className="p-1 rounded-md text-semantic-muted hover:text-semantic-primary hover:bg-semantic-panel border border-semantic-border/50 text-[10px] font-semibold flex items-center gap-1"
                              title={t('Alt şöbələri göstər')}
                            >
                              <span>{dept.sections?.length} {t('şöbə')}</span>
                              <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                          )}
                          {isSelected && (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          )}
                        </div>
                      </div>

                      {/* Expandable Sections Tree */}
                      {hasSections && isExpanded && (
                        <div className="px-3 pb-3 pt-1 border-t border-semantic-border/60 bg-semantic-subtle/50 space-y-1.5">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-semantic-muted px-1">
                            {t('Struktur Bölmələr və Şöbələr')}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {dept.sections!.map((section) => (
                              <div
                                key={section.id}
                                className="px-2.5 py-1.5 rounded-lg bg-semantic-panel border border-semantic-border/60 text-xs flex items-center justify-between gap-2"
                              >
                                <span className="truncate font-medium text-semantic-strong">
                                  {section.name}
                                </span>
                                <span className="font-mono text-[9px] text-semantic-muted font-bold px-1 rounded bg-semantic-subtle">
                                  {section.sectionType || section.code}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 3: İSTİFADƏÇİ (USER & PERSONA SWITCHER) */}
        {activeTab === 'user' && (
          <div className="space-y-4">
            {/* Current Logged-in User Hero Card */}
            <div className="p-4 rounded-xl border border-semantic-border-strong bg-gradient-to-br from-semantic-subtle to-semantic-neutral-surface shadow-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div>
                    <div className="font-bold text-sm text-semantic-strong leading-snug">
                      {currentUser?.fullName || currentUser?.username}
                    </div>
                    <div className="text-xs text-semantic-secondary font-mono mt-0.5">
                      {currentUser?.email || currentUser?.userPrincipalName || `${currentUser?.username}@apexbank.az`}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        {currentUser?.roles?.[0] || 'SECURITY_ANALYST'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-semantic-panel text-semantic-secondary border border-semantic-border">
                        {currentUser?.securityClearance || 'Tier 4: MƏXFİ'}
                      </span>
                      {currentUser?.departmentId && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                          {departments.find((d) => d.id === currentUser.departmentId)?.name || 'İnformasiya Təhlükəsizliyi'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wide bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0">
                  {t('Aktiv')}
                </span>
              </div>
            </div>

            {/* Sürətli İstifadəçi / Persona Dəyişimi (Quick Persona Switcher) */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-semantic-muted">
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>{t('Sürətli İstifadəçi / Persona Keçidi')}</span>
                </div>
                {isSwitchingUser && (
                  <span className="text-xs font-medium text-emerald-500 animate-pulse font-mono">
                    {t('Keçid edilir...')}
                  </span>
                )}
              </div>

              {/* User search input */}
              <div className="relative">
                <Search className="w-4 h-4 text-semantic-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  placeholder={t('İstifadəçi adı, soyadı, vəzifə və ya rol axtar...')}
                  className="w-full pl-9 pr-8 py-2 bg-semantic-subtle border border-semantic-border rounded-xl text-xs text-semantic-primary placeholder:text-semantic-placeholder focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
                {userSearchQuery && (
                  <button
                    onClick={() => setUserSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-semantic-muted hover:text-semantic-primary"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Users list */}
              <div className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar">
                {filteredUsers.map((user) => {
                  const isCurrent = user.id === currentUser?.id;
                  return (
                    <button
                      key={user.id}
                      type="button"
                      disabled={isSwitchingUser || isCurrent}
                      onClick={() => handleSwitchUser(user.id)}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                        isCurrent
                          ? 'border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500/20'
                          : 'border-semantic-border bg-semantic-panel hover:bg-semantic-subtle hover:border-semantic-border-strong cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-semantic-strong truncate">
                              {user.fullName || user.username}
                            </span>
                            <span className="font-mono text-[9px] text-semantic-muted px-1.5 rounded bg-semantic-subtle">
                              {user.roles?.[0] || 'USER'}
                            </span>
                          </div>
                          <div className="text-[11px] text-semantic-secondary truncate">
                            {user.title || user.email}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {isCurrent ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500 text-white">
                            {t('Cari')}
                          </span>
                        ) : (
                          <span className="text-xs text-semantic-brand hover:underline font-bold flex items-center gap-1">
                            {t('Keçid et')} →
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom System Action Links */}
            <div className="pt-3 border-t border-semantic-border space-y-1">
              {onOpenLdapModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenLdapModal();
                  }}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-semantic-subtle text-semantic-secondary hover:text-semantic-primary font-semibold flex items-center justify-between text-xs transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Lock className="w-4 h-4 text-emerald-500" />
                    <span>{t('Active Directory LDAP Giriş Modalı')}</span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-semantic-muted" />
                </button>
              )}

              {onNavigate && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigate('admin-departments');
                  }}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-semantic-subtle text-semantic-secondary hover:text-semantic-primary font-semibold flex items-center justify-between text-xs transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <FolderTree className="w-4 h-4 text-blue-500" />
                    <span>{t('Şöbə İdarəetmə Portalı')}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-semantic-muted" />
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onClose();
                  void logout();
                }}
                className="w-full text-left p-2.5 rounded-xl hover:bg-red-500/10 text-red-600 dark:text-red-400 font-semibold flex items-center justify-between text-xs transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <LogOut className="w-4 h-4" />
                  <span>{t('Təhlükəsiz Çıxış')}</span>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. Footer Bar */}
      <div className="px-5 py-2.5 border-t border-semantic-border bg-semantic-subtle/50 flex items-center justify-between text-[11px] text-semantic-muted font-medium">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Apex Bank Information Security Platform</span>
        </div>
        <span className="font-mono text-[10px]">v2026.4 • AD Kerberos</span>
      </div>
    </div>
  );
};
