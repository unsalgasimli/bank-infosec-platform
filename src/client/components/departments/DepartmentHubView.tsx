import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Shield,
  Server,
  Users,
  CreditCard,
  CheckSquare,
  ArrowRight,
  Search,
  Zap,
  Lock,
  Layers,
  Sparkles,
  Settings,
  X,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { BankDepartment } from '../../../shared/types/auth.js';

interface DepartmentHubViewProps {
  onSelectDepartment: (deptId: string) => void;
  onNavigate: (view: string, id?: string) => void;
}

export const DepartmentHubView: React.FC<DepartmentHubViewProps> = ({
  onSelectDepartment,
  onNavigate,
}) => {
  const { currentUser, fetchWithAuth } = useAuth();
  const [departments, setDepartments] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDivision, setSelectedDivision] = useState<string>('ALL');
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
      if (data.success) {
        setDepartments(data.departments || []);
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
        setToastMessage(`Department "${data.department?.name}" successfully created!`);
        setIsCreateModalOpen(false);
        setNewDeptName('');
        setNewDeptCode('');
        setNewDeptDesc('');
        loadDepartments();
        setTimeout(() => setToastMessage(null), 4000);
      } else {
        alert(`Failed to create department: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
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

  const filteredDepts = departments.filter((d) => {
    const matchesSearch =
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDiv = selectedDivision === 'ALL' || d.divisionId === selectedDivision;
    return matchesSearch && matchesDiv;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-semantic-page overflow-hidden select-none">
      {/* Header Bar */}
      <div className="bg-semantic-panel border-b border-semantic-border px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-semantic-success-surface text-semantic-brand border border-semantic-success-border flex items-center justify-center font-bold shadow-xs">
            <Building2 className="w-5 h-5 text-semantic-brand" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-extrabold text-semantic-primary tracking-tight">
                Bank Departments Hub & Scoped Administration
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-semantic-success-surface text-semantic-success text-caption font-bold border border-semantic-success-border">
                Enterprise Multi-Dept RBAC
              </span>
            </div>
            <p className="text-xs text-semantic-jira-muted-strong mt-0.5">
              Manage IT, Infosec, HR, Core Banking, and GRC departments with scoped administrators, templates, connections & flows.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigate('cross-tasks')}
            className="px-3.5 py-2 rounded-lg bg-semantic-subtle hover:bg-semantic-neutral-surface text-semantic-primary border border-semantic-border text-xs font-bold flex items-center gap-2 transition-all shadow-xs"
          >
            <Layers className="w-4 h-4 text-semantic-info" />
            <span>Cross-Dept Workflows</span>
          </button>

          {isSuperAdmin && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="wrike-btn-primary px-3.5 py-2 text-xs font-bold flex items-center gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Create Department</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Filter & Department Cards Grid */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-5">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* Toast Notification */}
          {toastMessage && (
            <div className="p-3.5 rounded-lg bg-semantic-success-surface border border-semantic-success-border text-xs font-semibold text-semantic-success flex items-center gap-2 shadow-sm animate-fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-semantic-panel p-3 rounded-xl border border-semantic-border shadow-xs">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-semantic-jira-icon absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search departments by name, code or function..."
                className="w-full pl-9 pr-3 py-1.5 bg-semantic-subtle border border-semantic-border rounded-lg text-xs font-medium text-semantic-primary focus:outline-none focus:border-semantic-brand"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto">
              {[
                { id: 'ALL', label: 'Bütün Diviziyalar' },
                { id: 'div-sec', label: 'İnformasiya Təhlükəsizliyi' },
                { id: 'div-it', label: 'İnformasiya Texnologiyaları' },
                { id: 'div-banking', label: 'Bank əməliyyatları və biznes' },
                { id: 'div-hr', label: 'İnsan Resursları' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedDivision(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                    selectedDivision === tab.id
                      ? 'bg-semantic-primary text-white'
                      : 'bg-semantic-subtle text-semantic-jira-muted-strong hover:bg-semantic-border-subtle hover:text-semantic-primary'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Department Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredDepts.map((dept) => {
              const Icon = getDeptIcon(dept.icon || 'Building2');
              const isUserAdminHere = dept.isDeptAdmin || isSuperAdmin;
              const sobeCount = (dept.sections || []).filter((s: any) => s.sectionType === 'SOBE' || !s.parentSectionId).length;
              const bolmeCount = (dept.sections || []).filter((s: any) => s.sectionType === 'BOLME' || s.parentSectionId).length;

              return (
                <div
                  key={dept.id}
                  className="bg-semantic-panel border border-semantic-border hover:border-semantic-border-strong rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-all group"
                  style={{ borderTop: `4px solid ${dept.color || 'var(--color-jira-blue-500)'}` }}
                >
                  {/* Card Header */}
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-xs"
                          style={{ backgroundColor: dept.color || 'var(--color-jira-blue-500)' }}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-caption font-extrabold uppercase px-2 py-0.5 rounded bg-semantic-neutral-surface text-semantic-secondary border border-semantic-border">
                              {dept.code}
                            </span>
                            {isUserAdminHere && (
                              <span className="px-2 py-0.5 rounded-full bg-semantic-success-surface text-semantic-success text-micro font-extrabold border border-semantic-success-border">
                                ADMIN ACCESS
                              </span>
                            )}
                          </div>
                          <h3 className="font-extrabold text-sm text-semantic-primary mt-1 leading-snug group-hover:text-semantic-info transition-colors">
                            {dept.name}
                          </h3>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-semantic-jira-muted-strong leading-relaxed line-clamp-2 mt-2">
                      {dept.description}
                    </p>

                    <div className="mt-3 rounded-lg border border-semantic-border bg-semantic-subtle/60 px-3 py-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-caption font-extrabold uppercase tracking-wide text-semantic-jira-muted-strong">
                          Şöbə və Bölmələr
                        </span>
                        <span className="text-caption font-bold text-semantic-info">
                          {sobeCount > 0 ? `${sobeCount} Şöbə${bolmeCount > 0 ? `, ${bolmeCount} Bölmə` : ''}` : 'Kataloq'}
                        </span>
                      </div>
                      {(dept.sections?.length || 0) > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {dept.sections.slice(0, 4).map((section: any) => (
                            <span
                              key={section.id}
                              className={`px-2 py-0.5 rounded-full border text-micro font-semibold ${
                                section.sectionType === 'BOLME'
                                  ? 'bg-semantic-info/10 text-semantic-info border-semantic-info/30'
                                  : 'bg-semantic-panel border-semantic-border text-semantic-primary'
                              }`}
                              title={`${section.sectionType === 'BOLME' ? 'Bölmə' : 'Şöbə'}: ${section.name}`}
                            >
                              {section.sectionType === 'BOLME' ? `↳ ${section.name}` : section.name}
                            </span>
                          ))}
                          {(dept.sectionCount || dept.sections.length) > 4 && (
                            <span className="px-2 py-0.5 rounded-full bg-semantic-neutral-surface text-micro font-semibold text-semantic-secondary">
                              +{(dept.sectionCount || dept.sections.length) - 4} əlavə
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="text-caption text-semantic-jira-muted-strong mt-1">
                          Kataloqda aktiv şöbə yoxdur
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Resource Badges */}
                  <div className="grid grid-cols-3 gap-2 py-2.5 border-y border-semantic-neutral-surface text-center">
                    <div className="p-2 rounded-lg bg-semantic-subtle">
                      <div className="text-caption text-semantic-jira-icon font-bold uppercase">Staff</div>
                      <div className="text-xs font-extrabold text-semantic-primary mt-0.5">
                        {dept.memberCount || 0} Members
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-semantic-subtle">
                      <div className="text-caption text-semantic-jira-icon font-bold uppercase">Connectors</div>
                      <div className="text-xs font-extrabold text-semantic-success mt-0.5">
                        {dept.connectionCount || 0} Linked
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-semantic-subtle">
                      <div className="text-caption text-semantic-jira-icon font-bold uppercase">Active Tasks</div>
                      <div className="text-xs font-extrabold text-semantic-info mt-0.5">
                        {dept.activeTaskCount || 0} Tasks
                      </div>
                    </div>
                  </div>

                  {/* Department Admin & SLA Summary */}
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between text-label">
                      <span className="text-semantic-jira-muted-strong font-semibold">Department Manager:</span>
                      <span className="font-bold text-semantic-primary truncate max-w-[180px]">
                        {dept.managerName || 'Not assigned'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-label">
                      <span className="text-semantic-jira-muted-strong font-semibold">SLA Targets:</span>
                      <span className="font-mono text-semantic-success font-bold">
                        P1: {dept.settings?.criticalSlaHours || 2}h | Standard: {dept.settings?.defaultSlaHours || 24}h
                      </span>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="pt-2">
                    <button
                      onClick={() => onSelectDepartment(dept.id)}
                      className="w-full py-2 px-3 rounded-lg bg-semantic-subtle hover:bg-semantic-primary text-semantic-primary hover:text-white border border-semantic-border hover:border-transparent text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-xs group-hover:bg-semantic-primary group-hover:text-white"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>
                        {isUserAdminHere ? 'Manage Department & Settings' : 'View Department Hub'}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-70" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Create Department Modal (Super Admin) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-dsDialog flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4">
          <div className="bg-semantic-panel border border-semantic-border rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between border-b border-semantic-border pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-semantic-success-surface text-semantic-brand flex items-center justify-center font-bold">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-semantic-primary">Create Bank Department</h3>
                  <p className="text-xs text-semantic-jira-muted-strong">Provision new organizational unit, admin roles and SLA policies.</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg text-semantic-jira-icon hover:text-semantic-primary hover:bg-semantic-subtle"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDepartment} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-semantic-primary mb-1">Department Name *</label>
                  <input
                    type="text"
                    required
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                    placeholder="e.g. Anti-Money Laundering & Fraud"
                    className="w-full px-3 py-2 bg-semantic-subtle border border-semantic-border rounded-lg text-xs font-medium focus:outline-none focus:border-semantic-brand"
                  />
                </div>

                <div>
                  <label className="block font-bold text-semantic-primary mb-1">Department Code *</label>
                  <input
                    type="text"
                    required
                    value={newDeptCode}
                    onChange={(e) => setNewDeptCode(e.target.value)}
                    placeholder="e.g. AML_FRAUD"
                    className="w-full px-3 py-2 bg-semantic-subtle border border-semantic-border rounded-lg text-xs font-mono font-bold uppercase focus:outline-none focus:border-semantic-brand"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-semantic-primary mb-1">Division Alignment</label>
                <select
                  value={newDeptDivision}
                  onChange={(e) => setNewDeptDivision(e.target.value)}
                  className="w-full px-3 py-2 bg-semantic-subtle border border-semantic-border rounded-lg text-xs font-medium focus:outline-none focus:border-semantic-brand"
                >
                  <option value="div-sec">Information Security & Cyber Defense</option>
                  <option value="div-it">Information Technology & Cloud Infrastructure</option>
                  <option value="div-banking">Retail & Corporate Banking Systems</option>
                  <option value="div-hr">Human Resources & Corporate Governance</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-semantic-primary mb-1">Description & Purpose</label>
                <textarea
                  rows={2}
                  value={newDeptDesc}
                  onChange={(e) => setNewDeptDesc(e.target.value)}
                  placeholder="Primary banking duties, functions and scope..."
                  className="w-full px-3 py-2 bg-semantic-subtle border border-semantic-border rounded-lg text-xs font-medium focus:outline-none focus:border-semantic-brand"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-semantic-primary mb-1">Brand Color Accent</label>
                  <div className="flex items-center gap-2">
                    {['#0052CC', '#00875A', '#6554C0', '#FF5630', '#00B8D9', '#E51739'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewDeptColor(c)}
                        className={`w-6 h-6 rounded-full border-2 transition-transform ${
                          newDeptColor === c ? 'scale-110 border-semantic-primary' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-semantic-primary mb-1">Department Icon</label>
                  <select
                    value={newDeptIcon}
                    onChange={(e) => setNewDeptIcon(e.target.value)}
                    className="w-full px-3 py-1.5 bg-semantic-subtle border border-semantic-border rounded-lg text-xs font-medium focus:outline-none focus:border-semantic-brand"
                  >
                    <option value="Shield">Shield (Security)</option>
                    <option value="Server">Server (Infrastructure)</option>
                    <option value="Users">Users (HR/People)</option>
                    <option value="CreditCard">CreditCard (Payments/Core)</option>
                    <option value="CheckSquare">CheckSquare (Compliance/Audit)</option>
                    <option value="Building2">Building2 (General)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-semantic-subtle rounded-lg border border-semantic-border">
                <div>
                  <label className="block font-semibold text-semantic-jira-muted-strong mb-1">Standard SLA (Hours)</label>
                  <input
                    type="number"
                    value={newDeptSla}
                    onChange={(e) => setNewDeptSla(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-semantic-panel border border-semantic-border rounded text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-semantic-jira-muted-strong mb-1">Critical P1 SLA (Hours)</label>
                  <input
                    type="number"
                    value={newDeptCriticalSla}
                    onChange={(e) => setNewDeptCriticalSla(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-semantic-panel border border-semantic-border rounded text-xs font-mono font-bold text-semantic-brand-danger"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-semantic-border">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-semantic-subtle hover:bg-semantic-border-subtle text-semantic-jira-muted-strong font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="wrike-btn-primary px-5 py-2 text-xs font-bold flex items-center gap-2"
                >
                  {isSubmitting ? 'Creating...' : 'Provision Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
