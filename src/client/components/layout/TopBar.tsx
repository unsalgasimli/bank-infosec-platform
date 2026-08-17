import React, { useState } from 'react';
import {
  Search,
  Plus,
  Bell,
  UserCheck,
  ChevronDown,
  Command,
  Shield,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useNotifications } from '../../context/NotificationContext.js';
import { Badge } from '../common/Badge.js';

interface TopBarProps {
  onOpenCreate: () => void;
  onOpenCommandPalette: () => void;
  onNavigate: (view: string, id?: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenCreate,
  onOpenCommandPalette,
  onNavigate,
  searchQuery,
  onSearchChange,
}) => {
  const { currentUser, allUsers, switchUser } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);

  return (
    <header className="h-13 bg-bank-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between z-30 select-none">
      {/* Brand & Global Search */}
      <div className="flex items-center gap-5 flex-1 max-w-2xl">
        <div
          className="flex items-center gap-2.5 cursor-pointer"
          onClick={() => onNavigate('ciso-dash')}
        >
          <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center text-white">
            <Shield className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 leading-none">
              <span className="text-sm font-bold text-white tracking-tight">AEGIS</span>
              <span className="text-xs font-semibold px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                SEC
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium tracking-wide mt-0.5">
              Apex Bank SecOps & GRC
            </span>
          </div>
        </div>

        {/* Global Search Bar */}
        <div className="relative flex-1 hidden md:block">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-3.5 h-3.5" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search tickets, CVEs, CWEs, or enter JQL..."
            className="w-full bg-bank-950 border border-slate-700/80 rounded-md pl-8 pr-20 py-1.5 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
          />
          <button
            onClick={onOpenCommandPalette}
            className="absolute inset-y-1 right-1 px-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded text-[10px] font-mono flex items-center gap-1 border border-slate-700 transition-colors"
            title="Open Command Palette (Ctrl+K)"
          >
            <Command className="w-3 h-3" />
            <span>K</span>
          </button>
        </div>
      </div>

      {/* Actions: Fast Create, Notifications, ABAC Persona Switcher */}
      <div className="flex items-center gap-2">
        {/* Fast Create Button */}
        <button
          onClick={onOpenCreate}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md border border-blue-500/50 shadow-sm transition-colors"
          id="btn-fast-create"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Create Ticket</span>
        </button>

        {/* Notifications Popover */}
        <div className="relative">
          <button
            onClick={() => setShowNotifMenu(!showNotifMenu)}
            className="relative p-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-600 text-white rounded-full text-[10px] font-bold flex items-center justify-center border-2 border-bank-900">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifMenu && (
            <div className="absolute right-0 mt-1.5 w-80 enterprise-dropdown rounded-lg p-3 z-40">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
                <div className="font-semibold text-xs text-white">Notifications</div>
                <button
                  onClick={markAllAsRead}
                  className="text-[11px] text-blue-400 hover:underline"
                >
                  Mark all read
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto space-y-1.5">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => {
                      markAsRead(n.id);
                      if (n.ticketKey) {
                        onNavigate('tickets', n.ticketKey);
                        setShowNotifMenu(false);
                      }
                    }}
                    className={`p-2.5 rounded border text-xs cursor-pointer transition-colors ${
                      n.read
                        ? 'bg-bank-950 border-slate-800/80 text-slate-400'
                        : 'bg-slate-800/90 border-slate-700 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between font-medium mb-0.5">
                      <span className="text-white truncate">{n.title}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-300">{n.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ABAC Persona Switcher (Role Simulator) */}
        <div className="relative">
          <button
            onClick={() => setShowPersonaMenu(!showPersonaMenu)}
            className="flex items-center gap-2 pl-2 pr-2.5 py-1 bg-bank-950 hover:bg-slate-800 border border-slate-700/80 rounded-md text-left transition-colors"
            id="btn-persona-switcher"
          >
            <div className="w-6 h-6 rounded bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center text-xs font-semibold text-slate-300">
              {currentUser?.avatarUrl ? (
                <img src={currentUser.avatarUrl} alt={currentUser.fullName} className="w-full h-full object-cover" />
              ) : (
                currentUser?.fullName.charAt(0)
              )}
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="text-xs font-semibold text-slate-200 leading-tight">
                {currentUser?.fullName}
              </span>
              <span className="text-[10px] text-slate-400 font-mono leading-tight">
                {currentUser?.roles[0]}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
          </button>

          {showPersonaMenu && (
            <div className="absolute right-0 mt-1.5 w-80 enterprise-dropdown rounded-lg p-3 z-40">
              <div className="pb-2 border-b border-slate-800 mb-2">
                <div className="flex items-center gap-1.5 font-semibold text-xs text-white">
                  <UserCheck className="w-3.5 h-3.5 text-slate-300" />
                  <span>Persona & Role Switcher</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Test banking RBAC & contextual ABAC rules across departments.
                </p>
              </div>

              <div className="max-h-80 overflow-y-auto space-y-1">
                {allUsers.map((u) => {
                  const isSelected = u.id === currentUser?.id;
                  return (
                    <div
                      key={u.id}
                      onClick={() => {
                        switchUser(u.id);
                        setShowPersonaMenu(false);
                      }}
                      className={`p-2 rounded border text-xs cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-slate-800 border-blue-500 text-white'
                          : 'bg-bank-950 border-slate-800 hover:border-slate-700 text-slate-300 hover:bg-slate-850'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-slate-100">{u.fullName}</div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                          {u.roles[0]}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{u.title}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge type="CONFIDENTIALITY" value={u.securityClearance} size="sm" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

