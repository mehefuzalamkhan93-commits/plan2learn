'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AxiosError } from 'axios';
import { authAPI, getStoredToken } from '@/services/api';
import { AuthenticatedUser } from '@/types';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextType {
  user: AuthenticatedUser | null;
  status: AuthStatus;
  error: string | null;
  refresh: () => Promise<AuthenticatedUser | null>;
  setUser: (user: AuthenticatedUser | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeUser(data: unknown): AuthenticatedUser | null {
  if (!data || typeof data !== 'object') return null;
  const anyData = data as Record<string, any>;
  const raw = anyData.user || anyData.data?.user || anyData.data || anyData;
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  return {
    id: String(raw.id),
    email: String(raw.email || ''),
    full_name: String(raw.full_name || ''),
    is_onboarded: Boolean(raw.is_onboarded),
    has_student_profile: Boolean(raw.has_student_profile),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AuthenticatedUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const checkInFlightRef = useRef<Promise<AuthenticatedUser | null> | null>(null);

  const setUser = useCallback((newUser: AuthenticatedUser | null) => {
    setUserState(newUser);
    setStatus(newUser ? 'authenticated' : 'unauthenticated');
    setError(null);
  }, []);

  const refresh = useCallback(async (): Promise<AuthenticatedUser | null> => {
    if (checkInFlightRef.current) {
      return checkInFlightRef.current;
    }

    const checkPromise = (async () => {
      setStatus((prev) => (prev === 'authenticated' ? prev : 'loading'));
      setError(null);
      try {
        const response = await authAPI.getCurrentUser();
        const userData = normalizeUser(response.data);
        setUserState(userData);
        setStatus(userData ? 'authenticated' : 'unauthenticated');
        return userData;
      } catch (requestError) {
        const axiosError = requestError as AxiosError<{ detail?: string }>;
        setUserState(null);
        setStatus('unauthenticated');
        if (axiosError.response && axiosError.response.status !== 401) {
          setError(axiosError.response.data?.detail || 'Unable to verify your session.');
        }
        return null;
      } finally {
        checkInFlightRef.current = null;
      }
    })();

    checkInFlightRef.current = checkPromise;
    return checkPromise;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
    } finally {
      try {
        sessionStorage.removeItem('p2l_session_splash_shown');
      } catch {}
      setUserState(null);
      setStatus('unauthenticated');
      setError(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider
      value={{
        user,
        status,
        error,
        refresh,
        setUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
