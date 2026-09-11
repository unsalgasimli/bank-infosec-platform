import React, { lazy, Suspense, useEffect, useState } from "react";
import { Lock, X, Clock, ShieldAlert, Swords, Crosshair } from "lucide-react";
import { ExpressbankEmblem } from "../common/ExpressbankLogo.js";
import { useAuth } from "../../context/AuthContext.js";
import { useI18n } from "../../context/I18nContext.js";
import {
  useArcadeAccess,
  checkArcadeAccess,
  type ArcadeAccessInfo,
} from "./arcade-access-policy.js";
import "./garden-flight-arcade.css";

const GardenFlightArcade = lazy(() => import("./GardenFlightArcade.js"));
const CyberDefenseArcade = lazy(() => import("./cyber/CyberDefenseArcade.js"));
const VaultBreakerArcade = lazy(() => import("./breaker/VaultBreakerArcade.js"));
const CyberSweeperArcade = lazy(() => import("./sweeper/CyberSweeperArcade.js"));
const CyberSudokuArcade = lazy(() => import("./sudoku/CyberSudokuArcade.js"));
const RetroArcadeCabinet = lazy(() => import("./RetroArcadeCabinet.js"));
const CyberBattleArcade = lazy(() =>
  import("./battle/CyberBattleArcade.js").then((m) => ({ default: m.CyberBattleArcade }))
);
const ChallengeModal = lazy(() =>
  import("./battle/ChallengeModal.js").then((m) => ({ default: m.ChallengeModal }))
);
const CyberShooterArcade = lazy(() =>
  import("./shooter/CyberShooterArcade.js").then((m) => ({ default: m.CyberShooterArcade }))
);
import { IncomingChallengeAlert } from "./battle/IncomingChallengeAlert.js";

/**
 * Dispatches a global event to open the Retro Arcade Cabinet selector
 */
export function openRetroArcade(): void {
  window.dispatchEvent(new CustomEvent("open-retro-arcade"));
}

/**
 * Dispatches a global event to open 1v1 Battle Challenge Menu
 */
export function openBattleChallenge(matchId?: string): void {
  window.dispatchEvent(new CustomEvent("open-battle-challenge", { detail: { matchId } }));
}

/**
 * Enterprise Working Hours Policy Modal: shown if games are requested during working hours
 */
function ArcadePolicyModal({
  access,
  isAz,
  onClose,
}: {
  access: ArcadeAccessInfo;
  isAz: boolean;
  onClose: () => void;
}) {
  return (
    <div className="rac-policy-overlay" role="dialog" aria-modal="true">
      <div className="rac-policy-card">
        <div className="rac-policy-card__header">
          <div className="rac-policy-card__badge">
            <ExpressbankEmblem size={22} glow />
            <span>EXPRESSBANK INFOSEC & HR</span>
          </div>
          <button
            type="button"
            className="rac-policy-card__close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="rac-policy-card__body">
          <div className="rac-policy-card__icon-wrap">
            <Lock size={32} color="#ffb800" />
          </div>

          <h3 className="rac-policy-card__title">
            {isAz
              ? "İş Saatlarında Oyunlara Giriş Məhdudlaşdırılıb"
              : "Arcade Games Restricted During Working Hours"}
          </h3>

          <p className="rac-policy-card__lead">
            {isAz
              ? "Expressbank daxili nizam-intizam və informasiya təhlükəsizliyi siyasətinə əsasən, Retro Arcade oyunları iş saatlarında məhdudlaşdırılıb."
              : "Per Expressbank enterprise policy and infosec regulations, Retro Arcade games are restricted during corporate working hours."}
          </p>

          <div className="rac-policy-card__time-badge">
            <Clock size={15} color="#00e5ff" />
            <span>{isAz ? "Cari Bakı Vaxtı:" : "Current Baku Time:"}</span>
            <strong>{access.bakuTimeStr} (UTC+4)</strong>
          </div>

          <div className="rac-policy-card__schedule">
            <div className="rac-policy-card__schedule-title">
              {isAz
                ? "İcazəli Giriş Cədvəli (Bakı Vaxtı ilə):"
                : "Allowed Access Schedule (Baku Time):"}
            </div>
            <ul className="rac-policy-card__schedule-list">
              <li className="rac-policy-card__item rac-policy-card__item--allowed">
                <span className="rac-policy-indicator">●</span>
                <span>
                  <strong>{isAz ? "Həftə içi Nahar fasiləsi:" : "Weekday Lunch Break:"}</strong> 13:00 – 14:00
                </span>
              </li>
              <li className="rac-policy-card__item rac-policy-card__item--allowed">
                <span className="rac-policy-indicator">●</span>
                <span>
                  <strong>{isAz ? "Həftə içi İşdən sonra / Gecə:" : "Weekday After-Hours / Night:"}</strong> 18:00 – 09:00
                </span>
              </li>
              <li className="rac-policy-card__item rac-policy-card__item--allowed">
                <span className="rac-policy-indicator">●</span>
                <span>
                  <strong>{isAz ? "Həftə sonu (Şənbə & Bazar):" : "Weekends (Sat & Sun):"}</strong> 7/24 Açıq
                </span>
              </li>
              <li className="rac-policy-card__item rac-policy-card__item--blocked">
                <span className="rac-policy-indicator">✕</span>
                <span>
                  <strong>{isAz ? "İş saatları (Qapalı):" : "Work Hours (Locked):"}</strong> 09:00 – 13:00 & 14:00 – 18:00
                </span>
              </li>
            </ul>
          </div>

          <div className="rac-policy-card__notice">
            <ShieldAlert size={16} color="#ff4d4f" />
            <span>{isAz ? access.nextWindowNotice.az : access.nextWindowNotice.en}</span>
          </div>
        </div>

        <div className="rac-policy-card__footer">
          <button
            type="button"
            className="rac-policy-btn rac-policy-btn--primary"
            onClick={onClose}
          >
            {isAz ? "Başa düşdüm • İşə qayıt" : "Understood • Return to Work"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Top-level Error Boundary to catch any game loading or WebGL failure
 * and prevent white screen of death in the platform.
 */
class ArcadeErrorBoundary extends React.Component<
  { children: React.ReactNode; onClose: () => void; isAz: boolean },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: "" };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error: error?.message || "Arcade module loading error" };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ArcadeErrorBoundary caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            background: "rgba(4, 7, 17, 0.96)",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            padding: 24,
            fontFamily: "Inter, sans-serif",
          }}
        >
          <div
            style={{
              background: "#0d1628",
              border: "1px solid #ef4444",
              borderRadius: 16,
              padding: "32px 40px",
              textAlign: "center",
              maxWidth: 480,
              boxShadow: "0 0 40px rgba(239, 68, 68, 0.25)",
            }}
          >
            <ShieldAlert size={48} color="#ef4444" style={{ margin: "0 auto 14px" }} />
            <h2 style={{ fontSize: 20, fontWeight: 900, color: "#ef4444", marginBottom: 8 }}>
              {this.props.isAz ? "Oyun Modulunda Xəta" : "Game Module Error"}
            </h2>
            <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
              {this.state.error}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: "" })}
                style={{
                  background: "#00f576",
                  color: "#040711",
                  border: "none",
                  fontWeight: 800,
                  fontSize: 13,
                  padding: "10px 20px",
                  borderRadius: 20,
                  cursor: "pointer",
                }}
              >
                {this.props.isAz ? "Yenidən Yüklə" : "Retry"}
              </button>
              <button
                type="button"
                onClick={this.props.onClose}
                style={{
                  background: "#ef4444",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: 800,
                  fontSize: 13,
                  padding: "10px 20px",
                  borderRadius: 20,
                  cursor: "pointer",
                }}
              >
                {this.props.isAz ? "Arcade-ə Qayıt" : "Exit"}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Loading state with glowing Expressbank emblem during 3D chunk download
 */
function ShooterLoadingOverlay({ isAz }: { isAz: boolean }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "#040711",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        color: "#ffffff",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <ExpressbankEmblem size={56} glow />
      <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "2px", color: "#00f576" }}>
        EXPRESSBANK CYBER SHOOTER
      </div>
      <div style={{ fontSize: 13, color: "#94a3b8" }}>
        {isAz ? "3D Server Mərkəzi Yüklənir..." : "Loading 3D Datacenter Arena..."}
      </div>
      <div
        style={{
          width: 180,
          height: 4,
          background: "rgba(255, 255, 255, 0.1)",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "linear-gradient(90deg, #00f576, #00e5ff)",
            animation: "pulse 1.2s infinite ease-in-out",
          }}
        />
      </div>
    </div>
  );
}

/**
 * The workplace easter egg: a golden Expressbank emblem drifting near the
 * bottom-right corner of the authenticated app.
 *
 * POLICY:
 * Visible & Accessible ONLY during Baku time (UTC+4):
 * - Weekdays: 13:00 - 14:00 & 18:00 - 09:00
 * - Weekends: 24/7
 */
export function FlightEasterEgg() {
  const { currentUser } = useAuth();
  const { t, language } = useI18n();
  const isAz = language === "az";
  const access = useArcadeAccess(currentUser, 15000);
  const [activeGame, setActiveGame] = useState<"selector" | "cyber" | "flight" | "breaker" | "sweeper" | "sudoku" | "battle" | "shooter" | null>(null);
  const [activeBattleMatchId, setActiveBattleMatchId] = useState<string | null>(null);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);

  useEffect(() => {
    const handleOpenArcade = () => {
      const current = checkArcadeAccess(currentUser);
      if (current.isAccessible) {
        setActiveGame("selector");
      } else {
        setShowPolicyModal(true);
      }
    };
    window.addEventListener("open-retro-arcade", handleOpenArcade);
    return () => window.removeEventListener("open-retro-arcade", handleOpenArcade);
  }, []);

  useEffect(() => {
    const handleOpenBattle = (e: Event) => {
      const custom = e as CustomEvent<{ matchId?: string }>;
      if (custom.detail?.matchId) {
        setActiveBattleMatchId(custom.detail.matchId);
        setActiveGame("battle");
      } else {
        setShowChallengeModal(true);
      }
    };
    window.addEventListener("open-battle-challenge", handleOpenBattle);
    return () => window.removeEventListener("open-battle-challenge", handleOpenBattle);
  }, []);

  // Gracefully dismiss active game and display policy if workday window starts while in game
  useEffect(() => {
    if (activeGame !== null && activeGame !== "battle" && !access.isAccessible) {
      setActiveGame(null);
      setShowPolicyModal(true);
    }
  }, [access.isAccessible, activeGame]);

  if (!currentUser) return null;

  // If outside allowed hours and no modal or game is active, still listen for incoming challenges
  if (!access.isAccessible && !showPolicyModal && !activeGame && !activeBattleMatchId && !showChallengeModal) {
    return (
      <IncomingChallengeAlert
        onAccept={(matchId) => {
          setActiveBattleMatchId(matchId);
          setActiveGame("battle");
        }}
      />
    );
  }

  return (
    <>
      {/* 1v1 Real-Time Incoming Challenge Alert */}
      <IncomingChallengeAlert
        onAccept={(matchId) => {
          setActiveBattleMatchId(matchId);
          setActiveGame("battle");
        }}
      />

      {/* 1v1 Battle Challenge Selection Modal */}
      {showChallengeModal && (
        <Suspense fallback={null}>
          <ChallengeModal
            onClose={() => setShowChallengeModal(false)}
            onChallengeCreated={(mId) => {
              setShowChallengeModal(false);
              setActiveBattleMatchId(mId);
              setActiveGame("battle");
            }}
          />
        </Suspense>
      )}

      {/* 1v1 Battleship Match Screen */}
      {activeBattleMatchId && (
        <Suspense fallback={null}>
          <CyberBattleArcade
            matchId={activeBattleMatchId}
            onClose={() => {
              setActiveBattleMatchId(null);
              setActiveGame("selector");
            }}
          />
        </Suspense>
      )}

      {/* 3D Cyber Shooter: IT Warfare FPS Arena */}
      {activeGame === "shooter" && (
        <ArcadeErrorBoundary
          isAz={isAz}
          onClose={() => setActiveGame("selector")}
        >
          <Suspense fallback={<ShooterLoadingOverlay isAz={isAz} />}>
            <CyberShooterArcade
              onClose={() => setActiveGame("selector")}
              onSwitchGame={() => setActiveGame("selector")}
            />
          </Suspense>
        </ArcadeErrorBoundary>
      )}

      {showPolicyModal && (
        <ArcadePolicyModal
          access={access}
          isAz={isAz}
          onClose={() => setShowPolicyModal(false)}
        />
      )}

      {access.isAccessible && (
        <div className="flight-egg">
          {activeGame === "selector" && (
            <Suspense fallback={null}>
              <RetroArcadeCabinet
                onSelectGame={(game, matchId) => {
                  if (game === "battle" && matchId) {
                    setActiveBattleMatchId(matchId);
                    setActiveGame("battle");
                  } else {
                    setActiveGame(game);
                  }
                }}
                onClose={() => setActiveGame(null)}
              />
            </Suspense>
          )}

          {activeGame === "flight" && (
            <Suspense fallback={null}>
              <GardenFlightArcade
                onClose={() => setActiveGame("selector")}
                onSwitchGame={() => setActiveGame("selector")}
              />
            </Suspense>
          )}

          {activeGame === "cyber" && (
            <Suspense fallback={null}>
              <CyberDefenseArcade
                onClose={() => setActiveGame("selector")}
                onSwitchGame={() => setActiveGame("selector")}
              />
            </Suspense>
          )}

          {activeGame === "breaker" && (
            <Suspense fallback={null}>
              <VaultBreakerArcade
                onClose={() => setActiveGame("selector")}
                onSwitchGame={() => setActiveGame("selector")}
              />
            </Suspense>
          )}

          {activeGame === "sweeper" && (
            <Suspense fallback={null}>
              <CyberSweeperArcade
                onClose={() => setActiveGame("selector")}
                onSwitchGame={() => setActiveGame("selector")}
              />
            </Suspense>
          )}

          {activeGame === "sudoku" && (
            <Suspense fallback={null}>
              <CyberSudokuArcade
                onClose={() => setActiveGame("selector")}
                onSwitchGame={() => setActiveGame("selector")}
              />
            </Suspense>
          )}



          <div className="flight-egg__tooltip" aria-hidden="true">
            <div className="flight-egg__tooltip-head">
              <ExpressbankEmblem size={15} glow />
              <strong>EXPRESSBANK RETRO ARCADE</strong>
            </div>
            <div className="flight-egg__tooltip-desc">
              {isAz
                ? "🎯 3D Kiber Atıcı • 🚀 Kiber Gəmi • 🧱 Kassa Dağıtıcı • 🐦 Bağ Uçuşu • 💣 Mina Axtaran • 🔢 Sudoku • ⚔️ Dəniz Döyüşü"
                : "🎯 3D Cyber Shooter • 🚀 Cyber Ship • 🧱 Vault Breaker • 🐦 Garden Flight • 💣 Minesweeper • 🔢 Sudoku • ⚔️ Battleship"}
            </div>
            <div className="flight-egg__tooltip-time">
              <span className="flight-egg__time-dot" />
              <span>
                {isAz ? "Bakı vaxtı:" : "Baku time:"} {access.bakuTimeStr} •{" "}
                {access.isWeekend
                  ? (isAz ? "Həftəsonu (7/24 Açıq)" : "Weekend (24/7 Open)")
                  : access.isInfosecExempt
                  ? (isAz ? "İnformasiya Təhlükəsizliyi (7/24 Açıq)" : "Infosec Exemption (24/7 Open)")
                  : access.isLunchBreak
                  ? (isAz ? "Nahar fasiləsi (13:00 - 14:00)" : "Lunch (13:00 - 14:00)")
                  : access.isBypassActive
                  ? (isAz ? "Test rejimi (Açıq)" : "Test mode (Open)")
                  : (isAz ? "İşdən sonra (18:00 - 09:00)" : "After-hours (18:00 - 09:00)")}
              </span>
            </div>
            <div className="flight-egg__tooltip-hint">
              {isAz ? "Oyun kabinetini açmaq üçün klikləyin" : "Click to launch arcade cabinet"}
            </div>
          </div>
          <div className="flight-egg__btn-group">
            <button
              type="button"
              className="flight-egg__btn flight-egg__btn--shooter"
              onClick={() => setActiveGame("shooter")}
              title={isAz ? "3D Kiber Atıcı • IT Döyüşü (Krunker FPS)" : "3D Cyber Shooter • IT Warfare (Krunker FPS)"}
              aria-label={isAz ? "3D Kiber Atıcı" : "3D Cyber Shooter"}
            >
              <span className="flight-egg__pulse-dot flight-egg__pulse-dot--cyan" />
              <Crosshair size={18} color="#00f576" />
              <span className="flight-egg__btn-label" style={{ color: "#00f576" }}>
                FPS
              </span>
            </button>

            <button
              type="button"
              className="flight-egg__btn flight-egg__btn--challenge"
              onClick={() => setShowChallengeModal(true)}
              title={isAz ? "1v1 Kiber Dəniz Döyüşü • Həmkarına Meydan Oxu" : "1v1 Cyber Battleship • Challenge Colleague"}
              aria-label={isAz ? "Meydan Oxu (1v1 Döyüş)" : "Challenge (1v1 Battle)"}
            >
              <span className="flight-egg__pulse-dot flight-egg__pulse-dot--cyan" />
              <Swords size={18} color="#00e5ff" />
              <span className="flight-egg__btn-label flight-egg__btn-label--cyan">
                {isAz ? "MEYDAN OXU" : "CHALLENGE"}
              </span>
            </button>

            <button
              type="button"
              className="flight-egg__btn"
              onClick={() => setActiveGame((prev) => (prev ? null : "selector"))}
              aria-label={t("Open Expressbank Arcade")}
              aria-haspopup="dialog"
            >
              <span className="flight-egg__pulse-dot" />
              <ExpressbankEmblem size={22} glow />
              <span className="flight-egg__btn-label">ARCADE</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default FlightEasterEgg;
