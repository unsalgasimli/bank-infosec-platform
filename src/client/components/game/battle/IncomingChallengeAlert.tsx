import React, { useEffect, useRef, useState, useCallback } from "react";
import { Swords, Check, X, Bell } from "lucide-react";
import { useAuth } from "../../../context/AuthContext.js";
import { useI18n } from "../../../context/I18nContext.js";
import { playSonarBlipSound } from "./cyber-battle-sounds.js";
import "./cyber-battle-arcade.css";

interface IncomingChallenge {
  id: string;
  player1: {
    userId: string;
    username: string;
    displayName: string;
  };
  createdAt: string;
}

interface IncomingChallengeAlertProps {
  onAccept: (matchId: string) => void;
}

export const IncomingChallengeAlert: React.FC<IncomingChallengeAlertProps> = ({ onAccept }) => {
  const { currentUser, fetchWithAuth } = useAuth();
  const { language } = useI18n();
  const isAz = language === "az";

  const [activeChallenge, setActiveChallenge] = useState<IncomingChallenge | null>(null);
  const dismissedIdsRef = useRef<Set<string>>(new Set());
  const lastSoundPlayedRef = useRef<string | null>(null);

  // Poll for pending challenges
  const checkPending = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await fetchWithAuth("/api/battle/pending");
      const data = await res.json();

      if (data && data.success && Array.isArray(data.pending) && data.pending.length > 0) {
        const candidate = data.pending[0] as IncomingChallenge;
        if (!dismissedIdsRef.current.has(candidate.id)) {
          setActiveChallenge(candidate);

          if (lastSoundPlayedRef.current !== candidate.id) {
            lastSoundPlayedRef.current = candidate.id;
            playSonarBlipSound();
          }
          return;
        }
      }
      setActiveChallenge(null);
    } catch {
      /* network resilient */
    }
  }, [currentUser, fetchWithAuth]);

  useEffect(() => {
    if (!currentUser) return;
    void checkPending();
    const interval = setInterval(checkPending, 2500);
    return () => clearInterval(interval);
  }, [checkPending, currentUser]);

  const handleAccept = async () => {
    if (!activeChallenge) return;
    const matchId = activeChallenge.id;

    try {
      await fetchWithAuth(`/api/battle/accept/${matchId}`, { method: "POST" });
      setActiveChallenge(null);
      onAccept(matchId);
    } catch {
      /* fallback */
    }
  };

  const handleDecline = async () => {
    if (!activeChallenge) return;
    const matchId = activeChallenge.id;
    dismissedIdsRef.current.add(matchId);
    setActiveChallenge(null);

    try {
      await fetchWithAuth(`/api/battle/decline/${matchId}`, { method: "POST" });
    } catch {
      /* fallback */
    }
  };

  if (!activeChallenge) return null;

  return (
    <div className="cba-incoming-overlay" role="dialog" aria-modal="true">
      <div className="cba-incoming-card">
        <div className="cba-incoming-header">
          <div className="cba-incoming-icon">
            <Swords size={20} color="#00e5ff" />
          </div>
          <div className="cba-incoming-title">
            {isAz ? "⚔️ DÖYÜŞ ÇAĞIRIŞI!" : "⚔️ BATTLE CHALLENGE!"}
          </div>
        </div>

        <div className="cba-incoming-msg">
          <strong>{activeChallenge.player1.displayName || activeChallenge.player1.username}</strong>{" "}
          {isAz
            ? "sizi Kiber Dəniz Döyüşünə (Battleship) meydan oxumağa dəvət edir!"
            : "has challenged you to a Cyber Sea Battle (Battleship)!"}
        </div>

        <div className="cba-incoming-actions">
          <button
            type="button"
            className="cba-inc-btn cba-inc-btn--accept"
            onClick={handleAccept}
          >
            <Check size={14} />
            <span>{isAz ? "QƏBUL ET" : "ACCEPT"}</span>
          </button>
          <button
            type="button"
            className="cba-inc-btn cba-inc-btn--decline"
            onClick={handleDecline}
          >
            <X size={14} />
            <span>{isAz ? "İMTİNA ET" : "DECLINE"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
