import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import {
  ShieldCheck,
  Lock,
  CheckCircle2,
  AlertCircle,
  Users,
  ArrowRight,
  Eye,
  EyeOff,
  Activity,
  RefreshCw,
  Search,
  ChevronRight,
  UserCheck,
  X
} from 'lucide-react';

interface LDAPSignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const LDAPSignInModal: React.FC<LDAPSignInModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { ldapLogin, allUsers, currentUser } = useAuth();
  const [usernameOrEmail, setUsernameOrEmail] = useState(currentUser?.sAMAccountName || currentUser?.username || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'LOGIN' | 'DIRECTORY' | 'DIAGNOSTICS'>('LOGIN');
  const [searchFilter, setSearchFilter] = useState('');

  const activeDomain = currentUser?.ldapDomain || 'ACTIVE DIRECTORY';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleLDAPSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!usernameOrEmail.trim()) {
      setErrorMessage('İstifadəçi adı daxil edilməlidir.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const result = await ldapLogin({
      usernameOrEmail: usernameOrEmail.trim(),
      password: password.trim(),
    });

    setIsLoading(false);
    setPassword('');

    if (result.success) {
      setSuccessMessage(`Doğrulandı: '${usernameOrEmail}'.`);
      setTimeout(() => {
        onSuccess?.();
        onClose();
        setSuccessMessage(null);
      }, 500);
    } else {
      setErrorMessage(result.message || 'LDAP autentifikasiyası uğursuz oldu.');
    }
  };

  const handleQuickAccountSelect = (u: any) => {
    setUsernameOrEmail(u.sAMAccountName || u.username);
    setPassword('');
    setErrorMessage(null);
    setActiveTab('LOGIN');
  };

  const infosecUsers = allUsers.filter((u) => {
    const matchesSearch =
      u.fullName.toLowerCase().includes(searchFilter.toLowerCase()) ||
      u.username.toLowerCase().includes(searchFilter.toLowerCase()) ||
      u.title.toLowerCase().includes(searchFilter.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Dark Blur Backdrop */}
      <div
        className="fixed inset-0 bg-[#040711]/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-2xl bg-[#0D1424] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10 text-slate-200 font-sans">

        {/* Top subtle highlight */}
        <div className="absolute top-0 left-8 right-8 h-[1px] bg-gradient-to-r from-transparent via-[#00B259]/50 to-transparent" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0A101D]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[#00B259]">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-tight">
                  Active Directory / LDAP Girişi
                </h2>
                <span className="px-1.5 py-0.2 rounded font-mono text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {activeDomain}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                Server-managed LDAPS • encrypted
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center p-1 mx-6 mt-4 rounded-xl bg-[#080D18] border border-slate-800/80">
          <button
            type="button"
            onClick={() => setActiveTab('LOGIN')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'LOGIN'
                ? 'bg-[#152238] text-white shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5 text-[#00B259]" />
            <span>Giriş</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('DIRECTORY')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'DIRECTORY'
                ? 'bg-[#152238] text-white shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-[#0073D3]" />
            <span>Heyət ({allUsers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('DIAGNOSTICS')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'DIAGNOSTICS'
                ? 'bg-[#152238] text-white shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-purple-400" />
            <span>Diaqnostika</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center gap-2 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Success Banner */}
          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-2 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* TAB 1: LOGIN */}
          {activeTab === 'LOGIN' && (
            <form onSubmit={handleLDAPSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Domain İstifadəçi Adı və ya Email
                </label>
                <input
                  type="text"
                  autoComplete="username"
                  required
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  placeholder="istifadəçi adı və ya korporativ email"
                  className="w-full bg-[#0A101D] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#00B259]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-semibold text-slate-300">
                    Şifrə / Smart Card PIN
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Yalnız development bypass aktivdirsə boş qala bilər
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Şifrə daxil edin"
                    className="w-full bg-[#0A101D] border border-slate-800 rounded-xl pl-3 pr-9 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#00B259]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Ləğv et
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 rounded-xl bg-[#00B259] hover:bg-[#009e4e] text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-[#00B259]/20 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Doğrulanır...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Daxil Ol</span>
                    </>
                  )}
                </button>
              </div>

              {/* Quick Select Preset Accounts */}
              {allUsers && allUsers.length > 0 && (
                <div className="pt-3 border-t border-slate-800/80 space-y-1.5">
                  <div className="text-[10px] text-slate-400 uppercase font-mono font-semibold">
                    Sürətli Seçim:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {allUsers.slice(0, 6).map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleQuickAccountSelect(u)}
                        className="px-2 py-1 rounded-lg bg-[#0A101D] hover:bg-slate-800 border border-slate-800 text-[10px] text-slate-300 font-mono transition-colors"
                      >
                        {u.fullName} ({u.username})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </form>
          )}

          {/* TAB 2: DIRECTORY */}
          {activeTab === 'DIRECTORY' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Heyət üzrə axtarış..."
                  className="w-full bg-[#0A101D] border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#0073D3]"
                />
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                {infosecUsers.map((u) => (
                  <div
                    key={u.id}
                    className="p-2 rounded-xl bg-[#0A101D]/70 border border-slate-800 flex items-center justify-between gap-2 hover:border-slate-700 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-slate-200 truncate">{u.fullName}</span>
                        <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono text-[9px]">
                          {u.sAMAccountName || u.username}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">{u.title}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleQuickAccountSelect(u)}
                      className="shrink-0 px-2 py-1 rounded-lg bg-[#0073D3] hover:bg-[#005CAD] text-white text-[10px] font-semibold"
                    >
                      Seç
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: DIAGNOSTICS */}
          {activeTab === 'DIAGNOSTICS' && (
            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-xl bg-[#0A101D] border border-slate-800 space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Domain Controller:</span>
                  <span className="text-emerald-400 font-semibold">Server-managed LDAPS</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">PKI Certificate:</span>
                  <span className="text-slate-200">Tier-1 Expressbank CA</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">TLS Encryption:</span>
                  <span className="text-cyan-400">TLS 1.3 Strict</span>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
