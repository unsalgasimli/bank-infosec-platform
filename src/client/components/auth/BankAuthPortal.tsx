import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../context/I18nContext.js';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  FileCheck2,
  Lock,
  RefreshCw,
  Server,
  ShieldCheck,
  Users,
} from 'lucide-react';

interface BankAuthPortalProps {
  onLoginSuccess?: () => void;
}

const readinessRows = [
  { label: 'Directory services', value: 'Online', icon: Server },
  { label: 'Identity perimeter', value: 'Synchronized', icon: Database },
  { label: 'Append-only evidence log', value: 'Protected', icon: FileCheck2 },
];

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
    <main className="auth-shell" aria-labelledby="auth-title" data-i18n-skip>
      <section className="auth-brief" aria-label={t('Security Operations Workspace')}>
        <div className="auth-brief__inner">
          <div className="auth-brand-lockup">
            <div className="auth-brand-mark" aria-hidden="true">A</div>
            <div>
              <p className="auth-brand-name">Apex Bank GRC</p>
              <p className="auth-brand-caption">{t('Enterprise security operations')}</p>
            </div>
          </div>

          <div className="auth-brief__content">
            <div className="auth-kicker">
              <span className="auth-kicker__dot" />
              {t('Security Operations Workspace')}
            </div>
            <h1>{t('Control room access')}</h1>
            <p className="auth-brief__description">
              {t('A single operating surface for security work, evidence, and accountable decisions.')}
            </p>

            <div className="auth-signal-card">
              <div className="auth-signal-card__header">
                <div>
                  <p className="auth-micro-label">{t('Identity perimeter')}</p>
                  <p className="auth-signal-card__title">{t('Workspace readiness')}</p>
                </div>
                <span className="auth-status-pill"><Activity className="h-3.5 w-3.5" /> {t('Operational')}</span>
              </div>
              <div className="auth-signal-graph" aria-hidden="true">
                <div className="auth-graph-grid" />
                <svg viewBox="0 0 540 112" preserveAspectRatio="none" role="presentation">
                  <path d="M0 82H540" className="auth-graph-axis" />
                  <path d="M0 76 C33 76, 39 51, 74 57 S116 82, 151 66 S188 24, 224 45 S269 87, 303 68 S347 51, 377 58 S416 85, 446 42 S493 31, 540 19" className="auth-graph-line" />
                  <circle cx="540" cy="19" r="4" className="auth-graph-point" />
                </svg>
                <span className="auth-graph-label auth-graph-label--left">{t('Authentication path')} / 01</span>
                <span className="auth-graph-label auth-graph-label--right">{t('Verified')}</span>
              </div>
              <div className="auth-signal-card__footer">
                <span>{t('Live directory boundary')}</span>
                <span className="auth-mono">LDAPS / TIER 1</span>
              </div>
            </div>

            <div className="auth-readiness-list">
              {readinessRows.map(({ label, value, icon: Icon }) => (
                <div className="auth-readiness-row" key={label}>
                  <span className="auth-readiness-row__icon"><Icon className="h-4 w-4" /></span>
                  <span className="auth-readiness-row__label">{t(label)}</span>
                  <span className="auth-readiness-row__value"><span />{t(value)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="auth-brief__footer">
            <span className="auth-mono">APEX / IS-PLATFORM</span>
            <span>{t('Access is limited to authorized bank personnel.')}</span>
          </div>
        </div>
      </section>

      <section className="auth-form-surface">
        <div className="auth-form-surface__topbar">
          <span className="auth-form-index">01 / 02</span>
          <div className="auth-language-switcher" role="group" aria-label={t('Switch language')}>
            <button type="button" onClick={() => setLanguage('az')} aria-pressed={language === 'az'}>AZ</button>
            <button type="button" onClick={() => setLanguage('en')} aria-pressed={language === 'en'}>EN</button>
          </div>
        </div>

        <div className="auth-form-content">
          <div className="auth-form-heading">
            <div className="auth-form-icon" aria-hidden="true"><ShieldCheck className="h-5 w-5" /></div>
            <p className="auth-micro-label">{t('Corporate credentials')}</p>
            <h2 id="auth-title">{t('Enter the security workspace')}</h2>
            <p>{t('Use your corporate directory credentials.')}</p>
          </div>

          {errorMessage && (
            <div className="auth-message auth-message--error" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div className="auth-message auth-message--success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <form className="auth-form" onSubmit={handleLDAPSubmit}>
            <label className="auth-field">
              <span>{t('Username or corporate email')}</span>
              <div className="auth-input-wrap">
                <input
                  autoComplete="username"
                  onChange={(event) => setUsernameOrEmail(event.target.value)}
                  placeholder={t('username or corporate email')}
                  required
                  value={usernameOrEmail}
                />
                <Users className="auth-input-icon" aria-hidden="true" />
              </div>
            </label>

            <label className="auth-field">
              <span className="auth-field__label-row">
                <span>{t('Password / Smart Card PIN')}</span>
                <span className="auth-field__hint">{t('Dev: optional')}</span>
              </span>
              <div className="auth-input-wrap">
                <input
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t('Leave blank for dev bypass')}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                />
                <button aria-label={t('Toggle password visibility')} className="auth-input-action" onClick={() => setShowPassword((shown) => !shown)} type="button">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            <button className="auth-submit" disabled={isLoading} type="submit">
              <span className="auth-submit__label">
                {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                {isLoading ? t('Authenticating...') : t('Sign In')}
              </span>
              {!isLoading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          <div className="auth-form-note">
            <Lock className="h-3.5 w-3.5" />
            <span>{t('Session securely stored; terminates upon logout.')}</span>
          </div>
        </div>

        <div className="auth-form-surface__footer">
          <span><span className="auth-live-dot" /> {t('Directory verified')}</span>
          <span className="auth-mono">{t('Secure session')} / HTTP-ONLY</span>
        </div>
      </section>
    </main>
  );
};
