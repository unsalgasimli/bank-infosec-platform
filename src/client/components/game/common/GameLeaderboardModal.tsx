import React, { useEffect, useState, useCallback } from "react";
import {
  Trophy,
  X,
  RotateCcw,
  Shield,
  Zap,
  Bomb,
  Plane,
  Award,
  Clock,
  Sparkles,
  Users,
  Hash,
} from "lucide-react";
import { ExpressbankEmblem } from "../../common/ExpressbankLogo.js";
import { useAuth } from "../../../context/AuthContext.js";
import { useI18n } from "../../../context/I18nContext.js";
import type { GameLeaderboardEntry, GamePlayerStats } from "../../../../shared/types/game.js";
import "./game-leaderboard-modal.css";

export type GameKey = "cyber" | "flight" | "breaker" | "sweeper" | "sudoku";

interface GameLeaderboardModalProps {
  initialGame?: GameKey;
  allowedGames?: GameKey[];
  onClose: () => void;
  onLaunchGame?: (gameKey: GameKey) => void;
}

const GAME_TABS: {
  id: GameKey;
  labelAz: string;
  labelEn: string;
  badge: string;
  color: string;
  icon: React.ComponentType<{ size?: number; color?: string; className?: string }>;
}[] = [
  {
    id: "cyber",
    labelAz: "Cyber Defense",
    labelEn: "Cyber Defense",
    badge: "Kiber Qala",
    color: "#00f576",
    icon: Shield,
  },
  {
    id: "breaker",
    labelAz: "Vault Breaker",
    labelEn: "Vault Breaker",
    badge: "Kassa Deşmə",
    color: "#ff007f",
    icon: Zap,
  },
  {
    id: "sweeper",
    labelAz: "Cyber Sweeper",
    labelEn: "Cyber Sweeper",
    badge: "Zero-Day Mina",
    color: "#00e5ff",
    icon: Bomb,
  },
  {
    id: "sudoku",
    labelAz: "Cyber Sudoku",
    labelEn: "Cyber Sudoku",
    badge: "Kripto Matris",
    color: "#a855f7",
    icon: Hash,
  },
  {
    id: "flight",
    labelAz: "Garden Flight",
    labelEn: "Garden Flight",
    badge: "Retro Uçuş",
    color: "#ffb800",
    icon: Plane,
  },
];

const SWEEPER_DIFFS: { id: string; labelAz: string; labelEn: string }[] = [
  { id: "novice", labelAz: "Başlanğıc (9x9)", labelEn: "Novice (9x9)" },
  { id: "soc", labelAz: "SOC Analitik (16x16)", labelEn: "SOC Analyst (16x16)" },
  { id: "ciso", labelAz: "CISO Rejimi (30x16)", labelEn: "CISO Mode (30x16)" },
];

const SUDOKU_DIFFS: { id: string; labelAz: string; labelEn: string }[] = [
  { id: "novice", labelAz: "Başlanğıc (Novice)", labelEn: "Novice (Easy)" },
  { id: "soc", labelAz: "SOC Analitik (Medium)", labelEn: "SOC Analyst (Medium)" },
  { id: "ciso", labelAz: "CISO Kriptoqraf (Hard)", labelEn: "CISO Cryptographer (Hard)" },
];

export const GameLeaderboardModal: React.FC<GameLeaderboardModalProps> = ({
  initialGame = "cyber",
  allowedGames,
  onClose,
  onLaunchGame,
}) => {
  const { currentUser, fetchWithAuth } = useAuth();
  const { language } = useI18n();
  const isAz = language === "az";

  const [activeGame, setActiveGame] = useState<GameKey>(initialGame);
  const [sweeperDiff, setSweeperDiff] = useState<string>("novice");
  const [sudokuDiff, setSudokuDiff] = useState<string>("novice");
  const [leaderboard, setLeaderboard] = useState<GameLeaderboardEntry[]>([]);
  const [me, setMe] = useState<GamePlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const availableTabs = allowedGames
    ? GAME_TABS.filter((t) => allowedGames.includes(t.id))
    : GAME_TABS;

  const loadData = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setLoading(true);
      setRefreshing(true);

      try {
        const isSweeper = activeGame === "sweeper";
        const isSudoku = activeGame === "sudoku";
        const diffParam = isSweeper ? sweeperDiff : isSudoku ? sudokuDiff : "novice";
        const queryParams = isSweeper || isSudoku ? `?difficulty=${diffParam}&limit=10` : `?limit=10`;
        const res = await fetchWithAuth(`/api/game/${activeGame}/leaderboard${queryParams}`);
        const data = await res.json();

        if (data && data.success && Array.isArray(data.leaderboard)) {
          setLeaderboard(data.leaderboard);
          setMe(data.me ?? null);
        } else {
          setLeaderboard([]);
          setMe(null);
        }
      } catch {
        setLeaderboard([]);
        setMe(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeGame, sweeperDiff, sudokuDiff, fetchWithAuth]
  );

  useEffect(() => {
    void loadData(true);
  }, [loadData]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const activeTabMeta = GAME_TABS.find((t) => t.id === activeGame) ?? GAME_TABS[0];
  const isSweeper = activeGame === "sweeper";
  const isSudoku = activeGame === "sudoku";

  const formatScore = (val: number) => {
    if (isSweeper || isSudoku) {
      const mins = Math.floor(val / 60);
      const secs = val % 60;
      return `${mins > 0 ? `${mins}m ` : ""}${secs}s`;
    }
    return val.toLocaleString();
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return { label: "1", medal: "🥇", cls: "glm-rank--gold" };
    if (rank === 2) return { label: "2", medal: "🥈", cls: "glm-rank--silver" };
    if (rank === 3) return { label: "3", medal: "🥉", cls: "glm-rank--bronze" };
    return { label: String(rank), medal: "", cls: "glm-rank--regular" };
  };

  return (
    <div
      className="glm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Expressbank Arcade Leaderboard"
    >
      <div className="glm-modal">
        {/* Header */}
        <header className="glm-header">
          <div className="glm-header__brand">
            <div className="glm-header__emblem">
              <ExpressbankEmblem size={24} glow />
            </div>
            <div>
              <div className="glm-header__title-row">
                <Trophy size={18} color="#ffb800" />
                <h2>{isAz ? "EXPRESSBANK ARCADİA LİDERLƏRİ" : "EXPRESSBANK ARCADIA LEADERBOARD"}</h2>
              </div>
              <p className="glm-header__sub">
                {isAz
                  ? "Təhlükəsizlik və İnformasiya Texnologiyaları əməkdaşlarının canlı turnir cədvəli"
                  : "Live tournament standings for InfoSec & Engineering personnel"}
              </p>
            </div>
          </div>

          <div className="glm-header__actions">
            <button
              type="button"
              className={`glm-btn glm-btn--icon ${refreshing ? "is-spinning" : ""}`}
              onClick={() => void loadData(false)}
              title={isAz ? "Cədvəli Yenilə" : "Refresh Standings"}
              disabled={refreshing}
            >
              <RotateCcw size={14} />
              <span>{isAz ? "Yenilə" : "Refresh"}</span>
            </button>
            <button
              type="button"
              className="glm-btn glm-btn--close"
              onClick={onClose}
              title={isAz ? "Bağla (Esc)" : "Close (Esc)"}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Game Navigation Tabs */}
        <div className="glm-tabs-bar" role="tablist">
          {availableTabs.map((tab) => {
            const isSelected = activeGame === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`glm-tab ${isSelected ? "glm-tab--active" : ""}`}
                style={
                  {
                    "--tab-color": tab.color,
                  } as React.CSSProperties
                }
                onClick={() => setActiveGame(tab.id)}
              >
                <Icon size={14} color={isSelected ? tab.color : "#94a3b8"} />
                <span>{isAz ? tab.labelAz : tab.labelEn}</span>
                <span className="glm-tab__badge">{tab.badge}</span>
              </button>
            );
          })}
        </div>

        {/* Sub-Tabs for Sweeper Difficulty */}
        {isSweeper && (
          <div className="glm-diff-bar">
            <div className="glm-diff-bar__title">
              <Sparkles size={13} color="#00e5ff" />
              <span>{isAz ? "ÇƏTİNLİK SƏVİYYƏSİ:" : "DIFFICULTY MODE:"}</span>
            </div>
            <div className="glm-diff-buttons">
              {SWEEPER_DIFFS.map((diff) => {
                const isSelected = sweeperDiff === diff.id;
                return (
                  <button
                    key={diff.id}
                    type="button"
                    className={`glm-diff-btn ${isSelected ? "glm-diff-btn--active" : ""}`}
                    onClick={() => setSweeperDiff(diff.id)}
                  >
                    {isAz ? diff.labelAz : diff.labelEn}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Sub-Tabs for Sudoku Difficulty */}
        {isSudoku && (
          <div className="glm-diff-bar">
            <div className="glm-diff-bar__title">
              <Sparkles size={13} color="#a855f7" />
              <span>{isAz ? "ÇƏTİNLİK SƏVİYYƏSİ:" : "DIFFICULTY MODE:"}</span>
            </div>
            <div className="glm-diff-buttons">
              {SUDOKU_DIFFS.map((diff) => {
                const isSelected = sudokuDiff === diff.id;
                return (
                  <button
                    key={diff.id}
                    type="button"
                    className={`glm-diff-btn ${isSelected ? "glm-diff-btn--active" : ""}`}
                    style={isSelected ? { borderColor: "#a855f7", color: "#a855f7" } : undefined}
                    onClick={() => setSudokuDiff(diff.id)}
                  >
                    {isAz ? diff.labelAz : diff.labelEn}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Main Leaderboard Table Container */}
        <div className="glm-body">
          {loading ? (
            <div className="glm-loading">
              <div className="glm-spinner" />
              <p>{isAz ? "Liderlər cədvəli yüklənir..." : "Loading tournament rankings..."}</p>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="glm-empty">
              <Award size={36} color="#64748b" />
              <h3>{isAz ? "Hələ ki rekord qeydə alınmayıb" : "No Records Yet"}</h3>
              <p>
                {isAz
                  ? "Bu oyunda ilk rekordu siz təyin edin və adınızı tarixə yazın!"
                  : "Be the first cyber defender to register a high score in this category!"}
              </p>
            </div>
          ) : (
            <div className="glm-table-wrapper">
              <table className="glm-table">
                <thead>
                  <tr>
                    <th style={{ width: "60px", textAlign: "center" }}>
                      {isAz ? "SIRA" : "RANK"}
                    </th>
                    <th>{isAz ? "ƏMƏKDAŞ" : "PLAYER / SPECIALIST"}</th>
                    <th style={{ width: "90px", textAlign: "center" }}>
                      {isAz ? "OYUN" : "RUNS"}
                    </th>
                    <th style={{ width: "130px", textAlign: "right" }}>
                      {isSweeper
                        ? isAz
                          ? "MÜDDƏT"
                          : "TIME"
                        : isAz
                        ? "XAL"
                        : "SCORE"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, idx) => {
                    const rank = idx + 1;
                    const badge = getRankBadge(rank);
                    const isMe =
                      currentUser &&
                      (entry.userId === currentUser.id ||
                        entry.username === currentUser.username);

                    return (
                      <tr
                        key={entry.userId || idx}
                        className={`glm-row ${isMe ? "glm-row--me" : ""}`}
                      >
                        <td className="glm-col-rank">
                          <span className={`glm-rank-badge ${badge.cls}`}>
                            {badge.medal ? badge.medal : badge.label}
                          </span>
                        </td>
                        <td className="glm-col-name">
                          <div className="glm-user-cell">
                            <div className="glm-user-avatar">
                              {entry.displayName?.slice(0, 2).toUpperCase() ||
                                entry.username?.slice(0, 2).toUpperCase() ||
                                "EB"}
                            </div>
                            <div className="glm-user-meta">
                              <span className="glm-user-name">
                                {entry.displayName || entry.username}
                                {isMe && (
                                  <span className="glm-you-tag">
                                    {isAz ? "SİZ" : "YOU"}
                                  </span>
                                )}
                              </span>
                              <span className="glm-user-sub">
                                @{entry.username}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="glm-col-runs">
                          <span className="glm-runs-badge">
                            {entry.runs} {isAz ? "dəfə" : "runs"}
                          </span>
                        </td>
                        <td className="glm-col-score">
                          <span
                            className="glm-score-val"
                            style={{ color: activeTabMeta.color }}
                          >
                            {formatScore(entry.best)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer: Caller's Live Standing Card & Quick Launch */}
        <footer className="glm-footer">
          <div className="glm-my-card">
            <div className="glm-my-card__col">
              <span className="glm-my-card__label">
                {isAz ? "SİZİN REKORDUNUZ:" : "YOUR BEST:"}
              </span>
              <span className="glm-my-card__val" style={{ color: activeTabMeta.color }}>
                {me && me.runs > 0 ? formatScore(me.best) : isAz ? "Oynanılmayıb" : "None"}
              </span>
            </div>
            <div className="glm-my-card__col">
              <span className="glm-my-card__label">
                {isAz ? "DƏRƏCƏNİZ:" : "YOUR RANK:"}
              </span>
              <span className="glm-my-card__val">
                {me && me.runs > 0 ? `#${me.rank}` : "—"}
              </span>
            </div>
            <div className="glm-my-card__col">
              <span className="glm-my-card__label">
                {isAz ? "ÜMUMİ CƏHD:" : "TOTAL RUNS:"}
              </span>
              <span className="glm-my-card__val">
                {me ? me.runs : 0} {isAz ? "oyun" : "runs"}
              </span>
            </div>
          </div>

          <div className="glm-footer__actions">
            {onLaunchGame && (
              <button
                type="button"
                className="glm-launch-btn"
                style={{ background: activeTabMeta.color }}
                onClick={() => {
                  onLaunchGame(activeGame);
                  onClose();
                }}
              >
                <Sparkles size={14} color="#000" />
                <span style={{ color: "#000", fontWeight: 700 }}>
                  {isAz ? "BU OYUNU BAŞLA" : "PLAY THIS GAME"}
                </span>
              </button>
            )}
            <button type="button" className="glm-btn" onClick={onClose}>
              {isAz ? "Bağla" : "Close"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default GameLeaderboardModal;
