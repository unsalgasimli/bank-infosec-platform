import React, { createContext, useContext, useState, useEffect } from 'react';
import { BankUser } from '../../shared/types/auth.js';

interface AuthContextType {
  currentUser: BankUser | null;
  allUsers: BankUser[];
  switchUser: (userId: string) => void;
  isLoading: boolean;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [allUsers, setAllUsers] = useState<BankUser[]>([]);
  const [currentUser, setCurrentUser] = useState<BankUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/users')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.users.length > 0) {
          setAllUsers(data.users);
          const savedUserId = localStorage.getItem('aegis_user_id');
          const matched = data.users.find((u: BankUser) => u.id === savedUserId);
          setCurrentUser(matched || data.users[0]);
        }
      })
      .catch((err) => console.error('Failed to load bank users', err))
      .finally(() => setIsLoading(false));
  }, []);

  const switchUser = (userId: string) => {
    const target = allUsers.find((u) => u.id === userId);
    if (target) {
      setCurrentUser(target);
      localStorage.setItem('aegis_user_id', target.id);
    }
  };

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    if (currentUser) {
      headers.set('x-user-id', currentUser.id);
    }
    return fetch(url, { ...options, headers });
  };

  return (
    <AuthContext.Provider value={{ currentUser, allUsers, switchUser, isLoading, fetchWithAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
