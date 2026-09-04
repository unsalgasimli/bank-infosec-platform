import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext.js";
import { useI18n } from "../../context/I18nContext.js";
import { WindGarden } from "./garden/WindGarden.js";
import type { GardenPhase } from "./garden/garden-state.js";
import "./garden/wind-garden.css";

interface BankAuthPortalProps {
  onLoginSuccess?: () => void;
  onAuthenticationStart?: () => void;
  onAuthenticationFailure?: () => void;
}

export const BankAuthPortal: React.FC<BankAuthPortalProps> = ({
  onLoginSuccess,
  onAuthenticationStart,
  onAuthenticationFailure,
}) => {
  const { ldapLogin, currentUser } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const mounted = useRef(true);
  const successCallback = useRef(onLoginSuccess);
  successCallback.current = onLoginSuccess;
  const copy = (en: string, az: string) => (language === "az" ? az : en);
  const phase: GardenPhase = currentUser
    ? "entering"
    : isLoading
      ? "pending"
      : errorMessage
        ? "error"
        : "idle";

  useEffect(() => {
    mounted.current = true;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => {
      mounted.current = false;
      media.removeEventListener("change", update);
    };
  }, []);
  useEffect(() => {
    if (!currentUser) return;
    setPassword("");
    // The identity was already validated by AuthContext. Only presentation waits.
    const timer = window.setTimeout(
      () => successCallback.current?.(),
      reducedMotion ? 0 : 800,
    );
    return () => window.clearTimeout(timer);
  }, [currentUser, reducedMotion]);

  const handleLDAPSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isLoading || currentUser) return;
    const username = usernameOrEmail.trim();
    if (!username) {
      setErrorMessage(t("Username or corporate email is required."));
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    onAuthenticationStart?.();
    try {
      // Preserve the existing payload and credential normalization contract.
      const result = await ldapLogin({
        usernameOrEmail: username,
        password: password.trim(),
      });
      if (!mounted.current) return;
      if (!result.success) {
        setErrorMessage(result.message || t("LDAP authentication failed."));
        setIsLoading(false);
        onAuthenticationFailure?.();
      }
    } catch {
      if (mounted.current) {
        setErrorMessage(
          copy(
            "Unable to connect. Please try again.",
            "Bağlantı qurulmadı. Yenidən cəhd edin.",
          ),
        );
        setIsLoading(false);
        onAuthenticationFailure?.();
      }
    }
  };

  return (
    <main
      className={`garden-login ${phase === "entering" ? "is-entering" : ""}`}
      data-i18n-skip
      data-motion={reducedMotion ? "reduced" : "full"}
    >
      <a className="garden-skip" href="#garden-username">
        {copy("Skip to sign in", "Girişə keç")}
      </a>
      <header className="garden-header">
        <a
          className="garden-brand"
          href="#garden-username"
          aria-label="Apex Bank GRC"
        >
          <span className="garden-brand__symbol" aria-hidden="true">
            a<span>·</span>
          </span>
          <span>
            APEX<span>BANK GRC</span>
          </span>
        </a>
        <span className="garden-header__note">
          {copy(
            "A place for everything that matters.",
            "Önəmli olan hər şey üçün bir məkan.",
          )}
        </span>
        <div
          className="garden-language"
          role="group"
          aria-label={t("Switch language")}
        >
          <button
            type="button"
            onClick={() => setLanguage("az")}
            aria-pressed={language === "az"}
          >
            AZ
          </button>
          <span>/</span>
          <button
            type="button"
            onClick={() => setLanguage("en")}
            aria-pressed={language === "en"}
          >
            EN
          </button>
        </div>
      </header>
      <div className="garden-layout">
        <WindGarden
          language={language}
          phase={phase}
          reducedMotion={reducedMotion}
        />
        <section className="garden-access" aria-labelledby="garden-auth-title">
          <div className="garden-access__rule">
            <span>{copy("YOUR WORKSPACE", "SİZİN İŞ SAHƏNİZ")}</span>
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <div className="garden-access__content">
            <p className="garden-eyebrow">
              {copy("GOOD TO HAVE YOU HERE", "SİZİ BURADA GÖRMƏK XOŞDUR")}
            </p>
            <h2 id="garden-auth-title">
              {copy("Welcome", "Xoş")}
              <br />
              <em>{copy("inside.", "gəlmisiniz.")}</em>
            </h2>
            <p className="garden-access__intro">
              {t("Use your corporate directory credentials.")}
            </p>
            <form
              className="garden-form"
              onSubmit={handleLDAPSubmit}
              aria-busy={isLoading}
            >
              <label htmlFor="garden-username">
                {t("Username or corporate email")}
              </label>
              <input
                id="garden-username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={usernameOrEmail}
                onChange={(event) => setUsernameOrEmail(event.target.value)}
                placeholder={copy("your.name@apex.az", "adınız@apex.az")}
                readOnly={isLoading || !!currentUser}
                aria-describedby={
                  errorMessage ? "garden-auth-error" : undefined
                }
              />
              <label
                className="garden-password-label"
                htmlFor="garden-password"
              >
                <span>{t("Password / Smart Card PIN")}</span>
                {import.meta.env.DEV && <small>{t("Dev: optional")}</small>}
              </label>
              <div className="garden-password">
                <input
                  id="garden-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={copy(
                    "Enter your password",
                    "Şifrənizi daxil edin",
                  )}
                  readOnly={isLoading || !!currentUser}
                  aria-describedby={
                    errorMessage ? "garden-auth-error" : undefined
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-label={t("Toggle password visibility")}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errorMessage && (
                <p
                  id="garden-auth-error"
                  className="garden-auth-error"
                  role="alert"
                >
                  {errorMessage}
                </p>
              )}
              <button
                className="garden-submit"
                disabled={isLoading || !!currentUser}
                type="submit"
              >
                <span>
                  {currentUser
                    ? copy("Come on in", "Buyurun")
                    : isLoading
                      ? t("Authenticating...")
                      : t("Sign In")}
                </span>
                {isLoading && !currentUser ? (
                  <LoaderCircle
                    size={19}
                    className="garden-loading"
                    aria-hidden="true"
                  />
                ) : (
                  <ArrowRight size={20} aria-hidden="true" />
                )}
              </button>
              <span className="garden-auth-status" role="status">
                {currentUser ? t("Authenticated. Entering system...") : ""}
              </span>
            </form>
            <p className="garden-session-note">
              <LockKeyhole size={13} aria-hidden="true" />
              {t("Session securely stored; terminates upon logout.")}
            </p>
          </div>
          <footer className="garden-access__footer">
            <span>APEX / IS-PLATFORM</span>
            <p>{t("Access is limited to authorized bank personnel.")}</p>
          </footer>
        </section>
      </div>
      <div className="garden-entry" aria-hidden="true">
        <div />
      </div>
    </main>
  );
};
