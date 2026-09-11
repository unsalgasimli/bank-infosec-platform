import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Swords,
  RotateCw,
  Sparkles,
  Shuffle,
  CheckCircle,
  Crosshair,
  Shield,
  Radio,
  Flame,
  Volume2,
  VolumeX,
  Layers,
  Award,
  AlertTriangle,
} from "lucide-react";
import { ExpressbankEmblem } from "../../common/ExpressbankLogo.js";
import { useAuth } from "../../../context/AuthContext.js";
import { useI18n } from "../../../context/I18nContext.js";
import {
  FLEET_SPECS,
  GRID_LETTERS,
  GRID_NUMBERS,
  canPlaceShip,
  generateRandomFleet,
  isFleetDeploymentComplete,
  getSunkPerimeterKeys,
  type PlacedShip,
  type ShipCoordinate,
  type ShipSpec,
} from "./cyber-battle-engine.js";
import {
  playSonarBlipSound,
  playCannonShotSound,
  playWaterSplashSound,
  playExplosionSound,
  playShipSunkAlarmSound,
  playVictoryFanfare,
  playDefeatSound,
} from "./cyber-battle-sounds.js";
import { isArcadeMuted, toggleArcadeMuted } from "../retro-arcade-sound.js";
import "./cyber-battle-arcade.css";

interface CyberBattleArcadeProps {
  matchId: string;
  onClose: () => void;
}

export const CyberBattleArcade: React.FC<CyberBattleArcadeProps> = ({
  matchId,
  onClose,
}) => {
  const { currentUser, fetchWithAuth } = useAuth();
  const { language } = useI18n();
  const isAz = language === "az";

  const [matchState, setMatchState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(() => isArcadeMuted());

  // Phase 1 Placement State
  const [placedShips, setPlacedShips] = useState<PlacedShip[]>(() => generateRandomFleet());
  const [selectedSpecId, setSelectedSpecId] = useState<string>("flagship");
  const [isHorizontal, setIsHorizontal] = useState(true);
  const [hoverCoord, setHoverCoord] = useState<ShipCoordinate | null>(null);
  const [submittingFleet, setSubmittingFleet] = useState(false);
  const [firing, setFiring] = useState(false);

  const prevShotsTakenCount = useRef(0);
  const prevShotsReceivedCount = useRef(0);
  const prevStatusRef = useRef<string | null>(null);

  // Fetch match state
  const loadMatchState = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`/api/battle/match/${matchId}`);
      const data = await res.json();
      if (data && data.success && data.state) {
        setMatchState(data.state);
      }
    } catch {
      /* resilient fallback */
    } finally {
      setLoading(false);
    }
  }, [matchId, fetchWithAuth]);

  // Real-time EventSource SSE listener + Polling fallback
  useEffect(() => {
    void loadMatchState();

    let sse: EventSource | null = null;
    try {
      sse = new EventSource(`/api/battle/stream/${matchId}`);
      sse.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload && payload.state) {
            setMatchState(payload.state);
          }
        } catch {
          /* parse error */
        }
      };
    } catch {
      /* SSE unavailable fallback to polling */
    }

    // Secondary resilient interval polling (every 1.8s)
    const pollInterval = setInterval(() => {
      void loadMatchState();
    }, 1800);

    return () => {
      if (sse) sse.close();
      clearInterval(pollInterval);
    };
  }, [matchId, loadMatchState]);

  // Audio cues on state updates (hits, misses, sunk, victory, defeat)
  useEffect(() => {
    if (!matchState) return;

    // Check my shots
    if (matchState.me?.shotsTaken?.length > prevShotsTakenCount.current) {
      const latest = matchState.me.shotsTaken[matchState.me.shotsTaken.length - 1];
      if (latest.result === "SUNK") {
        playShipSunkAlarmSound();
      } else if (latest.result === "HIT") {
        playExplosionSound();
      } else if (latest.result === "MISS") {
        playWaterSplashSound();
      }
      prevShotsTakenCount.current = matchState.me.shotsTaken.length;
    }

    // Check enemy incoming shots
    if (matchState.me?.shotsReceived?.length > prevShotsReceivedCount.current) {
      const latest = matchState.me.shotsReceived[matchState.me.shotsReceived.length - 1];
      if (latest.result === "HIT" || latest.result === "SUNK") {
        playExplosionSound();
      } else {
        playWaterSplashSound();
      }
      prevShotsReceivedCount.current = matchState.me.shotsReceived.length;
    }

    // Check game finish
    if (matchState.status === "FINISHED" && prevStatusRef.current !== "FINISHED") {
      if (matchState.winnerUserId === currentUser?.id) {
        playVictoryFanfare();
      } else {
        playDefeatSound();
      }
    }

    prevStatusRef.current = matchState.status;
  }, [matchState, currentUser?.id]);

  // Rotate orientation
  const handleToggleRotate = () => {
    playSonarBlipSound();
    setIsHorizontal((prev) => !prev);
  };

  // Auto-place fleet
  const handleAutoDeploy = () => {
    playSonarBlipSound();
    const fresh = generateRandomFleet();
    setPlacedShips(fresh);
  };

  // Clear fleet
  const handleClearFleet = () => {
    playSonarBlipSound();
    setPlacedShips([]);
  };

  // Click to place ship in Phase 1
  const handleGridCellClick = (r: number, c: number) => {
    if (matchState?.me?.isReady) return;

    const spec = FLEET_SPECS.find((s) => s.typeId === selectedSpecId);
    if (!spec) return;

    // Check if we still have available ships of this type
    const placedCount = placedShips.filter((s) => s.typeId === selectedSpecId).length;
    if (placedCount >= spec.count) {
      // Find another incomplete spec
      const nextSpec = FLEET_SPECS.find((s) => {
        const count = placedShips.filter((p) => p.typeId === s.typeId).length;
        return count < s.count;
      });
      if (nextSpec) setSelectedSpecId(nextSpec.typeId);
      return;
    }

    const check = canPlaceShip(placedShips, r, c, spec.size, isHorizontal);
    if (check.canPlace) {
      playSonarBlipSound();
      const newShip: PlacedShip = {
        id: `ship_${Date.now()}_${Math.random()}`,
        typeId: spec.typeId,
        name: spec.nameAz,
        size: spec.size,
        coordinates: check.coordinates,
        isSunk: false,
      };
      setPlacedShips((prev) => [...prev, newShip]);

      // If finished this spec, move to next
      if (placedCount + 1 >= spec.count) {
        const nextSpec = FLEET_SPECS.find((s) => {
          const count = placedShips.filter((p) => p.typeId === s.typeId).length;
          return s.typeId !== selectedSpecId && count < s.count;
        });
        if (nextSpec) setSelectedSpecId(nextSpec.typeId);
      }
    }
  };

  // Confirm fleet deployment
  const handleConfirmFleetReady = async () => {
    if (!isFleetDeploymentComplete(placedShips)) return;
    setSubmittingFleet(true);

    try {
      const res = await fetchWithAuth(`/api/battle/place-fleet/${matchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ships: placedShips }),
      });
      const data = await res.json();
      if (data && data.success && data.state) {
        setMatchState(data.state);
        playSonarBlipSound();
      }
    } catch {
      /* fallback */
    } finally {
      setSubmittingFleet(false);
    }
  };

  // Click to fire at enemy radar (Phase 2)
  const handleFireAtRadar = async (r: number, c: number) => {
    if (!matchState?.isMyTurn || firing) return;

    // Check if already fired at (r, c)
    const already = matchState.me?.shotsTaken?.some((s: any) => s.row === r && s.col === c);
    if (already) return;

    setFiring(true);
    playCannonShotSound();

    try {
      const res = await fetchWithAuth(`/api/battle/fire/${matchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row: r, col: c }),
      });
      const data = await res.json();
      if (data && data.success && data.state) {
        setMatchState(data.state);
      }
    } catch {
      /* fallback */
    } finally {
      setFiring(false);
    }
  };

  // Leave match
  const handleLeave = async () => {
    try {
      await fetchWithAuth(`/api/battle/leave/${matchId}`, { method: "POST" });
    } catch {
      /* ignore */
    }
    onClose();
  };

  // Keyboard listener for Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleLeave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleLeave]);

  // Derived Grid States
  const isPhasePlacement =
    matchState?.status === "PREPARING" || matchState?.status === "PENDING";
  const isBattleActive = matchState?.status === "BATTLE_ACTIVE";
  const isFinished = matchState?.status === "FINISHED";

  // Coordinates of placed ships on my board
  const myShipCoordMap = useMemo(() => {
    const map = new Map<string, PlacedShip>();
    const shipsToUse = isPhasePlacement ? placedShips : matchState?.me?.ships || [];
    for (const ship of shipsToUse) {
      for (const coord of ship.coordinates) {
        map.set(`${coord.row},${coord.col}`, ship);
      }
    }
    return map;
  }, [isPhasePlacement, placedShips, matchState?.me?.ships]);

  // Shots map on my fleet (enemy shots)
  const enemyShotsOnMeMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const s of matchState?.me?.shotsReceived || []) {
      map.set(`${s.row},${s.col}`, s);
    }
    return map;
  }, [matchState?.me?.shotsReceived]);

  // My shots on enemy radar
  const myShotsOnEnemyMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const s of matchState?.me?.shotsTaken || []) {
      map.set(`${s.row},${s.col}`, s);
    }
    return map;
  }, [matchState?.me?.shotsTaken]);

  // Placement preview coordinates
  const placementPreview = useMemo(() => {
    if (!isPhasePlacement || !hoverCoord || matchState?.me?.isReady) return null;
    const spec = FLEET_SPECS.find((s) => s.typeId === selectedSpecId);
    if (!spec) return null;
    return canPlaceShip(placedShips, hoverCoord.row, hoverCoord.col, spec.size, isHorizontal);
  }, [isPhasePlacement, hoverCoord, matchState?.me?.isReady, selectedSpecId, placedShips, isHorizontal]);

  if (loading || !matchState) {
    return (
      <div className="cba-arcade-overlay" role="dialog" aria-modal="true">
        <div style={{ color: "#00e5ff", fontFamily: "monospace", fontSize: "1.1rem" }}>
          KİBER DÖYÜŞ ŞƏBƏKƏSİNƏ BAĞLANILIR...
        </div>
      </div>
    );
  }

  return (
    <div
      className="cba-arcade-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleLeave();
      }}
    >
      <div className="cba-arcade-cabinet">
        {/* Header */}
        <header className="cba-header">
          <div className="cba-header__brand">
            <div className="cba-header__emblem">
              <ExpressbankEmblem size={26} glow />
            </div>
            <div>
              <h1 className="cba-header__title">
                EXPRESSBANK <span>CYBER SEA BATTLE</span>
              </h1>
              <span className="cba-header__sub">
                {isAz
                  ? "DƏNİZ DÖYÜŞÜ • ÇOXOYUNÇULU ARENA"
                  : "FLEET COMBAT • MULTIPLAYER ARENA"}
              </span>
            </div>
          </div>

          <div className="cba-header__actions">
            {/* Audio Toggle */}
            <button
              type="button"
              className={`csu-pill-btn ${!muted ? "csu-pill-btn--active" : ""}`}
              onClick={() => {
                const next = toggleArcadeMuted();
                setMuted(next);
              }}
              title="Toggle Audio"
            >
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              <span>{muted ? "MUTED" : "SOUND ON"}</span>
            </button>

            {/* Leave / Close */}
            <button
              type="button"
              className="csu-close-btn"
              onClick={handleLeave}
              title={isAz ? "Tərk Et (Leave)" : "Leave Battle"}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Status / Turn Bar */}
        <div className="cba-status-bar">
          {isPhasePlacement ? (
            <div className="cba-turn-indicator cba-turn-indicator--deploy">
              <span className="cba-pulse-dot" />
              <span>
                {matchState.me?.isReady
                  ? (isAz ? "SİZİN DONANMANIZ HAZIRDIR • RƏQİB GÖZLƏNİLİR..." : "FLEET DEPLOYED • WAITING FOR OPPONENT...")
                  : (isAz ? "FAZA 1: DONANMANIZI YERLƏŞDİRİN VƏ TƏSDİQLƏYİN" : "PHASE 1: DEPLOY FLEET ON THE GRID")}
              </span>
            </div>
          ) : isBattleActive ? (
            <div
              className={`cba-turn-indicator ${
                matchState.isMyTurn
                  ? "cba-turn-indicator--my-turn"
                  : "cba-turn-indicator--enemy-turn"
              }`}
            >
              <span className="cba-pulse-dot" />
              <span>
                {matchState.isMyTurn
                  ? (isAz ? "🟢 SİZİN NÖVBƏNİZ! Düşmən radarına atəş açın" : "🟢 YOUR TURN! Fire at enemy radar")
                  : (isAz ? "🔴 RƏQİBİN NÖVBƏSİ! Rəqibin atəşi gözlənilir..." : "🔴 OPPONENT'S TURN! Waiting for incoming strike...")}
              </span>
            </div>
          ) : (
            <div className="cba-turn-indicator">
              <span>{isAz ? "DÖYÜŞ BAŞA ÇATDI" : "BATTLE CONCLUDED"}</span>
            </div>
          )}

          <div className="cba-opp-badge">
            <span>{isAz ? "RƏQİB:" : "OPPONENT:"}</span>
            <strong>{matchState.opponent?.displayName || matchState.opponent?.username}</strong>
            {matchState.opponent?.isAi && (
              <span style={{ color: "#00f576", fontSize: "0.75rem" }}>(AI BOT)</span>
            )}
          </div>
        </div>

        {/* Main Body */}
        <div className="cba-body">
          {/* Grid 1: Your Fleet Grid */}
          <div className="cba-board-section">
            <div className="cba-board-header">
              <h3 className="cba-board-title cba-board-title--fleet">
                <Shield size={16} />
                <span>{isAz ? "SƏNİN FLOTİLİYAN" : "YOUR FLEET"}</span>
              </h3>
              <span className="cba-fleet-count">
                {isAz ? "Qalan:" : "Alive:"} {matchState.me?.remainingShipsCount ?? placedShips.length} / 10
              </span>
            </div>

            {/* 10x10 Fleet Grid */}
            <div className="cba-grid-board">
              <div className="cba-col-headers">
                <div className="cba-corner-spacer" />
                {GRID_NUMBERS.map((n) => (
                  <div key={n} className="cba-col-header-cell">{n}</div>
                ))}
              </div>

              <div className="cba-board-main-row">
                <div className="cba-row-headers">
                  {GRID_LETTERS.map((letter) => (
                    <div key={letter} className="cba-row-header-cell">{letter}</div>
                  ))}
                </div>

                <div className="cba-grid">
                  {GRID_LETTERS.map((_, r) =>
                    GRID_NUMBERS.map((_, c) => {
                      const coordKey = `${r},${c}`;
                      const hasShip = myShipCoordMap.has(coordKey);
                      const enemyShot = enemyShotsOnMeMap.get(coordKey);

                      // Preview placement in Phase 1
                      const inPreview = placementPreview?.coordinates.some(
                        (p) => p.row === r && p.col === c
                      );
                      const previewValid = placementPreview?.canPlace;

                      let cellClass = "";
                      if (hasShip) cellClass += " cba-cell--ship";
                      if (enemyShot?.result === "HIT" || enemyShot?.result === "SUNK") {
                        cellClass += " cba-cell--hit";
                      } else if (enemyShot?.result === "MISS") {
                        cellClass += " cba-cell--miss";
                      }
                      if (inPreview) {
                        cellClass += previewValid
                          ? " cba-cell--preview-valid"
                          : " cba-cell--preview-invalid";
                      }

                      return (
                        <div
                          key={coordKey}
                          className={`cba-cell ${cellClass}`}
                          onMouseEnter={() => setHoverCoord({ row: r, col: c })}
                          onMouseLeave={() => setHoverCoord(null)}
                          onClick={() => isPhasePlacement && handleGridCellClick(r, c)}
                        >
                          {enemyShot?.result === "HIT" || enemyShot?.result === "SUNK" ? (
                            <span>💥</span>
                          ) : enemyShot?.result === "MISS" ? (
                            <span className="cba-miss-dot" />
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Phase 1 Placement Dock */}
          {isPhasePlacement && (
            <div className="cba-dock-panel">
              <h3 className="cba-dock-title">
                {isAz ? "GƏMİ YERLƏŞDİRMƏ" : "DEPLOY FLEET"}
              </h3>

              <div className="cba-dock-ships-list">
                {FLEET_SPECS.map((spec) => {
                  const placedCount = placedShips.filter((s) => s.typeId === spec.typeId).length;
                  const isDone = placedCount >= spec.count;
                  const isSelected = selectedSpecId === spec.typeId;

                  return (
                    <div
                      key={spec.typeId}
                      className={`cba-dock-ship-item ${
                        isSelected ? "cba-dock-ship-item--selected" : ""
                      } ${isDone ? "cba-dock-ship-item--placed" : ""}`}
                      onClick={() => setSelectedSpecId(spec.typeId)}
                    >
                      <div>
                        <div style={{ fontWeight: "bold", fontSize: "0.85rem", color: "#ffffff" }}>
                          {isAz ? spec.nameAz : spec.nameEn}
                        </div>
                        <div className="cba-ship-blocks-preview" style={{ marginTop: 4 }}>
                          {Array.from({ length: spec.size }).map((_, i) => (
                            <div key={i} className="cba-ship-block-dot" />
                          ))}
                        </div>
                      </div>
                      <span style={{ fontSize: "0.8rem", color: isDone ? "#00f576" : "#cbd5e1" }}>
                        {isDone ? "✓ HAZIR" : `${placedCount} / ${spec.count}`}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Controls */}
              <div className="cba-dock-actions">
                <button
                  type="button"
                  className="cba-btn cba-btn--secondary"
                  onClick={handleToggleRotate}
                >
                  <RotateCw size={14} />
                  <span>
                    {isAz
                      ? `İstiqamət: ${isHorizontal ? "Üfüqi (→)" : "Şaquli (↓)"}`
                      : `Orientation: ${isHorizontal ? "Horizontal (→)" : "Vertical (↓)"}`}
                  </span>
                </button>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="cba-btn cba-btn--secondary"
                    style={{ flex: 1 }}
                    onClick={handleAutoDeploy}
                  >
                    <Shuffle size={14} />
                    <span>{isAz ? "Təsadüfi Düz" : "Auto Deploy"}</span>
                  </button>

                  <button
                    type="button"
                    className="cba-btn cba-btn--secondary"
                    style={{ flex: 1 }}
                    onClick={handleClearFleet}
                  >
                    <span>{isAz ? "Təmizlə" : "Clear"}</span>
                  </button>
                </div>

                <button
                  type="button"
                  className="cba-btn cba-btn--primary"
                  disabled={!isFleetDeploymentComplete(placedShips) || matchState.me?.isReady || submittingFleet}
                  onClick={handleConfirmFleetReady}
                >
                  <CheckCircle size={16} />
                  <span>
                    {matchState.me?.isReady
                      ? (isAz ? "HAZIRDIR" : "READY")
                      : (isAz ? "DÖYÜŞƏ HAZIRAM" : "CONFIRM READY")}
                  </span>
                </button>

                {matchState.me?.isReady && (
                  <div className="cba-waiting-banner">
                    <span className="cba-pulse-dot" />
                    <span>
                      {isAz
                        ? "Rəqibin gəmilərini yerləşdirməsi gözlənilir..."
                        : "Waiting for opponent to finish deployment..."}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Grid 2: Enemy Radar Grid (Phase 2 Active Battle) */}
          {(isBattleActive || isFinished) && (
            <div className="cba-board-section">
              <div className="cba-board-header">
                <h3 className="cba-board-title cba-board-title--radar">
                  <Crosshair size={16} />
                  <span>{isAz ? "DÜŞMƏN RADARI (KOR HƏDƏF)" : "ENEMY RADAR (BLIND)"}</span>
                </h3>
                <span className="cba-fleet-count">
                  {isAz ? "Düşmən:" : "Enemy:"} {matchState.opponent?.remainingShipsCount ?? 10} / 10
                </span>
              </div>

              {/* 10x10 Enemy Radar */}
              <div className="cba-grid-board">
                <div className="cba-col-headers">
                  <div className="cba-corner-spacer" />
                  {GRID_NUMBERS.map((n) => (
                    <div key={n} className="cba-col-header-cell">{n}</div>
                  ))}
                </div>

                <div className="cba-board-main-row">
                  <div className="cba-row-headers">
                    {GRID_LETTERS.map((letter) => (
                      <div key={letter} className="cba-row-header-cell">{letter}</div>
                    ))}
                  </div>

                  <div className="cba-grid">
                    {GRID_LETTERS.map((letter, r) =>
                      GRID_NUMBERS.map((_, c) => {
                        const coordKey = `${r},${c}`;
                        const myShot = myShotsOnEnemyMap.get(coordKey);

                        let cellClass = " cba-cell--radar-targetable";
                        if (myShot?.result === "HIT") {
                          cellClass = " cba-cell--hit";
                        } else if (myShot?.result === "SUNK") {
                          cellClass = " cba-cell--sunk";
                        } else if (myShot?.result === "MISS") {
                          cellClass = " cba-cell--miss";
                        }

                        return (
                          <div
                            key={coordKey}
                            className={`cba-cell ${cellClass}`}
                            onClick={() => !myShot && handleFireAtRadar(r, c)}
                            title={
                              myShot
                                ? (myShot.result === "HIT" ? "Dəqiq Vuruş!" : myShot.result === "SUNK" ? "Gəmi Batırıldı!" : "Boşa Atəş")
                                : (matchState.isMyTurn ? `${letter}${c + 1} Hədəfə al` : "Rəqibin növbəsi")
                            }
                          >
                            {myShot?.result === "HIT" ? (
                              <span>💥</span>
                            ) : myShot?.result === "SUNK" ? (
                              <span>🔥</span>
                            ) : myShot?.result === "MISS" ? (
                              <span className="cba-miss-dot" />
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Victory / Defeat Overlay Modal */}
        {isFinished && (
          <div className="cba-gameover-modal" role="dialog" aria-modal="true">
            <div
              className={`cba-gameover-card ${
                matchState.winnerUserId === currentUser?.id
                  ? "cba-gameover-card--won"
                  : "cba-gameover-card--lost"
              }`}
            >
              <div style={{ fontSize: "2.8rem" }}>
                {matchState.winnerUserId === currentUser?.id ? "🏆" : "💀"}
              </div>
              <h2 className="cba-gameover-title">
                {matchState.winnerUserId === currentUser?.id
                  ? (isAz ? "QƏLƏBƏ! DONANMA MƏHV EDİLDİ" : "VICTORY! ENEMY SINK")
                  : (isAz ? "MƏĞLUBİYYƏT! FLOTİLİYANIZ BATIRILDI" : "DEFEAT! FLEET DESTROYED")}
              </h2>
              <p className="cba-gameover-sub">
                {matchState.winnerUserId === currentUser?.id
                  ? (isAz ? "Rəqibin bütün 10 gəmisi dəqiqliklə sıradan çıxarıldı!" : "All 10 enemy vessels have been neutralized!")
                  : (isAz ? "Rəqib donanmanızı tam məhv etdi. Yenidən cəhd edin!" : "Opponent annihilated your battle fleet.")}
              </p>

              <div className="cba-gameover-stats">
                <div className="cba-gstat-item">
                  <span className="cba-gstat-label">{isAz ? "ATƏŞ SAYI" : "SHOTS"}</span>
                  <span className="cba-gstat-val">{matchState.me?.shotsTaken?.length || 0}</span>
                </div>
                <div className="cba-gstat-item">
                  <span className="cba-gstat-label">{isAz ? "VURUŞLAR" : "HITS"}</span>
                  <span className="cba-gstat-val" style={{ color: "#ef4444" }}>
                    {matchState.me?.shotsTaken?.filter((s: any) => s.result === "HIT" || s.result === "SUNK").length || 0}
                  </span>
                </div>
                <div className="cba-gstat-item">
                  <span className="cba-gstat-label">{isAz ? "DƏQİQLİK" : "ACCURACY"}</span>
                  <span className="cba-gstat-val" style={{ color: "#00f576" }}>
                    {matchState.me?.shotsTaken?.length
                      ? Math.round(
                          (matchState.me.shotsTaken.filter((s: any) => s.result === "HIT" || s.result === "SUNK").length /
                            matchState.me.shotsTaken.length) *
                            100
                        )
                      : 0}
                    %
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="cba-btn cba-btn--primary"
                style={{ width: "100%" }}
                onClick={onClose}
              >
                <span>{isAz ? "KABİNETƏ QAYIT" : "RETURN TO ARCADE"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CyberBattleArcade;
