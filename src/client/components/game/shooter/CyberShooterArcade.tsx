/**
 * Expressbank Cyber Shooter: IT Warfare (Krunker-Style 3D FPS)
 * High-performance React Component hosting the WebGL 3D World,
 * Pointer Lock Handler, Network Synchronizer, and Cyberpunk HUD.
 */

import React, { Component, useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  X,
  Crosshair,
  Volume2,
  VolumeX,
  Shield,
  Zap,
  Flame,
  RotateCcw,
  Trophy,
  Users,
  Compass,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "../../../context/AuthContext.js";
import { useI18n } from "../../../context/I18nContext.js";
import { ExpressbankEmblem } from "../../common/ExpressbankLogo.js";
import {
  ShooterRole,
  ShooterPlayer,
  ShooterLobbyState,
  KillfeedEntry,
  WeaponId,
  ROLE_SPECS,
  WEAPON_SPECS,
  SPAWN_POINTS,
} from "../../../../shared/types/shooter.js";
import { CyberShooterEngine, ShooterInputState } from "./cyber-shooter-engine.js";
import { cyberShooterAudio } from "./cyber-shooter-audio.js";
import "./cyber-shooter-arcade.css";

interface CyberShooterArcadeProps {
  onClose: () => void;
  onSwitchGame?: () => void;
}

// React Error Boundary for resilient WebGL fallback
class CyberShooterErrorBoundary extends Component<
  { children: React.ReactNode; onClose: () => void; isAz: boolean },
  { hasError: boolean; errorMsg: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorMsg: "" };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorMsg: error?.message || "Unknown 3D Engine Error" };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("CyberShooter error caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="cyber-shooter__lock-overlay" style={{ zIndex: 10000 }}>
          <div className="cyber-shooter__lock-box" style={{ borderColor: "#ef4444" }}>
            <AlertTriangle size={48} color="#ef4444" style={{ margin: "0 auto 12px" }} />
            <h2 className="cyber-shooter__lock-title" style={{ color: "#ef4444" }}>
              {this.props.isAz ? "Qrafik Mühərrikində Xəta" : "3D Engine Graphics Error"}
            </h2>
            <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 20 }}>
              {this.state.errorMsg}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button
                type="button"
                className="cyber-shooter__lock-hint"
                onClick={() => this.setState({ hasError: false, errorMsg: "" })}
                style={{ cursor: "pointer", background: "#00f576" }}
              >
                {this.props.isAz ? "Yenidən cəhd et" : "Retry"}
              </button>
              <button
                type="button"
                className="cyber-shooter__lock-hint"
                onClick={this.props.onClose}
                style={{ cursor: "pointer", background: "#ef4444", color: "#fff" }}
              >
                {this.props.isAz ? "Arcade-ə qayıt" : "Exit to Arcade"}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const CyberShooterInner: React.FC<CyberShooterArcadeProps> = ({ onClose }) => {
  const { currentUser } = useAuth();
  const { t, language } = useI18n();
  const isAz = language === "az";

  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<CyberShooterEngine | null>(null);

  // Game & Lobby state
  const [hasStarted, setHasStarted] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [webGlError, setWebGlError] = useState<string | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState<string>(() => currentUser?.id || `player-${Math.random().toString(36).slice(2, 6)}`);
  const [currentRole, setCurrentRole] = useState<ShooterRole>("infosec");
  const [activeWeaponId, setActiveWeaponId] = useState<WeaponId>("railgun");
  const [health, setHealth] = useState(90);
  const [maxHealth, setMaxHealth] = useState(90);
  const [shield, setShield] = useState(50);
  const [maxShield, setMaxShield] = useState(50);
  const [ammo, setAmmo] = useState(4);
  const [maxAmmo, setMaxAmmo] = useState(4);
  const [isReloading, setIsReloading] = useState(false);

  // Ability cooldowns
  const [dashCd, setDashCd] = useState(0);
  const [ultCd, setUltCd] = useState(0);
  const dashReadyAtRef = useRef<number>(0);
  const ultReadyAtRef = useRef<number>(0);

  // Killfeed & Scoreboard
  const [killfeed, setKillfeed] = useState<KillfeedEntry[]>([]);
  const [scoreboardVisible, setScoreboardVisible] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<Record<string, ShooterPlayer>>({});
  const [hitmarker, setHitmarker] = useState<{ isHeadshot: boolean } | null>(null);
  const [isEliminated, setIsEliminated] = useState(false);
  const [respawnCountdown, setRespawnCountdown] = useState(3);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);

  // Synchronized state refs for 60FPS render loop (avoids continuous re-renders!)
  const ammoRef = useRef<number>(4);
  ammoRef.current = ammo;
  const activeWeaponRef = useRef<WeaponId>("railgun");
  activeWeaponRef.current = activeWeaponId;
  const isReloadingRef = useRef<boolean>(false);
  isReloadingRef.current = isReloading;
  const isEliminatedRef = useRef<boolean>(false);
  isEliminatedRef.current = isEliminated;
  const localPlayerIdRef = useRef<string>(localPlayerId);
  localPlayerIdRef.current = localPlayerId;
  const lobbyPlayersRef = useRef<Record<string, ShooterPlayer>>(lobbyPlayers);
  lobbyPlayersRef.current = lobbyPlayers;

  // Input states
  const inputRef = useRef<ShooterInputState>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    slide: false,
    fire: false,
    aimDownSights: false,
    reload: false,
    ability: false,
  });

  const lastFireTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());

  /**
   * Helper to make authenticated API requests with timeout
   */
  const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const token = typeof localStorage !== "undefined" ? localStorage.getItem("auth_token") : null;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(url, { ...options, headers, signal: controller.signal });
      clearTimeout(timeoutId);
      return res;
    } catch {
      return null;
    }
  }, []);

  /**
   * 1. Initialize Engine & Join Lobby
   */
  useEffect(() => {
    if (!containerRef.current) return;

    let engine: CyberShooterEngine | null = null;
    try {
      engine = new CyberShooterEngine(containerRef.current);
      engineRef.current = engine;
    } catch (e: any) {
      console.error("Failed to initialize CyberShooterEngine:", e);
      setWebGlError(e?.message || "WebGL initialization failed");
      return;
    }

    // Set initial position from spawns
    const initSpawn = SPAWN_POINTS[0] || { x: 0, y: 0, z: 0 };
    engine.playerPosition.set(initSpawn.x, initSpawn.y, initSpawn.z);

    // Join Server Lobby (with offline fallback)
    const joinArena = async () => {
      try {
        const res = await fetchWithAuth("/api/shooter/join", {
          method: "POST",
          body: JSON.stringify({
            role: currentRole,
            guestName: currentUser?.fullName || currentUser?.username,
          }),
        });
        if (res && res.ok) {
          const data = await res.json();
          if (data.success && data.player) {
            setLocalPlayerId(data.player.id);
            if (engineRef.current) {
              engineRef.current.playerPosition.set(data.player.position.x, data.player.position.y, data.player.position.z);
            }
            setHealth(data.player.health);
            setMaxHealth(data.player.maxHealth);
            setShield(data.player.shield);
            setMaxShield(data.player.maxShield);
            setAmmo(data.player.ammo);
            setMaxAmmo(data.player.maxAmmo);
            if (data.lobbyState?.players) {
              setLobbyPlayers(data.lobbyState.players);
            }
          }
        }
      } catch (err) {
        console.warn("Lobby offline or slow, running local match:", err);
      }
    };

    void joinArena();

    // 2. Connect to Real-time SSE Stream (if supported)
    let sse: EventSource | null = null;
    try {
      sse = new EventSource("/api/shooter/stream");

      sse.addEventListener("init", (e: MessageEvent) => {
        try {
          const state: ShooterLobbyState = JSON.parse(e.data);
          setLobbyPlayers(state.players || {});
          setKillfeed(state.killfeed || []);
        } catch {}
      });

      sse.addEventListener("sync", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (data.players) {
            setLobbyPlayers(data.players);
            if (engineRef.current) {
              engineRef.current.updateRemotePlayers(data.players, localPlayerIdRef.current);
            }
          }
        } catch {}
      });

      sse.addEventListener("shot_fired", (e: MessageEvent) => {
        try {
          const d = JSON.parse(e.data);
          if (d.shooterId !== localPlayerIdRef.current && engineRef.current) {
            const origin = new THREE.Vector3(d.origin.x, d.origin.y, d.origin.z);
            const dir = new THREE.Vector3(d.direction.x, d.direction.y, d.direction.z).normalize();
            const target = origin.clone().add(dir.multiplyScalar(30));
            const weapon = WEAPON_SPECS[d.weaponId as WeaponId];
            const colorHex = weapon ? parseInt(weapon.accentColor.replace("#", "0x"), 16) : 0x00f576;
            engineRef.current.spawnLaserTracer(origin, target, colorHex);
          }
        } catch {}
      });

      sse.addEventListener("damage_dealt", (e: MessageEvent) => {
        try {
          const d = JSON.parse(e.data);
          if (d.victimId === localPlayerIdRef.current) {
            setHealth(d.remainingHealth);
            setShield(d.remainingShield);
            if (d.remainingHealth <= 0) {
              setIsEliminated(true);
              setRespawnCountdown(3);
            }
          }
        } catch {}
      });

      sse.addEventListener("player_killed", (e: MessageEvent) => {
        try {
          const d = JSON.parse(e.data);
          setKillfeed((prev) => [d.killEntry, ...prev.slice(0, 10)]);
          if (d.killEntry.killerId === localPlayerIdRef.current) {
            cyberShooterAudio.playKillSound();
          }
          if (d.killEntry.victimId === localPlayerIdRef.current) {
            setIsEliminated(true);
            setRespawnCountdown(3);
          }
        } catch {}
      });

      sse.onerror = () => {
        // Suppress console spam if server stream disconnects
      };
    } catch {}

    // 3. Pointer Lock Change Listeners
    const handlePointerLockChange = () => {
      const locked =
        document.pointerLockElement === containerRef.current ||
        (engineRef.current?.renderer?.domElement &&
          document.pointerLockElement === engineRef.current.renderer.domElement);
      setIsLocked(Boolean(locked));
    };

    const handlePointerLockError = (err: Event) => {
      console.warn("Pointer lock error encountered, falling back to direct mouse tracking:", err);
      setIsLocked(false);
    };

    document.addEventListener("pointerlockchange", handlePointerLockChange);
    document.addEventListener("pointerlockerror", handlePointerLockError);

    return () => {
      if (sse) sse.close();
      document.removeEventListener("pointerlockchange", handlePointerLockChange);
      document.removeEventListener("pointerlockerror", handlePointerLockError);
      if (engineRef.current) {
        engineRef.current.dispose();
      }
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [fetchWithAuth]);

  /**
   * Safely request Pointer Lock on canvas or container
   */
  const requestPointerLock = () => {
    const target = engineRef.current?.renderer?.domElement || containerRef.current;
    if (target && typeof target.requestPointerLock === "function") {
      try {
        const p = target.requestPointerLock() as any;
        if (p && typeof p.catch === "function") {
          p.catch((err: any) => {
            console.warn("Pointer lock request rejected:", err);
          });
        }
      } catch (err) {
        console.warn("Pointer lock request ignored:", err);
      }
    }
  };

  /**
   * Start game and attempt pointer lock
   */
  const startGameAndLock = () => {
    setHasStarted(true);
    requestPointerLock();
  };

  /**
   * Cooldown ticker (every 250ms, light on CPU)
   */
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      if (dashReadyAtRef.current > 0) {
        const rem = Math.max(0, Math.ceil((dashReadyAtRef.current - now) / 1000));
        setDashCd(rem);
      }
      if (ultReadyAtRef.current > 0) {
        const rem = Math.max(0, Math.ceil((ultReadyAtRef.current - now) / 1000));
        setUltCd(rem);
      }
    }, 250);

    return () => clearInterval(timer);
  }, []);

  /**
   * Weapon Reloading
   */
  const handleReload = () => {
    const spec = WEAPON_SPECS[activeWeaponRef.current];
    if (!spec || ammoRef.current === spec.magSize || isReloadingRef.current) return;
    setIsReloading(true);
    setTimeout(() => {
      setAmmo(spec.magSize);
      setIsReloading(false);
    }, spec.reloadTimeSec * 1000);
  };

  /**
   * Weapon Swap
   */
  const switchWeapon = (wId: WeaponId) => {
    if (activeWeaponRef.current === wId || isReloadingRef.current) return;
    setActiveWeaponId(wId);
    if (engineRef.current) {
      engineRef.current.activeWeapon = wId;
      engineRef.current.buildFirstPersonWeapon();
    }
    const spec = WEAPON_SPECS[wId];
    if (spec) {
      setAmmo(spec.magSize);
      setMaxAmmo(spec.magSize);
    }
  };

  /**
   * Weapon Firing Logic with Hit Registration
   */
  const handleFireShot = () => {
    const now = performance.now();
    const spec = WEAPON_SPECS[activeWeaponRef.current];
    if (!spec) return;
    const shotInterval = (60 / spec.fireRateRpm) * 1000;

    if (now - lastFireTimeRef.current < shotInterval || isReloadingRef.current || ammoRef.current <= 0 || isEliminatedRef.current) {
      return;
    }
    lastFireTimeRef.current = now;

    // Deduct ammo
    setAmmo((prev) => {
      const next = prev - 1;
      if (next === 0) handleReload();
      return next;
    });

    const engine = engineRef.current;
    if (!engine) return;

    // Play procedural sound
    if (spec.soundType === "railgun") cyberShooterAudio.playRailgunFire();
    else if (spec.soundType === "gatling") cyberShooterAudio.playGatlingFire();
    else if (spec.soundType === "shotgun") cyberShooterAudio.playShotgunFire();
    else cyberShooterAudio.playPistolFire();

    engine.applyFireRecoil();

    // Check hit against remote players
    let hitPlayerId: string | undefined;
    let hitPart: "head" | "body" = "body";
    let hitDist: number = 50;

    const currentPlayers = lobbyPlayersRef.current;
    for (const [pId, p] of Object.entries(currentPlayers)) {
      if (pId === localPlayerIdRef.current || p.health <= 0) continue;
      const targetPos = new THREE.Vector3(p.position.x, p.position.y + 1.2, p.position.z);
      const camPos = engine.camera.position;
      const toTarget = targetPos.clone().sub(camPos);
      const dist = toTarget.length();

      if (dist > spec.range) continue;

      const forward = new THREE.Vector3();
      engine.camera.getWorldDirection(forward);

      const angle = forward.angleTo(toTarget.normalize());
      if (angle < 0.08) {
        hitPlayerId = pId;
        hitDist = dist;
        const hitHeight = targetPos.y;
        hitPart = hitHeight > p.position.y + 1.5 ? "head" : "body";
        break;
      }
    }

    // Spawn client tracer beam
    const muzzlePos = engine.camera.position.clone().add(new THREE.Vector3(0.2, -0.2, -0.4));
    let hitPoint = engine.camera.position.clone().add(
      new THREE.Vector3().copy(engine.camera.getWorldDirection(new THREE.Vector3())).multiplyScalar(spec.range)
    );
    if (hitPlayerId && currentPlayers[hitPlayerId]) {
      const victim = currentPlayers[hitPlayerId];
      hitPoint = new THREE.Vector3(victim.position.x, victim.position.y + (hitPart === "head" ? 1.75 : 1.1), victim.position.z);
    }
    const colorHex = parseInt(spec.accentColor.replace("#", "0x"), 16);
    engine.spawnLaserTracer(muzzlePos, hitPoint, colorHex);

    if (hitPlayerId) {
      const isHead = hitPart === "head";
      const dmg = isHead ? spec.damageHead : spec.damageBody;

      cyberShooterAudio.playHitmarker(isHead);
      setHitmarker({ isHeadshot: isHead });
      setTimeout(() => setHitmarker(null), 180);

      engine.spawnDamageNumber(hitPoint, dmg, isHead);
    }

    // Send shot event to server
    const camDir = new THREE.Vector3();
    engine.camera.getWorldDirection(camDir);

    fetchWithAuth("/api/shooter/fire", {
      method: "POST",
      body: JSON.stringify({
        playerId: localPlayerIdRef.current,
        action: {
          weaponId: activeWeaponRef.current,
          origin: { x: engine.camera.position.x, y: engine.camera.position.y, z: engine.camera.position.z },
          direction: { x: camDir.x, y: camDir.y, z: camDir.z },
          hitPlayerId,
          hitPart,
          hitDistance: hitDist,
        },
      }),
    });
  };

  /**
   * Special Movement / Ability
   */
  const triggerSpecialMovement = () => {
    if (Date.now() < dashReadyAtRef.current || !engineRef.current) return;
    const cd = ROLE_SPECS[currentRole]?.abilityCooldownSec || 12;
    dashReadyAtRef.current = Date.now() + cd * 1000;
    setDashCd(cd);

    if (currentRole === "infosec") {
      cyberShooterAudio.playDashSound();
      const fwd = new THREE.Vector3();
      engineRef.current.camera.getWorldDirection(fwd);
      engineRef.current.playerPosition.add(fwd.multiplyScalar(9.0));
      engineRef.current.playerVelocity.multiplyScalar(1.3);
    } else if (currentRole === "it_admin") {
      cyberShooterAudio.playGroundSlam();
      engineRef.current.playerVelocity.y = -22.0;
    }

    fetchWithAuth("/api/shooter/ability", {
      method: "POST",
      body: JSON.stringify({
        playerId: localPlayerIdRef.current,
        action: {
          abilityType: currentRole === "it_admin" ? "slam" : "dash",
          position: {
            x: engineRef.current.playerPosition.x,
            y: engineRef.current.playerPosition.y,
            z: engineRef.current.playerPosition.z,
          },
        },
      }),
    });
  };

  /**
   * Ultimate Ability
   */
  const triggerUltimate = () => {
    if (Date.now() < ultReadyAtRef.current || !engineRef.current) return;
    const cd = (ROLE_SPECS[currentRole]?.abilityCooldownSec || 12) + 5;
    ultReadyAtRef.current = Date.now() + cd * 1000;
    setUltCd(cd);

    if (currentRole === "infosec") cyberShooterAudio.playUltSound("ddos_emp");
    else if (currentRole === "helpdesk") cyberShooterAudio.playUltSound("hotfix_reboot");
    else cyberShooterAudio.playUltSound("root_bastion");

    fetchWithAuth("/api/shooter/ability", {
      method: "POST",
      body: JSON.stringify({
        playerId: localPlayerIdRef.current,
        action: {
          abilityType: "ult",
          position: {
            x: engineRef.current.playerPosition.x,
            y: engineRef.current.playerPosition.y,
            z: engineRef.current.playerPosition.z,
          },
        },
      }),
    });
  };

  /**
   * Respawn Handler
   */
  const handleRespawn = async () => {
    try {
      const res = await fetchWithAuth("/api/shooter/respawn", {
        method: "POST",
        body: JSON.stringify({ playerId: localPlayerIdRef.current }),
      });
      if (res && res.ok) {
        const data = await res.json();
        if (data.success && data.player && engineRef.current) {
          setIsEliminated(false);
          setHealth(data.player.health);
          setShield(data.player.shield);
          setAmmo(data.player.ammo);
          engineRef.current.playerPosition.set(data.player.position.x, data.player.position.y, data.player.position.z);
          return;
        }
      }
    } catch {}

    // Fallback local respawn
    setIsEliminated(false);
    const spec = ROLE_SPECS[currentRole];
    setHealth(spec.maxHealth);
    setShield(spec.maxShield);
    setAmmo(WEAPON_SPECS[activeWeaponRef.current]?.magSize || 4);
    if (engineRef.current) {
      const sp = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
      engineRef.current.playerPosition.set(sp.x, sp.y, sp.z);
    }
  };

  /**
   * Change Role / Class
   */
  const handleRoleSelect = (role: ShooterRole) => {
    setCurrentRole(role);
    setIsRoleModalOpen(false);
    if (engineRef.current) {
      engineRef.current.currentRole = role;
      const roleSpec = ROLE_SPECS[role];
      if (roleSpec) {
        setActiveWeaponId(roleSpec.primaryWeapon);
        engineRef.current.activeWeapon = roleSpec.primaryWeapon;
        engineRef.current.buildFirstPersonWeapon();
        setHealth(roleSpec.maxHealth);
        setMaxHealth(roleSpec.maxHealth);
        setShield(roleSpec.maxShield);
        setMaxShield(roleSpec.maxShield);
        setAmmo(WEAPON_SPECS[roleSpec.primaryWeapon]?.magSize || 4);
      }
    }
    fetchWithAuth("/api/shooter/join", {
      method: "POST",
      body: JSON.stringify({ role }),
    });
  };

  /**
   * Keyboard & Mouse Controls Handlers
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.code;
      const inp = inputRef.current;

      if (key === "KeyW") inp.forward = true;
      if (key === "KeyS") inp.backward = true;
      if (key === "KeyA") inp.left = true;
      if (key === "KeyD") inp.right = true;
      if (key === "Space") inp.jump = true;
      if (key === "ShiftLeft" || key === "ShiftRight" || key === "KeyC") inp.slide = true;
      if (key === "KeyR") handleReload();
      if (key === "Tab") {
        e.preventDefault();
        setScoreboardVisible(true);
      }
      if (key === "KeyM") {
        setIsRoleModalOpen((prev) => !prev);
        if (document.exitPointerLock) document.exitPointerLock();
      }
      if (key === "Digit1") {
        const spec = ROLE_SPECS[currentRole];
        if (spec) switchWeapon(spec.primaryWeapon);
      }
      if (key === "Digit2") {
        const spec = ROLE_SPECS[currentRole];
        if (spec) switchWeapon(spec.secondaryWeapon);
      }
      if (key === "KeyE") triggerSpecialMovement();
      if (key === "KeyQ") triggerUltimate();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.code;
      const inp = inputRef.current;

      if (key === "KeyW") inp.forward = false;
      if (key === "KeyS") inp.backward = false;
      if (key === "KeyA") inp.left = false;
      if (key === "KeyD") inp.right = false;
      if (key === "Space") inp.jump = false;
      if (key === "ShiftLeft" || key === "ShiftRight" || key === "KeyC") inp.slide = false;
      if (key === "Tab") setScoreboardVisible(false);
    };

    let lastClientX = 0;
    let lastClientY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      if (!hasStarted) return;
      if (e.button === 0) {
        inputRef.current.fire = true;
        handleFireShot();
      } else if (e.button === 2) {
        e.preventDefault();
        inputRef.current.aimDownSights = true;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) inputRef.current.fire = false;
      if (e.button === 2) inputRef.current.aimDownSights = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!hasStarted || !engineRef.current) return;
      if (isLocked) {
        engineRef.current.onMouseMove(e.movementX, e.movementY);
      } else {
        // Fallback smooth mouse aim when pointer lock is not active
        if (lastClientX !== 0 && lastClientY !== 0) {
          const dx = e.clientX - lastClientX;
          const dy = e.clientY - lastClientY;
          if (Math.abs(dx) < 120 && Math.abs(dy) < 120) {
            engineRef.current.onMouseMove(dx, dy);
          }
        }
        lastClientX = e.clientX;
        lastClientY = e.clientY;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [hasStarted, isLocked, currentRole]);

  /**
   * Main Engine 60FPS Render & Physics Loop
   */
  useEffect(() => {
    let lastSyncTime = 0;
    let respawnTimer = 0;

    const loop = (time: number) => {
      const dt = Math.min(0.1, (time - lastTimeRef.current) / 1000);
      lastTimeRef.current = time;

      const engine = engineRef.current;
      if (engine && !isEliminatedRef.current) {
        engine.updatePlayerPhysics(inputRef.current, dt);

        // Continuous fire for automatic weapons (Gatling)
        const currentSpec = WEAPON_SPECS[activeWeaponRef.current];
        if (inputRef.current.fire && currentSpec && currentSpec.fireRateRpm > 300) {
          handleFireShot();
        }

        // Periodic Sync with backend (every 250ms)
        if (time - lastSyncTime > 250 && localPlayerIdRef.current) {
          lastSyncTime = time;
          fetchWithAuth("/api/shooter/sync", {
            method: "POST",
            body: JSON.stringify({
              playerId: localPlayerIdRef.current,
              packet: {
                position: { x: engine.playerPosition.x, y: engine.playerPosition.y, z: engine.playerPosition.z },
                velocity: { x: engine.playerVelocity.x, y: engine.playerVelocity.y, z: engine.playerVelocity.z },
                yaw: engine.playerYaw,
                pitch: engine.playerPitch,
                isSliding: engine.isSliding,
                isJumping: !engine.isGrounded,
                activeWeapon: activeWeaponRef.current,
                ammo: ammoRef.current,
                isReloading: isReloadingRef.current,
              },
            }),
          });
        }
      }

      if (isEliminatedRef.current) {
        respawnTimer += dt;
        if (respawnTimer >= 3.0) {
          respawnTimer = 0;
          void handleRespawn();
        }
      } else {
        respawnTimer = 0;
      }

      if (engine) {
        engine.render();
      }

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [fetchWithAuth]);

  const activeWeaponSpec = WEAPON_SPECS[activeWeaponId] || WEAPON_SPECS.railgun;
  const roleSpec = ROLE_SPECS[currentRole] || ROLE_SPECS.infosec;

  if (webGlError) {
    return (
      <div className="cyber-shooter" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="cyber-shooter__lock-box" style={{ borderColor: "#ef4444" }}>
          <AlertTriangle size={48} color="#ef4444" style={{ margin: "0 auto 12px" }} />
          <h2 className="cyber-shooter__lock-title" style={{ color: "#ef4444" }}>
            {isAz ? "3D Qrafik Mühərrik Xətası" : "3D Graphics Engine Error"}
          </h2>
          <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 20 }}>
            {webGlError}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              type="button"
              className="cyber-shooter__lock-hint"
              onClick={() => {
                setWebGlError(null);
                window.location.reload();
              }}
              style={{ cursor: "pointer", background: "#00f576", border: "none" }}
            >
              {isAz ? "Yenidən Cəhd Et" : "Retry"}
            </button>
            <button
              type="button"
              className="cyber-shooter__lock-hint"
              onClick={onClose}
              style={{ cursor: "pointer", background: "#ef4444", color: "#fff", border: "none" }}
            >
              {isAz ? "Arcade-ə Qayıt" : "Exit to Arcade"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cyber-shooter">
      {/* 3D WebGL Canvas Viewport */}
      <div
        ref={containerRef}
        className="cyber-shooter__canvas-container"
        onClick={() => {
          if (!hasStarted) {
            startGameAndLock();
          } else if (!isLocked) {
            requestPointerLock();
          }
        }}
      />

      {/* Top Close Exit Button */}
      <button
        type="button"
        className="cyber-shooter__close-btn"
        onClick={onClose}
        title={isAz ? "Oyundan çıx" : "Exit to Arcade"}
      >
        <X size={20} />
      </button>

      {/* Click-to-Play Pointer Lock Overlay */}
      {!hasStarted && !isRoleModalOpen && (
        <div className="cyber-shooter__lock-overlay" onClick={startGameAndLock}>
          <div className="cyber-shooter__lock-box">
            <ExpressbankEmblem size={44} glow />
            <h2 className="cyber-shooter__lock-title">
              EXPRESSBANK CYBER SHOOTER
            </h2>
            <div className="cyber-shooter__lock-lead">
              IT WARFARE ARENA • KRUNKER STYLE 3D FPS
            </div>
            <button
              type="button"
              className="cyber-shooter__lock-hint"
              onClick={(e) => {
                e.stopPropagation();
                startGameAndLock();
              }}
              style={{ cursor: "pointer", border: "none" }}
            >
              {isAz ? "DÖYÜŞƏ BAŞLA (DAXİL OL)" : "START COMBAT (CLICK TO PLAY)"}
            </button>

            <div className="cyber-shooter__controls-guide">
              <div><strong>WASD:</strong> {isAz ? "Hərəkət / Strafe" : "Move & Strafe"}</div>
              <div><strong>Space:</strong> {isAz ? "Tullan / Slide-Hop" : "Jump / Slide-Hop"}</div>
              <div><strong>Shift / C:</strong> {isAz ? "Slide / Crouch" : "Slide / Crouch"}</div>
              <div><strong>Left Click:</strong> {isAz ? "Atəş aç" : "Fire Weapon"}</div>
              <div><strong>Right Click:</strong> {isAz ? "Dürbün / ADS" : "Aim Down Sights"}</div>
              <div><strong>R:</strong> {isAz ? "Sursat doldur" : "Reload"}</div>
              <div><strong>E:</strong> {isAz ? "Ghost Dash / Slam" : "Role Movement"}</div>
              <div><strong>Q:</strong> {isAz ? "Ultimate Bacarıq" : "Ultimate Ability"}</div>
              <div><strong>M:</strong> {isAz ? "Rol dəyişdir" : "Switch Class / Role"}</div>
              <div><strong>Tab:</strong> {isAz ? "Liderlər lövhəsi" : "Scoreboard"}</div>
            </div>
          </div>
        </div>
      )}

      {/* Crosshair & Hitmarkers */}
      {hasStarted && (
        <div className="cyber-shooter__crosshair-wrap">
          <div className="cyber-shooter__crosshair-dot" />
          <div className="cyber-shooter__crosshair-line cyber-shooter__crosshair-line--top" />
          <div className="cyber-shooter__crosshair-line cyber-shooter__crosshair-line--bottom" />
          <div className="cyber-shooter__crosshair-line cyber-shooter__crosshair-line--left" />
          <div className="cyber-shooter__crosshair-line cyber-shooter__crosshair-line--right" />

          {hitmarker && (
            <div
              className={`cyber-shooter__hitmarker ${
                hitmarker.isHeadshot ? "cyber-shooter__hitmarker--headshot" : ""
              }`}
            />
          )}
        </div>
      )}

      {/* Sniper ADS Scope Overlay */}
      {inputRef.current.aimDownSights && activeWeaponId === "railgun" && hasStarted && (
        <div className="cyber-shooter__scope-overlay">
          <div className="cyber-shooter__scope-reticle" />
        </div>
      )}

      {/* Top HUD: Branding & Killfeed */}
      <div className="cyber-shooter__hud-top">
        <div className="cyber-shooter__branding">
          <ExpressbankEmblem size={18} glow />
          <span>CYBER ARENA ALPHA • 10-MIN ROTATION</span>
          {hasStarted && (
            <button
              type="button"
              className="cyber-shooter__lock-badge-btn"
              onClick={requestPointerLock}
              style={{
                marginLeft: 14,
                background: isLocked ? "rgba(0, 245, 118, 0.15)" : "rgba(255, 184, 0, 0.2)",
                border: `1px solid ${isLocked ? "#00f576" : "#ffb800"}`,
                color: isLocked ? "#00f576" : "#ffb800",
                borderRadius: 20,
                padding: "3px 10px",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Compass size={13} />
              <span>
                {isLocked
                  ? (isAz ? "🎯 Kursor Kilidli [ESC]" : "🎯 Mouse Locked [ESC]")
                  : (isAz ? "🔓 Kursor Sərbəst (Kilidlə)" : "🔓 Mouse Free (Click to Lock)")}
              </span>
            </button>
          )}
        </div>

        <div className="cyber-shooter__killfeed">
          {killfeed.slice(0, 5).map((k) => (
            <div key={k.id} className="cyber-shooter__killfeed-item">
              <span style={{ color: ROLE_SPECS[k.killerRole]?.color || "#00f576" }}>
                {k.killerName}
              </span>
              <span className="cyber-shooter__killfeed-weapon">
                {WEAPON_SPECS[k.weaponId]?.nameEn || k.weaponId}
              </span>
              {k.isHeadshot && (
                <span className="cyber-shooter__killfeed-headshot">HEADSHOT!</span>
              )}
              <span style={{ color: ROLE_SPECS[k.victimRole]?.color || "#ef4444" }}>
                {k.victimName}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom HUD: Health, Shields, Abilities, Ammo */}
      <div className="cyber-shooter__hud-bottom">
        {/* Vitals */}
        <div className="cyber-shooter__vitals">
          <div className="cyber-shooter__vital-bar-wrap">
            <div className="cyber-shooter__vital-label">
              <span>HEALTH</span>
              <strong>{Math.ceil(health)} / {maxHealth}</strong>
            </div>
            <div className="cyber-shooter__vital-track">
              <div
                className={`cyber-shooter__vital-fill ${
                  health < 30 ? "cyber-shooter__vital-fill--hp-low" : "cyber-shooter__vital-fill--hp"
                }`}
                style={{ width: `${Math.max(0, Math.min(100, (health / Math.max(1, maxHealth)) * 100))}%` }}
              />
            </div>
          </div>

          <div className="cyber-shooter__vital-bar-wrap">
            <div className="cyber-shooter__vital-label">
              <span>SHIELD</span>
              <strong>{Math.ceil(shield)} / {maxShield}</strong>
            </div>
            <div className="cyber-shooter__vital-track">
              <div
                className="cyber-shooter__vital-fill cyber-shooter__vital-fill--shield"
                style={{ width: `${Math.max(0, Math.min(100, (shield / Math.max(1, maxShield)) * 100))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Abilities Slots */}
        <div className="cyber-shooter__abilities">
          <div className="cyber-shooter__ability-slot">
            <div className="cyber-shooter__ability-icon">
              <span>HOP</span>
            </div>
            <span className="cyber-shooter__ability-key">SHIFT</span>
          </div>

          <div className="cyber-shooter__ability-slot">
            <div
              className={`cyber-shooter__ability-icon ${
                dashCd <= 0 ? "cyber-shooter__ability-icon--ready" : ""
              }`}
            >
              {dashCd > 0 ? Math.ceil(dashCd) : <Zap size={18} />}
            </div>
            <span className="cyber-shooter__ability-key">E • {roleSpec.movementMechanicNameEn ? roleSpec.movementMechanicNameEn.split(" ")[0] : "DASH"}</span>
          </div>

          <div className="cyber-shooter__ability-slot">
            <div
              className={`cyber-shooter__ability-icon ${
                ultCd <= 0 ? "cyber-shooter__ability-icon--ready" : ""
              }`}
            >
              {ultCd > 0 ? Math.ceil(ultCd) : <Flame size={18} />}
            </div>
            <span className="cyber-shooter__ability-key">Q • ULT</span>
          </div>
        </div>

        {/* Ammo & Weapon */}
        <div className="cyber-shooter__ammo-box">
          <div className="cyber-shooter__weapon-name" style={{ color: activeWeaponSpec.accentColor }}>
            {activeWeaponSpec.nameEn}
            <div style={{ fontSize: 10, color: "#64748b" }}>
              [{currentRole.toUpperCase()}] • {isReloading ? "RELOADING..." : "READY"}
            </div>
          </div>
          <div className="cyber-shooter__ammo-numbers">
            {ammo} <span>/ {maxAmmo}</span>
          </div>
        </div>
      </div>

      {/* Tab Scoreboard */}
      {scoreboardVisible && (
        <div className="cyber-shooter__scoreboard">
          <div className="cyber-shooter__scoreboard-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <ExpressbankEmblem size={24} glow />
                <h3 style={{ margin: 0, color: "#fff", fontSize: 18, fontWeight: 900 }}>
                  EXPRESSBANK CYBER LOBBY SCOREBOARD
                </h3>
              </div>
              <div style={{ fontSize: 12, color: "#00f576", fontWeight: 700 }}>
                PLAYERS ONLINE: {Object.keys(lobbyPlayers).length}
              </div>
            </div>

            <table className="cyber-shooter__scoreboard-table">
              <thead>
                <tr>
                  <th>OPERATOR</th>
                  <th>ROLE</th>
                  <th>KILLS</th>
                  <th>DEATHS</th>
                  <th>SCORE</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(lobbyPlayers)
                  .sort((a, b) => b.score - a.score)
                  .map((p) => (
                    <tr
                      key={p.id}
                      className={p.id === localPlayerId ? "cyber-shooter__scoreboard-row--me" : ""}
                    >
                      <td>{p.name} {p.id === localPlayerId && "(YOU)"}</td>
                      <td style={{ color: ROLE_SPECS[p.role]?.color || "#fff" }}>
                        {ROLE_SPECS[p.role]?.callsign}
                      </td>
                      <td>{p.kills}</td>
                      <td>{p.deaths}</td>
                      <td>{p.score}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Elimination & Respawn Overlay */}
      {isEliminated && (
        <div className="cyber-shooter__elim-overlay">
          <div className="cyber-shooter__elim-title">SYSTEM COMPROMISED</div>
          <div className="cyber-shooter__elim-countdown">
            {isAz ? "Yenidən yüklənir:" : "RESPAWNING IN"} {Math.ceil(respawnCountdown)}s...
          </div>
        </div>
      )}

      {/* Class / Role Picker Modal (M key) */}
      {isRoleModalOpen && (
        <div className="cyber-shooter__lock-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="cyber-shooter__lock-box" style={{ maxWidth: 760 }}>
            <h2 className="cyber-shooter__lock-title">
              {isAz ? "KİBER DÖYÜŞÇÜ ROLUNU SEÇİN" : "SELECT YOUR IT COMBAT CLASS"}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 20 }}>
              {(["infosec", "helpdesk", "it_admin"] as ShooterRole[]).map((rKey) => {
                const r = ROLE_SPECS[rKey];
                const isCurrent = currentRole === rKey;
                return (
                  <div
                    key={rKey}
                    onClick={() => handleRoleSelect(rKey)}
                    style={{
                      background: isCurrent ? "rgba(0, 245, 118, 0.15)" : "rgba(255, 255, 255, 0.04)",
                      border: `1px solid ${isCurrent ? r.color : "rgba(255, 255, 255, 0.1)"}`,
                      borderRadius: 12,
                      padding: 18,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.2s",
                    }}
                  >
                    <div style={{ color: r.color, fontWeight: 900, fontSize: 16, marginBottom: 6 }}>
                      {r.callsign}
                    </div>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                      {isAz ? r.titleAz : r.titleEn}
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: 11, lineHeight: 1.4, marginBottom: 12 }}>
                      {isAz ? r.descriptionAz : r.descriptionEn}
                    </div>
                    <div style={{ fontSize: 11, color: "#00e5ff", fontWeight: 700 }}>
                      ⚡ {isAz ? r.movementMechanicNameAz : r.movementMechanicNameEn}
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="cyber-shooter__lock-hint"
              onClick={() => {
                setIsRoleModalOpen(false);
                setHasStarted(true);
                requestPointerLock();
              }}
              style={{ marginTop: 24, cursor: "pointer" }}
            >
              {isAz ? "DÖYÜŞƏ QAYIT" : "RETURN TO ARENA"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const CyberShooterArcade: React.FC<CyberShooterArcadeProps> = (props) => {
  const { language } = useI18n();
  const isAz = language === "az";
  return (
    <CyberShooterErrorBoundary onClose={props.onClose} isAz={isAz}>
      <CyberShooterInner {...props} />
    </CyberShooterErrorBoundary>
  );
};

export default CyberShooterArcade;
