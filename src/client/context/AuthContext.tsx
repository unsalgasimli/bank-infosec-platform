import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BankUser, LDAPLoginPayload, AuthSessionResponse } from '../../shared/types/auth.js';

interface AuthContextType {
  currentUser: BankUser | null;
  allUsers: BankUser[];
  isAuthenticated: boolean;
  isLoading: boolean;
  ldapLogin: (payload: LDAPLoginPayload) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const clearLegacyClientAuth = () => {
  localStorage.removeItem('aegis_user_id');
  localStorage.removeItem('aegis_auth_token');
  localStorage.removeItem('aegis_ldap_session');
};

const readJsonResponse = async <T,>(response: Response): Promise<T | null> => {
  const raw = await response.text();
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [allUsers, setAllUsers] = useState<BankUser[]>([]);
  const [currentUser, setCurrentUser] = useState<BankUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUsers = useCallback(async (): Promise<void> => {
    const res = await fetch('/api/auth/users', { credentials: 'include' });
    if (!res.ok) {
      if (res.status === 401) {
        setCurrentUser(null);
        setAllUsers([]);
      }
      return;
    }

    const data = await readJsonResponse<{ success?: boolean; users?: BankUser[] }>(res);
    setAllUsers(data?.success && Array.isArray(data.users) ? data.users : []);
  }, []);

  useEffect(() => {
    clearLegacyClientAuth();

    const restoreServerSession = async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) return;

        const data = await readJsonResponse<{ success?: boolean; user?: BankUser }>(res);
        if (data?.success && data.user) {
          setCurrentUser(data.user);
          await refreshUsers();
        }
      } catch (err) {
        console.error('Failed to restore the authenticated session', err);
      } finally {
        setIsLoading(false);
      }
    };

    void restoreServerSession();
  }, [refreshUsers]);

  const ldapLogin = async (payload: LDAPLoginPayload): Promise<{ success: boolean; message?: string }> => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch('/api/auth/ldap-login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          usernameOrEmail: payload.usernameOrEmail,
          password: payload.password,
        }),
      });
      const data = await readJsonResponse<AuthSessionResponse>(res);

      if (!res.ok || !data?.success || !data.user) {
        return {
          success: false,
          message: data?.message || `Authentication service returned an invalid response (${res.status}).`,
        };
      }

      setCurrentUser(data.user);
      await refreshUsers();
      return { success: true };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { success: false, message: 'Giriş sorğusu 12 saniyə ərzində cavab vermədi. API bağlantısını yoxlayın.' };
      }
      return { success: false, message: err.message || 'Unable to connect to authentication server' };
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
      setCurrentUser(null);
      setAllUsers([]);
      clearLegacyClientAuth();
    }
  };

  const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}) => {
    const response = await fetch(url, { ...options, credentials: 'include' });
    if (response.status === 401) {
      setCurrentUser(null);
      setAllUsers([]);
    }
    return response;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        allUsers,
        isAuthenticated: Boolean(currentUser),
        isLoading,
        ldapLogin,
        logout,
        refreshUsers,
        fetchWithAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
