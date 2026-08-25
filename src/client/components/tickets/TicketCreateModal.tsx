import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  UploadCloud,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import type { BusinessImpact, BusinessPriority, Ticket, TicketCategory, TicketCategoryOption, TicketIntakeCategoryOption } from '../../../shared/types/ticket.js';
import type { TicketUrgency } from '../../../shared/types/itsm.js';

interface TicketCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  applications?: unknown[];
  assets?: unknown[];
  onCreated: (ticket: Ticket) => void;
}

type IntakeData = {
  requester: { id: string; fullName: string; title: string; departmentId: string };
  canAssignDirect: boolean;
  directory: { ready: boolean; message?: string };
  departments: Array<{ id: string; name: string; code: string }>;
  sections: Array<{ id: string; departmentId: string; name: string; code: string }>;
  teams: Array<{ id: string; departmentId: string; name: string; code: string }>;
  assignees: Array<{ id: string; fullName: string; title: string; departmentId: string; sectionId?: string; sectionName?: string; sectionCode?: string; teamIds: string[] }>;
  slaPolicies: Array<{ id: string; name: string; description?: string; isDefault?: boolean }>;
  categories: TicketIntakeCategoryOption[];
};

type FormState = {
  title: string;
  description: string;
  category: string;
  targetId: string;
  assigneeId: string;
  slaPolicyId: string;
  impact: BusinessImpact;
  urgency: TicketUrgency;
  businessPriority: BusinessPriority;
};

export type DropdownOption = {
  value: string;
  label: string;
  sublabel?: string;
};

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  category: 'GENERAL_REQUEST',
  targetId: '',
  assigneeId: '',
  slaPolicyId: '',
  impact: 'MODERATE',
  urgency: 'MEDIUM',
  businessPriority: 'P3_MEDIUM',
};

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_PENDING_FILES = 5;

const categoryLabel = (category: string) => category.replaceAll('_', ' ').toLocaleLowerCase('az').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase('az'));

const normalizeIntake = (value: unknown): IntakeData => {
  const source = value as IntakeData & { categories?: Array<TicketCategoryOption | TicketIntakeCategoryOption | string> };
  return {
    ...source,
    categories: (source.categories || []).map((category) => typeof category === 'string'
      ? { code: category, label: categoryLabel(category), kind: 'CATEGORY' as const }
      : category),
  } as IntakeData;
};

const categoryExamples: Partial<Record<TicketCategory, string>> = {
  SECURITY_REVIEW: 'Məsələn: Yeni firewall qaydasının təhlükəsizlik baxışı',
  NETWORK_INFRASTRUCTURE: 'Məsələn: Firewall qaydasının yenilənməsi',
  ACCESS_REQUEST: 'Məsələn: Yeni əməkdaş üçün hesabların açılması',
  IAM_REQUEST: 'Məsələn: Tətbiqə giriş icazəsinin verilməsi',
  HR_OPERATIONS: 'Məsələn: Yeni əməkdaşın sistem hesablarının açılması',
  VULNERABILITY: 'Məsələn: Kritik zəifliyin aradan qaldırılması',
  INCIDENT: 'Məsələn: İstehsal sistemində giriş xətası',
};

const categoryTokens: Partial<Record<TicketCategory, string[]>> = {
  NETWORK_INFRASTRUCTURE: ['network', 'şəbəkə', 'net'],
  IT_SUPPORT: ['it', 'support', 'texniki', 'help'],
  SECURITY_REVIEW: ['security', 'təhlükəsizlik', 'infosec'],
  VULNERABILITY: ['security', 'təhlükəsizlik', 'vuln'],
  IAM_REQUEST: ['iam', 'identity', 'giriş', 'access'],
  ACCESS_REQUEST: ['access', 'giriş', 'iam'],
  HR_OPERATIONS: ['hr', 'human', 'insan', 'əmək'],
  FINANCE_PROCUREMENT: ['finance', 'maliyyə', 'procurement', 'satın'],
  COMPLIANCE_LEGAL: ['compliance', 'legal', 'uyğunluq', 'hüquq'],
  DLP_ALERT: ['dlp', 'data loss', 'məlumat'],
};

const impactUrgencyFor = (priority: BusinessPriority): Pick<FormState, 'impact' | 'urgency'> => ({
  P1_URGENT: { impact: 'CATASTROPHIC', urgency: 'CRITICAL' },
  P2_HIGH: { impact: 'SIGNIFICANT', urgency: 'HIGH' },
  P3_MEDIUM: { impact: 'MODERATE', urgency: 'MEDIUM' },
  P4_LOW: { impact: 'MINOR', urgency: 'LOW' },
}[priority] as Pick<FormState, 'impact' | 'urgency'>);

const priorityMeta: Record<BusinessPriority, { short: string; label: string; response: string; resolution: string; tone: string }> = {
  P1_URGENT: { short: 'P1', label: 'Kritik', response: '15 dəq.', resolution: '2 iş saatı', tone: 'border-red-200 bg-red-50 text-red-700' },
  P2_HIGH: { short: 'P2', label: 'Yüksək', response: '1 iş saatı', resolution: '1 iş günü', tone: 'border-orange-200 bg-orange-50 text-orange-700' },
  P3_MEDIUM: { short: 'P3', label: 'Orta', response: '4 iş saatı', resolution: '2 iş günü', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  P4_LOW: { short: 'P4', label: 'Aşağı', response: '8 iş saatı', resolution: '5 iş günü', tone: 'border-slate-200 bg-slate-50 text-slate-600' },
};

const responseJson = async (response: Response) => {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) throw new Error(data?.error || 'Xidmət cavabı alınmadı.');
  return data;
};

const readAsBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Seçilmiş fayl oxuna bilmədi.'));
  reader.onload = () => {
    const value = String(reader.result || '');
    const commaIndex = value.indexOf(',');
    resolve(commaIndex >= 0 ? value.slice(commaIndex + 1) : value);
  };
  reader.readAsDataURL(file);
});

const SearchableDropdown = ({ id, value, onChange, options, placeholder, disabled, searchPlaceholder, ariaLabelledBy }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  ariaLabelledBy?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value);
  const normalizedQuery = query.trim().toLocaleLowerCase('az');
  const visibleOptions = useMemo(() => {
    const matching = normalizedQuery
      ? options.filter((option) => [option.label, option.sublabel, option.value].filter(Boolean).some((candidate) => candidate!.toLocaleLowerCase('az').includes(normalizedQuery)))
      : [...options];
    return matching.sort((left, right) => {
      if (left.value === '') return -1;
      if (right.value === '') return 1;
      return left.label.localeCompare(right.label, 'az');
    });
  }, [normalizedQuery, options]);

  useEffect(() => {
    if (!open) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (!fieldRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [open]);

  useEffect(() => {
    const selectedIndex = visibleOptions.findIndex((option) => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [value, visibleOptions]);

  const selectOption = (option: DropdownOption) => {
    onChange(option.value);
    setQuery('');
    setOpen(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const openAndSearch = () => {
    setOpen(true);
    setQuery('');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, Math.max(visibleOptions.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && visibleOptions[activeIndex]) {
      event.preventDefault();
      selectOption(visibleOptions[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div ref={fieldRef} className="relative w-full">
      <div onClick={(event) => { if (!disabled && event.target !== inputRef.current) { inputRef.current?.focus(); openAndSearch(); } }} className={`flex h-11 w-full items-center rounded-xl border bg-white shadow-sm transition ${open ? 'border-semantic-brand ring-4 ring-semantic-brand/10' : 'border-semantic-border-strong hover:border-semantic-brand/70 hover:bg-slate-50'} ${disabled ? 'border-semantic-border bg-slate-50' : ''}`}>
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={open ? query : selected?.label || ''}
          onFocus={openAndSearch}
          onClick={openAndSearch}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={open ? searchPlaceholder || placeholder : placeholder}
          aria-labelledby={ariaLabelledBy}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          role="combobox"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent px-3.5 text-sm font-medium text-semantic-primary outline-none placeholder:font-normal placeholder:text-semantic-placeholder disabled:cursor-not-allowed disabled:text-semantic-placeholder"
        />
        <ChevronDown aria-hidden="true" className={`mr-3 h-4 w-4 shrink-0 text-semantic-muted transition-transform ${open ? 'rotate-180 text-semantic-brand' : ''}`} />
      </div>
      {open && <div id={`${id}-listbox`} role="listbox" aria-labelledby={ariaLabelledBy} className="absolute left-0 right-0 top-[calc(100%+6px)] z-dsDropdown max-h-72 overflow-y-auto rounded-2xl border border-slate-300 bg-white p-2 shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
        {visibleOptions.map((option, index) => {
          const isSelected = option.value === value;
          const isActive = index === activeIndex;
          return <button key={option.value} type="button" role="option" aria-selected={isSelected} onMouseEnter={() => setActiveIndex(index)} onPointerDown={(event) => { event.preventDefault(); selectOption(option); }} className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition ${isSelected ? 'bg-semantic-success-surface text-semantic-success' : isActive ? 'bg-slate-100 text-semantic-primary' : 'text-semantic-primary hover:bg-slate-50'}`}><span className="min-w-0"><span className={`block truncate text-sm ${isSelected ? 'font-bold' : 'font-semibold'}`}>{option.label}</span>{option.sublabel && <span className="mt-0.5 block truncate text-xs font-normal text-semantic-muted">{option.sublabel}</span>}</span>{isSelected && <Check className="h-4 w-4 shrink-0 text-semantic-success" />}</button>;
        })}
        {!visibleOptions.length && <p className="px-3 py-7 text-center text-sm font-medium text-semantic-muted">Uyğun seçim tapılmadı</p>}
      </div>}
    </div>
  );
};

export const SelectField = ({ label, value, onChange, options, disabled, hint, recommended, searchable, searchPlaceholder, placeholder = 'Seçin' }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  disabled?: boolean;
  hint?: string;
  recommended?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  placeholder?: string;
}) => {
  const fieldId = `ticket-select-${label.toLocaleLowerCase('az').replace(/[^a-z0-9]+/gi, '-')}`;
  const labelId = `${fieldId}-label`;

  return (
    <div className="block">
      <span id={labelId} className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-semantic-strong">
        {label}
        {recommended && <span className="rounded-full bg-semantic-success-surface px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-semantic-success">Tövsiyə olunur</span>}
      </span>
      <SearchableDropdown
        id={fieldId}
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        disabled={disabled}
        searchable={searchable}
        searchPlaceholder={searchPlaceholder}
        ariaLabelledBy={labelId}
      />
      {hint && <span className="mt-1.5 block text-xs text-semantic-muted">{hint}</span>}
    </div>
  );
};

export const TicketCreateModal: React.FC<TicketCreateModalProps> = ({ isOpen, onClose, onCreated }) => {
  const { fetchWithAuth } = useAuth();
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [intake, setIntake] = useState<IntakeData | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAssignees, setLoadingAssignees] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [createdTicketKey, setCreatedTicketKey] = useState('');
  const [targetWasAutoSelected, setTargetWasAutoSelected] = useState(false);
  const [ciOptions, setCiOptions] = useState<DropdownOption[]>([]);
  const [affectedCiId, setAffectedCiId] = useState('');

  const targetOptions = useMemo(() => {
    if (!intake) return [];
    return [...intake.departments.map((unit) => ({ ...unit, kind: 'Departament' })), ...intake.teams.map((unit) => ({ ...unit, kind: 'Komanda' }))].sort((left, right) => left.name.localeCompare(right.name, 'az'));
  }, [intake]);
  const selectedTarget = targetOptions.find((option) => option.id === form.targetId);
  const selectedPriority = form.businessPriority;
  const priority = priorityMeta[selectedPriority] || priorityMeta.P3_MEDIUM;
  const example = categoryExamples[form.category as TicketCategory] || 'Kontekst, gözlənilən nəticə və təsirlənən sistemi yazın…';
  const defaultSla = intake?.slaPolicies.find((policy) => policy.isDefault) || intake?.slaPolicies[0];
  const selectedCategory = intake?.categories.find((category) => category.code === form.category);
  const selectedCategoryLabel = selectedCategory?.label || categoryLabel(form.category);
  const selectedSla = intake?.slaPolicies.find((policy) => policy.id === form.slaPolicyId) || defaultSla;
  const assigneeSelectionLocked = !intake?.directory.ready || !selectedTarget || !intake.canAssignDirect || loadingAssignees;
  const assigneePlaceholder = loadingAssignees
    ? 'İcraçılar yüklənir…'
    : !intake?.canAssignDirect
      ? 'Yalnız bölmə növbəsi'
      : 'Avtomatik / bölmə növbəsi';
  const assigneeHint = !selectedTarget
    ? 'Əvvəlcə icraçı bölməsini seçin.'
    : loadingAssignees
      ? 'Seçilmiş bölmə üzrə icraçılar yüklənir…'
      : !intake?.canAssignDirect
        ? 'Bu hesab üçün birbaşa icraçı seçimi icazəli deyil; iş bölmə növbəsinə yönləndiriləcək.'
        : undefined;

  const categoryRecommendation = useMemo(() => {
    const tokens = selectedCategory?.kind === 'BASIC_TICKET'
      ? ['it', 'help', 'desk', 'texniki']
      : categoryTokens[form.category as TicketCategory] || [];
    if (!tokens.length) return null;
    const ranked = targetOptions.map((target) => {
      const searchable = `${target.name} ${target.code}`.toLocaleLowerCase('az');
      const score = tokens.reduce((total, token) => total + (searchable.includes(token.toLocaleLowerCase('az')) ? 1 : 0), 0);
      return { target, score };
    }).sort((left, right) => right.score - left.score);
    return ranked[0]?.score ? ranked[0].target : null;
  }, [form.category, selectedCategory?.kind, targetOptions]);

  const isDirty = Boolean(form.title.trim() || form.description.trim() || form.targetId || form.assigneeId || affectedCiId || pendingFiles.length);
  const update = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setForm(EMPTY_FORM);
    setPendingFiles([]);
    setCreatedTicketKey('');
    setAffectedCiId('');
    setCiOptions([]);
     setTargetWasAutoSelected(false);
    setIntake(null);
    fetchWithAuth('/api/tickets/intake-options', { signal: controller.signal })
      .then(responseJson)
      .then((data) => {
        if (controller.signal.aborted) return;
         const next = normalizeIntake(data.intake);
        setIntake(next);
         setForm((current) => ({ ...current, category: next.categories.some((category) => category.code === 'GENERAL_REQUEST') ? 'GENERAL_REQUEST' : next.categories[0]?.code || 'GENERAL_REQUEST', slaPolicyId: next.slaPolicies.find((policy) => policy.isDefault)?.id || next.slaPolicies[0]?.id || '' }));
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Intake məlumatı yüklənmədi.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    fetchWithAuth('/api/cmdb/cis?pageSize=100', { signal: controller.signal })
      .then(responseJson)
      .then((data) => { if (!controller.signal.aborted) setCiOptions([{ value: '', label: 'CI seçin (istəyə bağlı)' }, ...(data.cis || []).map((ci: any) => ({ value: ci.id, label: `${ci.ciNumber} — ${ci.name}`, sublabel: `${ci.typeId} · ${ci.environment}` }))]); })
      .catch(() => { if (!controller.signal.aborted) setCiOptions([{ value: '', label: 'CMDB hazır deyil' }]); });
    return () => controller.abort();
  }, [fetchWithAuth, isOpen]);

  useEffect(() => {
    if (!isOpen || loading) return;
    const timer = window.setTimeout(() => titleRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [isOpen, loading]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void submit();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  useEffect(() => {
    if (!isOpen || !form.targetId) return;
    const controller = new AbortController();
    setLoadingAssignees(true);
    fetchWithAuth(`/api/tickets/intake-options?targetId=${encodeURIComponent(form.targetId)}`, { signal: controller.signal })
      .then(responseJson)
       .then((data) => { if (!controller.signal.aborted) setIntake(normalizeIntake(data.intake)); })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'İcraçı siyahısı yüklənmədi.'); })
      .finally(() => { if (!controller.signal.aborted) setLoadingAssignees(false); });
    return () => controller.abort();
  }, [fetchWithAuth, form.targetId, isOpen]);

  if (!isOpen) return null;

  function requestClose() {
    if (createdTicketKey || !isDirty || window.confirm('Yazdığınız məlumatlar itəcək. Pəncərəni bağlamaq istəyirsiniz?')) onClose();
  }

  function changeCategory(value: string) {
    const option = intake?.categories.find((candidate) => candidate.code === value);
    const category = value;
    const recommendedPriority: BusinessPriority = ['INCIDENT', 'INCIDENT_MANAGEMENT', 'VULNERABILITY', 'DLP_ALERT'].includes(category) ? 'P2_HIGH' : 'P3_MEDIUM';
    const tokens = option?.kind === 'BASIC_TICKET' ? ['it', 'help', 'desk', 'texniki'] : categoryTokens[category as TicketCategory] || [];
    const recommendedTarget = targetOptions.map((target) => {
      const searchable = `${target.name} ${target.code}`.toLocaleLowerCase('az');
      const score = tokens.reduce((total, token) => total + (searchable.includes(token.toLocaleLowerCase('az')) ? 1 : 0), 0);
      return { target, score };
    }).sort((left, right) => right.score - left.score)[0];
    const metadataTarget = option?.targetDepartmentId ? targetOptions.find((target) => target.id === option.targetDepartmentId) : undefined;
    const nextTarget = metadataTarget || (recommendedTarget?.score ? recommendedTarget.target : null);
    setForm((current) => ({
      ...current,
      category,
      businessPriority: recommendedPriority,
      ...impactUrgencyFor(recommendedPriority),
      targetId: (!current.targetId || targetWasAutoSelected) && nextTarget ? nextTarget.id : current.targetId,
      assigneeId: (!current.targetId || targetWasAutoSelected) && nextTarget ? '' : current.assigneeId,
    }));
    setTargetWasAutoSelected(Boolean((!form.targetId || targetWasAutoSelected) && nextTarget));
  }

  function changeTarget(value: string) {
    setTargetWasAutoSelected(false);
    setForm((current) => ({ ...current, targetId: value, assigneeId: '' }));
  }

  function changePriority(value: BusinessPriority) {
    setForm((current) => ({ ...current, businessPriority: value, ...impactUrgencyFor(value) }));
  }

  function insertPrompt(prompt: string) {
    const textarea = descriptionRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextValue = `${form.description.slice(0, start)}${prompt}\n${form.description.slice(end)}`;
    update('description', nextValue);
    window.requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + prompt.length + 1;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files);
    const invalid = incoming.find((file) => file.size === 0 || file.size > MAX_UPLOAD_BYTES);
    if (invalid) {
      setError(invalid.size === 0 ? 'Boş fayl əlavə etmək olmur.' : `"${invalid.name}" 25 MB-dan böyükdür.`);
      return;
    }
    setError('');
    setPendingFiles((current) => [...current, ...incoming].slice(0, MAX_PENDING_FILES));
  }

  async function uploadFiles(ticketId: string) {
    const failures: string[] = [];
    for (const file of pendingFiles) {
      try {
        const response = await fetchWithAuth('/api/storage/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId, fileName: file.name, fileBase64: await readAsBase64(file), mimeType: file.type || 'application/octet-stream', evidenceType: 'AUDIT_WORKPAPER', isForensicArtifact: false }),
        });
        await responseJson(response);
      } catch (reason) {
        failures.push(reason instanceof Error ? `${file.name}: ${reason.message}` : file.name);
      }
    }
    return failures;
  }

  async function submit() {
    if (submitting || createdTicketKey) return;
    const nextError = form.title.trim().length < 3 ? 'Başlıq ən azı 3 simvol olmalıdır.' : !form.description.trim() ? 'Təsvir məcburidir.' : '';
    if (nextError) {
      setError(nextError);
      if (nextError.startsWith('Başlıq')) titleRef.current?.focus();
      else descriptionRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const selectedBasicTask = selectedCategory?.kind === 'BASIC_TICKET' && selectedCategory.requestTypeId ? selectedCategory : undefined;
      const response = await fetchWithAuth(selectedBasicTask ? '/api/orchestration/quick-work' : '/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedBasicTask
          ? {
              requestTypeId: selectedBasicTask.requestTypeId,
              idempotencyKey: `new-ticket-${crypto.randomUUID()}`,
              values: {
                summary: form.title.trim(),
                description: form.description.trim(),
                requesterId: intake?.requester.id,
                departmentId: intake?.requester.departmentId,
                targetDepartmentId: form.targetId || selectedBasicTask.targetDepartmentId,
                technicalSeverity: 'MEDIUM',
                businessImpact: form.impact,
                urgency: form.urgency,
                businessPriority: form.businessPriority,
                slaPolicyId: form.slaPolicyId || undefined,
                affectedCiIds: affectedCiId ? [affectedCiId] : undefined,
                routingStrategy: form.targetId ? 'TEAM_QUEUE' : 'DIRECT_USER',
              },
            }
          : { title: form.title.trim(), description: form.description.trim(), category: form.category, ticketTypeId: form.category, ticketTypeName: selectedCategoryLabel, requestTypeId: form.category, requestTypeName: selectedCategoryLabel, technicalSeverity: 'MEDIUM', businessImpact: form.impact, urgency: form.urgency, businessPriority: form.businessPriority, slaPolicyId: form.slaPolicyId || undefined, targetDepartmentId: form.targetId || undefined, assigneeId: intake?.canAssignDirect ? form.assigneeId || undefined : undefined, affectedCiIds: affectedCiId ? [affectedCiId] : undefined, routingStrategy: form.assigneeId ? 'DIRECT_USER' : form.targetId ? 'TEAM_QUEUE' : 'DIRECT_USER' }),
      });
      const data = await responseJson(response);
      if (!data.ticket) throw new Error('Yaradılmış iş server cavabında tapılmadı.');
      const failures = pendingFiles.length ? await uploadFiles(data.ticket.id) : [];
      onCreated(data.ticket);
      if (failures.length) {
        setCreatedTicketKey(data.ticket.key);
        setError(`İş ${data.ticket.key} yaradıldı, lakin ${failures.length} fayl yüklənmədi: ${failures.join('; ')}`);
      } else {
        onClose();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'İş yaradıla bilmədi.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-dsOverlay flex items-center justify-center bg-semantic-modal-tint/60 p-3 backdrop-blur-sm sm:p-5">
      <section role="dialog" aria-modal="true" aria-labelledby="new-work-title" className="flex h-[min(780px,calc(100vh-24px))] w-[min(1120px,100%)] flex-col overflow-hidden rounded-[26px] bg-white shadow-[0_28px_80px_rgba(15,29,50,0.24)] sm:h-[min(780px,calc(100vh-40px))]">
        <header className="flex shrink-0 items-center justify-between border-b border-semantic-border px-5 py-4 sm:px-8 sm:py-5">
          <div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-semantic-success-surface text-semantic-success"><Plus className="h-5 w-5" /></span><div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><h2 id="new-work-title" className="shrink-0 text-base font-bold text-semantic-primary">Yeni iş</h2><span className="max-w-[230px] truncate rounded-full bg-semantic-neutral-surface px-2.5 py-1 text-[11px] font-bold text-semantic-strong">{selectedCategoryLabel}</span></div><p className="truncate text-xs text-semantic-muted">Sorğunu yaradın — yönləndirmə və SLA avtomatik hesablanır</p></div></div>
          <button type="button" onClick={requestClose} aria-label="Bağla" className="rounded-xl p-2 text-semantic-muted transition hover:bg-semantic-neutral-surface hover:text-semantic-primary focus:outline-none focus:ring-4 focus:ring-semantic-brand/10"><X className="h-5 w-5" /></button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
          {loading ? <div className="flex h-full items-center justify-center gap-3 text-sm font-medium text-semantic-muted"><Loader2 className="h-5 w-5 animate-spin text-semantic-brand" /> Məlumatlar yüklənir…</div> : (
            <div className="mx-auto grid max-w-6xl gap-7 min-[900px]:grid-cols-[minmax(0,1.8fr)_minmax(270px,0.9fr)] min-[900px]:gap-8">
              <section aria-labelledby="content-heading" className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-semantic-success">01 · Məzmun</p><h3 id="content-heading" className="mt-2 text-xl font-bold tracking-tight text-semantic-primary">İşinizi izah edin</h3>
                <div className="mt-5 space-y-4">
                  <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-semantic-strong">Başlıq <span className="text-red-600">*</span></span><input ref={titleRef} value={form.title} onChange={(event) => update('title', event.target.value)} onBlur={() => { if (form.title.trim() && form.title.trim().length < 3) setError('Başlıq ən azı 3 simvol olmalıdır.'); }} placeholder={example} aria-invalid={Boolean(error && form.title.trim().length < 3)} className="h-11 w-full rounded-xl border border-semantic-border-strong px-3 text-sm font-medium outline-none transition placeholder:font-normal placeholder:text-semantic-placeholder focus:border-semantic-brand focus:ring-4 focus:ring-semantic-brand/10" /></label>
                  <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-semantic-strong">Təsvir <span className="text-red-600">*</span></span><span className="block overflow-hidden rounded-xl border border-semantic-border-strong transition focus-within:border-semantic-brand focus-within:ring-4 focus-within:ring-semantic-brand/10"><span className="flex flex-wrap items-center gap-1 border-b border-semantic-border bg-slate-50/70 px-2 py-1.5"><span className="mr-1 text-[11px] font-semibold text-semantic-muted">Strukturu tez qurun:</span>{['Problem nədir?', 'Təsir', 'Gözlənilən nəticə'].map((prompt) => <button key={prompt} type="button" onClick={() => insertPrompt(prompt)} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-semantic-muted transition hover:bg-white hover:text-semantic-brand focus:outline-none focus:ring-2 focus:ring-semantic-brand/20">{prompt}</button>)}</span><textarea ref={descriptionRef} rows={7} value={form.description} onChange={(event) => update('description', event.target.value)} onBlur={() => { if (!form.description.trim()) setError('Təsvir məcburidir.'); }} placeholder="Kontekst, təsirlənən sistem və gözlənilən nəticəni yazın…" aria-invalid={Boolean(error && !form.description.trim())} className="block min-h-[168px] w-full resize-y border-0 px-3 py-3 text-sm leading-relaxed outline-none placeholder:text-semantic-placeholder" /></span></label>
                  <SelectField label="Təsirlənən CMDB elementi" value={affectedCiId} onChange={setAffectedCiId} searchable searchPlaceholder="CI nömrəsi, ad və ya host axtarın…" placeholder="CI seçin (istəyə bağlı)" hint="Seçilmiş element biletdə generic CI əlaqəsi kimi saxlanılır; biznes təsiri CMDB asılılıqlarından hesablanır." options={ciOptions} />
                  <div onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragActive(false)} onDrop={(event) => { event.preventDefault(); setDragActive(false); addFiles(event.dataTransfer.files); }} className={`rounded-xl border border-dashed px-4 py-3 transition ${dragActive ? 'border-semantic-brand bg-semantic-brand/5' : 'border-semantic-border-strong bg-slate-50/55 hover:border-semantic-brand/50 hover:bg-slate-50'}`}><input ref={fileInputRef} type="file" multiple className="sr-only" onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.currentTarget.value = ''; }} /><button type="button" onClick={() => fileInputRef.current?.click()} className="flex w-full items-center gap-3 text-left focus:outline-none focus:ring-4 focus:ring-semantic-brand/10"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-semantic-muted shadow-sm"><UploadCloud className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-sm font-semibold text-semantic-strong">Fayl əlavə et</span><span className="block text-xs text-semantic-muted">Buraya sürükləyin və ya seçin · hər fayl 25 MB-a qədər</span></span><Paperclip className="ml-auto h-4 w-4 shrink-0 text-semantic-placeholder" /></button>{pendingFiles.length > 0 && <div className="mt-3 flex flex-wrap gap-2 border-t border-semantic-border pt-3">{pendingFiles.map((file, index) => <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-semantic-strong shadow-sm"><FileText className="h-3.5 w-3.5 text-semantic-muted" /><span className="max-w-[220px] truncate">{file.name}</span><button type="button" onClick={() => setPendingFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} aria-label={`${file.name} faylını sil`} className="ml-1 rounded p-0.5 text-semantic-muted hover:bg-red-50 hover:text-red-600"><X className="h-3 w-3" /></button></span>)}</div>}</div>
                </div>
                {!intake?.directory.ready && <div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>Canlı AD sinxronizasiyası tələb olunur.</strong> {intake?.directory.message}</span></div>}
              </section>

              <aside className="min-w-0 border-t border-semantic-border pt-6 min-[900px]:sticky min-[900px]:top-0 min-[900px]:border-l min-[900px]:border-t-0 min-[900px]:pl-8 min-[900px]:pt-0">
       <section aria-labelledby="routing-heading"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-semantic-success">02 · Yönləndirmə</p><h3 id="routing-heading" className="sr-only">Yönləndirmə</h3><div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5"><UserRound className="h-4 w-4 text-semantic-success" /><span className="min-w-0 truncate text-sm font-bold text-semantic-primary">{intake?.requester.fullName || 'Cari istifadəçi'}</span><span className="ml-auto text-[11px] text-semantic-muted">Müraciət edən</span></div><div className="mt-4 space-y-4"><SelectField label="Kateqoriya" value={form.category} onChange={changeCategory} recommended searchable searchPlaceholder="Kateqoriya axtarın…" placeholder="Kateqoriya seçin" options={[{ value: '', label: 'Kateqoriya seçin' }, ...(intake?.categories || []).map((category) => ({ value: category.code, label: category.label, sublabel: category.kind === 'BASIC_TICKET' ? `${category.catalogGroup || 'IT'} · Help Desk task` : category.description }))]} /><SelectField label="İcraçı bölmə" value={form.targetId} onChange={changeTarget} disabled={!intake?.directory.ready} recommended={Boolean(categoryRecommendation && (!form.targetId || targetWasAutoSelected))} searchable searchPlaceholder="Bölmə və ya kod axtarın…" placeholder="Bölmə seçin" hint={categoryRecommendation && (!form.targetId || targetWasAutoSelected) ? `${categoryRecommendation.name} kateqoriyaya uyğun bölmə kimi təklif edilir.` : undefined} options={[{ value: '', label: 'Bölmə seçin' }, ...targetOptions.map((unit) => ({ value: unit.id, label: unit.name, sublabel: `${unit.kind} · ${unit.code}` }))]} /><SelectField label="İcraçı" value={form.assigneeId} onChange={(value) => update('assigneeId', value)} disabled={assigneeSelectionLocked} searchable searchPlaceholder="Ad, vəzifə və ya istifadəçi axtarın…" placeholder={assigneePlaceholder} hint={assigneeHint} options={[{ value: '', label: assigneePlaceholder }, ...(intake?.assignees || []).map((person) => ({ value: person.id, label: person.fullName, sublabel: [person.sectionName, person.title].filter(Boolean).join(' / ') }))]} /></div>{selectedTarget && <p className="mt-3 flex items-start gap-1.5 text-xs text-semantic-muted"><ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-semantic-success" /> {form.assigneeId ? 'Birbaşa seçilmiş icraçıya yönləndiriləcək.' : `${selectedTarget.name} növbəsinə yönləndiriləcək.`}</p>}</section>

       <section aria-labelledby="priority-heading" className="mt-7 border-t border-semantic-border pt-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-semantic-success">03 · Prioritet &amp; SLA</p><h3 id="priority-heading" className="mt-2 text-lg font-bold tracking-tight text-semantic-primary">Nə qədər təcilidir?</h3></div><Sparkles className="h-4 w-4 text-semantic-success" /></div><div className="mt-4 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Prioritet">{(Object.keys(priorityMeta) as BusinessPriority[]).map((value) => { const meta = priorityMeta[value]; const selected = value === selectedPriority; return <button key={value} type="button" role="radio" aria-checked={selected} onClick={() => changePriority(value)} className={`rounded-lg border px-1 py-2 text-center transition focus:outline-none focus:ring-4 focus:ring-semantic-brand/10 ${selected ? meta.tone : 'border-semantic-border bg-white text-semantic-muted hover:border-semantic-border-strong hover:bg-slate-50'}`}><span className="block text-xs font-extrabold">{meta.short}</span><span className="mt-0.5 block text-[10px] font-semibold">{meta.label}</span>{selected && <Check className="mx-auto mt-1 h-3 w-3" />}</button>; })}</div><div key={`priority-summary-${selectedPriority}`} className="mt-3 rounded-xl bg-semantic-success-surface/70 px-3 py-2.5"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-semantic-success">{priority.short} {priority.label} · xidmət hədəfi</span><CheckCircle2 className="h-4 w-4 text-semantic-success" /></div><p className="mt-1 text-xs text-semantic-strong">Cavab: {priority.response} <span className="mx-1 text-semantic-muted">·</span> Həll: {priority.resolution}</p></div><div className="mt-4"><SelectField label="SLA siyasəti" value={form.slaPolicyId} onChange={(value) => update('slaPolicyId', value)} recommended searchable searchPlaceholder="SLA siyasəti axtarın…" placeholder="Sistem standartı" hint={selectedSla?.description || 'Seçiminiz serverdə yenidən yoxlanılır.'} options={[{ value: '', label: 'Sistem standartı' }, ...(intake?.slaPolicies || []).map((policy) => ({ value: policy.id, label: policy.name, sublabel: policy.description }))]} /></div><div className="mt-4 flex items-start gap-2 text-xs text-semantic-muted"><UsersRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-semantic-success" /><span>{selectedTarget ? `${selectedTarget.name} → ${form.assigneeId ? 'seçilmiş icraçı' : 'növbə'} · ${priority.short} · ${selectedSla?.name || 'Sistem standartı'}` : 'Bölmə seçdikdən sonra yekun yönləndirmə burada görünəcək.'}</span></div></section>
              </aside>
            </div>
          )}
          {error && <div role="alert" className="mx-auto mt-5 flex max-w-6xl items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
        </main>

        <footer className="flex shrink-0 flex-col gap-3 border-t border-semantic-border bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8"><span className="flex items-center gap-2 text-xs font-semibold text-semantic-success"><CheckCircle2 className="h-4 w-4 shrink-0" /> Prioritet və SLA seçiminizə əsasən avtomatik hesablanacaq.</span><div className="flex justify-end gap-2"><button type="button" onClick={requestClose} className="rounded-xl border border-semantic-border-strong px-4 py-2.5 text-sm font-bold text-semantic-strong transition hover:bg-semantic-subtle focus:outline-none focus:ring-4 focus:ring-semantic-brand/10">{createdTicketKey ? 'Bağla' : 'Ləğv et'}</button><button type="button" disabled={loading || submitting || Boolean(createdTicketKey)} onClick={() => void submit()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-semantic-success px-4 py-2.5 text-sm font-bold text-white transition hover:bg-semantic-success-hover disabled:cursor-not-allowed disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{submitting ? 'Yaradılır…' : createdTicketKey ? 'İş yaradıldı' : 'İş yarat'}</button></div></footer>
      </section>
    </div>
  );
};
