import React, { useEffect, useRef } from "react";
import type { CyberDefenseState } from "./cyber-defense-engine.js";
import { EXPRESSBANK_EMBLEM_PATH } from "../../common/ExpressbankLogo.js";

interface Props {
  state: CyberDefenseState;
  onPointerMove: (normalizedX: number) => void;
  onClick: () => void;
}

export const CyberDefenseScene: React.FC<Props> = ({
  state,
  onPointerMove,
  onClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const path2DRef = useRef<Path2D | null>(null);

  // Pre-compile Expressbank emblem path for 2D canvas drawing
  useEffect(() => {
    try {
      path2DRef.current = new Path2D(EXPRESSBANK_EMBLEM_PATH);
    } catch {
      path2DRef.current = null;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrame: number;
    let gridOffset = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      if (width <= 0 || height <= 0) return;

      gridOffset = (gridOffset + 1.2) % 32;

      ctx.save();

      // Screen shake translation
      if (state.shakeTime > 0) {
        const mag = state.shakeMagnitude;
        const sx = (Math.random() - 0.5) * mag * 2;
        const sy = (Math.random() - 0.5) * mag * 2;
        ctx.translate(sx, sy);
      }

      // 1. Deep Cyber Background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, "#06090d");
      bgGrad.addColorStop(0.65, "#091217");
      bgGrad.addColorStop(1, "#0c181d");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Scrolling Perspective Grid Lines
      ctx.strokeStyle = "rgba(0, 229, 255, 0.06)";
      ctx.lineWidth = 1;

      // Horizontal lines
      for (let y = gridOffset; y < height; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Vertical lines with perspective convergence
      const vSpacing = 44;
      for (let x = 0; x <= width; x += vSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // 3. Bank Vault Perimeter Barrier Line
      const baseLineY = height - 28;
      const hasBarrier = state.vaultBarrier > 0;
      const wallGrad = ctx.createLinearGradient(0, baseLineY, width, baseLineY);
      wallGrad.addColorStop(0, "rgba(250, 166, 26, 0.15)");
      wallGrad.addColorStop(
        0.5,
        hasBarrier
          ? "rgba(105, 240, 174, 0.75)"
          : state.shields > 1
            ? "rgba(0, 229, 255, 0.5)"
            : "rgba(255, 23, 68, 0.85)",
      );
      wallGrad.addColorStop(1, "rgba(250, 166, 26, 0.15)");
      ctx.strokeStyle = wallGrad;
      ctx.lineWidth = hasBarrier ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(0, baseLineY);
      ctx.lineTo(width, baseLineY);
      ctx.stroke();

      // Draw Vault Barrier Integrity Nodes
      if (hasBarrier) {
        const barrierNodes = state.vaultBarrier;
        const spacing = width / (barrierNodes + 1);
        ctx.fillStyle = "#69F0AE";
        ctx.shadowColor = "#69F0AE";
        ctx.shadowBlur = 8;
        for (let i = 1; i <= barrierNodes; i++) {
          const bx = spacing * i;
          ctx.beginPath();
          ctx.arc(bx, baseLineY, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }

      // 4. Draw Lasers (optimized multi-layer glow without GPU-stalling shadowBlur)
      ctx.globalCompositeOperation = "lighter";
      for (const laser of state.lasers) {
        const glowColor = laser.color || "#FAA61A";
        const w = laser.isCrit ? 5 : laser.isDroneShot ? 3 : 4;
        const h = laser.isCrit ? 22 : 16;

        // Outer bloom halo
        ctx.fillStyle = glowColor;
        ctx.globalAlpha = laser.isCrit ? 0.45 : 0.35;
        ctx.fillRect(laser.x - w / 2 - 3, laser.y - h / 2 - 2, w + 6, h + 4);

        // Mid vibrant beam
        ctx.globalAlpha = 0.85;
        ctx.fillRect(laser.x - w / 2, laser.y - h / 2, w, h);

        // Core incandescent white beam
        ctx.fillStyle = "#FFFFFF";
        ctx.globalAlpha = 1.0;
        ctx.fillRect(laser.x - 1, laser.y - h / 2 + 2, 2, h - 4);
      }
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = "source-over";

      // 5. Draw Collectible Drops
      for (const d of state.drops) {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rotation);

        if (d.kind === "coin") {
          // Expressbank Gold Token
          ctx.fillStyle = "#FAA61A";
          ctx.beginPath();
          ctx.arc(0, 0, d.radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "#FFF8E1";
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = "#16222F";
          ctx.font = "bold 9px Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("E", 0, 1);
        } else if (d.kind === "shield") {
          // Firewall Patch
          ctx.fillStyle = "#2E7D32";
          ctx.beginPath();
          ctx.arc(0, 0, d.radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "#81C784";
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = "#E8F5E9";
          ctx.font = "bold 10px Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("+", 0, 1);
        } else if (d.kind === "emp") {
          // Rare EMP Core
          ctx.fillStyle = "#0091EA";
          ctx.beginPath();
          ctx.arc(0, 0, d.radius, 0, Math.PI * 2);
          ctx.fill();

          // Cyan pulse ring
          ctx.strokeStyle = "#00E5FF";
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = "#FFFFFF";
          ctx.font = "bold 8px Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("EMP", 0, 1);
        }

        ctx.restore();
      }

      // 6. Draw Cryptolocker Agility Tethers
      const playerPxX = state.playerX * width;
      const playerPxY = height - 60;
      for (const t of state.threats) {
        if (t.kind === "cryptolocker" && t.tetherActive) {
          ctx.save();
          ctx.strokeStyle = "rgba(255, 23, 68, 0.75)";
          ctx.lineWidth = 2.5;
          ctx.setLineDash([6, 4]);
          ctx.lineDashOffset = -(performance.now() * 0.05) % 10;
          ctx.beginPath();
          ctx.moveTo(t.x, t.y);
          ctx.lineTo(playerPxX, playerPxY);
          ctx.stroke();

          // Core inner laser wire
          ctx.strokeStyle = "#FF8A80";
          ctx.lineWidth = 1;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(t.x, t.y);
          ctx.lineTo(playerPxX, playerPxY);
          ctx.stroke();
          ctx.restore();
        }
      }

      // 7. Draw Threats (Clean vector rendering with zero shadowBlur lag)
      for (const t of state.threats) {
        ctx.save();
        ctx.translate(t.x, t.y);

        if (t.cloaked) {
          ctx.globalAlpha = Math.sin(performance.now() * 0.008) * 0.35 + 0.6;
        }

        if (t.kind === "phishing") {
          // Amber/yellow diamond packet
          ctx.fillStyle = "#FF8F00";
          ctx.beginPath();
          ctx.moveTo(0, -t.radius);
          ctx.lineTo(t.radius, 0);
          ctx.lineTo(0, t.radius);
          ctx.lineTo(-t.radius, 0);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = "#FFE082";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (t.kind === "ddos") {
          // Cyan spinning triangle
          ctx.fillStyle = "#00B0FF";
          ctx.beginPath();
          ctx.moveTo(0, t.radius);
          ctx.lineTo(t.radius * 0.86, -t.radius * 0.5);
          ctx.lineTo(-t.radius * 0.86, -t.radius * 0.5);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = "#E0F7FA";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (t.kind === "trojan") {
          // Purple spiked payload
          ctx.fillStyle = "#AA00FF";
          ctx.beginPath();
          ctx.arc(0, 0, t.radius * 0.75, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "#EA80FC";
          ctx.lineWidth = 2;
          for (let a = 0; a < 6; a++) {
            const rad = (a * Math.PI) / 3;
            ctx.beginPath();
            ctx.moveTo(Math.cos(rad) * (t.radius * 0.7), Math.sin(rad) * (t.radius * 0.7));
            ctx.lineTo(Math.cos(rad) * (t.radius * 1.15), Math.sin(rad) * (t.radius * 1.15));
            ctx.stroke();
          }
        } else if (t.kind === "stealth") {
          // Cloaked neon-violet hexagon
          ctx.fillStyle = "rgba(171, 71, 188, 0.85)";
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            const px = Math.cos(angle) * t.radius;
            const py = Math.sin(angle) * t.radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = "#F48FB1";
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (t.kind === "ransomware") {
          // Heavy armored red tank
          ctx.fillStyle = "#B71C1C";
          ctx.fillRect(-t.radius, -t.radius, t.radius * 2, t.radius * 2);

          ctx.strokeStyle = "#FF8A80";
          ctx.lineWidth = 2;
          ctx.strokeRect(-t.radius + 3, -t.radius + 3, t.radius * 2 - 6, t.radius * 2 - 6);

          ctx.fillStyle = "#FFFFFF";
          ctx.font = "bold 11px Consolas, monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("LOCK", 0, 0);
        } else if (t.kind === "buffer_overflow") {
          // High-velocity rocket needle probe
          ctx.fillStyle = "#D84315";
          ctx.beginPath();
          ctx.moveTo(0, t.radius + 4);
          ctx.lineTo(t.radius * 0.65, -t.radius);
          ctx.lineTo(0, -t.radius * 0.5);
          ctx.lineTo(-t.radius * 0.65, -t.radius);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = "#FF6E40";
          ctx.lineWidth = 2;
          ctx.stroke();

          // Thruster flame if rushing
          if (t.overflowTriggered) {
            ctx.fillStyle = "#FFAB00";
            ctx.beginPath();
            ctx.moveTo(-t.radius * 0.35, -t.radius);
            ctx.lineTo(0, -t.radius - 12);
            ctx.lineTo(t.radius * 0.35, -t.radius);
            ctx.closePath();
            ctx.fill();
          }
        } else if (t.kind === "cryptolocker") {
          // Reinforced armored octagon
          ctx.fillStyle = "#4A0E17";
          ctx.beginPath();
          const octSides = 8;
          for (let i = 0; i < octSides; i++) {
            const ang = (i * Math.PI) / 4;
            const ox = Math.cos(ang) * t.radius;
            const oy = Math.sin(ang) * t.radius;
            if (i === 0) ctx.moveTo(ox, oy);
            else ctx.lineTo(ox, oy);
          }
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = t.tetherActive ? "#FF1744" : "#D50000";
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Padlock glyph
          ctx.fillStyle = "#FF8A80";
          ctx.fillRect(-6, -2, 12, 9);
          ctx.strokeStyle = "#FF8A80";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, -3, 4, Math.PI, 0);
          ctx.stroke();
        } else if (t.kind === "mitm_proxy") {
          // Interceptor router with frontal energy shield
          ctx.fillStyle = "#004D40";
          ctx.beginPath();
          ctx.arc(0, 0, t.radius * 0.75, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "#80CBC4";
          ctx.lineWidth = 2;
          ctx.stroke();

          // Frontal deflector arc facing downwards
          ctx.strokeStyle = "#00E5FF";
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(0, 2, t.radius + 5, 0.15 * Math.PI, 0.85 * Math.PI);
          ctx.stroke();

          ctx.fillStyle = "#00E5FF";
          ctx.font = "bold 9px Consolas, monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("MITM", 0, -2);
        } else if (t.kind === "polymorphic_worm") {
          // Segmented mutating code worm
          ctx.fillStyle = "#1B5E20";
          ctx.beginPath();
          ctx.arc(0, 0, t.radius * 0.8, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "#76FF03";
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Inner pulsing core
          ctx.fillStyle = "#B2FF59";
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fill();
        } else if (t.kind === "worm_fragment") {
          // Mini-fragment spark diamond
          ctx.fillStyle = "#64DD17";
          ctx.beginPath();
          ctx.moveTo(0, -t.radius);
          ctx.lineTo(t.radius, 0);
          ctx.lineTo(0, t.radius);
          ctx.lineTo(-t.radius, 0);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = "#CCFF90";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (t.kind === "boss") {
          // Giant Zero-Day Boss Mainframe
          const isLeviathan = t.bossType === "quantum_leviathan";
          const bossColor = isLeviathan ? "#7C4DFF" : "#FF6D00";
          const coreColor = isLeviathan ? "#311B92" : "#3E2723";

          ctx.fillStyle = coreColor;
          ctx.beginPath();
          ctx.arc(0, 0, t.radius, 0, Math.PI * 2);
          ctx.fill();

          // Rotating outer ring
          ctx.strokeStyle = bossColor;
          ctx.lineWidth = 4;
          ctx.stroke();

          // Boss Title
          ctx.fillStyle = "#FFFFFF";
          ctx.font = "bold 10px Consolas, monospace";
          ctx.textAlign = "center";
          ctx.fillText(
            isLeviathan
              ? "QUANTUM LEVIATHAN"
              : t.bossType === "ransomware_cartel"
                ? "RANSOMWARE CARTEL"
                : "PHISHING MASTER",
            0,
            -t.radius - 22,
          );

          // Boss Health Bar
          const hpRatio = Math.max(0, t.hp / t.maxHp);
          ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
          ctx.fillRect(-45, -t.radius - 14, 90, 8);
          ctx.fillStyle = isLeviathan ? "#B388FF" : "#FF1744";
          ctx.fillRect(-45, -t.radius - 14, 90 * hpRatio, 8);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
          ctx.lineWidth = 1;
          ctx.strokeRect(-45, -t.radius - 14, 90, 8);
        }

        // EMP Disruption Aura & Stun Sparks
        if (t.stunTimer && t.stunTimer > 0) {
          ctx.strokeStyle = "#00E5FF";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, t.radius + 6, 0, Math.PI * 2);
          ctx.stroke();

          const pulseAng = (performance.now() * 0.015) % (Math.PI * 2);
          ctx.beginPath();
          ctx.arc(0, 0, t.radius + 9, pulseAng, pulseAng + 1.2);
          ctx.stroke();
        }

        ctx.restore();
      }

      // 7. Draw Player Craft (Expressbank Interceptor & Diep.io Evolutions)
      const playerX = state.playerX * width;
      const playerY = height - 60;
      const upgrades = state.activeUpgrades;

      // Orbiting Crypto Companions
      const droneLvl = upgrades.crypto_drones || 0;
      if (droneLvl > 0) {
        for (let i = 0; i < droneLvl; i++) {
          const offsetAngle = state.droneAngle + (i * Math.PI);
          const dX = playerX + Math.cos(offsetAngle) * 44;
          const dY = playerY + Math.sin(offsetAngle) * 32;

          ctx.save();
          ctx.translate(dX, dY);
          ctx.shadowColor = "#FFB300";
          ctx.shadowBlur = 10;
          ctx.fillStyle = "#FFB300";
          ctx.beginPath();
          ctx.arc(0, 0, 7, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Mini antenna
          ctx.beginPath();
          ctx.moveTo(0, -7);
          ctx.lineTo(0, -11);
          ctx.stroke();
          ctx.restore();
        }
      }

      ctx.save();
      ctx.translate(playerX, playerY);

      // Invulnerable / Shield bubble
      if (state.invulnerableTime > 0) {
        ctx.shadowColor = "#00E5FF";
        ctx.shadowBlur = 20;
        ctx.strokeStyle = `rgba(0, 229, 255, ${Math.sin(performance.now() * 0.02) * 0.4 + 0.6})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 38, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Engine thruster flames
      ctx.globalCompositeOperation = "lighter";
      const flameLen = 14 + Math.random() * 8;
      const flameGrad = ctx.createLinearGradient(0, 16, 0, 16 + flameLen);
      flameGrad.addColorStop(0, "rgba(0, 229, 255, 0.9)");
      flameGrad.addColorStop(1, "rgba(0, 229, 255, 0)");
      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.moveTo(-8, 16);
      ctx.lineTo(0, 16 + flameLen);
      ctx.lineTo(8, 16);
      ctx.closePath();
      ctx.fill();

      // Cannons (Rendered before Hull)
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = upgrades.plasma_railgun ? "#00E5FF" : "#FAA61A";
      ctx.shadowColor = upgrades.plasma_railgun ? "#00E5FF" : "#FAA61A";
      ctx.shadowBlur = 8;

      if (upgrades.pentashot) {
        // 5 Cannon Barrels
        const angles = [-26, -13, 0, 13, 26];
        angles.forEach((deg) => {
          ctx.save();
          ctx.rotate((deg * Math.PI) / 180);
          ctx.fillRect(-2.5, -28, 5, 20);
          ctx.restore();
        });
      } else if (upgrades.triple_spread) {
        // 3 Cannon Barrels
        const angles = [-18, 0, 18];
        angles.forEach((deg) => {
          ctx.save();
          ctx.rotate((deg * Math.PI) / 180);
          ctx.fillRect(-2.5, -26, 5, 18);
          ctx.restore();
        });
      } else if (upgrades.twin_cannons) {
        // Heavy Dual Parallel Barrels
        ctx.fillRect(-22, -16, 5, 24);
        ctx.fillRect(17, -16, 5, 24);
      } else {
        // Standard Wing Cannons
        ctx.fillRect(-20, -6, 4, 18);
        ctx.fillRect(16, -6, 4, 18);
      }

      // Ship Hull (aerodynamic arrowhead)
      ctx.shadowColor = "#FAA61A";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#16222F";
      ctx.beginPath();
      ctx.moveTo(0, -26);
      ctx.lineTo(26, 18);
      ctx.lineTo(12, 14);
      ctx.lineTo(0, 20);
      ctx.lineTo(-12, 14);
      ctx.lineTo(-26, 18);
      ctx.closePath();
      ctx.fill();

      // Ship Trim & Border
      ctx.strokeStyle = "#FAA61A";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Center Expressbank Emblem Insignia
      if (path2DRef.current) {
        ctx.save();
        ctx.translate(-7, -8);
        ctx.scale(0.36, 0.36);
        ctx.fillStyle = "#FAA61A";
        ctx.fill(path2DRef.current, "evenodd");
        ctx.restore();
      } else {
        ctx.fillStyle = "#FAA61A";
        ctx.beginPath();
        ctx.arc(0, -2, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // Aegis Orbital Shield
      if (upgrades.orbital_shield) {
        const orbX = playerX + Math.cos(state.orbitalAngle) * 48;
        const orbY = playerY + Math.sin(state.orbitalAngle) * 36;
        ctx.save();
        ctx.translate(orbX, orbY);
        ctx.fillStyle = "#00B0FF";
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#E0F7FA";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      // Proximity Mines
      if (state.mines && state.mines.length > 0) {
        for (let i = 0; i < state.mines.length; i++) {
          const m = state.mines[i];
          ctx.save();
          ctx.translate(m.x, m.y);
          ctx.fillStyle = "#FF5252";
          ctx.beginPath();
          ctx.arc(0, 0, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#FFCDD2";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        }
      }

      // 8. Draw Explosions & Particles (Lightning-fast zero-lag vector sparks)
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < state.particles.length; i++) {
        const p = state.particles[i];
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
        const s = p.size;
        ctx.fillRect(p.x - s * 0.5, p.y - s * 0.5, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      // 9. Draw Floating Popups (+Points, Combo, etc.)
      ctx.font = "bold 12px Consolas, monospace";
      ctx.textAlign = "center";
      for (let i = 0; i < state.floatingTexts.length; i++) {
        const ft = state.floatingTexts[i];
        ctx.save();
        ctx.translate(ft.x, ft.y);
        ctx.scale(ft.scale, ft.scale);
        ctx.fillStyle = ft.color;
        ctx.globalAlpha = Math.max(0, Math.min(1, ft.alpha));
        ctx.fillText(ft.text, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      ctx.restore();
      animFrame = requestAnimationFrame(render);
    };

    animFrame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animFrame);
  }, [state]);

  // Handle Resize
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d");
      ctx?.scale(dpr, dpr);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handlePointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    onPointerMove(Math.max(0.05, Math.min(0.95, x)));
  };

  return (
    <div
      ref={containerRef}
      className="cyber-scene"
      onPointerMove={handlePointer}
      onPointerDown={(e) => {
        handlePointer(e);
        onClick();
      }}
    >
      <canvas ref={canvasRef} className="cyber-scene__canvas" />
    </div>
  );
};
