import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../context/I18nContext.js';
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Lock, RefreshCw, ShieldCheck, Users } from 'lucide-react';

interface BankAuthPortalProps {
  onLoginSuccess?: () => void;
}

export const BankAuthPortal: React.FC<BankAuthPortalProps> = ({ onLoginSuccess }) => {
  const { ldapLogin } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleLDAPSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const username = usernameOrEmail.trim();
    if (!username) {
      setErrorMessage(t('Username or corporate email is required.'));
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await ldapLogin({ usernameOrEmail: username, password: password.trim() });
      if (!result.success) {
        setErrorMessage(result.message || t('LDAP authentication failed.'));
        return;
      }

      setPassword('');
      setSuccessMessage(t('Authenticated. Entering system...'));
      window.setTimeout(() => onLoginSuccess?.(), 350);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-semantic-auth-portal px-4 py-8 text-slate-100 sm:grid sm:place-items-center">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-semantic-auth p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-semantic-brand/10 border border-semantic-brand/20 text-semantic-brand">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-wide text-white">Apex Bank GRC</p>
              <p className="text-label font-medium text-slate-400">InfoSec Platform</p>
            </div>
          </div>

          {/* Language Switcher */}
          <div className="flex items-center rounded-lg border border-slate-700 bg-semantic-dark-inset p-0.5" role="group" aria-label={t('Switch language')}>
            <button
              type="button"
              onClick={() => setLanguage('az')}
              aria-pressed={language === 'az'}
              className={`rounded-md px-2 py-1 text-label font-extrabold transition-colors ${
                language === 'az' ? 'bg-semantic-info text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              AZ
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              aria-pressed={language === 'en'}
              className={`rounded-md px-2 py-1 text-label font-extrabold transition-colors ${
                language === 'en' ? 'bg-semantic-info text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              EN
            </button>
          </div>
        </div>

        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">{t('Sign In')}</h1>
          <p className="text-xs text-slate-400 mt-1">{t('Active Directory LDAP Auth')}</p>
        </div>

        {errorMessage && (
          <div className="mb-5 flex gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="mb-5 flex gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <form className="space-y-4" onSubmit={handleLDAPSubmit}>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-300">{t('Username or corporate email')}</span>
            <div className="relative">
              <input
                autoComplete="username"
                className="w-full rounded-xl border border-slate-700 bg-semantic-dark-inset px-3.5 py-3 pr-10 text-sm outline-none transition focus:border-semantic-brand focus:ring-1 focus:ring-semantic-brand"
                onChange={(event) => setUsernameOrEmail(event.target.value)}
                placeholder={t('username or corporate email')}
                required
                value={usernameOrEmail}
              />
              <Users className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-slate-500" />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 flex justify-between gap-3 text-xs font-semibold text-slate-300">
              <span>{t('Password / Smart Card PIN')}</span>
              <span className="font-mono font-normal text-emerald-400">{t('Dev: optional')}</span>
            </span>
            <div className="relative">
              <input
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-700 bg-semantic-dark-inset px-3.5 py-3 pr-10 text-sm outline-none transition focus:border-semantic-brand focus:ring-1 focus:ring-semantic-brand"
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t('Leave blank for dev bypass')}
                type={showPassword ? 'text' : 'password'}
                value={password}
              />
              <button aria-label={t('Toggle password visibility')} className="absolute right-2.5 top-2.5 p-1 text-slate-500 hover:text-slate-200" onClick={() => setShowPassword((shown) => !shown)} type="button">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-semantic-brand px-4 py-3 text-sm font-bold text-white transition hover:bg-semantic-brand-hover-deep disabled:cursor-not-allowed disabled:opacity-60" disabled={isLoading} type="submit">
            {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            <span>{isLoading ? t('Authenticating...') : t('Sign In')}</span>
            {!isLoading && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>

        <p className="mt-6 flex items-center gap-2 text-xs text-slate-500">
          <Lock className="h-3.5 w-3.5" /> {t('Session securely stored; terminates upon logout.')}
        </p>
      </section>
    </main>
  );
};
