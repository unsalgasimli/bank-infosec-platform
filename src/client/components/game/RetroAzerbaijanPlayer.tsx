import React, { useEffect, useRef, useState } from "react";
import { Music, SkipForward, Play, Pause, ChevronDown, Check } from "lucide-react";
import {
  AZERBAIJAN_TRACKS,
  getCurrentAzerbaijanTrack,
  isBgmPlaying,
  toggleAzerbaijanMusic,
  nextAzerbaijanTrack,
  playAzerbaijanTrack,
  subscribeAzerbaijanMusic,
  type AzerbaijanTrack,
} from "./retro-azerbaijan-music.js";

interface RetroAzerbaijanPlayerProps {
  compact?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const RetroAzerbaijanPlayer: React.FC<RetroAzerbaijanPlayerProps> = ({
  compact = false,
  className = "",
  style,
}) => {
  const [track, setTrack] = useState<AzerbaijanTrack>(() => getCurrentAzerbaijanTrack());
  const [playing, setPlaying] = useState<boolean>(() => isBgmPlaying());
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = subscribeAzerbaijanMusic((curTrack, isPlay) => {
      setTrack(curTrack);
      setPlaying(isPlay);
    });
    return unsub;
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      window.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleAzerbaijanMusic();
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    nextAzerbaijanTrack();
  };

  const handleSelectTrack = (trackId: AzerbaijanTrack["id"], e: React.MouseEvent) => {
    e.stopPropagation();
    playAzerbaijanTrack(trackId);
    setIsDropdownOpen(false);
  };

  const shortName = track.name
    .replace(" 8-Bit Drive", "")
    .replace(" Chiptune", "")
    .replace(" Retro Groove", "")
    .replace(" Battle", "");

  return (
    <div
      ref={containerRef}
      className={`retro-az-bgm-player ${playing ? "retro-az-bgm-player--playing" : ""} ${className}`}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? "4px" : "6px",
        padding: compact ? "3px 8px" : "4px 10px",
        background: playing
          ? "linear-gradient(90deg, rgba(0, 245, 118, 0.18) 0%, rgba(0, 229, 255, 0.18) 100%)"
          : "rgba(255, 255, 255, 0.05)",
        border: playing
          ? "1px solid rgba(0, 245, 118, 0.45)"
          : "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: "9999px",
        fontFamily: "'VT323', monospace",
        fontSize: compact ? "0.95rem" : "1.05rem",
        color: playing ? "#00f576" : "#94a3b8",
        boxShadow: playing ? "0 0 14px rgba(0, 245, 118, 0.25)" : "none",
        transition: "all 0.2s ease",
        userSelect: "none",
        ...style,
      }}
    >
      {/* Play / Pause Toggle Button */}
      <button
        type="button"
        onClick={handleTogglePlay}
        title={playing ? "Musiqini dayandır" : "Musiqini başlat"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          padding: "2px",
          borderRadius: "50%",
        }}
      >
        {playing ? (
          <Pause size={compact ? 12 : 14} style={{ color: "#00f576" }} />
        ) : (
          <Play size={compact ? 12 : 14} style={{ color: "#cbd5e1" }} />
        )}
      </button>

      {/* Track Title & Dropdown Trigger */}
      <button
        type="button"
        onClick={() => setIsDropdownOpen((prev) => !prev)}
        title="Azərbaycan Retro Mahnısını Seçin"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          background: "none",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          padding: 0,
          fontFamily: "inherit",
          fontSize: "inherit",
        }}
      >
        <Music
          size={compact ? 12 : 13}
          style={{
            animation: playing ? "az-note-bounce 0.8s ease infinite alternate" : "none",
            color: playing ? "#00e5ff" : "#94a3b8",
          }}
        />
        <span
          style={{
            letterSpacing: "0.05em",
            maxWidth: compact ? "95px" : "135px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "inline-block",
            color: playing ? "#ffffff" : "#a0aec0",
          }}
        >
          {shortName}
        </span>
        <ChevronDown
          size={compact ? 10 : 12}
          style={{
            opacity: 0.7,
            transform: isDropdownOpen ? "rotate(180deg)" : "none",
            transition: "transform 0.15s ease",
          }}
        />
      </button>

      {/* Next Track Skip Button */}
      <button
        type="button"
        onClick={handleNext}
        title="Növbəti Retro Azərbaycan Mahnısı (⏭)"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: "none",
          color: "inherit",
          opacity: 0.85,
          cursor: "pointer",
          padding: "2px",
        }}
      >
        <SkipForward size={compact ? 11 : 13} />
      </button>

      {/* Interactive Song Selection Menu */}
      {isDropdownOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            zIndex: 999999,
            minWidth: "220px",
            background: "linear-gradient(180deg, #101726 0%, #080d16 100%)",
            border: "1px solid rgba(0, 245, 118, 0.4)",
            borderRadius: "12px",
            padding: "6px",
            boxShadow:
              "0 10px 25px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 245, 118, 0.2)",
            display: "flex",
            flexDirection: "column",
            gap: "3px",
            animation: "cs-fade-in 0.15s ease-out",
          }}
        >
          <div
            style={{
              padding: "4px 8px 6px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              fontFamily: "'Orbitron', sans-serif",
              fontSize: "0.62rem",
              fontWeight: 800,
              letterSpacing: "0.08em",
              color: "#00f576",
              textTransform: "uppercase",
            }}
          >
            Azərbaycan 8-Bit Mixi
          </div>

          {AZERBAIJAN_TRACKS.map((t) => {
            const isCurrent = t.id === track.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={(e) => handleSelectTrack(t.id, e)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 8px",
                  borderRadius: "8px",
                  background: isCurrent
                    ? "rgba(0, 245, 118, 0.15)"
                    : "transparent",
                  border: isCurrent
                    ? "1px solid rgba(0, 245, 118, 0.4)"
                    : "1px solid transparent",
                  color: isCurrent ? "#ffffff" : "#94a3b8",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.12s ease",
                  fontFamily: "'VT323', monospace",
                  fontSize: "1rem",
                }}
                onMouseEnter={(e) => {
                  if (!isCurrent) {
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
                    e.currentTarget.style.color = "#ffffff";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isCurrent) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "#94a3b8";
                  }
                }}
              >
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: isCurrent ? "bold" : "normal" }}>
                    {t.name}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: "0.45rem",
                      color: isCurrent ? "#00f576" : "#64748b",
                      marginTop: "2px",
                    }}
                  >
                    {t.theme} • {t.bpm} BPM
                  </span>
                </div>
                {isCurrent && <Check size={14} style={{ color: "#00f576" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
export default RetroAzerbaijanPlayer;
