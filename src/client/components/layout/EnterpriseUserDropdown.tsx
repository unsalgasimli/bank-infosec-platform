import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ChevronDown,
  Building2,
  Lock,
  LogOut,
  Copy,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../context/I18nContext.js';
import { BankDepartment } from '../../../shared/types/auth.js';

interface EnterpriseUserDropdownProps {
  departments?: BankDepartment[];
  onOpenLdapModal?: () => void;
  onNavigate?: (view: string, id?: string) => void;
  className?: string;
}

export const EnterpriseUserDropdown: React.FC<EnterpriseUserDropdownProps> = ({
  departments = [],
  onOpenLdapModal,
  onNavigate,
  className = '',
}) => {
  const { currentUser, logout } = useAuth();
  const { t } = useI18n();

  const [isOpen, setIsOpen] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
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

  const isEncryptedIdentityPlaceholder = (value?: string) =>
    /^pii\+[A-Za-z0-9_-]+@encrypted\.invalid$/i.test(value || '');

  const displayName =
    currentUser?.fullName && currentUser.fullName !== 'Encrypted Directory User'
      ? currentUser.fullName
      : currentUser?.sAMAccountName || currentUser?.username || 'İstifadəçi';

  const displayEmail =
    currentUser?.email && !isEncryptedIdentityPlaceholder(currentUser.email)
      ? currentUser.email
      : `${currentUser?.username || 'user'}@bank.corp`;

  // Resolved department & section names
  const userDepartment = useMemo(() => {
    if (!currentUser?.departmentId) return null;
    return departments.find((d) => d.id === currentUser.departmentId) || null;
  }, [departments, currentUser?.departmentId]);

  const departmentName = userDepartment?.name || 'İnformasiya Təhlükəsizliyi Departamenti';
  const sectionName = currentUser?.sectionName || 'Kibertəhlükəsizlik Əməliyyatları (SOC)';
  const jobTitle = currentUser?.title || 'Baş Təhlükəsizlik Analitiki';

  const handleCopyEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (displayEmail) {
      navigator.clipboard.writeText(displayEmail);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    }
  };

  return (
    <div ref={dropdownRef} className={`relative select-none ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title="İstifadəçi Profili və Hesab İdarəetməsi"
        className={`group flex items-center gap-2.5 p-1.5 rounded-xl border transition-all duration-200 cursor-pointer ${
          isOpen
            ? 'bg-semantic-subtle border-semantic-brand/60 shadow-md ring-2 ring-semantic-brand/20'
            : 'bg-transparent hover:bg-semantic-subtle border-transparent hover:border-semantic-border-strong'
        }`}
      >
        {/* User details */}
        <div className="hidden lg:flex flex-col text-left pr-0.5">
          <div className="text-sm font-bold text-semantic-primary leading-tight flex items-center gap-1.5">
            <span className="truncate max-w-[140px]">{displayName}</span>
          </div>
          <div className="flex items-center gap-1 text-micro text-semantic-secondary font-semibold leading-tight mt-0.5">
            <span className="text-semantic-brand font-bold">
              {currentUser?.roles[0] || 'USER'}
            </span>
            <span className="text-semantic-muted">·</span>
            <span className="text-semantic-muted truncate max-w-[100px]">
              {userDepartment ? userDepartment.code : 'INFOSEC'}
            </span>
          </div>
        </div>

        {/* Chevron */}
        <ChevronDown
          className={`w-4 h-4 text-semantic-secondary transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-semantic-brand' : 'group-hover:text-semantic-primary'
          }`}
        />
      </button>

      {/* Flyout Popover */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="İstifadəçi Profili"
          className="absolute right-0 top-full mt-2.5 w-[360px] sm:w-[420px] max-w-[95vw] bg-semantic-panel border border-semantic-border-strong/80 rounded-2xl shadow-2xl z-dsOverlay flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Section 1: User Identity Card Header */}
          <div className="p-4 border-b border-semantic-border bg-semantic-subtle/50">
            <div className="flex items-start gap-3.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-base text-semantic-primary truncate">
                    {displayName}
                  </h3>
                  <span className="px-1.5 py-0.5 rounded text-micro font-bold bg-semantic-brand/15 text-semantic-brand border border-semantic-brand/30">
                    AD ✓
                  </span>
                </div>

                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs text-semantic-secondary font-mono truncate">
                    {displayEmail}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyEmail}
                    title="Emaili kopyala"
                    className="text-semantic-muted hover:text-semantic-primary p-0.5 transition-colors"
                  >
                    {copiedEmail ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-semantic-brand" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Security Clearance Badge */}
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-bold bg-semantic-success-surface text-semantic-success border border-semantic-success-border">
                    <ShieldCheck className="w-3 h-3" />
                    {currentUser?.securityClearance || 'CONFIDENTIAL_SECURITY_ONLY'}
                  </span>
                  <span className="text-micro font-mono text-semantic-muted">
                    BANK.CORP
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Organizational Scope Card (Şirkət, Departament, Şöbə) */}
          <div className="p-3.5 border-b border-semantic-border bg-semantic-panel">
            <div className="text-micro font-extrabold uppercase tracking-wider text-semantic-muted mb-2 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-semantic-brand" />
              <span>{t('Təşkilati Vahid və Vəzifə')}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-xl bg-semantic-subtle border border-semantic-border">
                <span className="text-micro text-semantic-muted block">{t('Şirkət / Qurum')}</span>
                <span className="font-bold text-semantic-primary truncate block mt-0.5">
                  Bank Standard QSC
                </span>
              </div>

              <div className="p-2 rounded-xl bg-semantic-subtle border border-semantic-border">
                <span className="text-micro text-semantic-muted block">{t('Departament')}</span>
                <span className="font-bold text-semantic-primary truncate block mt-0.5" title={departmentName}>
                  {departmentName}
                </span>
              </div>

              <div className="p-2 rounded-xl bg-semantic-subtle border border-semantic-border">
                <span className="text-micro text-semantic-muted block">{t('Şöbə / Bölmə')}</span>
                <span className="font-bold text-semantic-primary truncate block mt-0.5" title={sectionName}>
                  {sectionName}
                </span>
              </div>

              <div className="p-2 rounded-xl bg-semantic-subtle border border-semantic-border">
                <span className="text-micro text-semantic-muted block">{t('Vəzifə')}</span>
                <span className="font-bold text-semantic-primary truncate block mt-0.5" title={jobTitle}>
                  {jobTitle}
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: System Actions Footer */}
          <div className="p-3 bg-semantic-panel space-y-1">
            {onOpenLdapModal && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenLdapModal();
                }}
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-semantic-subtle text-semantic-info font-semibold flex items-center gap-2.5 text-xs transition-colors"
              >
                <Lock className="w-4 h-4" />
                <span>Active Directory LDAP Yenilənməsi</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                void logout();
              }}
              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-rose-500/10 text-rose-500 font-semibold flex items-center gap-2.5 text-xs transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>{t('Təhlükəsiz Çıxış')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
