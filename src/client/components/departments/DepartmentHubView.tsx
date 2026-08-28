import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Plus,
  Shield,
  Server,
  Users,
  CreditCard,
  CheckSquare,
  Search,
  Layers,
  Settings,
  X,
  CheckCircle2,
  ChevronRight,
  LayoutGrid,
  List,
  ShieldCheck,
  Link2,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../context/I18nContext.js';

interface DepartmentHubViewProps {
  onSelectDepartment: (deptId: string) => void;
  onNavigate: (view: string, id?: string) => void;
}

const DIVISION_CONFIG: Record<string, { label: string; shortLabel: string }> = {
  ALL: { label: 'Bütün Diviziyalar', shortLabel: 'Hamısı' },
  'div-sec': { label: 'İnformasiya Təhlükəsizliyi', shortLabel: 'Təhlükəsizlik' },
  'div-it': { label: 'İnformasiya Texnologiyaları', shortLabel: 'İT & İnfrastruktur' },
  'div-banking': { label: 'Bank əməliyyatları və biznes', shortLabel: 'Bank & Biznes' },
  'div-hr': { label: 'İnsan Resursları', shortLabel: 'İnsan Resursları' },
};

const DEPARTMENT_GROUPS = [
  { id: 'div-sec', label: 'Təhlükəsizlik və risk', keywords: ['təhlükəsizlik', 'informasiya təhlükəsizliyi', 'kiber', 'risk', 'soc', 'dlp', 'fraud', 'fırıldaq', 'audit', 'uyğunluq'] },
  { id: 'div-it', label: 'İT və infrastruktur', keywords: ['informasiya texnologiyaları', 'infrastruktur', 'şəbəkə', 'network', 'server', 'sistem', 'texniki dəstək', 'help desk', 'it ', 'it&', 'digital', 'proqram'] },
  { id: 'div-banking', label: 'Bankçılıq və maliyyə', keywords: ['bank', 'biznes', 'maliyyə', 'kredit', 'ödəniş', 'xəzinə', 'filial', 'kart', 'cash', 'expresspay', 'əməliyyat'] },
  { id: 'div-hr', label: 'İnsan və təşkilat', keywords: ['insan resursları', 'əmək', 'personal', 'işə qəbul', 'hr ', 'təlim', 'inkişaf'] },
  { id: 'group-governance', label: 'Hüquq və idarəetmə', keywords: ['hüquq', 'legal', 'korporativ', 'idarəetmə', 'katiblik', 'sənəd', 'arxiv'] },
  { id: 'group-operations', label: 'Əməliyyat və təminat', keywords: ['satınalma', 'təchizat', 'təsərrüfat', 'logistika', 'anbar', 'inzibati', 'xidmət'] },
  { id: 'group-other', label: 'Digər təşkilati vahidlər', keywords: [] },
] as const;

const getDepartmentGroupId = (department: any) => {
  const divisionId = department.divisionId || department.division_id;
  const haystack = [
    department.name,
    department.description,
    department.code,
    ...(department.sections || []).flatMap((section: any) => [section.name, section.code]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('az-AZ');
  const nameGroup = DEPARTMENT_GROUPS.find((group) => group.keywords.some((keyword) => haystack.includes(keyword)));
  return nameGroup?.id || (DIVISION_CONFIG[divisionId] ? divisionId : 'group-other');
};

const getDepartmentGroupLabel = (department: any) =>
  DEPARTMENT_GROUPS.find((group) => group.id === getDepartmentGroupId(department))?.label || 'Digər təşkilati vahidlər';

export const DepartmentHubView: React.FC<DepartmentHubViewProps> = ({
  onSelectDepartment,
  onNavigate,
}) => {
  const { currentUser, fetchWithAuth } = useAuth();
  const { t } = useI18n();
  const [departments, setDepartments] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDivision, setSelectedDivision] = useState<string>('ALL');
  const [selectedScope, setSelectedScope] = useState<'ALL' | 'MINE' | 'TASKS' | 'STRUCTURE'>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // New Department Form State
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptCode, setNewDeptCode] = useState('');
  const [newDeptDivision, setNewDeptDivision] = useState('div-sec');
  const [newDeptDesc, setNewDeptDesc] = useState('');
  const [newDeptColor, setNewDeptColor] = useState('#0052CC');
  const [newDeptIcon, setNewDeptIcon] = useState('Building2');
  const [newDeptSla, setNewDeptSla] = useState('24');
  const [newDeptCriticalSla, setNewDeptCriticalSla] = useState('2');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const isSuperAdmin =
    currentUser?.roles?.includes('PLATFORM_ADMIN') || currentUser?.roles?.includes('CISO');

  const loadDepartments = async () => {
    try {
      setIsLoading(true);
      const res = await fetchWithAuth('/api/departments');
      const data = await res.json();
      if (data.success && Array.isArray(data.departments)) {
        setDepartments(data.departments);
      }
    } catch (err) {
      console.error('Failed to load departments', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDepartments();
  }, [currentUser]);

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName || !newDeptCode) return;

    try {
      setIsSubmitting(true);
      const res = await fetchWithAuth('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newDeptName,
          code: newDeptCode,
          divisionId: newDeptDivision,
          description: newDeptDesc,
          color: newDeptColor,
          icon: newDeptIcon,
          defaultSlaHours: Number(newDeptSla),
          criticalSlaHours: Number(newDeptCriticalSla),
          requireDualApproval: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setToastMessage(`"${data.department?.name}" departamenti uğurla yaradıldı!`);
        setIsCreateModalOpen(false);
        setNewDeptName('');
        setNewDeptCode('');
        setNewDeptDesc('');
        loadDepartments();
        setTimeout(() => setToastMessage(null), 4000);
      } else {
        alert(`Departament yaradılarkən xəta baş verdi: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Xəta: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDeptIcon = (iconName: string) => {
    switch (iconName) {
      case 'Shield':
        return Shield;
      case 'Server':
        return Server;
      case 'Users':
        return Users;
      case 'CreditCard':
        return CreditCard;
      case 'CheckSquare':
        return CheckSquare;
      default:
        return Building2;
    }
  };

  // High-level KPI summary calculations
  const totalStats = useMemo(() => {
    const totalDepts = departments.length;
    const totalMembers = departments.reduce((sum, d) => sum + (Number(d.memberCount) || 0), 0);
    const totalConnections = departments.reduce((sum, d) => sum + (Number(d.connectionCount) || 0), 0);
    const totalTasks = departments.reduce((sum, d) => sum + (Number(d.activeTaskCount) || 0), 0);
    const totalSections = departments.reduce(
      (sum, d) => sum + ((d.sections || []).length || Number(d.sectionCount) || 0),
      0
    );
    return { totalDepts, totalMembers, totalConnections, totalTasks, totalSections };
  }, [departments]);

  // Division counts
  const divisionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    departments.forEach((d) => {
      const groupId = getDepartmentGroupId(d);
      counts[groupId] = (counts[groupId] || 0) + 1;
    });
    return counts;
  }, [departments]);

  const visibleDepartmentGroups = useMemo(
    () => DEPARTMENT_GROUPS.filter((group) => divisionCounts[group.id] > 0),
    [divisionCounts]
  );

  // Filtered departments
  const filteredDepts = useMemo(() => {
    return departments.filter((d) => {
      const q = searchQuery.toLocaleLowerCase('az-AZ').trim();
      const searchableText = [d.name, d.code, d.description, d.managerName, d.divisionName]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('az-AZ');
      const matchesSearch =
        !q || searchableText.includes(q);
      const groupId = getDepartmentGroupId(d);
      const matchesDiv = selectedDivision === 'ALL' || groupId === selectedDivision;
      const hasSections = (d.sections || []).length > 0 || Number(d.sectionCount) > 0;
      const matchesScope =
        selectedScope === 'ALL' ||
        (selectedScope === 'MINE' && (d.isDeptAdmin || isSuperAdmin)) ||
        (selectedScope === 'TASKS' && Number(d.activeTaskCount) > 0) ||
        (selectedScope === 'STRUCTURE' && hasSections);
      return matchesSearch && matchesDiv && matchesScope;
    });
  }, [departments, searchQuery, selectedDivision, selectedScope, isSuperAdmin]);

  const hasActiveFilters = Boolean(searchQuery.trim()) || selectedDivision !== 'ALL' || selectedScope !== 'ALL';
  const resetFilters = () => {
    setSearchQuery('');
    setSelectedDivision('ALL');
    setSelectedScope('ALL');
  };

  // Clean description helper
  const cleanDescription = (name: string, desc?: string) => {
    if (!desc) return 'Təşkilati struktur vahidi və departament idarəetmə mərkəzi.';
    return desc;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-semantic-page overflow-hidden select-none">
      {/* Header Bar */}
      <header className="bg-semantic-panel border-b border-semantic-border px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-semantic-brand/10 text-semantic-brand border border-semantic-brand/20 flex items-center justify-center font-bold shadow-xs">
            <Building2 className="w-5 h-5 text-semantic-brand" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-bold text-semantic-primary tracking-tight">
                {t('Departments & Governance Hub')}
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-semantic-brand/10 text-semantic-brand text-caption font-semibold border border-semantic-brand/20">
                {totalStats.totalDepts} {t('Departments')}
              </span>
            </div>
            <p className="text-xs text-semantic-jira-muted-strong mt-0.5">
              {t('Banking structure, security perimeter, departmental SLAs and governance settings')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigate('workflows')}
            className="px-3 py-2 rounded-xl bg-semantic-subtle hover:bg-semantic-neutral-surface text-semantic-primary border border-semantic-border text-xs font-semibold flex items-center gap-2 transition-all shadow-xs"
          >
            <Layers className="w-4 h-4 text-semantic-info" />
            <span>{t('Cross-department workflows')}</span>
          </button>

          {isSuperAdmin && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-semantic-brand hover:bg-semantic-brandHover text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>{t('New Department')}</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
        <div className="max-w-[1500px] mx-auto space-y-4">
          {/* Toast Notification */}
          {toastMessage && (
            <div className="p-3.5 rounded-xl bg-semantic-success-surface border border-semantic-success-border text-xs font-semibold text-semantic-success flex items-center gap-2.5 shadow-sm animate-fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-semantic-success" />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* Quick Metrics Ribbon (Executive Overview) */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="bg-semantic-panel border border-semantic-border/80 rounded-xl p-3 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-caption font-semibold text-semantic-jira-muted-strong uppercase tracking-wider">
                  Departamentlər
                </p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-xl font-bold text-semantic-primary tracking-tight">
                    {totalStats.totalDepts}
                  </span>
                  <span className="text-micro text-semantic-jira-muted-strong font-medium">
                    ({totalStats.totalSections} şöbə/bölmə)
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-semantic-panel border border-semantic-border/80 rounded-xl p-3 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-caption font-semibold text-semantic-jira-muted-strong uppercase tracking-wider">
                  Ümumi Əməkdaşlar
                </p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-xl font-bold text-semantic-primary tracking-tight">
                    {totalStats.totalMembers}
                  </span>
                  <span className="text-micro text-semantic-jira-muted-strong font-medium">
                    heyət üzvü
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-semantic-panel border border-semantic-border/80 rounded-xl p-3 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
                <Link2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-caption font-semibold text-semantic-jira-muted-strong uppercase tracking-wider">
                  Bağlayıcılar
                </p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-xl font-bold text-semantic-primary tracking-tight">
                    {totalStats.totalConnections}
                  </span>
                  <span className="text-micro text-semantic-jira-muted-strong font-medium">
                    inteqrasiya
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-semantic-panel border border-semantic-border/80 rounded-xl p-3 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-caption font-semibold text-semantic-jira-muted-strong uppercase tracking-wider">
                  Aktiv Tapşırıqlar
                </p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-xl font-bold text-semantic-primary tracking-tight">
                    {totalStats.totalTasks}
                  </span>
                  <span className="text-micro text-semantic-jira-muted-strong font-medium">
                    icrada
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Controls Bar: Search + Division Tabs + View Switcher */}
          <div className="bg-semantic-panel p-3 rounded-xl border border-semantic-border shadow-xs space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1 min-w-0 lg:min-w-[280px]">
              <Search className="w-4 h-4 text-semantic-jira-icon absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('Search by department name, code or function...')}
                className="w-full pl-9 pr-8 py-2 bg-semantic-subtle/80 border border-semantic-border rounded-lg text-xs font-medium text-semantic-primary placeholder:text-semantic-placeholder focus:outline-none focus:border-semantic-brand focus:bg-semantic-panel transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-semantic-jira-icon hover:text-semantic-primary p-0.5 rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {hasActiveFilters && (
                <button onClick={resetFilters} className="hidden sm:inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-semibold text-semantic-brand hover:bg-semantic-brand/10 transition-colors">
                  <X className="w-3.5 h-3.5" /> Təmizlə
                </button>
              )}
              {/* View Switcher */}
              <div className="flex items-center bg-semantic-subtle p-0.5 rounded-lg border border-semantic-border shrink-0">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-semantic-panel text-semantic-brand shadow-xs' : 'text-semantic-jira-icon hover:text-semantic-primary'}`}
                  title="Kart görünüşü (Grid)"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-semantic-panel text-semantic-brand shadow-xs' : 'text-semantic-jira-icon hover:text-semantic-primary'}`}
                  title="Cədvəl görünüşü (List)"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
            </div>

            <div className="flex flex-col xl:flex-row xl:items-center gap-2.5">
              <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-0.5 flex-1">
                {[{ id: 'ALL', label: 'Hamısı' }, ...visibleDepartmentGroups].map((group) => {
                  const isSelected = selectedDivision === group.id;
                  return (
                    <button
                      key={group.id}
                      onClick={() => setSelectedDivision(group.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-semantic-primary text-semantic-inverse shadow-xs font-bold'
                          : 'bg-semantic-subtle hover:bg-semantic-neutral-surface text-semantic-secondary hover:text-semantic-primary'
                      }`}
                    >
                      <span>{t(group.label)}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar">
                <span className="hidden md:inline-flex items-center gap-1 text-micro font-semibold uppercase tracking-wider text-semantic-jira-muted-strong mr-1"><SlidersHorizontal className="w-3.5 h-3.5" /> Əlavə filter</span>
                {[
                  ['ALL', 'Hamısı'],
                  ['MINE', 'Admin olduğum'],
                  ['TASKS', 'Aktiv tapşırığı olan'],
                  ['STRUCTURE', 'Strukturu olan'],
                ].map(([id, label]) => (
                  <button key={id} onClick={() => setSelectedScope(id as typeof selectedScope)} className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${selectedScope === id ? 'bg-semantic-brand/10 text-semantic-brand border border-semantic-brand/25' : 'text-semantic-secondary hover:bg-semantic-subtle border border-transparent'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 pt-1 border-t border-semantic-border/60">
              <span className="text-micro text-semantic-jira-muted-strong"><span className="font-bold text-semantic-primary">{filteredDepts.length}</span> departament göstərilir</span>
              {hasActiveFilters && <button onClick={resetFilters} className="sm:hidden text-xs font-semibold text-semantic-brand">Təmizlə</button>}
            </div>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="py-16 text-center">
              <div className="inline-block w-8 h-8 border-3 border-semantic-brand/20 border-t-semantic-brand rounded-full animate-spin" />
              <p className="text-xs text-semantic-jira-muted-strong mt-3 font-medium">
                Departament məlumatları yüklənir...
              </p>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && filteredDepts.length === 0 && (
            <div className="bg-semantic-panel border border-semantic-border rounded-2xl p-12 text-center shadow-xs">
              <div className="w-12 h-12 rounded-2xl bg-semantic-subtle text-semantic-jira-icon flex items-center justify-center mx-auto mb-3">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-semantic-primary">Uyğun departament tapılmadı</h3>
              <p className="text-xs text-semantic-jira-muted-strong mt-1 max-w-sm mx-auto">
                Axtarış sorğunuza və ya seçilmiş filtr parametrlərinə uyğun heç bir departament aşkar edilmədi.
              </p>
              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className="mt-4 px-4 py-2 rounded-xl bg-semantic-brand/10 hover:bg-semantic-brand/20 text-semantic-brand text-xs font-semibold transition-all"
                >
                  Filtrləri sıfırla
                </button>
              )}
            </div>
          )}

          {/* GRID VIEW */}
          {!isLoading && viewMode === 'grid' && filteredDepts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              {filteredDepts.map((dept) => {
                const Icon = getDeptIcon(dept.icon || 'Building2');
                const isUserAdminHere = dept.isDeptAdmin || isSuperAdmin;
                const sobeCount = (dept.sections || []).filter(
                  (s: any) => s.sectionType === 'SOBE' || !s.parentSectionId
                ).length;
                const bolmeCount = (dept.sections || []).filter(
                  (s: any) => s.sectionType === 'BOLME' || s.parentSectionId
                ).length;
                const divisionName = getDepartmentGroupLabel(dept);
                const deptAccentColor = dept.color || '#0052CC';

                return (
                  <div
                    key={dept.id}
                    onClick={() => onSelectDepartment(dept.id)}
                    className="bg-semantic-panel border border-semantic-border hover:border-semantic-brand/40 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-xs hover:shadow-md transition-all duration-200 group cursor-pointer relative overflow-hidden"
                  >
                    {/* Subtle top brand accent line */}
                    <div
                      className="absolute top-0 left-0 right-0 h-1 transition-opacity opacity-80 group-hover:opacity-100"
                      style={{ backgroundColor: deptAccentColor }}
                    />

                    <div>
                      {/* Top Row: Icon + Names + Badges */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold transition-transform group-hover:scale-105"
                            style={{
                              backgroundColor: `${deptAccentColor}18`,
                              color: deptAccentColor,
                            }}
                          >
                            <Icon className="w-5 h-5" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-micro font-medium text-semantic-jira-muted-strong truncate">
                                {divisionName}
                              </span>
                              <span className="font-mono text-micro font-bold uppercase px-1.5 py-0.5 rounded bg-semantic-subtle text-semantic-jira-muted-strong">
                                {dept.code}
                              </span>
                            </div>

                            <h3 className="font-bold text-sm text-semantic-primary mt-0.5 leading-snug group-hover:text-semantic-brand transition-colors truncate">
                              {dept.name}
                            </h3>
                          </div>
                        </div>

                        {/* Admin Badge */}
                        {isUserAdminHere && (
                          <span
                            className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-micro font-bold border border-emerald-500/20 shrink-0 flex items-center gap-1"
                            title="Siz bu departamentin inzibatçısısınız"
                          >
                            <ShieldCheck className="w-3 h-3" />
                            <span>Admin</span>
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-xs text-semantic-jira-muted-strong leading-relaxed line-clamp-2 mt-3 min-h-[34px]">
                        {cleanDescription(dept.name, dept.description)}
                      </p>

                      {/* Sub-sections summary pill */}
                      <div className="mt-3.5 flex items-center justify-between gap-2 p-2 rounded-xl bg-semantic-subtle/70 border border-semantic-border/60 text-xs">
                        <div className="flex items-center gap-2 text-semantic-primary font-medium truncate">
                          <Layers className="w-3.5 h-3.5 text-semantic-brand shrink-0" />
                          <span className="text-micro truncate">
                            {sobeCount > 0
                              ? `${sobeCount} şöbə${bolmeCount > 0 ? `, ${bolmeCount} bölmə` : ''}`
                              : 'Əsas struktur vahidi'}
                          </span>
                        </div>
                        {(dept.sections?.length || 0) > 0 && (
                          <span className="text-micro font-semibold text-semantic-jira-muted-strong shrink-0">
                            {dept.sections.length} vahid
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stats Strip */}
                    <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-semantic-subtle/50 border border-semantic-border/40 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <div className="flex items-center gap-1 text-micro text-semantic-jira-muted-strong font-medium">
                          <Users className="w-3 h-3 text-semantic-jira-icon" />
                          <span>Heyət</span>
                        </div>
                        <div className="text-xs font-bold text-semantic-primary mt-0.5">
                          {dept.memberCount || 0}
                        </div>
                      </div>

                      <div className="flex flex-col items-center justify-center border-x border-semantic-border/60">
                        <div className="flex items-center gap-1 text-micro text-semantic-jira-muted-strong font-medium">
                          <Link2 className="w-3 h-3 text-semantic-jira-icon" />
                          <span>Bağlayıcı</span>
                        </div>
                        <div className="text-xs font-bold text-semantic-primary mt-0.5">
                          {dept.connectionCount || 0}
                        </div>
                      </div>

                      <div className="flex flex-col items-center justify-center">
                        <div className="flex items-center gap-1 text-micro text-semantic-jira-muted-strong font-medium">
                          <CheckCircle2 className="w-3 h-3 text-semantic-jira-icon" />
                          <span>Tapşırıq</span>
                        </div>
                        <div className="text-xs font-bold text-semantic-primary mt-0.5">
                          {dept.activeTaskCount || 0}
                        </div>
                      </div>
                    </div>

                    {/* Footer Row: Manager & SLA + Action */}
                    <div className="space-y-2.5 pt-1">
                      <div className="flex items-center justify-between text-micro text-semantic-jira-muted-strong">
                        <div className="flex items-center gap-1.5 truncate max-w-[55%]">
                          <span className="font-medium text-semantic-jira-muted-strong">Rəhbər:</span>
                          <span className="font-semibold text-semantic-primary truncate">
                            {dept.managerName || 'Təyin olunmayıb'}
                          </span>
                        </div>

                        <div className="font-mono text-micro font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 shrink-0">
                          SLA: {dept.settings?.defaultSlaHours || 24}s · P1: {dept.settings?.criticalSlaHours || 2}s
                        </div>
                      </div>

                      {/* Action Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectDepartment(dept.id);
                        }}
                        className="w-full py-2 px-3 rounded-xl bg-semantic-subtle hover:bg-semantic-brand text-semantic-primary hover:text-white border border-semantic-border hover:border-transparent text-xs font-semibold flex items-center justify-between transition-all group-hover:bg-semantic-brand/10 group-hover:text-semantic-brand group-hover:border-semantic-brand/30"
                      >
                        <span className="flex items-center gap-1.5">
                          <Settings className="w-3.5 h-3.5" />
                          <span>{isUserAdminHere ? 'İdarə et və Tənzimləmələr' : 'Detallara bax'}</span>
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* LIST VIEW (TABLE MODE) */}
          {!isLoading && viewMode === 'list' && filteredDepts.length > 0 && (
            <div className="bg-semantic-panel border border-semantic-border rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-semantic-subtle/80 border-b border-semantic-border text-micro font-bold text-semantic-jira-muted-strong uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">Departament</th>
                      <th className="px-4 py-3.5">Diviziya</th>
                      <th className="px-4 py-3.5">Struktur</th>
                      <th className="px-3 py-3.5 text-center">Heyət</th>
                      <th className="px-3 py-3.5 text-center">Bağlayıcı</th>
                      <th className="px-3 py-3.5 text-center">Tapşırıq</th>
                      <th className="px-4 py-3.5">Rəhbər / SLA</th>
                      <th className="px-5 py-3.5 text-right">Əməliyyat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-semantic-border/60">
                    {filteredDepts.map((dept) => {
                      const Icon = getDeptIcon(dept.icon || 'Building2');
                      const isUserAdminHere = dept.isDeptAdmin || isSuperAdmin;
                      const divisionName = getDepartmentGroupLabel(dept);
                      const deptAccentColor = dept.color || '#0052CC';
                      const sectionCount = (dept.sections || []).length || dept.sectionCount || 0;

                      return (
                        <tr
                          key={dept.id}
                          onClick={() => onSelectDepartment(dept.id)}
                          className="hover:bg-semantic-subtle/50 transition-colors cursor-pointer group"
                        >
                          {/* Name + Icon + Code */}
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold"
                                style={{
                                  backgroundColor: `${deptAccentColor}18`,
                                  color: deptAccentColor,
                                }}
                              >
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-semantic-primary group-hover:text-semantic-brand transition-colors truncate">
                                    {dept.name}
                                  </span>
                                  {isUserAdminHere && (
                                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 text-micro font-bold border border-emerald-500/20">
                                      Admin
                                    </span>
                                  )}
                                </div>
                                <span className="font-mono text-micro text-semantic-jira-muted-strong">
                                  {dept.code}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Division */}
                          <td className="px-4 py-3.5 text-semantic-secondary font-medium">
                            {divisionName}
                          </td>

                          {/* Structure */}
                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center gap-1 text-micro font-semibold text-semantic-primary bg-semantic-subtle px-2 py-0.5 rounded-md border border-semantic-border/50">
                              <Layers className="w-3 h-3 text-semantic-jira-icon" />
                              {sectionCount > 0 ? `${sectionCount} vahid` : 'Əsas'}
                            </span>
                          </td>

                          {/* Members */}
                          <td className="px-3 py-3.5 text-center font-semibold text-semantic-primary">
                            {dept.memberCount || 0}
                          </td>

                          {/* Connectors */}
                          <td className="px-3 py-3.5 text-center font-semibold text-semantic-primary">
                            {dept.connectionCount || 0}
                          </td>

                          {/* Active Tasks */}
                          <td className="px-3 py-3.5 text-center font-semibold text-semantic-primary">
                            {dept.activeTaskCount || 0}
                          </td>

                          {/* Manager & SLA */}
                          <td className="px-4 py-3.5">
                            <div className="text-micro font-medium text-semantic-primary truncate max-w-[150px]">
                              {dept.managerName || 'Təyin olunmayıb'}
                            </div>
                            <div className="font-mono text-micro text-emerald-600">
                              P1: {dept.settings?.criticalSlaHours || 2}s · Std: {dept.settings?.defaultSlaHours || 24}s
                            </div>
                          </td>

                          {/* Action */}
                          <td className="px-5 py-3.5 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectDepartment(dept.id);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-semantic-subtle hover:bg-semantic-brand hover:text-white text-semantic-primary text-micro font-semibold transition-all border border-semantic-border"
                            >
                              İdarə et
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Department Modal (Super Admin) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-dsDialog flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-semantic-panel border border-semantic-border rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-semantic-border pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-semantic-brand/10 text-semantic-brand border border-semantic-brand/20 flex items-center justify-center font-bold">
                  <Building2 className="w-5 h-5 text-semantic-brand" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-semantic-primary">Yeni Bank Departamenti Yarat</h3>
                  <p className="text-xs text-semantic-jira-muted-strong">
                    Təşkilati vahid, inzibatçı rolları və SLA parametrləri
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-lg text-semantic-jira-icon hover:text-semantic-primary hover:bg-semantic-subtle transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateDepartment} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-semibold text-semantic-primary mb-1">
                    Departament Adı <span className="text-semantic-brand-danger">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                    placeholder="məs. Maliyyə Monitorinqi və AML"
                    className="w-full px-3 py-2 bg-semantic-subtle border border-semantic-border rounded-xl text-xs font-medium focus:outline-none focus:border-semantic-brand transition-colors"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-semantic-primary mb-1">
                    Departament Kodu <span className="text-semantic-brand-danger">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newDeptCode}
                    onChange={(e) => setNewDeptCode(e.target.value.toUpperCase())}
                    placeholder="məs. AML_FRAUD"
                    className="w-full px-3 py-2 bg-semantic-subtle border border-semantic-border rounded-xl text-xs font-mono font-bold uppercase focus:outline-none focus:border-semantic-brand transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-semantic-primary mb-1">Diviziya Təyinatı</label>
                <select
                  value={newDeptDivision}
                  onChange={(e) => setNewDeptDivision(e.target.value)}
                  className="w-full px-3 py-2 bg-semantic-subtle border border-semantic-border rounded-xl text-xs font-medium focus:outline-none focus:border-semantic-brand transition-colors"
                >
                  <option value="div-sec">İnformasiya Təhlükəsizliyi (Cyber Defense)</option>
                  <option value="div-it">İnformasiya Texnologiyaları (Cloud & Infra)</option>
                  <option value="div-banking">Bank əməliyyatları və biznes</option>
                  <option value="div-hr">İnsan Resursları və İdarəetmə</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-semantic-primary mb-1">Təyinat və Funksiyalar</label>
                <textarea
                  rows={2}
                  value={newDeptDesc}
                  onChange={(e) => setNewDeptDesc(e.target.value)}
                  placeholder="Departamentin əsas bank vəzifələri və əməliyyat sahəsi..."
                  className="w-full px-3 py-2 bg-semantic-subtle border border-semantic-border rounded-xl text-xs font-medium focus:outline-none focus:border-semantic-brand transition-colors resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-semibold text-semantic-primary mb-1.5">Brend Rəngi</label>
                  <div className="flex items-center gap-2">
                    {['#0052CC', '#00875A', '#6554C0', '#FF5630', '#00B8D9', '#E51739'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewDeptColor(c)}
                        className={`w-6 h-6 rounded-full border-2 transition-transform ${
                          newDeptColor === c ? 'scale-115 border-semantic-primary shadow-xs' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-semantic-primary mb-1">İkon</label>
                  <select
                    value={newDeptIcon}
                    onChange={(e) => setNewDeptIcon(e.target.value)}
                    className="w-full px-3 py-1.5 bg-semantic-subtle border border-semantic-border rounded-xl text-xs font-medium focus:outline-none focus:border-semantic-brand transition-colors"
                  >
                    <option value="Shield">Qalxan (Təhlükəsizlik)</option>
                    <option value="Server">Server (İnfrastruktur / İT)</option>
                    <option value="Users">İstifadəçilər (HR / Heyət)</option>
                    <option value="CreditCard">Ödəniş / Bankçılıq</option>
                    <option value="CheckSquare">Uyğunluq / Audit</option>
                    <option value="Building2">Bina (Ümumi)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-semantic-subtle/80 rounded-xl border border-semantic-border">
                <div>
                  <label className="block font-medium text-semantic-jira-muted-strong mb-1">Standart SLA (Saat)</label>
                  <input
                    type="number"
                    value={newDeptSla}
                    onChange={(e) => setNewDeptSla(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-semantic-panel border border-semantic-border rounded-lg text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-medium text-semantic-jira-muted-strong mb-1">Kritik P1 SLA (Saat)</label>
                  <input
                    type="number"
                    value={newDeptCriticalSla}
                    onChange={(e) => setNewDeptCriticalSla(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-semantic-panel border border-semantic-border rounded-lg text-xs font-mono font-bold text-semantic-brand-danger"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-semantic-border">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-semantic-subtle hover:bg-semantic-neutral-surface text-semantic-secondary font-semibold text-xs transition-colors"
                >
                  Ləğv et
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-semantic-brand hover:bg-semantic-brandHover text-white text-xs font-semibold flex items-center gap-2 shadow-xs transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Yaradılır...' : 'Departamenti Yarat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
