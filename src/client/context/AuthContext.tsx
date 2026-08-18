import React, { createContext, useContext, useState, useEffect } from 'react';
import { BankUser, LDAPLoginPayload, AuthSessionResponse } from '../../shared/types/auth.js';

interface AuthContextType {
  currentUser: BankUser | null;
  allUsers: BankUser[];
  isAuthenticated: boolean;
  authToken: string | null;
  ldapSession: AuthSessionResponse['ldapInfo'] | null;
  isLoading: boolean;
  ldapLogin: (payload: LDAPLoginPayload) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  switchUser: (userId: string) => void;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [allUsers, setAllUsers] = useState<BankUser[]>([]);
  const [currentUser, setCurrentUser] = useState<BankUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(localStorage.getItem('aegis_auth_token'));
  const [ldapSession, setLdapSession] = useState<AuthSessionResponse['ldapInfo'] | null>(() => {
    try {
      const saved = localStorage.getItem('aegis_ldap_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedUserId = localStorage.getItem('aegis_user_id');
    fetch('/api/auth/users')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.users.length > 0) {
          setAllUsers(data.users);
          const matched =
            data.users.find((u: BankUser) => u.id === savedUserId) ||
            data.users[0] ||
            null;
          setCurrentUser(matched);
        } else {
          setAllUsers([]);
          setCurrentUser(null);
        }
      })
      .catch((err) => console.error('Failed to load bank users', err))
      .finally(() => setIsLoading(false));
  }, []);

  const ldapLogin = async (payload: LDAPLoginPayload): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await fetch('/api/auth/ldap-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data: AuthSessionResponse = await res.json();

      if (data.success && data.user) {
        setCurrentUser(data.user);
        setAuthToken(data.token);
        setLdapSession(data.ldapInfo || null);
        localStorage.setItem('aegis_user_id', data.user.id);
        localStorage.setItem('aegis_auth_token', data.token);
        if (data.ldapInfo) {
          localStorage.setItem('aegis_ldap_session', JSON.stringify(data.ldapInfo));
        }
        return { success: true };
      } else {
        return { success: false, message: data.message || 'Authentication failed' };
      }
    } catch (err: any) {
      return { success: false, message: err.message || 'Unable to connect to authentication server' };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error(err);
    } finally {
      setAuthToken(null);
      setLdapSession(null);
      localStorage.removeItem('aegis_auth_token');
      localStorage.removeItem('aegis_ldap_session');
    }
  };

  const switchUser = (userId: string) => {
    const target = allUsers.find((u) => u.id === userId);
    if (target) {
      setCurrentUser(target);
      localStorage.setItem('aegis_user_id', target.id);
      if (target.distinguishedName || target.ldapDomain) {
        const sessionInfo: AuthSessionResponse['ldapInfo'] = {
          server: target.ldapDomain ? `ldaps://${target.ldapDomain}:636` : 'Direct Active Directory Session',
          bindDn: target.distinguishedName || target.email,
          distributionGroup: target.distributionGroups?.[0] || 'Enterprise User',
          authenticatedAt: new Date().toISOString(),
          kerberosTicketIssued: true,
        };
        setLdapSession(sessionInfo);
        localStorage.setItem('aegis_ldap_session', JSON.stringify(sessionInfo));
      } else {
        setLdapSession(null);
        localStorage.removeItem('aegis_ldap_session');
      }
    }
  };

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }
    if (currentUser) {
      headers.set('x-user-id', currentUser.id);
    }
    return fetch(url, { ...options, headers });
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        allUsers,
        isAuthenticated: Boolean(currentUser),
        authToken,
        ldapSession,
        isLoading,
        ldapLogin,
        logout,
        switchUser,
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

