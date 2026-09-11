import React, { useState, useMemo } from "react";
import {
  X,
  Swords,
  Search,
  Bot,
  User,
  Shield,
  Zap,
  Sparkles,
  CheckCircle,
} from "lucide-react";
import { ExpressbankEmblem } from "../../common/ExpressbankLogo.js";
import { useAuth } from "../../../context/AuthContext.js";
import { useI18n } from "../../../context/I18nContext.js";
import "./cyber-battle-arcade.css";

interface ChallengeModalProps {
  onClose: () => void;
  onChallengeCreated: (matchId: string) => void;
}

export const ChallengeModal: React.FC<ChallengeModalProps> = ({
  onClose,
  onChallengeCreated,
}) => {
  const { currentUser, allUsers, refreshUsers, fetchWithAuth } = useAuth();
  const { language } = useI18n();
  const isAz = language === "az";

  const [searchQuery, setSearchQuery] = useState("");
  const [loadingTargetId, setLoadingTargetId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (allUsers.length <= 1 && refreshUsers) {
      void refreshUsers();
    }
  }, [allUsers.length, refreshUsers]);

  // Available colleague list (with realistic Expressbank InfoSec fallbacks if user list is small)
  const availableUsers = useMemo(() => {
    const list = [...allUsers];
    const fallbackList = [
      { id: "u_orkhan", username: "orkhan.m", fullName: "Orxan Məmmədov", title: "SOC Lead & Threat Hunter", departmentId: "CYBER_DEFENSE" },
      { id: "u_leyla", username: "leyla.a", fullName: "Leyla Əliyeva", title: "Kiber Təhlükəsizlik Analitiki", departmentId: "INFOSEC" },
      { id: "u_rashad", username: "rashad.h", fullName: "Rəşad Hüseynov", title: "İnformasiya Təhlükəsizliyi Meneceri", departmentId: "RISK_GOV" },
      { id: "u_narmin", username: "narmin.b", fullName: "Nərmin Babayeva", title: "Kriptoqrafiya və Giriş Nəzarəti", departmentId: "IT_SECURITY" },
      { id: "u_samir", username: "samir.q", fullName: "Samir Qasımov", title: "Şəbəkə Təhlükəsizliyi Mühəndisi", departmentId: "NETWORK" },
    ];
    for (const fb of fallbackList) {
      if (!list.some((u) => u.id === fb.id || u.username === fb.username)) {
        list.push(fb as any);
      }
    }
    return list;
  }, [allUsers]);

  // Filter available colleagues excluding self
  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return availableUsers.filter((u) => {
      if (u.id === currentUser?.id || u.username === currentUser?.username) return false;
      if (!q) return true;
      return (
        u.fullName?.toLowerCase().includes(q) ||
        u.username?.toLowerCase().includes(q) ||
        u.title?.toLowerCase().includes(q) ||
        u.departmentId?.toLowerCase().includes(q)
      );
    });
  }, [availableUsers, currentUser?.id, currentUser?.username, searchQuery]);

  // Initiate challenge
  const handleSendChallenge = async (targetUser: { id: string; username: string; fullName: string }) => {
    setLoadingTargetId(targetUser.id);
    setErrorMsg(null);

    try {
      const res = await fetchWithAuth("/api/battle/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: targetUser.id,
          targetUsername: targetUser.username,
          targetFullName: targetUser.fullName,
        }),
      });

      const data = await res.json();
      if (data && data.success && data.matchId) {
        onChallengeCreated(data.matchId);
      } else {
        setErrorMsg(data?.message || "Dəvət göndərilə bilmədi");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Şəbəkə xətası baş verdi");
    } finally {
      setLoadingTargetId(null);
    }
  };

  return (
    <div className="cba-modal-overlay" role="dialog" aria-modal="true">
      <div className="cba-challenge-modal">
        {/* Header */}
        <div className="cba-cmodal-header">
          <div className="cba-cmodal-header__brand">
            <ExpressbankEmblem size={24} glow />
            <div>
              <h2 className="cba-cmodal-header__title">
                {isAz ? "MEYDAN OXU" : "CHALLENGE"}{" "}
                <span>• DƏNİZ DÖYÜŞÜ</span>
              </h2>
              <span className="cba-cmodal-header__sub">
                {isAz
                  ? "Həmkarını seç və kiber donanma döyüşünə çağır!"
                  : "Select a colleague and challenge to a fleet battle!"}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="csu-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="cba-cmodal-search">
          <div className="cba-search-input-wrap">
            <Search size={16} />
            <input
              type="text"
              className="cba-search-input"
              placeholder={isAz ? "Həmkar axtar (ad, soyad, vəzifə)..." : "Search colleague by name or role..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
          {errorMsg && (
            <div style={{ color: "#ef4444", fontSize: "0.8rem", marginTop: 6 }}>
              {errorMsg}
            </div>
          )}
        </div>

        {/* User list */}
        <div className="cba-users-list">
          {/* Option 1: AI SOC Bot (Immediate Play) */}
          <div className="cba-user-card cba-user-card--ai">
            <div className="cba-user-card__left">
              <div className="cba-user-avatar cba-user-avatar--ai">
                <Bot size={20} />
              </div>
              <div className="cba-user-info">
                <span className="cba-user-name">
                  Expressbank AI • SOC Bot
                </span>
                <span className="cba-user-meta" style={{ color: "#00f576" }}>
                  ● {isAz ? "Avtomatlaşdırılmış Rəqib • Ani Başlama" : "Automated AI Opponent • Instant Play"}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="cba-challenge-btn cba-challenge-btn--ai"
              disabled={loadingTargetId !== null}
              onClick={() =>
                handleSendChallenge({
                  id: "ai_soc_bot",
                  username: "soc.bot",
                  fullName: "Expressbank SOC AI Bot",
                })
              }
            >
              <Swords size={13} />
              <span>{isAz ? "DÖYÜŞƏ BAŞLA" : "START BATTLE"}</span>
            </button>
          </div>

          {/* Colleague List */}
          {filteredUsers.map((u) => (
            <div key={u.id} className="cba-user-card">
              <div className="cba-user-card__left">
                <div className="cba-user-avatar">
                  {u.fullName?.charAt(0) || u.username?.charAt(0) || "U"}
                </div>
                <div className="cba-user-info">
                  <span className="cba-user-name">{u.fullName || u.username}</span>
                  <span className="cba-user-meta">
                    {u.title || "Expressbank Əməkdaşı"} {u.departmentId ? `• ${u.departmentId}` : ""}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="cba-challenge-btn"
                disabled={loadingTargetId !== null}
                onClick={() =>
                  handleSendChallenge({
                    id: u.id,
                    username: u.username,
                    fullName: u.fullName || u.username,
                  })
                }
              >
                <Swords size={13} />
                <span>
                  {loadingTargetId === u.id
                    ? (isAz ? "DƏVƏT EDİLİR..." : "INVITING...")
                    : (isAz ? "MEYDAN OXU" : "CHALLENGE")}
                </span>
              </button>
            </div>
          ))}

          {filteredUsers.length === 0 && (
            <div style={{ textAlign: "center", color: "#64748b", padding: "24px 0", fontSize: "0.85rem" }}>
              {isAz ? "Uyğun həmkar tapılmadı" : "No colleagues found"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
