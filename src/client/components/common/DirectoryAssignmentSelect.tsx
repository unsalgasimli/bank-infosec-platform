import React, { useEffect, useMemo, useState } from 'react';
import { Building2, UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
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

export type DirectoryAssignmentSelectProps = {
  kind: 'department' | 'section' | 'user';
  value: string;
  onChange: (value: string) => void;
  departmentId?: string;
  sectionId?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  required?: boolean;
  allowEmpty?: boolean;
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
  className = '',
  ariaLabelledBy,
  size = 'md',
}) => {
  const { fetchWithAuth } = useAuth();
  const [payload, setPayload] = useState<DirectoryPayload>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const scopeKey = `${kind}:${departmentId || ''}:${sectionId || ''}`;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setPayload({});
    const params = new URLSearchParams({ limit: '100' });
    if (departmentId) params.set('departmentId', departmentId);
    if (sectionId) params.set('sectionId', sectionId);

    fetchWithAuth(`/api/directory/assignment-options?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.error || 'Canlı directory məlumatı yüklənmədi.');
        if (!controller.signal.aborted) setPayload(data);
      })
      .catch((cause: any) => {
        if (cause?.name !== 'AbortError') setError(cause?.message || 'Canlı directory məlumatı yüklənmədi.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [fetchWithAuth, scopeKey]);

  const directoryReady = payload.directory?.ready === true;
  const departments = sortByLabel(payload.departments || []);
  const sections = sortByLabel((payload.sections || []).filter((section) => !departmentId || section.departmentId === departmentId));
  const excludedUsers = useMemo(() => new Set(excludeUserIds), [excludeUserIds]);
  const users = sortByLabel((payload.users || []).filter((user) => !excludedUsers.has(user.id)));
  const departmentMap = useMemo(() => new Map(departments.map((department) => [department.id, department])), [departments]);

  const options = useMemo<SelectOption[]>(() => {
    const empty: SelectOption[] = allowEmpty
      ? [{ value: '', label: kind === 'user' ? 'Avtomatik / növbə' : 'Seçilməyib' }]
      : [];

    if (kind === 'department') {
      return [...empty, ...departments.map((department) => ({
        value: department.id,
        label: department.name,
        sublabel: [department.code, `${department.memberCount || 0} aktiv əməkdaş`].join(' · '),
        icon: <Building2 className="h-4 w-4 text-semantic-brand" />,
        badge: 'AD',
        badgeColor: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      }))];
    }

    if (kind === 'section') {
      return [...empty, ...sections.map((section) => ({
        value: section.id,
        label: section.name,
        sublabel: [section.code, departmentMap.get(section.departmentId)?.name].filter(Boolean).join(' · '),
        icon: <Building2 className="h-4 w-4 text-semantic-info" />,
        badge: 'AD',
        badgeColor: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
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
  const isDisabled = disabled || loading || !directoryReady || options.length === 0;

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
      {!directoryReady && !loading && <p className="mt-1.5 text-xs text-amber-700">{unavailableMessage}</p>}
      {directoryReady && !options.length && <p className="mt-1.5 text-xs text-semantic-muted">Bu scope üçün aktiv AD seçimi yoxdur.</p>}
    </div>
  );
};
