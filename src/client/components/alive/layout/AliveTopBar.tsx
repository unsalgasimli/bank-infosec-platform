import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Bell,
  Sparkles,
  ChevronDown,
  Lock,
  LogOut,
  Menu,
  CheckCircle2,
  Shield,
  Layers,
} from 'lucide-react';
import { useNotifications } from '../../../context/NotificationContext.js';
import { useI18n } from '../../../context/I18nContext.js';
import { AliveExperienceSwitcher } from '../common/AliveExperienceSwitcher.js';
import { LDAPSignInModal } from '../../auth/LDAPSignInModal.js';
import { EnterpriseUserDropdown } from '../../layout/EnterpriseUserDropdown.js';
import { BankDepartment } from '../../../../shared/types/auth.js';

interface AliveTopBarProps {
  activeViewTitle?: string;
  activeParentModuleTitle?: string;
  onOpenCreate: () => void;
  onOpenCommandPalette: () => void;
  onToggleSidebar?: () => void;
  departments?: BankDepartment[];
  onNavigate?: (view: string, id?: string) => void;
}

export const AliveTopBar: React.FC<AliveTopBarProps> = ({
  activeViewTitle,
  activeParentModuleTitle,
  onOpenCreate,
  onOpenCommandPalette,
  onToggleSidebar,
  departments = [],
  onNavigate,
}) => {
  const { language, setLanguage, t } = useI18n();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [showLdapModal, setShowLdapModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
        className="h-14 bg-semantic-panel border-b border-semantic-border px-4 flex items-center justify-between z-dsDialog relative select-none shadow-xs"
      >
        {/* Left: Mobile Toggle, Brand Monogram & Breadcrumb */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            aria-label="Toggle navigation"
            onClick={onToggleSidebar}
            className="lg:hidden p-2 rounded-lg text-semantic-secondary hover:bg-semantic-subtle transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          {activeViewTitle && (
            <div className="hidden md:flex items-center gap-1.5">
              {activeParentModuleTitle && (
                <>
                  <span className="text-caption font-mono uppercase font-bold text-semantic-muted">
                    {activeParentModuleTitle}
                  </span>
                  <span className="text-semantic-muted text-xs">/</span>
                </>
              )}
              <span className="text-xs font-semibold text-semantic-strong">
                {activeViewTitle}
              </span>
            </div>
          )}
        </div>

        {/* Center: Command Launcher Pill Trigger */}
        <div className="flex-1 max-w-lg mx-4 hidden sm:block">
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="w-full relative flex items-center bg-semantic-subtle hover:bg-semantic-hover border border-semantic-border hover:border-[#00F576]/50 rounded-xl px-3.5 py-1.5 cursor-pointer transition-all shadow-xs group text-left"
          >
            <Search className="w-4 h-4 text-semantic-muted group-hover:text-[#00F576] mr-2.5 shrink-0 transition-colors" />
            <span className="text-xs text-semantic-muted group-hover:text-semantic-primary flex-1 truncate font-medium">
              {t('Search anything or press ⌘K for commands...')}
            </span>
            <kbd className="hidden md:inline-flex items-center gap-0.5 px-2 py-0.5 text-caption font-mono font-bold text-semantic-muted bg-semantic-panel border border-semantic-border rounded shadow-xs">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right: Experience Switcher, Language, Alerts & User Profile */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Experience Switcher */}
          <AliveExperienceSwitcher />

          {/* Language Switcher */}
          <div className="hidden md:flex items-center rounded-lg border border-semantic-border bg-semantic-subtle p-0.5">
            <button
              type="button"
              onClick={() => setLanguage('az')}
              className={`px-2 py-0.5 rounded-md text-label font-bold transition-all ${
                language === 'az' ? 'bg-[#00F576] text-[#041407] shadow-xs' : 'text-semantic-muted hover:text-semantic-primary'
              }`}
            >
              AZ
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-2 py-0.5 rounded-md text-label font-bold transition-all ${
                language === 'en' ? 'bg-[#00F576] text-[#041407] shadow-xs' : 'text-semantic-muted hover:text-semantic-primary'
              }`}
            >
              EN
            </button>
          </div>

          {/* Live Alerts Bell */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleMenu('notifications')}
              className={`p-2 rounded-xl transition-all relative ${
                activeMenu === 'notifications'
                  ? 'bg-semantic-hover text-semantic-primary'
                  : 'text-semantic-secondary hover:text-semantic-primary hover:bg-semantic-subtle'
              }`}
              title={t('Notifications')}
            >
              <Bell className="w-4.5 h-4.5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-micro font-bold flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {activeMenu === 'notifications' && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 p-4 z-dsOverlay text-xs shadow-2xl rounded-2xl border border-semantic-border bg-semantic-panel">
                <div className="flex items-center justify-between border-b border-semantic-border pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-semantic-primary">{t('Live Security Alerts')}</span>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 font-mono text-micro font-bold border border-rose-500/20">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-caption text-[#00F576] hover:underline font-bold"
                    >
                      {t('Mark all read')}
                    </button>
                  )}
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                  {notifications.length === 0 ? (
                    <div className="py-6 text-center text-semantic-muted">
                      <CheckCircle2 className="w-7 h-7 mx-auto mb-1.5 text-[#00F576] opacity-75" />
                      <div className="font-semibold text-semantic-primary">{t('All caught up')}</div>
                      <div className="text-caption">{t('No pending operational alerts')}</div>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => markAsRead(n.id)}
                        className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          n.isRead
                            ? 'bg-semantic-subtle/30 border-semantic-border text-semantic-muted'
                            : 'bg-semantic-subtle border-semantic-border-strong text-semantic-primary shadow-xs'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-mono text-micro uppercase font-bold text-[#00F576]">
                            {n.type}
                          </span>
                          <span className="font-mono text-micro text-semantic-muted">
                            {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="font-bold text-semantic-primary leading-snug">{n.title}</div>
                        <div className="text-caption text-semantic-secondary mt-0.5 line-clamp-2">{n.message}</div>
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
