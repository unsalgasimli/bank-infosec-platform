import React, { useState } from 'react';
import {
  Search,
  Plus,
  Bell,
  UserCheck,
  ChevronDown,
  Command,
  ShieldCheck,
  Lock,
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
    <header className="h-14 bg-bank-900/90 backdrop-blur-md border-b border-slate-800 px-4 flex items-center justify-between z-30 select-none">
      {/* Brand & Global Search */}
      <div className="flex items-center gap-4 flex-1 max-w-2xl">
        <div className="flex items-center gap-2.5 font-extrabold text-white text-base tracking-tight cursor-pointer" onClick={() => onNavigate('ciso-dash')}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-700 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20 border border-blue-400/30">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="leading-none text-sm font-black bg-gradient-to-r from-white via-slate-200 to-blue-200 bg-clip-text text-transparent">
              AEGIS<span className="text-blue-400">SEC</span>
            </span>
            <span className="text-[9px] text-slate-400 font-mono tracking-widest leading-none mt-0.5">
              APEX BANK GRC & SECOPS
            </span>
          </div>
        </div>

        {/* Global Search Bar with JQL shortcut */}
        <div className="relative flex-1 hidden md:block">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search tickets, CVEs, CWEs, or enter JQL (e.g. severity = CRITICAL)..."
            className="w-full bg-bank-950/80 border border-slate-700/70 rounded-lg pl-9 pr-24 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors font-medium"
          />
          <button
            onClick={onOpenCommandPalette}
            className="absolute inset-y-1.5 right-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded text-[11px] font-mono flex items-center gap-1 border border-slate-700 transition-colors"
            title="Open Command Palette (Ctrl+K)"
          >
            <Command className="w-3 h-3" />
            <span>K</span>
          </button>
        </div>
      </div>

      {/* Actions: Fast Create, Notifications, ABAC Persona Switcher */}
      <div className="flex items-center gap-2.5">
        {/* Fast Create Button */}
        <button
          onClick={onOpenCreate}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-lg shadow-blue-600/20 border border-blue-400/40 transition-all hover:scale-105 active:scale-95"
          id="btn-fast-create"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Create Ticket</span>
        </button>

        {/* Notifications Popover */}
        <div className="relative">
          <button
            onClick={() => setShowNotifMenu(!showNotifMenu)}
            className="relative p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-600 text-white rounded-full text-[10px] font-bold flex items-center justify-center border-2 border-bank-900 animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifMenu && (
            <div className="absolute right-0 mt-2 w-80 glass-dropdown rounded-xl p-3 z-40 border border-slate-700">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
                <div className="font-bold text-xs text-white">Security Notifications</div>
                <button
                  onClick={markAllAsRead}
                  className="text-[11px] text-blue-400 hover:underline"
                >
                  Mark all read
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto space-y-2">
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
                    className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                      n.read
                        ? 'bg-bank-900/60 border-slate-800 text-slate-400'
                        : 'bg-blue-950/40 border-blue-800 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold mb-0.5">
                      <span className="text-white truncate">{n.title}</span>
                      <span className="text-[10px] text-slate-500 font-mono">
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

        {/* ABAC Persona Switcher (Live Role & Clearance Simulator) */}
        <div className="relative">
          <button
            onClick={() => setShowPersonaMenu(!showPersonaMenu)}
            className="flex items-center gap-2 pl-2 pr-3 py-1 bg-bank-950/80 hover:bg-slate-800/80 border border-slate-700/80 rounded-lg text-left transition-all"
            id="btn-persona-switcher"
          >
            <div className="w-7 h-7 rounded-md bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center text-xs font-bold text-blue-400">
              {currentUser?.avatarUrl ? (
                <img src={currentUser.avatarUrl} alt={currentUser.fullName} className="w-full h-full object-cover" />
              ) : (
                currentUser?.fullName.charAt(0)
              )}
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="text-xs font-bold text-slate-200 leading-tight">
                {currentUser?.fullName}
              </span>
              <span className="text-[10px] text-blue-400 font-mono leading-tight">
                {currentUser?.roles[0]}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
          </button>

          {showPersonaMenu && (
            <div className="absolute right-0 mt-2 w-80 glass-dropdown rounded-xl p-3 z-40 border border-slate-700">
              <div className="pb-2 border-b border-slate-800 mb-2">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-xs text-white uppercase tracking-wider">
                    ABAC Persona Switcher
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Test banking RBAC & contextual ABAC rules across bank departments.
                </p>
              </div>

              <div className="max-h-80 overflow-y-auto space-y-1.5">
                {allUsers.map((u) => {
                  const isSelected = u.id === currentUser?.id;
                  return (
                    <div
                      key={u.id}
                      onClick={() => {
                        switchUser(u.id);
                        setShowPersonaMenu(false);
                      }}
                      className={`p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-blue-950/60 border-blue-500 shadow-md text-white'
                          : 'bg-bank-900/60 border-slate-800 hover:border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-slate-100">{u.fullName}</div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                          {u.roles[0]}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{u.title}</div>
                      <div className="flex items-center gap-2 mt-1.5">
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
