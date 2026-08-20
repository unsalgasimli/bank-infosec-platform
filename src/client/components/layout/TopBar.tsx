import React, { useEffect, useRef, useState } from 'react';
import {
  Search,
  Plus,
  Bell,
  ChevronDown,
  Lock,
  LogOut,
  Settings,
  Sparkles,
  Shield,
  Layers,
  Users,
  CheckCircle2,
  FileText,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useNotifications } from '../../context/NotificationContext.js';
import { LDAPSignInModal } from '../auth/LDAPSignInModal.js';
import { useI18n } from '../../context/I18nContext.js';

interface TopBarProps {
  onOpenCreate: () => void;
  onOpenCommandPalette: () => void;
  onOpenRovo: () => void;
  onNavigate: (view: string, id?: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeDepartmentId?: string | null;
  onSelectDepartment?: (deptId: string | null) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenCreate,
  onOpenCommandPalette,
  onOpenRovo,
  onNavigate,
  searchQuery,
  onSearchChange,
}) => {
  const { currentUser, logout } = useAuth();
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

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <>
      <header
        ref={menuRef}
        className="h-14 bg-[#FFFFFF] border-b border-[#E2E8F0] px-5 flex items-center justify-between z-30 select-none shadow-sm"
      >
        {/* Left: Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <div
            className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => onNavigate('my-work-overview')}
          >
            <div className="w-8 h-8 rounded-lg bg-[#00B259] flex items-center justify-center text-white font-black text-sm shadow-sm">
              W
            </div>
          </div>
        </div>

        {/* Center: Single Global Search Bar */}
        <div className="flex-1 max-w-md mx-6 hidden md:block">
          <div
            onClick={onOpenCommandPalette}
            className="relative flex items-center bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#CBD5E1] hover:border-[#94A3B8] rounded-lg px-3.5 py-1.5 cursor-pointer transition-all shadow-sm group"
          >
            <Search className="w-4.5 h-4.5 text-[#64748B] group-hover:text-[#162136] mr-2.5 shrink-0" />
            <span className="text-sm text-[#64748B] group-hover:text-[#334155] flex-1 truncate font-medium">
              Search tasks, systems, assets, CVEs, SOPs...
            </span>
            <kbd className="hidden lg:inline-flex items-center gap-0.5 px-2 py-0.5 text-xs font-mono font-bold text-[#64748B] bg-[#FFFFFF] border border-[#CBD5E1] rounded shadow-xs">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Right: AI Intelligence, Notifications & User Profile */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] p-0.5" role="group" aria-label={t('Switch language')}>
            <button
              type="button"
              onClick={() => setLanguage('az')}
              aria-pressed={language === 'az'}
              className={`rounded-md px-2 py-1 text-[11px] font-extrabold transition-colors ${language === 'az' ? 'bg-[#0073D3] text-white shadow-sm' : 'text-[#475569] hover:text-[#162136]'}`}
            >AZ</button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              aria-pressed={language === 'en'}
              className={`rounded-md px-2 py-1 text-[11px] font-extrabold transition-colors ${language === 'en' ? 'bg-[#0073D3] text-white shadow-sm' : 'text-[#475569] hover:text-[#162136]'}`}
            >EN</button>
          </div>
          {/* AI Intelligence Assistant */}
          <button
            onClick={onOpenRovo}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#E6F7EF] text-[#007860] hover:bg-[#B8EAD1] font-bold text-sm border border-[#B8EAD1] transition-colors shadow-2xs"
          >
            <Sparkles className="w-4 h-4 text-[#00B259]" />
            <span className="hidden sm:inline">AI Copilot</span>
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => toggleMenu('notifications')}
              className={`p-2 rounded-lg hover:bg-[#F8FAFC] transition-colors relative ${
                activeMenu === 'notifications' ? 'bg-[#EDF2F7] text-[#162136]' : 'text-[#475569]'
              }`}
              title="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-[#E51739] text-white rounded-full text-xs font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {activeMenu === 'notifications' && (
              <div className="wrike-dropdown-menu absolute right-0 mt-2 w-96 p-4 z-50 text-sm shadow-xl rounded-xl border border-[#E2E8F0] bg-[#FFFFFF]">
                <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-[#162136]">Live Security Alerts</span>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-[#FDE8EB] text-[#CF1322] font-mono text-xs font-bold border border-[#FFA39E]">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-xs text-[#0073D3] hover:text-[#005CAD] hover:underline font-bold"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="space-y-2.5 max-h-80 overflow-y-auto custom-scrollbar">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center text-[#475569]">
                      <div className="w-8 h-8 rounded-full bg-[#E6F7EF] text-[#007860] flex items-center justify-center mx-auto mb-2 font-bold text-sm">
                        ✓
                      </div>
                      <div className="font-semibold text-sm text-[#162136]">All caught up!</div>
                      <div className="text-xs text-[#64748B] mt-0.5">No pending alerts or notifications.</div>
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
                            ? 'bg-[#FFFFFF] border-[#E2E8F0] hover:bg-[#F8FAFC]'
                            : n.severity === 'CRITICAL'
                            ? 'bg-[#FFF8F8] border-[#FFA39E] hover:border-[#E51739] shadow-xs'
                            : 'bg-[#F6FCF9] border-[#B8EAD1] hover:border-[#00B259] shadow-xs'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span
                            className={`px-2 py-0.5 rounded-full font-mono text-xs font-bold border ${
                              n.type === 'SLA_WARNING'
                                ? 'bg-[#FDE8EB] text-[#CF1322] border-[#FFA39E]'
                                : n.type === 'APPROVAL'
                                ? 'bg-[#FFF7E6] text-[#D46B08] border-[#FFE7BA]'
                                : 'bg-[#EBF4FD] text-[#0073D3] border-[#BAE0FD]'
                            }`}
                          >
                            {n.type.replace('_', ' ')}
                          </span>

                          <span className="text-xs font-mono text-[#64748B]">
                            {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div className="font-bold text-[#162136] text-sm leading-snug">{n.title}</div>
                        <div className="text-[#475569] text-xs mt-1 leading-relaxed">{n.message}</div>

                        {n.ticketKey && (
                          <div className="mt-2 pt-1.5 border-t border-[#E2E8F0]/60 flex items-center justify-between text-xs">
                            <span className="font-mono font-bold text-[#0073D3]">{n.ticketKey}</span>
                            <span className="text-[#00B259] font-bold text-xs flex items-center gap-0.5">
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

          {/* User Profile */}
          <div className="relative">
            <button
              onClick={() => toggleMenu('userMenu')}
              className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-[#F8FAFC] transition-colors border border-transparent hover:border-[#CBD5E1]"
            >
              <div className="w-8 h-8 rounded-full bg-[#00B259] text-white flex items-center justify-center font-bold text-xs shadow-sm">
                {currentUser ? getInitials(currentUser.fullName) : '--'}
              </div>
              <div className="hidden lg:block text-left">
                <div className="text-sm font-bold text-[#162136] leading-tight">
                  {currentUser?.fullName || 'Authenticated user'}
                </div>
                <div className="text-xs text-[#007860] font-bold leading-tight">
                  {currentUser?.roles[0] || 'USER'}
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-[#475569]" />
            </button>

            {activeMenu === 'userMenu' && (
              <div className="wrike-dropdown-menu absolute right-0 mt-2 w-68 p-3.5 z-50 text-sm shadow-lg">
                <div className="border-b border-[#E2E8F0] pb-2.5 mb-2.5">
                  <div className="font-bold text-base text-[#162136]">{currentUser?.fullName}</div>
                  <div className="text-xs text-[#475569] font-mono">{currentUser?.email}</div>
                  <span className="inline-block mt-1.5 px-2.5 py-0.5 bg-[#E6F7EF] text-[#007860] border border-[#B8EAD1] rounded-full text-xs font-bold">
                    {currentUser?.securityClearance}
                  </span>
                </div>

                <div className="pt-2.5 border-t border-[#E2E8F0] mt-2.5">
                  <button
                    onClick={() => setShowLdapModal(true)}
                    className="w-full text-left p-2 rounded-lg hover:bg-[#F8FAFC] text-[#0073D3] font-semibold flex items-center gap-2 text-sm"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Active Directory LDAP Auth</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveMenu(null);
                      void logout();
                    }}
                    className="w-full text-left p-2 rounded-lg hover:bg-[#FFEBE6] text-[#DE350B] font-semibold flex items-center gap-2 text-sm"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Təhlükəsiz çıxış</span>
                  </button>
                </div>
              </div>
            )}
          </div>
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
