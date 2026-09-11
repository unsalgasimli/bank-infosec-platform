/**
 * Expressbank Retro Arcade - Enterprise Working Hours Access Policy
 * 
 * Rules (Baku Time, Asia/Baku UTC+4):
 * - Weekdays (Monday to Friday):
 *     Visible & Accessible ONLY during:
 *       13:00 - 14:00 (Lunch Break)
 *       18:00 - 09:00 (After hours / overnight / early morning)
 *     Restricted / Hidden during Working Hours:
 *       09:00 - 13:00 (Morning work block)
 *       14:00 - 18:00 (Afternoon work block)
 * - Weekends (Saturday & Sunday):
 *     Visible & Accessible 24/7
 * 
 * SPECIAL EXEMPTION (İSTİSNA):
 * - Information Security (Infosec) department & security team members (e.g. u.gasimli, SOC, CISO, etc.)
 *   are exempt from working hour restrictions and have 24/7 unrestricted access to games and testing.
 */

import { useEffect, useState } from "react";
import type { BankUser } from "../../shared/types/auth.js";

export interface ArcadeAccessInfo {
  isAccessible: boolean;
  isWeekend: boolean;
  isLunchBreak: boolean;
  isOffHours: boolean;
  isBypassActive?: boolean;
  isInfosecExempt?: boolean;
  bakuTimeStr: string;
  nextWindowNotice: {
    az: string;
    en: string;
  };
}

/**
 * Checks whether a given user is exempt from arcade work-hour restrictions.
 * Specifically grants 24/7 access to:
 * 1. Specific users: u.gasimli (or any gasimli account)
 * 2. Infosec & IT department members
 * 3. Security roles (CISO, INFOSEC_ADMIN, SOC_ANALYST, etc.)
 */
export function isUserExemptFromArcadePolicy(user?: Partial<BankUser> | null): boolean {
  if (!user && typeof window !== "undefined") {
    user = (window as any).__CURRENT_BANK_USER__ || null;
  }
  if (!user) return false;

  const username = (user.username || user.sAMAccountName || "").toLowerCase().trim();
  const email = (user.email || user.userPrincipalName || "").toLowerCase().trim();
  const fullName = (user.fullName || "").toLowerCase().trim();

  // 1. Direct username / name check (u.gasimli, ugasimli, etc.)
  if (
    username === "u.gasimli" ||
    username === "ugasimli" ||
    username.includes("gasimli") ||
    email.includes("gasimli") ||
    fullName.includes("qasımlı") ||
    fullName.includes("gasimli")
  ) {
    return true;
  }

  // 2. Department & Section check (Infosec, Security)
  const dept = (user.departmentId || "").toLowerCase();
  const secName = (user.sectionName || "").toLowerCase();
  if (
    dept === "infosec" ||
    dept.includes("infosec") ||
    dept.includes("security") ||
    dept.includes("it") ||
    secName.includes("infosec") ||
    secName.includes("təhlükəsizlik") ||
    secName.includes("security")
  ) {
    return true;
  }

  // 3. Security Roles check
  const roles = user.roles || [];
  const infosecRoles = [
    "INFOSEC_ADMIN",
    "INFOSEC_MANAGER",
    "CISO",
    "SECURITY_ANALYST",
    "SOC_ANALYST",
    "GRC_ANALYST",
    "APPSEC_ANALYST",
    "SECURITY_ARCHITECT",
    "DLP_ANALYST",
    "VULN_ANALYST",
    "PLATFORM_ADMIN",
    "IT_ADMIN",
  ];
  if (roles.some((r) => infosecRoles.includes(r))) {
    return true;
  }

  // 4. Job Title check
  const title = (user.title || "").toLowerCase();
  if (
    title.includes("infosec") ||
    title.includes("information security") ||
    title.includes("təhlükəsizlik") ||
    title.includes("soc") ||
    title.includes("ciso") ||
    title.includes("cyber")
  ) {
    return true;
  }

  return false;
}

export function isArcadeBypassActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if ((window as any).__EXPRESSBANK_ARCADE_FORCE_OPEN__ === true) return true;
    if (window.localStorage && window.localStorage.getItem("arcade_bypass") === "1") return true;
    if (window.location && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("arcade_bypass") === "1" || params.get("arcade_bypass") === "true") return true;
    }
  } catch {
    // Ignore storage/cross-origin access restrictions
  }
  return false;
}

// Global console helper for testing
if (typeof window !== "undefined") {
  (window as any).__toggleArcadeBypass = (enable?: boolean) => {
    try {
      const current = window.localStorage.getItem("arcade_bypass") === "1";
      const next = enable !== undefined ? enable : !current;
      window.localStorage.setItem("arcade_bypass", next ? "1" : "0");
      window.dispatchEvent(new CustomEvent("arcade-policy-change"));
      console.log(`%c[Expressbank Arcade] Policy Bypass: ${next ? "ACTIVATED" : "DEACTIVATED"}`, "color:#00f576; font-weight:bold;");
      return next;
    } catch (e) {
      return false;
    }
  };
}

/**
 * Evaluates whether Retro Arcade and its launcher fob are currently accessible in Baku time.
 */
export function checkArcadeAccess(user?: Partial<BankUser> | null, date: Date = new Date()): ArcadeAccessInfo {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Baku",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  let weekday = "";
  let hour = 0;
  let minute = 0;
  let second = 0;

  for (const part of parts) {
    if (part.type === "weekday") weekday = part.value;
    else if (part.type === "hour") hour = parseInt(part.value, 10);
    else if (part.type === "minute") minute = parseInt(part.value, 10);
    else if (part.type === "second") second = parseInt(part.value, 10);
  }

  // Handle midnight formatting edge-cases
  if (hour === 24) hour = 0;

  const bakuTimeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const isWeekend = weekday === "Sat" || weekday === "Sun";
  const timeDecimal = hour + minute / 60 + second / 3600;

  // 1. Check Infosec / User Exemption
  if (isUserExemptFromArcadePolicy(user)) {
    return {
      isAccessible: true,
      isWeekend,
      isLunchBreak: false,
      isOffHours: false,
      isBypassActive: true,
      isInfosecExempt: true,
      bakuTimeStr,
      nextWindowNotice: {
        az: "🛡️ İnformasiya Təhlükəsizliyi (Infosec) İstisnası: 7/24 Açıqdır",
        en: "🛡️ Information Security (Infosec) Exemption: Open 24/7",
      },
    };
  }

  // 2. Check developer/admin bypass
  if (isArcadeBypassActive()) {
    return {
      isAccessible: true,
      isWeekend,
      isLunchBreak: false,
      isOffHours: false,
      isBypassActive: true,
      bakuTimeStr,
      nextWindowNotice: {
        az: "⚡ Test Rejimi Aktivdir (Bypass)",
        en: "⚡ Test Mode Active (Bypass)",
      },
    };
  }

  // 3. Weekend: 24/7 unrestricted
  if (isWeekend) {
    return {
      isAccessible: true,
      isWeekend: true,
      isLunchBreak: false,
      isOffHours: false,
      bakuTimeStr,
      nextWindowNotice: {
        az: "Həftə sonu: 7/24 Açıqdır",
        en: "Weekend: Open 24/7",
      },
    };
  }

  // 4. Weekdays:
  // Accessible: 13:00 - 14:00 (Nahar fasiləsi) VƏ YA 18:00 - 09:00 (İşdən sonra / gecə)
  // Restricted: 09:00 - 13:00 və 14:00 - 18:00
  const isLunchBreak = timeDecimal >= 13.0 && timeDecimal < 14.0;
  const isOffHours = timeDecimal >= 18.0 || timeDecimal < 9.0;
  const isAccessible = isLunchBreak || isOffHours;

  let nextNotice = {
    az: "İcazəli vaxtdadır (Açıqdır)",
    en: "Currently open",
  };

  if (!isAccessible) {
    if (timeDecimal >= 9.0 && timeDecimal < 13.0) {
      nextNotice = {
        az: "İş saatıdır. Növbəti icazəli vaxt: 13:00 - 14:00 (Nahar fasiləsi)",
        en: "Working hours. Next access: 13:00 - 14:00 (Lunch break)",
      };
    } else {
      nextNotice = {
        az: "İş saatıdır. Növbəti icazəli vaxt: 18:00 (İş gününün sonu)",
        en: "Working hours. Next access: 18:00 (After hours)",
      };
    }
  }

  return {
    isAccessible,
    isWeekend: false,
    isLunchBreak,
    isOffHours,
    bakuTimeStr,
    nextWindowNotice: nextNotice,
  };
}

/**
 * React hook to observe arcade access policy for a user, updating periodically.
 */
export function useArcadeAccess(user?: Partial<BankUser> | null, pollIntervalMs = 15000): ArcadeAccessInfo {
  const [access, setAccess] = useState<ArcadeAccessInfo>(() => checkArcadeAccess(user));

  useEffect(() => {
    const update = () => {
      setAccess(checkArcadeAccess(user));
    };

    update();
    const timer = setInterval(update, pollIntervalMs);
    window.addEventListener("arcade-policy-change", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("arcade-policy-change", update);
    };
  }, [user, pollIntervalMs]);

  return access;
}
