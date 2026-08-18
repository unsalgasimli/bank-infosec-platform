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
  Building2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useNotifications } from '../../context/NotificationContext.js';
import { LDAPSignInModal } from '../auth/LDAPSignInModal.js';

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
  activeDepartmentId = null,
  onSelectDepartment,
}) => {
  const { currentUser, allUsers, switchUser, fetchWithAuth } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [showLdapModal, setShowLdapModal] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchWithAuth('/api/departments')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setDepartments(data.departments || []);
      })
      .catch((err) => console.error(err));
  }, []);

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

  const activeDeptObj = departments.find((d) => d.id === activeDepartmentId);

  return (
    <>
      <header
        ref={menuRef}
        className="h-14 bg-[#FFFFFF] border-b border-[#E2E8F0] px-5 flex items-center justify-between z-30 select-none shadow-sm"
      >
        {/* Left: Brand & Department Switcher */}
        <div className="flex items-center gap-3 shrink-0">
          <div
            className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => onNavigate('table')}
          >
            <div className="w-8 h-8 rounded-lg bg-[#00B259] flex items-center justify-center text-white font-black text-sm shadow-sm">
              W
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-[#162136] text-base tracking-tight hidden sm:inline">
                wrike <span className="text-[#00B259] font-bold">BankGRC</span>
              </span>
            </div>
          </div>

          {/* Department Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => toggleMenu('deptMenu')}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] text-xs font-bold text-[#162136] transition-colors shadow-2xs"
            >
              <Building2 className="w-3.5 h-3.5 text-[#0073D3]" />
              <span className="max-w-[140px] truncate">
                {activeDeptObj ? activeDeptObj.name : 'All Bank Units'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-[#8D99AE]" />
            </button>

            {activeMenu === 'deptMenu' && (
              <div className="wrike-dropdown-menu absolute left-0 mt-2 w-72 p-2.5 z-50 text-xs shadow-xl rounded-xl border border-[#E2E8F0] bg-[#FFFFFF]">
                <div className="px-2 py-1 mb-1 border-b border-[#E2E8F0] flex items-center justify-between">
                  <span className="font-bold text-[11px] text-[#5A6A85] uppercase">Banking Departments</span>
                  <button
                    onClick={() => {
                      onNavigate('departments');
                      setActiveMenu(null);
                    }}
                    className="text-[11px] text-[#0073D3] font-bold hover:underline"
                  >
                    View All →
                  </button>
                </div>

                <button
                  onClick={() => {
                    if (onSelectDepartment) onSelectDepartment(null);
                    setActiveMenu(null);
                  }}
                  className={`w-full text-left p-2 rounded-lg text-xs font-bold flex items-center justify-between transition-colors ${
                    !activeDepartmentId ? 'bg-[#E6F7EF] text-[#007860]' : 'hover:bg-[#F8FAFC] text-[#162136]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#00B259]" />
                    <span>All Bank Units (Global View)</span>
                  </div>
                  <span className="text-[10px] font-mono bg-[#F1F5F9] px-1.5 py-0.5 rounded">
                    {departments.length}
                  </span>
                </button>

                <div className="my-1 border-t border-[#F1F5F9]" />

                <div className="space-y-1 max-h-56 overflow-y-auto custom-scrollbar">
                  {departments.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => {
                        if (onSelectDepartment) onSelectDepartment(d.id);
                        setActiveMenu(null);
                      }}
                      className={`w-full text-left p-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                        activeDepartmentId === d.id
                          ? 'bg-[#E6F7EF] text-[#007860] font-bold'
                          : 'hover:bg-[#F8FAFC] text-[#2B3A57]'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: d.color || '#0052CC' }}
                        />
                        <span className="truncate">{d.name}</span>
                      </div>
                      <span className="font-mono text-[10px] font-bold text-[#8D99AE]">
                        {d.code}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center: Single Global Search Bar */}
        <div className="flex-1 max-w-md mx-6 hidden md:block">
          <div
            onClick={onOpenCommandPalette}
            className="relative flex items-center bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] hover:border-[#CBD5E1] rounded-lg px-3 py-1.5 cursor-pointer transition-all shadow-sm group"
          >
            <Search className="w-4 h-4 text-[#8D99AE] group-hover:text-[#162136] mr-2.5 shrink-0" />
            <span className="text-xs text-[#8D99AE] group-hover:text-[#5A6A85] flex-1 truncate">
              Search tasks, systems, assets, CVEs, SOPs...
            </span>
            <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-bold text-[#8D99AE] bg-[#FFFFFF] border border-[#E2E8F0] rounded shadow-xs">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Right: AI Intelligence, Notifications & User Profile */}
        <div className="flex items-center gap-3 shrink-0">
          {/* AI Intelligence Assistant */}
          <button
            onClick={onOpenRovo}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#E6F7EF] text-[#007860] hover:bg-[#B8EAD1] font-bold text-xs border border-[#B8EAD1] transition-colors"
          >
            <Sparkles className="w-4 h-4 text-[#00B259]" />
            <span className="hidden sm:inline">AI Copilot</span>
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => toggleMenu('notifications')}
              className={`p-2 rounded-lg hover:bg-[#F8FAFC] transition-colors relative ${
                activeMenu === 'notifications' ? 'bg-[#EDF2F7] text-[#162136]' : 'text-[#5A6A85]'
              }`}
              title="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-[#E51739] text-white rounded-full text-[10px] font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {activeMenu === 'notifications' && (
              <div className="wrike-dropdown-menu absolute right-0 mt-2 w-96 p-4 z-50 text-xs shadow-xl rounded-xl border border-[#E2E8F0] bg-[#FFFFFF]">
                <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#162136]">Live Security Alerts</span>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-[#FDE8EB] text-[#CF1322] font-mono text-[10px] font-bold border border-[#FFA39E]">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-xs text-[#0073D3] hover:text-[#005CAD] hover:underline font-semibold"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="space-y-2.5 max-h-80 overflow-y-auto custom-scrollbar">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center text-[#5A6A85]">
                      <div className="w-8 h-8 rounded-full bg-[#E6F7EF] text-[#007860] flex items-center justify-center mx-auto mb-2 font-bold text-sm">
                        ✓
                      </div>
                      <div className="font-semibold text-xs text-[#162136]">All caught up!</div>
                      <div className="text-[11px] mt-0.5">No pending alerts or notifications.</div>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => {
                          markAsRead(n.id);
                          if (n.ticketKey || n.ticketId) {
                            onNavigate('table', n.ticketId || n.ticketKey);
                            setActiveMenu(null);
                          }
                        }}
                        className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                          n.isRead
                            ? 'bg-[#FFFFFF] border-[#E2E8F0] hover:bg-[#F8FAFC]'
                            : n.severity === 'CRITICAL'
                            ? 'bg-[#FFF8F8] border-[#FFA39E] hover:border-[#E51739] shadow-xs'
                            : 'bg-[#F6FCF9] border-[#B8EAD1] hover:border-[#00B259] shadow-xs'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span
                            className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold border ${
                              n.type === 'SLA_WARNING'
                                ? 'bg-[#FDE8EB] text-[#CF1322] border-[#FFA39E]'
                                : n.type === 'APPROVAL'
                                ? 'bg-[#FFF7E6] text-[#D46B08] border-[#FFE7BA]'
                                : 'bg-[#EBF4FD] text-[#0073D3] border-[#BAE0FD]'
                            }`}
                          >
                            {n.type.replace('_', ' ')}
                          </span>

                          <span className="text-[10px] font-mono text-[#8D99AE]">
                            {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div className="font-bold text-[#162136] text-xs leading-snug">{n.title}</div>
                        <div className="text-[#5A6A85] text-[11px] mt-1 leading-relaxed">{n.message}</div>

                        {n.ticketKey && (
                          <div className="mt-2 pt-1.5 border-t border-[#E2E8F0]/60 flex items-center justify-between text-[11px]">
                            <span className="font-mono font-bold text-[#0073D3]">{n.ticketKey}</span>
                            <span className="text-[#00B259] font-semibold text-[10px] flex items-center gap-0.5">
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
              className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-[#F8FAFC] transition-colors border border-transparent hover:border-[#E2E8F0]"
            >
              <div className="w-8 h-8 rounded-full bg-[#00B259] text-white flex items-center justify-center font-bold text-xs shadow-sm">
                {currentUser ? getInitials(currentUser.fullName) : 'UG'}
              </div>
              <div className="hidden lg:block text-left">
                <div className="text-xs font-bold text-[#162136] leading-tight">
                  {currentUser?.fullName || 'Unsal Gasimli'}
                </div>
                <div className="text-[11px] text-[#007860] font-semibold leading-tight">
                  {currentUser?.roles[0] || 'CISO'}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-[#5A6A85]" />
            </button>

            {activeMenu === 'userMenu' && (
              <div className="wrike-dropdown-menu absolute right-0 mt-2 w-64 p-3 z-50 text-xs shadow-lg">
                <div className="border-b border-[#E2E8F0] pb-2.5 mb-2.5">
                  <div className="font-bold text-sm text-[#162136]">{currentUser?.fullName}</div>
                  <div className="text-xs text-[#5A6A85] font-mono">{currentUser?.email}</div>
                  <span className="inline-block mt-1.5 px-2.5 py-0.5 bg-[#E6F7EF] text-[#007860] border border-[#B8EAD1] rounded-full text-xs font-bold">
                    {currentUser?.securityClearance}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-bold uppercase text-[#5A6A85] px-1 mb-1">
                    Switch Test User
                  </div>
                  {allUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        switchUser(u.id);
                        setActiveMenu(null);
                      }}
                      className={`w-full text-left p-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                        u.id === currentUser?.id ? 'bg-[#E6F7EF] text-[#007860] font-bold' : 'hover:bg-[#F8FAFC] text-[#2B3A57]'
                      }`}
                    >
                      <span>{u.fullName}</span>
                      <span className="text-[11px] font-mono text-[#5A6A85]">{u.roles[0]}</span>
                    </button>
                  ))}
                </div>

                <div className="pt-2.5 border-t border-[#E2E8F0] mt-2.5">
                  <button
                    onClick={() => setShowLdapModal(true)}
                    className="w-full text-left p-2 rounded-lg hover:bg-[#F8FAFC] text-[#0073D3] font-semibold flex items-center gap-2"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Active Directory LDAP Auth</span>
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
