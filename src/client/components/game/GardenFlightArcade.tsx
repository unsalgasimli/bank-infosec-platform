import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  RotateCcw,
  Sparkles,
  Trophy,
  Shield,
  Wind,
  X,
} from "lucide-react";
import { ExpressbankEmblem } from "../common/ExpressbankLogo.js";
import { useAuth } from "../../context/AuthContext.js";
import { useI18n } from "../../context/I18nContext.js";
import {
  advanceBird,
  createBirdFlight,
  flapBird,
  type BirdFlight,
} from "../auth/garden/garden-bird-game.js";
import type {
  GameLeaderboardEntry,
  GamePlayerStats,
} from "../../../shared/types/game.js";
import {
  playAzerbaijanTrack,
  stopAzerbaijanMusic,
} from "./retro-azerbaijan-music.js";
import { RetroAzerbaijanPlayer } from "./RetroAzerbaijanPlayer.js";
import "./garden-flight-arcade.css";

const BirdFlightScene = lazy(() => import("./FlightArcadeScene.js"));

const LOCAL_BEST_KEY = "garden-flight.best";

function loadLocalBest(): number {
  try {
    const raw = window.localStorage.getItem(LOCAL_BEST_KEY);
    const value = raw == null ? Number.NaN : Number(raw);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

function saveLocalBest(best: number): void {
  try {
    window.localStorage.setItem(LOCAL_BEST_KEY, String(best));
  } catch {
    /* storage unavailable — best stays in memory */
  }
}

/**
 * Workplace edition of the login page's Garden Flight miniature.
 * The same porcelain songbird and physics, but every finished run is
 * recorded server-side under the signed-in player and feeds a live
 * leaderboard.
 */
export function GardenFlightArcade({
  onClose,
  onSwitchGame,
}: {
  onClose: () => void;
  onSwitchGame?: () => void;
}) {
  const { currentUser, fetchWithAuth } = useAuth();
  const { t } = useI18n();
  const [flight, setFlight] = useState<BirdFlight>(() => createBirdFlight(loadLocalBest()));
  const [leaderboard, setLeaderboard] = useState<GameLeaderboardEntry[] | null>(null);
  const [me, setMe] = useState<GamePlayerStats | null>(null);
  const [syncNote, setSyncNote] = useState<"idle" | "recording" | "saved" | "offline">("idle");
  const [bestBeforeRun, setBestBeforeRun] = useState(loadLocalBest());
  const stageRef = useRef<HTMLDivElement | null>(null);
  const mounted = useRef(true);
  const lastFrame = useRef<number | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Play "Sarı Gəlin" Azerbaijani Chiptune Folk Theme on mount
  useEffect(() => {
    playAzerbaijanTrack("sarigelin");
    return () => {
      stopAzerbaijanMusic();
    };
  }, []);

  // Load the board and the signed-in player's standing when the arcade opens.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetchWithAuth("/api/game/flight/leaderboard");
        const data = await response.json();
        if (cancelled || !mounted.current) return;
        if (data.success && Array.isArray(data.leaderboard)) {
          setLeaderboard(data.leaderboard);
          setMe(data.me ?? null);
          setFlight((previous) => ({ ...previous, best: Math.max(previous.best, data.me?.best ?? 0) }));
          setBestBeforeRun((previous) => Math.max(previous, data.me?.best ?? 0));
        } else {
          setLeaderboard([]);
        }
      } catch {
        if (!cancelled && mounted.current) {
          setLeaderboard([]);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [fetchWithAuth]);

  // Record each finished run exactly once, under the session identity.
  useEffect(() => {
    if (flight.status !== "crashed") return;
    saveLocalBest(flight.best);
    setSyncNote("recording");
    const record = async () => {
      try {
        const response = await fetchWithAuth("/api/game/flight/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score: flight.score }),
        });
        const data = await response.json();
        if (!mounted.current) return;
        if (!data.success) {
          setSyncNote("offline");
          return;
        }
        setLeaderboard(data.leaderboard ?? []);
        setMe(data.me ?? null);
        setBestBeforeRun(data.me?.best ?? flight.best);
        setSyncNote("saved");
      } catch {
        if (mounted.current) setSyncNote("offline");
      }
    };
    void record();
  }, [flight.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Physics loop — same cadence as the login-page miniature.
  useEffect(() => {
    let frame = 0;
    const tick = (now: number) => {
      const previous = lastFrame.current ?? now;
      lastFrame.current = now;
      setFlight((current) => advanceBird(current, Math.min(0.04, (now - previous) / 1000)));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const flap = useCallback(() => setFlight(flapBird), []);
  const resetFlight = useCallback(() => {
    setSyncNote("idle");
    setFlight((previous) => createBirdFlight(previous.best));
  }, []);

  // A run's "record" bar is the personal best as it stood when the run began.
  const prevStatusRef = useRef(flight.status);
  useEffect(() => {
    if (flight.status === "flying" && prevStatusRef.current !== "flying") {
      setBestBeforeRun(flight.best);
    }
    prevStatusRef.current = flight.status;
  }, [flight.status, flight.best]);

  // Focus the stage so keyboard play works immediately.
  useEffect(() => {
    stageRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "r" || event.key === "R") {
        resetFlight();
      } else if (event.key === " " || event.key === "Enter" || event.key === "ArrowUp") {
        if (!event.repeat) {
          event.preventDefault();
          flap();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [flap, onClose, resetFlight]);

  const personalBest = me?.best ?? flight.best;
  const isNewRecord =
    flight.status === "crashed" && flight.score > 0 && flight.score > bestBeforeRun;

  return (
    <div className="gfa" role="dialog" aria-modal="true" aria-label={t("Garden Flight Arcade")}>
      <div className="gfa__backdrop" onClick={onClose} aria-hidden="true" />
      <div className="gfa__panel">
        <div className="gfa__game">
          <div
            ref={stageRef}
            className="gfa__stage"
            role="application"
            tabIndex={0}
            aria-label={t("Garden Flight game. Press Space or click to flap.")}
            onClick={flap}
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter" || event.key === "ArrowUp") {
                event.preventDefault();
                if (!event.repeat) flap();
              }
            }}
          >
            <Suspense fallback={<div className="gfa__scene-fallback"><Wind size={22} /></div>}>
              <BirdFlightScene flight={flight} />
            </Suspense>

            <div className="gfa__hud">
              <div className="gfa__score-pill">
                <span className="gfa__score" key={flight.score}>{flight.score}</span>
                <div className="gfa__best-pill">
                  <Trophy size={12} />
                  <span>{t("BEST")}: {personalBest}</span>
                </div>
              </div>
              <div className="gfa__sync" data-state={syncNote}>
                {syncNote === "recording" && t("Recording score…")}
                {syncNote === "saved" && t("Saved to leaderboard")}
                {syncNote === "offline" && t("Offline — score kept locally")}
              </div>
            </div>

            {flight.status === "ready" && (
              <div className="gfa__overlay">
                <div className="gfa__card">
                  <div className="gfa__card-icon gfa__card-icon--pulse"><ExpressbankEmblem size={34} glow /></div>
                  <h3>{t("Ready for Flight")}</h3>
                  <p>{t("Click anywhere or press Space to take flight")}</p>
                  <div className="gfa__keys">
                    <span className="gfa__key">SPACE</span>
                    <span>/</span>
                    <span className="gfa__key">{t("CLICK")}</span>
                  </div>
                  {currentUser && (
                    <p className="gfa__card-player">
                      {t("Flying as")} <strong>{currentUser.fullName}</strong>
                    </p>
                  )}
                </div>
              </div>
            )}

            {flight.status === "crashed" && (
              <div className="gfa__overlay">
                <div className="gfa__card gfa__card--summary">
                  <div className="gfa__card-icon"><ExpressbankEmblem size={34} glow /></div>
                  <h3>{t("A Soft Landing")}</h3>
                  {isNewRecord && (
                    <div className="gfa__new-record">
                      <Sparkles size={14} />
                      <span>{t("NEW HIGH SCORE!")}</span>
                    </div>
                  )}
                  <div className="gfa__stats-row">
                    <div className="gfa__stat">
                      <span className="gfa__stat-label">{t("Flight Score")}</span>
                      <span className="gfa__stat-value">{flight.score}</span>
                    </div>
                    <div className="gfa__stat-sep" />
                    <div className="gfa__stat">
                      <span className="gfa__stat-label">{t("Personal Best")}</span>
                      <span className="gfa__stat-value gfa__stat-value--best">{personalBest}</span>
                    </div>
                    <div className="gfa__stat-sep" />
                    <div className="gfa__stat">
                      <span className="gfa__stat-label">{t("Rank")}</span>
                      <span className="gfa__stat-value">{me && me.runs > 0 ? `#${me.rank}` : "—"}</span>
                    </div>
                  </div>
                  <div className="gfa__card-actions">
                    <button
                      type="button"
                      className="gfa__btn gfa__btn--primary"
                      onClick={(event) => { event.stopPropagation(); flap(); }}
                    >
                      <RotateCcw size={14} />
                      {t("Fly Again (Space)")}
                    </button>
                    {onSwitchGame && (
                      <button
                        type="button"
                        className="gfa__btn gfa__btn--secondary"
                        onClick={(event) => { event.stopPropagation(); onSwitchGame(); }}
                        title={t("Retro Arcade Kabinetinə qayıt")}
                      >
                        <Sparkles size={14} />
                        {t("Arcade Menyu")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="gfa__btn gfa__btn--secondary"
                      onClick={(event) => { event.stopPropagation(); onClose(); }}
                    >
                      {t("Close (Esc)")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="gfa__footer">
            <div className="gfa__controls-hint">
              <span><kbd>Space</kbd> / <kbd>{t("Click")}</kbd> {t("Ascend / Boost")}</span>
              <span>•</span>
              <span><kbd>R</kbd> {t("Restart")}</span>
              <span>•</span>
              <span><kbd>Esc</kbd> {t("Close")}</span>
            </div>
            <button type="button" className="gfa__reset-btn" onClick={resetFlight}>
              <RotateCcw size={12} />
              {t("New flight")}
            </button>
          </div>
        </div>

        <aside className="gfa__board" aria-label={t("Garden Flight leaderboard")}>
          <div className="gfa__board-head">
            <div className="gfa__board-title">
              <Trophy size={15} />
              <span>{t("Leaderboard")}</span>
            </div>
            {/* Retro Azerbaijan BGM Player */}
            <RetroAzerbaijanPlayer compact style={{ marginRight: "4px" }} />

            {onSwitchGame && (
              <button
                type="button"
                className="gfa__switch-btn"
                onClick={onSwitchGame}
                title={t("Retro Arcade Kabinetinə qayıt")}
                aria-label={t("Retro Arcade Kabinetinə qayıt")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 10px",
                  borderRadius: "9999px",
                  border: "1px solid rgba(250, 166, 26, 0.4)",
                  background: "rgba(250, 166, 26, 0.12)",
                  color: "#ffca6a",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Sparkles size={12} />
                <span>{t("Retro Arcade")}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t("Close arcade (Esc)")}
              title="Esc"
            >
              <X size={16} />
            </button>
          </div>
          <p className="gfa__board-sub">{t("Best flight per colleague, live from the server.")}</p>
          <div className="gfa__board-list">
            {leaderboard === null && (
              <p className="gfa__board-empty">{t("Loading leaderboard…")}</p>
            )}
            {leaderboard !== null && leaderboard.length === 0 && (
              <p className="gfa__board-empty">
                {t("No recorded flights yet.")}
                <br />
                {t("Be the first to fly.")}
              </p>
            )}
            {leaderboard?.map((entry, index) => {
              const isMe = currentUser && entry.userId === currentUser.id;
              const rank = index + 1;
              return (
                <div
                  key={entry.userId}
                  className={`gfa__board-row ${isMe ? "is-me" : ""}`}
                >
                  <span
                    className={`gfa__board-rank ${rank <= 3 ? `is-top is-top-${rank}` : ""}`}
                  >
                    {rank}
                  </span>
                  <span className="gfa__board-name" title={`${entry.displayName} (${entry.username})`}>
                    {entry.displayName}
                    {isMe && <em> — {t("you")}</em>}
                  </span>
                  <span className="gfa__board-score">{entry.best}</span>
                </div>
              );
            })}
            {leaderboard !== null &&
              leaderboard.length > 0 &&
              me &&
              me.runs > 0 &&
              !leaderboard.some((entry) => entry.userId === me.userId) && (
                <>
                  <div className="gfa__board-gap" aria-hidden="true">⋯</div>
                  <div className="gfa__board-row is-me">
                    <span className="gfa__board-rank">{me.rank}</span>
                    <span className="gfa__board-name">
                      {currentUser?.fullName ?? me.userId}
                      <em> — {t("you")}</em>
                    </span>
                    <span className="gfa__board-score">{me.best}</span>
                  </div>
                </>
              )}
          </div>
          <div className="gfa__board-foot">
            <div>
              <span>{t("Your best")}</span>
              <strong>{me && me.runs > 0 ? me.best : personalBest}</strong>
            </div>
            <div>
              <span>{t("Rank")}</span>
              <strong>{me && me.runs > 0 ? `#${me.rank}` : "—"}</strong>
            </div>
            <div>
              <span>{t("Flights")}</span>
              <strong>{me?.runs ?? 0}</strong>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default GardenFlightArcade;
