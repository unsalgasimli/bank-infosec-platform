import React, { useEffect, useRef, useState } from 'react';
import {
  Search,
  Plus,
  Bell,
  ChevronDown,
  Lock,
  LogOut,
  Settings,
  Layers,
  Users,
  CheckCircle2,
  FileText,
  Zap,
  Menu,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useNotifications } from '../../context/NotificationContext.js';
import { LDAPSignInModal } from '../auth/LDAPSignInModal.js';
import { useI18n } from '../../context/I18nContext.js';
import { AliveExperienceSwitcher } from '../alive/common/AliveExperienceSwitcher.js';
import { EnterpriseUserDropdown } from './EnterpriseUserDropdown.js';
import { BankDepartment } from '../../../shared/types/auth.js';

interface TopBarProps {
  onOpenCreate: () => void;
  onOpenCommandPalette: () => void;
  onNavigate: (view: string, id?: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  departments?: BankDepartment[];
  activeDepartmentId?: string | null;
  onSelectDepartment?: (deptId: string | null) => void;
  activeCompanyId?: string;
  onSelectCompany?: (companyId: string) => void;
  onToggleSidebar?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenCreate,
  onOpenCommandPalette,
  onNavigate,
  searchQuery,
  onSearchChange,
  departments = [],
  activeDepartmentId,
  onSelectDepartment,
  activeCompanyId,
  onSelectCompany,
  onToggleSidebar,
}) => {
  const { currentUser } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [showLdapModal, setShowLdapModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleMenu = (menuName: string) => {
    setActiveMenu((prev) => (prev === menuName ? null : menuName));
  };

  return (
    <>
      <header
        ref={menuRef}
        className="h-14 bg-semantic-panel border-b border-semantic-border px-4 lg:px-5 flex items-center justify-between z-dsDialog relative select-none shadow-xs"
      >
        {/* Left: Brand & Enterprise Organization / Department Switcher */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <button
            type="button"
            aria-label={t('Open navigation')}
            onClick={onToggleSidebar}
            className="lg:hidden p-2 rounded-lg text-semantic-secondary hover:bg-semantic-subtle transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

        </div>

        {/* Center: Single Global Search Bar */}
        <div className="flex-1 max-w-md mx-6 hidden md:block">
          <div
            onClick={onOpenCommandPalette}
            className="relative flex items-center bg-semantic-subtle hover:bg-semantic-neutral-surface border border-semantic-border-strong hover:border-semantic-placeholder rounded-lg px-3.5 py-1.5 cursor-pointer transition-all shadow-sm group"
          >
            <Search className="w-4.5 h-4.5 text-semantic-muted group-hover:text-semantic-primary mr-2.5 shrink-0" />
            <span className="text-sm text-semantic-muted group-hover:text-semantic-strong flex-1 truncate font-medium">
              {t('Search tasks, systems, assets, CVEs, SOPs...')}
            </span>
            <kbd className="hidden lg:inline-flex items-center gap-0.5 px-2 py-0.5 text-xs font-mono font-bold text-semantic-muted bg-semantic-panel border border-semantic-border-strong rounded shadow-xs">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Right: Experience Switcher, AI Intelligence, Notifications & User Profile */}
        <div className="flex items-center gap-3 shrink-0">
          <AliveExperienceSwitcher />
          <div className="hidden sm:flex items-center rounded-lg border border-semantic-border-strong bg-semantic-subtle p-0.5" role="group" aria-label={t('Switch language')}>
            <button
              type="button"
              onClick={() => setLanguage('az')}
              aria-pressed={language === 'az'}
              className={`rounded-md px-2 py-1 text-label font-extrabold transition-colors ${language === 'az' ? 'bg-semantic-info text-white shadow-sm' : 'text-semantic-secondary hover:text-semantic-primary'}`}
            >AZ</button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              aria-pressed={language === 'en'}
              className={`rounded-md px-2 py-1 text-label font-extrabold transition-colors ${language === 'en' ? 'bg-semantic-info text-white shadow-sm' : 'text-semantic-secondary hover:text-semantic-primary'}`}
            >EN</button>
          </div>
          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => toggleMenu('notifications')}
              className={`p-2 rounded-lg hover:bg-semantic-subtle transition-colors relative ${
                activeMenu === 'notifications' ? 'bg-semantic-border-subtle text-semantic-primary' : 'text-semantic-secondary'
              }`}
              title="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-semantic-brand-danger text-white rounded-full text-xs font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {activeMenu === 'notifications' && (
              <div className="wrike-dropdown-menu absolute right-0 mt-2 w-96 p-4 z-dsOverlay text-sm shadow-xl rounded-xl border border-semantic-border bg-semantic-panel">
                <div className="flex items-center justify-between border-b border-semantic-border pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-semantic-primary">Live Security Alerts</span>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-semantic-danger-surface text-semantic-danger font-mono text-xs font-bold border border-semantic-danger-border">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-xs text-semantic-info hover:text-semantic-info-hover hover:underline font-bold"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="space-y-2.5 max-h-80 overflow-y-auto custom-scrollbar">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center text-semantic-secondary">
                      <div className="w-8 h-8 rounded-full bg-semantic-success-surface text-semantic-success flex items-center justify-center mx-auto mb-2 font-bold text-sm">
                        ✓
                      </div>
                      <div className="font-semibold text-sm text-semantic-primary">All caught up!</div>
                      <div className="text-xs text-semantic-muted mt-0.5">No pending alerts or notifications.</div>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => {
                          markAsRead(n.id);
                          if (n.ticketKey || n.ticketId) {
                            onNavigate('projects-tasks', n.ticketId || n.ticketKey);
                            setActiveMenu(null);
                          }
                        }}
                        className={`p-3 rounded-lg border text-sm cursor-pointer transition-all ${
                          n.isRead
                            ? 'bg-semantic-panel border-semantic-border hover:bg-semantic-subtle'
                            : n.severity === 'CRITICAL'
                            ? 'bg-semantic-danger-card border-semantic-danger-border hover:border-semantic-brand-danger shadow-xs'
                            : 'bg-semantic-success-card border-semantic-success-border hover:border-semantic-brand shadow-xs'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span
                            className={`px-2 py-0.5 rounded-full font-mono text-xs font-bold border ${
                              n.type === 'SLA_WARNING'
                                ? 'bg-semantic-danger-surface text-semantic-danger border-semantic-danger-border'
                                : n.type === 'APPROVAL'
                                ? 'bg-semantic-warning-surface text-semantic-warning border-semantic-warning-border'
                                : 'bg-semantic-info-surface text-semantic-info border-semantic-info-border'
                            }`}
                          >
                            {n.type.replace('_', ' ')}
                          </span>

                          <span className="text-xs font-mono text-semantic-muted">
                            {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div className="font-bold text-semantic-primary text-sm leading-snug">{n.title}</div>
                        <div className="text-semantic-secondary text-xs mt-1 leading-relaxed">{n.message}</div>

                        {n.ticketKey && (
                          <div className="mt-2 pt-1.5 border-t border-semantic-border/60 flex items-center justify-between text-xs">
                            <span className="font-mono font-bold text-semantic-info">{n.ticketKey}</span>
                            <span className="text-semantic-brand font-bold text-xs flex items-center gap-0.5">
                              View Ticket →
                            </span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Enterprise User Profile & Persona Switcher */}
          <EnterpriseUserDropdown
            departments={departments}
            onOpenLdapModal={() => setShowLdapModal(true)}
            onNavigate={onNavigate}
          />
        </div>
      </header>

      {showLdapModal && (
        <LDAPSignInModal
          isOpen={showLdapModal}
          onClose={() => setShowLdapModal(false)}
          onSuccess={() => setShowLdapModal(false)}
        />
      )}
    </>
  );
};
