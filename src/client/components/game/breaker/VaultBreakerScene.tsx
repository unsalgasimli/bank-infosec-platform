import React, { useEffect, useRef } from "react";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  type VaultBreakerState,
} from "./vault-breaker-engine.js";
import { EXPRESSBANK_EMBLEM_PATH } from "../../common/ExpressbankLogo.js";

interface VaultBreakerSceneProps {
  state: VaultBreakerState;
  onPointerMove: (virtualX: number) => void;
  onClick: () => void;
}

export const VaultBreakerScene: React.FC<VaultBreakerSceneProps> = ({
  state,
  onPointerMove,
  onClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const path2DRef = useRef<Path2D | null>(null);

  useEffect(() => {
    if (typeof Path2D !== "undefined") {
      path2DRef.current = new Path2D(EXPRESSBANK_EMBLEM_PATH);
    }
  }, []);

  // Handle pointer interactions
  const handlePointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = ARENA_WIDTH / rect.width;
    const clientX = e.clientX - rect.left;
    onPointerMove(clientX * scaleX);
  };

  // Render loop
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // 1. Clear Arena
      ctx.fillStyle = "#070b12";
      ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

      // 2. Subtle Background Cyber Grid
      ctx.strokeStyle = "rgba(0, 245, 118, 0.05)";
      ctx.lineWidth = 1;
      for (let x = 0; x < ARENA_WIDTH; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ARENA_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y < ARENA_HEIGHT; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(ARENA_WIDTH, y);
        ctx.stroke();
      }

      // 3. Draw Arena Outer Safety Frame
      ctx.strokeStyle = "rgba(0, 245, 118, 0.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(6, 6, ARENA_WIDTH - 12, ARENA_HEIGHT - 12);

      // Top Header Zone glow
      const topGrad = ctx.createLinearGradient(0, 0, 0, 60);
      topGrad.addColorStop(0, "rgba(0, 245, 118, 0.08)");
      topGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = topGrad;
      ctx.fillRect(6, 6, ARENA_WIDTH - 12, 60);

      // 4. Draw Bricks
      state.bricks.forEach((b) => {
        ctx.save();

        // Brick Body
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.glowColor;
        ctx.shadowBlur = b.type === "emp" || b.type === "bonus" ? 14 : 8;

        // Rounded rect for brick
        const rad = 4;
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.width, b.height, rad);
        ctx.fill();

        // Inner bevel highlight
        ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
        ctx.fillRect(b.x + 2, b.y + 2, b.width - 4, 3);

        // Armored cracks if damaged
        if (b.hp < b.maxHp) {
          ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(b.x + b.width * 0.3, b.y + 3);
          ctx.lineTo(b.x + b.width * 0.5, b.y + b.height * 0.6);
          ctx.lineTo(b.x + b.width * 0.75, b.y + b.height - 3);
          ctx.stroke();
        }

        // Special icon markings for EMP and Bonus bricks
        if (b.type === "emp") {
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 9px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("EMP", b.x + b.width / 2, b.y + b.height / 2);
        } else if (b.type === "bonus") {
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 11px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("★", b.x + b.width / 2, b.y + b.height / 2);
        }

        ctx.restore();
      });

      // 5. Draw Falling Powerups
      state.powerups.forEach((p) => {
        ctx.save();
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;

        const pw = 34;
        const ph = 14;
        ctx.beginPath();
        ctx.roundRect(p.x - pw / 2, p.y - ph / 2, pw, ph, 7);
        ctx.fill();

        // Label inside capsule
        ctx.fillStyle = "#041208";
        ctx.font = "bold 8px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.type.slice(0, 4).toUpperCase(), p.x, p.y);

        ctx.restore();
      });

      // 6. Draw Lasers
      ctx.fillStyle = "#00e5ff";
      ctx.shadowColor = "#00e5ff";
      ctx.shadowBlur = 10;
      state.lasers.forEach((l) => {
        ctx.fillRect(l.x, l.y, l.width, l.height);
      });
      ctx.shadowBlur = 0;

      // 7. Draw Paddle
      const pad = state.paddle;
      ctx.save();

      // Metallic body
      const padGrad = ctx.createLinearGradient(pad.x, pad.y, pad.x, pad.y + pad.height);
      padGrad.addColorStop(0, "#cbd5e1");
      padGrad.addColorStop(0.5, "#475569");
      padGrad.addColorStop(1, "#1e293b");

      ctx.fillStyle = padGrad;
      ctx.shadowColor = pad.laserTimer > 0 ? "#00e5ff" : pad.fireballTimer > 0 ? "#ff3344" : "#00f576";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.roundRect(pad.x, pad.y, pad.width, pad.height, 6);
      ctx.fill();

      // Paddle neon top rim
      ctx.fillStyle = pad.laserTimer > 0 ? "#00e5ff" : pad.fireballTimer > 0 ? "#ff3344" : "#00f576";
      ctx.fillRect(pad.x + 4, pad.y, pad.width - 8, 2.5);

      // Twin Laser Cannons if laser powerup active
      if (pad.laserTimer > 0) {
        ctx.fillStyle = "#00e5ff";
        ctx.fillRect(pad.x + 8, pad.y - 6, 4, 6);
        ctx.fillRect(pad.x + pad.width - 12, pad.y - 6, 4, 6);
      }

      // Center Expressbank Emblem Insignia
      if (path2DRef.current) {
        ctx.save();
        ctx.translate(pad.x + pad.width / 2 - 8, pad.y + 2);
        ctx.scale(0.38, 0.38);
        ctx.fillStyle = "#ffb800";
        ctx.shadowColor = "#ffb800";
        ctx.shadowBlur = 6;
        ctx.fill(path2DRef.current);
        ctx.restore();
      }

      // Thruster exhaust on side bumpers
      ctx.fillStyle = "rgba(0, 245, 118, 0.4)";
      ctx.fillRect(pad.x - 2, pad.y + 3, 2, pad.height - 6);
      ctx.fillRect(pad.x + pad.width, pad.y + 3, 2, pad.height - 6);

      ctx.restore();

      // 8. Draw Balls
      state.balls.forEach((ball) => {
        ctx.save();
        const isFire = pad.fireballTimer > 0;

        ctx.fillStyle = isFire ? "#ff4b5c" : "#ffffff";
        ctx.shadowColor = isFire ? "#ff3344" : "#00f576";
        ctx.shadowBlur = isFire ? 18 : 12;

        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fill();

        // Inner hot core
        ctx.fillStyle = isFire ? "#ffd700" : "#00f576";
        ctx.beginPath();
        ctx.arc(ball.x - 1.5, ball.y - 1.5, ball.radius * 0.45, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      });

      // 9. Draw Particles
      state.particles.forEach((pt) => {
        ctx.save();
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = Math.max(0, pt.life);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [state]);

  return (
    <canvas
      ref={canvasRef}
      width={ARENA_WIDTH}
      height={ARENA_HEIGHT}
      className="vault-breaker-canvas"
      onPointerMove={handlePointer}
      onClick={onClick}
    />
  );
};
