import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../context/I18nContext.js';
import {
  ShieldCheck,
  Lock,
  CheckCircle2,
  AlertCircle,
  Users,
  Eye,
  EyeOff,
  Activity,
  RefreshCw,
  Search,
  X
} from 'lucide-react';

interface LDAPSignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const LDAPSignInModal: React.FC<LDAPSignInModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { ldapLogin, allUsers, currentUser } = useAuth();
  const { t } = useI18n();
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
      setErrorMessage(t('Username or corporate email is required.'));
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
      setSuccessMessage(`${t('Authenticated. Entering system...')}: '${usernameOrEmail}'.`);
      setTimeout(() => {
        onSuccess?.();
        onClose();
        setSuccessMessage(null);
      }, 500);
    } else {
      setErrorMessage(result.message || t('LDAP authentication failed.'));
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
    <div className="fixed inset-0 z-dsDialog flex items-center justify-center p-4">
      {/* Dark Blur Backdrop */}
      <div
        className="fixed inset-0 bg-semantic-auth-overlay/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-2xl bg-semantic-auth border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-dsModal z-dsContent text-slate-200 font-sans">

        {/* Top subtle highlight */}
        <div className="absolute top-0 left-8 right-8 h-[1px] bg-gradient-to-r from-transparent via-semantic-brand/50 to-transparent" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-semantic-dark">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-semantic-brand">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-tight">
                  {t('Active Directory / LDAP Sign In')}
                </h2>
                <span className="px-1.5 py-0.2 rounded font-mono text-micro font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {activeDomain}
                </span>
              </div>
              <p className="text-label text-slate-400 font-mono">
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
        <div className="flex items-center p-1 mx-6 mt-4 rounded-xl bg-semantic-dark-inset border border-slate-800/80">
          <button
            type="button"
            onClick={() => setActiveTab('LOGIN')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'LOGIN'
                ? 'bg-semantic-dark-selected text-white shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5 text-semantic-brand" />
            <span>{t('Sign In')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('DIRECTORY')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'DIRECTORY'
                ? 'bg-semantic-dark-selected text-white shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-semantic-info" />
            <span>{t('Directory')} ({allUsers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('DIAGNOSTICS')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'DIAGNOSTICS'
                ? 'bg-semantic-dark-selected text-white shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-purple-400" />
            <span>{t('Diagnostics')}</span>
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
                <label className="block text-label font-semibold text-slate-300 mb-1">
                  {t('Domain Username or Email')}
                </label>
                <input
                  type="text"
                  autoComplete="username"
                  required
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  placeholder={t('username or corporate email')}
                  className="w-full bg-semantic-dark border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-semantic-brand"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-label font-semibold text-slate-300">
                    {t('Password / Smart Card PIN')}
                  </label>
                  <span className="text-caption text-slate-500 font-mono">
                    {t('Optional if development bypass is enabled')}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('Enter password')}
                    className="w-full bg-semantic-dark border border-slate-800 rounded-xl pl-3 pr-9 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-semantic-brand"
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
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 rounded-xl bg-semantic-brand hover:bg-semantic-brand-hover-deep text-white text-xs font-semibold flex items-center gap-1.5 shadow-brand-soft transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{t('Authenticating...')}</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>{t('Sign In')}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Quick Select Preset Accounts */}
              {allUsers && allUsers.length > 0 && (
                <div className="pt-3 border-t border-slate-800/80 space-y-1.5">
                  <div className="text-caption text-slate-400 uppercase font-mono font-semibold">
                    {t('Quick Select:')}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {allUsers.slice(0, 6).map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleQuickAccountSelect(u)}
                        className="px-2 py-1 rounded-lg bg-semantic-dark hover:bg-slate-800 border border-slate-800 text-caption text-slate-300 font-mono transition-colors"
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
                  placeholder={t('Search directory...')}
                  className="w-full bg-semantic-dark border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-semantic-info"
                />
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                {infosecUsers.map((u) => (
                  <div
                    key={u.id}
                    className="p-2 rounded-xl bg-semantic-dark/70 border border-slate-800 flex items-center justify-between gap-2 hover:border-slate-700 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-slate-200 truncate">{u.fullName}</span>
                        <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono text-micro">
                          {u.sAMAccountName || u.username}
                        </span>
                      </div>
                      <div className="text-caption text-slate-400 truncate">{u.title}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleQuickAccountSelect(u)}
                      className="shrink-0 px-2 py-1 rounded-lg bg-semantic-info hover:bg-semantic-info-hover text-white text-caption font-semibold"
                    >
                      {t('Select')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: DIAGNOSTICS */}
          {activeTab === 'DIAGNOSTICS' && (
            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-xl bg-semantic-dark border border-slate-800 space-y-1.5 font-mono text-label">
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
