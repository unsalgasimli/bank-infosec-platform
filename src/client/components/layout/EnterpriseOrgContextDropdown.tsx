import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Building2,
  ChevronDown,
  Search,
  Check,
  Globe,
  Layers,
  Users,
  Shield,
  Server,
  AlertTriangle,
  FileCheck,
  CreditCard,
  Building,
  ChevronRight,
} from 'lucide-react';
import { BankDepartment } from '../../../shared/types/auth.js';
import { useI18n } from '../../context/I18nContext.js';

export interface EnterpriseCompany {
  id: string;
  name: string;
  shortName: string;
  code: string;
  description: string;
  badge: string;
  employeeCount: number;
  departmentsCount: number;
  securityTier: string;
  isHeadquarter?: boolean;
}

export const ENTERPRISE_COMPANIES: EnterpriseCompany[] = [
  {
    id: 'comp-standard-ho',
    name: 'Bank Standard QSC (Baş Ofis)',
    shortName: 'Bank Standard',
    code: 'BANK-HO',
    description: 'Mərkəzi İdarə Heyəti, İT, İnfoSec və Baş Aparat',
    badge: 'Baş Bank',
    employeeCount: 420,
    departmentsCount: 12,
    securityTier: 'Tier-1 Restricted',
    isHeadquarter: true,
  },
  {
    id: 'comp-fintech-lab',
    name: 'FinTex Lab & Rəqəmsal İnnovasiyalar ASC',
    shortName: 'FinTex Lab',
    code: 'FIN-TECH',
    description: 'Rəqəmsal Bankçılıq, API Hub və Open Banking ekosistemi',
    badge: 'Rəqəmsal Mərkəz',
    employeeCount: 145,
    departmentsCount: 5,
    securityTier: 'Tier-2 Internal',
  },
  {
    id: 'comp-processing',
    name: 'Kart Əməliyyatları və Prosessinq ASC',
    shortName: 'Prosessinq',
    code: 'CARD-PROC',
    description: 'Kart Əməliyyatları, Klirinq və PCI-DSS Sertifikatlaşdırılmış Zona',
    badge: 'Ödəniş Klirinq',
    employeeCount: 90,
    departmentsCount: 4,
    securityTier: 'PCI-DSS Tier-1',
  },
  {
    id: 'comp-branches-network',
    name: 'Filiallar Şəbəkəsi (Bakı və Regionlar)',
    shortName: 'Filiallar Şəbəkəsi',
    code: 'BRANCH-NET',
    description: '28 Regional Filial, Pərakəndə Xidmət və Müştəri Əməliyyatları',
    badge: 'Pərakəndə Şəbəkə',
    employeeCount: 680,
    departmentsCount: 8,
    securityTier: 'Tier-2 Standard',
  },
];

interface EnterpriseOrgContextDropdownProps {
  departments: BankDepartment[];
  activeDepartmentId?: string | null;
  onSelectDepartment?: (deptId: string | null) => void;
  activeCompanyId?: string;
  onSelectCompany?: (companyId: string) => void;
  onNavigate?: (view: string, id?: string) => void;
  className?: string;
}

export const EnterpriseOrgContextDropdown: React.FC<EnterpriseOrgContextDropdownProps> = ({
  departments = [],
  activeDepartmentId,
  onSelectDepartment,
  activeCompanyId = 'comp-standard-ho',
  onSelectCompany,
  onNavigate,
  className = '',
}) => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'departments' | 'companies'>('departments');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState(activeCompanyId);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sync external company prop
  useEffect(() => {
    if (activeCompanyId) setSelectedCompanyId(activeCompanyId);
  }, [activeCompanyId]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Focus search on open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  const currentCompany = useMemo(() => {
    return ENTERPRISE_COMPANIES.find((c) => c.id === selectedCompanyId) || ENTERPRISE_COMPANIES[0];
  }, [selectedCompanyId]);

  const currentDepartment = useMemo(() => {
    if (!activeDepartmentId) return null;
    return departments.find((d) => d.id === activeDepartmentId) || null;
  }, [departments, activeDepartmentId]);

  const filteredDepartments = useMemo(() => {
    if (!searchQuery.trim()) return departments;
    const q = searchQuery.toLowerCase().trim();
    return departments.filter(
      (dept) =>
        dept.name.toLowerCase().includes(q) ||
        dept.code.toLowerCase().includes(q) ||
        (dept.description && dept.description.toLowerCase().includes(q)) ||
        dept.sections?.some((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))
    );
  }, [departments, searchQuery]);

  const filteredCompanies = useMemo(() => {
    if (!searchQuery.trim()) return ENTERPRISE_COMPANIES;
    const q = searchQuery.toLowerCase().trim();
    return ENTERPRISE_COMPANIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.shortName.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const handleSelectDept = (deptId: string | null) => {
    if (onSelectDepartment) {
      onSelectDepartment(deptId);
    }
    setIsOpen(false);
  };

  const handleSelectCompany = (comp: EnterpriseCompany) => {
    setSelectedCompanyId(comp.id);
    if (onSelectCompany) {
      onSelectCompany(comp.id);
    }
    setActiveTab('departments');
  };

  const getDeptIcon = (code: string) => {
    const c = code.toUpperCase();
    if (c.includes('SEC') || c.includes('INFOSEC')) return <Shield className="w-4 h-4 text-emerald-500" />;
    if (c.includes('IT') || c.includes('TECH') || c.includes('DEV')) return <Server className="w-4 h-4 text-blue-500" />;
    if (c.includes('RISK')) return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    if (c.includes('AUDIT') || c.includes('COMPL')) return <FileCheck className="w-4 h-4 text-indigo-500" />;
    if (c.includes('CARD') || c.includes('PAY') || c.includes('PROC')) return <CreditCard className="w-4 h-4 text-purple-500" />;
    return <Building2 className="w-4 h-4 text-slate-400" />;
  };

  const totalSectionsCount = useMemo(() => {
    return departments.reduce((acc, d) => acc + (d.sections?.length || d.sectionCount || 0), 0);
  }, [departments]);

  return (
    <div ref={dropdownRef} className={`relative select-none ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title="Şirkət və Şöbə Seçimi (Enterprise Org Context)"
        className={`group flex items-center gap-2.5 px-3 py-1.5 rounded-xl border transition-all duration-200 text-left cursor-pointer ${
          isOpen
            ? 'bg-semantic-subtle border-semantic-brand/60 shadow-md ring-2 ring-semantic-brand/20'
            : 'bg-semantic-panel hover:bg-semantic-subtle/80 border-semantic-border hover:border-semantic-border-strong shadow-xs'
        }`}
      >
        {/* Left Organization Icon */}
        <div className="w-8 h-8 rounded-lg bg-semantic-subtle border border-semantic-border/80 flex items-center justify-center text-semantic-brand group-hover:scale-105 transition-transform shrink-0">
          <Building2 className="w-4.5 h-4.5 text-semantic-brand" />
        </div>

        {/* Text Context: Company / Department */}
        <div className="flex flex-col min-w-0 pr-1">
          <div className="flex items-center gap-1.5 text-micro font-extrabold uppercase tracking-wider text-semantic-muted leading-none">
            <span className="truncate max-w-[120px]">{currentCompany.shortName}</span>
            <span className="text-semantic-muted/60">/</span>
            <span className="text-semantic-info font-bold">
              {currentDepartment ? t('Şöbə') : t('Qlobal')}
            </span>
          </div>
          <div className="text-sm font-bold text-semantic-primary truncate max-w-[180px] lg:max-w-[220px] leading-snug mt-0.5">
            {currentDepartment ? currentDepartment.name : t('Bütün Departamentlər')}
          </div>
        </div>

        {/* Department Tasks or Active Badge */}
        {currentDepartment?.activeTaskCount !== undefined && currentDepartment.activeTaskCount > 0 ? (
          <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-full text-micro font-bold bg-semantic-brand/10 text-semantic-brand border border-semantic-brand/30">
            {currentDepartment.activeTaskCount} {t('tapşırıq')}
          </span>
        ) : (
          <span className="hidden xl:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-micro font-semibold bg-semantic-subtle text-semantic-secondary border border-semantic-border">
            <span className="w-1.5 h-1.5 rounded-full bg-semantic-brand animate-pulse" />
            Canlı
          </span>
        )}

        {/* Smooth rotating Chevron */}
        <ChevronDown
          className={`w-4 h-4 text-semantic-secondary transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-semantic-brand' : 'group-hover:text-semantic-primary'
          }`}
        />
      </button>

      {/* Flyout Dropdown Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Təşkilat və Şöbə Konteksti"
          className="absolute left-0 top-full mt-2.5 w-[380px] sm:w-[480px] md:w-[540px] max-w-[92vw] bg-semantic-panel/95 backdrop-blur-xl border border-semantic-border-strong/80 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Top Header */}
          <div className="p-4 border-b border-semantic-border bg-semantic-subtle/50">
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-semantic-brand/15 text-semantic-brand flex items-center justify-center font-bold text-xs">
                  🏛️
                </div>
                <div>
                  <h3 className="text-sm font-bold text-semantic-primary leading-none">
                    {t('Təşkilati Məkan və Şöbə Seçimi')}
                  </h3>
                  <p className="text-micro text-semantic-muted mt-0.5">
                    {t('Aktiv şirkət, departament və şöbə çərçivəsində filtrləyin')}
                  </p>
                </div>
              </div>

              {/* Breadcrumb Tag */}
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-semantic-panel border border-semantic-border text-micro font-bold text-semantic-secondary">
                <span className="text-semantic-brand">{currentCompany.shortName}</span>
                <span>›</span>
                <span className="text-semantic-primary truncate max-w-[120px]">
                  {currentDepartment ? currentDepartment.name : t('Qlobal')}
                </span>
              </div>
            </div>

            {/* Quick Summary Pill Bar */}
            <div className="flex items-center gap-2 text-micro font-medium text-semantic-secondary overflow-x-auto pb-1">
              <span className="px-2 py-0.5 rounded-md bg-semantic-panel border border-semantic-border">
                🏢 {ENTERPRISE_COMPANIES.length} {t('Şirkət / Qurum')}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-semantic-panel border border-semantic-border">
                🏛️ {departments.length || 12} {t('Departament')}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-semantic-panel border border-semantic-border">
                📂 {totalSectionsCount || 48} {t('Şöbə və Sektor')}
              </span>
            </div>

            {/* Segmented Switcher Tabs */}
            <div className="flex items-center p-1 bg-semantic-panel border border-semantic-border rounded-xl mt-2.5">
              <button
                type="button"
                onClick={() => setActiveTab('departments')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'departments'
                    ? 'bg-semantic-brand text-white shadow-sm'
                    : 'text-semantic-secondary hover:text-semantic-primary hover:bg-semantic-subtle'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{t('Departament və Şöbələr')}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-micro font-mono ${
                  activeTab === 'departments' ? 'bg-white/20 text-white' : 'bg-semantic-subtle text-semantic-muted'
                }`}>
                  {departments.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('companies')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'companies'
                    ? 'bg-semantic-brand text-white shadow-sm'
                    : 'text-semantic-secondary hover:text-semantic-primary hover:bg-semantic-subtle'
                }`}
              >
                <Building className="w-3.5 h-3.5" />
                <span>{t('Şirkət və Strukturlar')}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-micro font-mono ${
                  activeTab === 'companies' ? 'bg-white/20 text-white' : 'bg-semantic-subtle text-semantic-muted'
                }`}>
                  {ENTERPRISE_COMPANIES.length}
                </span>
              </button>
            </div>

            {/* Live Search Input */}
            <div className="relative mt-2.5">
              <Search className="w-4 h-4 text-semantic-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  activeTab === 'departments'
                    ? t('Şöbə, departament və ya kod üzrə axtarın...')
                    : t('Şirkət və ya struktur axtarın...')
                }
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-semantic-panel border border-semantic-border-strong focus:border-semantic-brand focus:ring-2 focus:ring-semantic-brand/20 text-xs font-medium text-semantic-primary placeholder:text-semantic-muted transition-all outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-semantic-muted hover:text-semantic-primary text-xs font-bold p-0.5"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* List Area */}
          <div className="p-3 max-h-[360px] overflow-y-auto custom-scrollbar space-y-1.5">
            {activeTab === 'departments' ? (
              <>
                {/* Option 1: Global / All Departments */}
                <div
                  onClick={() => handleSelectDept(null)}
                  className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                    activeDepartmentId === null
                      ? 'bg-semantic-brand/10 border-semantic-brand shadow-xs'
                      : 'bg-semantic-panel border-semantic-border hover:bg-semantic-subtle hover:border-semantic-border-strong'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-xs shrink-0">
                      <Globe className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-semantic-primary">
                          {t('Bütün Departamentlər (Qlobal Görünüş)')}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-micro font-bold bg-sky-500/15 text-sky-500 border border-sky-500/30">
                          Qlobal
                        </span>
                      </div>
                      <p className="text-micro text-semantic-muted mt-0.5">
                        {t('Bank üzrə bütün departamentlərin aktiv tapşırıq və proseslərini göstər')}
                      </p>
                    </div>
                  </div>

                  {activeDepartmentId === null && (
                    <div className="w-6 h-6 rounded-full bg-semantic-brand text-white flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}
                </div>

                {/* Filtered Department Items */}
                {filteredDepartments.length === 0 ? (
                  <div className="py-8 text-center text-semantic-muted">
                    <p className="text-sm font-semibold">{t('Uyğun departament və ya şöbə tapılmadı')}</p>
                    <p className="text-micro mt-1">{t('Axtarış sözünü dəyişməyə cəhd edin')}</p>
                  </div>
                ) : (
                  filteredDepartments.map((dept) => {
                    const isSelected = activeDepartmentId === dept.id;
                    const sections = dept.sections || [];
                    return (
                      <div
                        key={dept.id}
                        onClick={() => handleSelectDept(dept.id)}
                        className={`group p-3 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-semantic-brand/10 border-semantic-brand shadow-xs'
                            : 'bg-semantic-panel border-semantic-border hover:bg-semantic-subtle hover:border-semantic-border-strong'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-semantic-subtle border border-semantic-border flex items-center justify-center shrink-0 mt-0.5">
                              {getDeptIcon(dept.code)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm text-semantic-primary leading-tight">
                                  {dept.name}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-micro font-mono font-bold bg-semantic-subtle text-semantic-secondary border border-semantic-border">
                                  {dept.code}
                                </span>
                              </div>

                              {/* Member & Task counts */}
                              <div className="flex items-center gap-3 text-micro text-semantic-muted mt-1">
                                {dept.memberCount !== undefined && (
                                  <span className="flex items-center gap-1">
                                    <Users className="w-3 h-3 text-semantic-muted" />
                                    {dept.memberCount} {t('əməkdaş')}
                                  </span>
                                )}
                                {dept.activeTaskCount !== undefined && dept.activeTaskCount > 0 && (
                                  <span className="font-bold text-semantic-brand">
                                    ⚡ {dept.activeTaskCount} {t('aktiv iş')}
                                  </span>
                                )}
                                {dept.managerName && (
                                  <span className="truncate max-w-[150px]">
                                    👤 {dept.managerName}
                                  </span>
                                )}
                              </div>

                              {/* Child Sections (Şöbələr) */}
                              {sections.length > 0 && (
                                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                                  <span className="text-micro font-bold text-semantic-muted">
                                    {t('Şöbələr')}:
                                  </span>
                                  {sections.slice(0, 3).map((sec) => (
                                    <span
                                      key={sec.id}
                                      className="px-1.5 py-0.5 rounded-md text-micro bg-semantic-panel border border-semantic-border text-semantic-secondary truncate max-w-[140px]"
                                    >
                                      {sec.name}
                                    </span>
                                  ))}
                                  {sections.length > 3 && (
                                    <span className="text-micro font-mono text-semantic-muted">
                                      +{sections.length - 3}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Selected Checkmark */}
                          {isSelected && (
                            <div className="w-6 h-6 rounded-full bg-semantic-brand text-white flex items-center justify-center shrink-0 mt-1">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            ) : (
              /* Companies Tab */
              <>
                {filteredCompanies.map((comp) => {
                  const isSelected = selectedCompanyId === comp.id;
                  return (
                    <div
                      key={comp.id}
                      onClick={() => handleSelectCompany(comp)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-semantic-brand/10 border-semantic-brand shadow-xs'
                          : 'bg-semantic-panel border-semantic-border hover:bg-semantic-subtle hover:border-semantic-border-strong'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-semantic-subtle border border-semantic-border flex items-center justify-center text-semantic-brand shrink-0">
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-semantic-primary">
                                {comp.name}
                              </span>
                              <span className="px-1.5 py-0.5 rounded-full text-micro font-bold bg-semantic-brand/15 text-semantic-brand border border-semantic-brand/30">
                                {comp.badge}
                              </span>
                            </div>
                            <p className="text-micro text-semantic-muted mt-1 leading-relaxed">
                              {comp.description}
                            </p>

                            <div className="flex items-center gap-3 text-micro text-semantic-secondary mt-2">
                              <span>👥 {comp.employeeCount} {t('əməkdaş')}</span>
                              <span>🏛️ {comp.departmentsCount} {t('departament')}</span>
                              <span className="px-1.5 py-0.5 rounded text-micro font-mono bg-semantic-subtle border border-semantic-border">
                                {comp.securityTier}
                              </span>
                            </div>
                          </div>
                        </div>

                        {isSelected && (
                          <div className="w-6 h-6 rounded-full bg-semantic-brand text-white flex items-center justify-center shrink-0 mt-1">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Bottom Footer Actions */}
          <div className="p-3 border-t border-semantic-border bg-semantic-subtle/70 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                if (onNavigate) onNavigate('admin-departments');
              }}
              className="flex items-center gap-1.5 text-semantic-brand hover:text-semantic-brand/80 font-bold transition-colors"
            >
              <span>{t('Departamentlər Mərkəzi')}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <span className="text-micro font-mono text-semantic-muted">
              AD Synced • Tier-1
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
