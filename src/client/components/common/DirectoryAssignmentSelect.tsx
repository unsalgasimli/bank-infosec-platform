import React, { useEffect, useMemo, useState } from 'react';
import { Building2, UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../context/I18nContext.js';
import type { BankDepartment, BankDepartmentSection } from '../../../shared/types/auth.js';
import { CustomSelect, type SelectOption } from './CustomSelect.js';

type DirectoryUser = {
  id: string;
  fullName: string;
  title?: string;
  username?: string;
  departmentId: string;
  sectionId?: string;
  excludeUserIds?: string[];
  sectionName?: string;
  teamIds?: string[];
  roles?: string[];
};

type DirectoryPayload = {
  directory?: { ready: boolean; message?: string };
  departments?: BankDepartment[];
  sections?: BankDepartmentSection[];
  users?: DirectoryUser[];
  nextOffset?: number | null;
};

type FetchWithAuth = (url: string, options?: RequestInit) => Promise<Response>;

type DirectoryCacheEntry = {
  expiresAt: number;
  value: Promise<DirectoryPayload>;
};

// An asset drawer renders several assignment selectors at once. Keep one
// authenticated catalogue request per scope instead of making the primary,
// technical, business, department, and section controls all fetch the same
// directory projection independently. The cache is scoped to the current
// authenticated fetch function, so it cannot survive an auth-session change.
const directoryOptionCache = new WeakMap<FetchWithAuth, Map<string, DirectoryCacheEntry>>();
const DIRECTORY_OPTION_CACHE_MS = 30_000;

const fetchDirectoryPayload = async (fetchWithAuth: FetchWithAuth, url: string): Promise<DirectoryPayload> => {
  const response = await fetchWithAuth(url);
  const data = await response.json().catch(() => ({}));
  if (response.ok && data.success && (data.departments?.length || data.users?.length)) return data;

  // Retain the compatibility fallback, but issue it once for all selectors
  // sharing this catalogue scope.
  const [deptRes, userRes] = await Promise.all([
    fetchWithAuth('/api/departments').then((result) => result.json()).catch(() => ({})),
    fetchWithAuth('/api/auth/users').then((result) => result.json()).catch(() => ({})),
  ]);
  const departments = Array.isArray(deptRes.departments) ? deptRes.departments : [];
  const users = Array.isArray(userRes.users) ? userRes.users : [];
  if (departments.length || users.length) {
    return {
      directory: { ready: departments.length > 0 },
      departments,
      sections: departments.flatMap((department: any) => department.sections || []),
      users,
    };
  }
  throw new Error(data.error || 'Canlı directory məlumatı yüklənmədi.');
};

const getDirectoryPayload = (fetchWithAuth: FetchWithAuth, url: string): Promise<DirectoryPayload> => {
  let entries = directoryOptionCache.get(fetchWithAuth);
  if (!entries) {
    entries = new Map();
    directoryOptionCache.set(fetchWithAuth, entries);
  }
  const now = Date.now();
  const existing = entries.get(url);
  if (existing && existing.expiresAt > now) return existing.value;

  const value = fetchDirectoryPayload(fetchWithAuth, url).catch((error) => {
    // A transient outage must not poison the next attempt.
    if (entries?.get(url)?.value === value) entries.delete(url);
    throw error;
  });
  entries.set(url, { expiresAt: now + DIRECTORY_OPTION_CACHE_MS, value });
  return value;
};

export type DirectoryAssignmentSelectProps = {
  kind: 'department' | 'section' | 'user';
  value: string;
  onChange: (value: string) => void;
  departmentId?: string;
  sectionId?: string;
  excludeUserIds?: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  required?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
  ariaLabelledBy?: string;
  size?: 'sm' | 'md' | 'lg';
};

const azCollator = new Intl.Collator('az', { sensitivity: 'base', numeric: true });

const sortByLabel = <T extends { name?: string; fullName?: string }>(items: T[]) =>
  [...items].sort((left, right) => azCollator.compare(left.name || left.fullName || '', right.name || right.fullName || ''));

/**
 * Directory-backed selector used by assignment fields across the product.
 * It deliberately renders an empty, explanatory state when AD projection data
 * is unavailable; static/demo users are never used as a fallback.
 */
export const DirectoryAssignmentSelect: React.FC<DirectoryAssignmentSelectProps> = ({
  kind,
  value,
  onChange,
  departmentId,
  sectionId,
  excludeUserIds = [],
  placeholder,
  searchPlaceholder,
  disabled = false,
  required = false,
  allowEmpty = false,
  emptyLabel,
  className = '',
  ariaLabelledBy,
  size = 'md',
}) => {
  const { fetchWithAuth } = useAuth();
  const { t } = useI18n();
  const [payload, setPayload] = useState<DirectoryPayload>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const scopeKey = `${kind}:${departmentId || ''}:${sectionId || ''}`;

  useEffect(() => {
    setLoading(true);
    setError('');
    setPayload({});
    const params = new URLSearchParams({ limit: '100' });
    if (departmentId) params.set('departmentId', departmentId);
    if (sectionId) params.set('sectionId', sectionId);

    let disposed = false;
    const url = `/api/directory/assignment-options?${params.toString()}`;
    getDirectoryPayload(fetchWithAuth, url)
      .then((data) => {
        if (!disposed) setPayload(data);
      })
      .catch((cause: any) => {
        if (!disposed) setError(cause?.message || 'Canlı directory məlumatı yüklənmədi.');
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });

    return () => { disposed = true; };
  }, [fetchWithAuth, scopeKey]);

  const directoryReady = payload.directory?.ready !== false || Boolean(payload.departments?.length) || Boolean(payload.users?.length);
  const departments = sortByLabel(payload.departments || []);
  const sections = sortByLabel((payload.sections || []).filter((section) => !departmentId || section.departmentId === departmentId));
  const excludedUsers = useMemo(() => new Set(excludeUserIds), [excludeUserIds]);
  const users = sortByLabel((payload.users || []).filter((user) => !excludedUsers.has(user.id)));
  const departmentMap = useMemo(() => new Map(departments.map((department) => [department.id, department])), [departments]);

  const options = useMemo<SelectOption[]>(() => {
    const empty: SelectOption[] = allowEmpty
      ? [{ value: '', label: emptyLabel || (kind === 'user' ? 'Avtomatik / növbə' : 'Seçilməyib') }]
      : [];

    if (kind === 'department') {
      return [...empty, ...departments.map((department) => ({
        value: department.id,
        label: department.name,
        icon: <Building2 className="h-4 w-4 text-semantic-brand" />,
      }))];
    }

    if (kind === 'section') {
      return [...empty, ...sections.map((section) => ({
        value: section.id,
        label: section.name,
        icon: <Building2 className="h-4 w-4 text-semantic-info" />,
      }))];
    }

    return [...empty, ...users.map((user) => ({
      value: user.id,
      label: user.fullName,
      sublabel: [user.sectionName, departmentMap.get(user.departmentId)?.name, user.title, user.username ? `@${user.username}` : undefined].filter(Boolean).join(' · '),
      icon: <UserRound className="h-4 w-4 text-semantic-success" />,
      badge: 'AD',
      badgeColor: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    }))];
  }, [allowEmpty, departmentMap, departments, kind, sections, users]);

  const loadMore = async () => {
    if (kind !== 'user' || payload.nextOffset == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: '100', offset: String(payload.nextOffset) });
      if (departmentId) params.set('departmentId', departmentId);
      if (sectionId) params.set('sectionId', sectionId);
      const response = await fetchWithAuth(`/api/directory/assignment-options?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Əlavə directory nəticələri yüklənmədi.');
      setPayload((current) => ({ ...current, ...data, users: [...(current.users || []), ...(data.users || [])] }));
    } catch (cause: any) {
      setError(cause?.message || 'Əlavə directory nəticələri yüklənmədi.');
    } finally {
      setLoadingMore(false);
    }
  };

  const unavailableMessage = error || payload.directory?.message || 'Canlı Active Directory sinxronizasiyası tələb olunur.';
  // An owner picker must never look locked merely because directory data is
  // still refreshing.  Keep the searchable control operable and replace its
  // options as soon as the live projection arrives.
  const selectableOptions = options.filter((option) => option.value !== '');
  const isDisabled = disabled || (!allowEmpty && selectableOptions.length === 0);

  return (
    <div className={className}>
      <CustomSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder={loading ? 'Directory yüklənir…' : placeholder || (kind === 'department' ? 'Departament seçin…' : kind === 'section' ? 'Şöbə seçin…' : 'Əməkdaş seçin…')}
        searchPlaceholder={searchPlaceholder || 'Ad, kod və ya vəzifə axtarın…'}
        disabled={isDisabled}
        required={required}
        ariaLabelledBy={ariaLabelledBy}
        size={size}
        searchable
        hasMore={kind === 'user' && payload.nextOffset != null}
        isLoadingMore={loadingMore}
        onLoadMore={() => void loadMore()}
      />
      {!directoryReady && !loading && selectableOptions.length === 0 && <p className="mt-1.5 text-xs text-amber-700">{unavailableMessage}</p>}
      {directoryReady && selectableOptions.length === 0 && !loading && <p className="mt-1.5 text-xs text-semantic-muted">Bu scope üçün aktiv seçim yoxdur.</p>}
    </div>
  );
};
