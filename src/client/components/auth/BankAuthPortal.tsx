import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Lock, RefreshCw, ShieldCheck, Users } from 'lucide-react';

interface BankAuthPortalProps {
  onLoginSuccess?: () => void;
}

export const BankAuthPortal: React.FC<BankAuthPortalProps> = ({ onLoginSuccess }) => {
  const { ldapLogin } = useAuth();
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
      setErrorMessage('İstifadəçi adı və ya korporativ email daxil edilməlidir.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await ldapLogin({ usernameOrEmail: username, password: password.trim() });
      if (!result.success) {
        setErrorMessage(result.message || 'LDAP autentifikasiyası uğursuz oldu.');
        return;
      }

      setPassword('');
      setSuccessMessage('Doğrulandı. Sistemə daxil olunur...');
      window.setTimeout(() => onLoginSuccess?.(), 350);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#070B12] px-4 py-8 text-slate-100 sm:grid sm:place-items-center">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0D1424] p-6 shadow-2xl sm:p-8">
        <div className="mb-8 flex items-center gap-3">
          <div>
            <p className="text-sm font-bold tracking-wide text-white">Fiuuuu</p>
    
          </div>
        </div>

        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">Daxil ol</h1>
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
            <span className="mb-1.5 block text-xs font-semibold text-slate-300">İstifadəçi adı və ya email</span>
            <div className="relative">
              <input
                autoComplete="username"
                className="w-full rounded-xl border border-slate-700 bg-[#080D18] px-3.5 py-3 pr-10 text-sm outline-none transition focus:border-[#00B259] focus:ring-1 focus:ring-[#00B259]"
                onChange={(event) => setUsernameOrEmail(event.target.value)}
                placeholder="istifadəçi adı"
                required
                value={usernameOrEmail}
              />
              <Users className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-slate-500" />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 flex justify-between gap-3 text-xs font-semibold text-slate-300">
              <span>Şifrə / Smart Card PIN</span>
              <span className="font-mono font-normal text-emerald-400">Dev: boş qala bilər</span>
            </span>
            <div className="relative">
              <input
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-700 bg-[#080D18] px-3.5 py-3 pr-10 text-sm outline-none transition focus:border-[#00B259] focus:ring-1 focus:ring-[#00B259]"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="development bypass üçün boş saxlayın"
                type={showPassword ? 'text' : 'password'}
                value={password}
              />
              <button aria-label="Şifrəni göstər" className="absolute right-2.5 top-2.5 p-1 text-slate-500 hover:text-slate-200" onClick={() => setShowPassword((shown) => !shown)} type="button">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00B259] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#009e4e] disabled:cursor-not-allowed disabled:opacity-60" disabled={isLoading} type="submit">
            {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            <span>{isLoading ? 'Doğrulanır...' : 'Daxil ol'}</span>
            {!isLoading && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>

        <p className="mt-6 flex items-center gap-2 text-xs text-slate-500">
          <Lock className="h-3.5 w-3.5" /> Sessiya brauzerdə təhlükəsiz saxlanılır; logout ilə bitir.
        </p>
      </section>
    </main>
  );
};
