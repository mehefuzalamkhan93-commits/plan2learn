'use client';

import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { authAPI } from '@/services/api';
import { AuthenticatedUser } from '@/types';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

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

export function useAuth() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setStatus('loading');
    setError(null);
    try {
      const response = await authAPI.getCurrentUser();
      const userData = normalizeUser(response.data);
      setUser(userData);
      setStatus(userData ? 'authenticated' : 'unauthenticated');
      return userData;
    } catch (requestError) {
      const axiosError = requestError as AxiosError<{ detail?: string }>;
      setUser(null);
      setStatus('unauthenticated');
      if (axiosError.response && axiosError.response.status !== 401) {
        setError(axiosError.response.data?.detail || 'Unable to verify your session.');
      }
      return null;
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } finally {
      try {
        sessionStorage.removeItem('p2l_session_splash_shown');
      } catch {}
      setUser(null);
      setStatus('unauthenticated');
    }
  };

  useEffect(() => {
    let active = true;
    authAPI
      .getCurrentUser()
      .then((response) => {
        if (active) {
          const userData = normalizeUser(response.data);
          setUser(userData);
          setStatus(userData ? 'authenticated' : 'unauthenticated');
        }
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        const axiosError = requestError as AxiosError<{ detail?: string }>;
        setUser(null);
        setStatus('unauthenticated');
        if (axiosError.response && axiosError.response.status !== 401) {
          setError(axiosError.response.data?.detail || 'Unable to verify your session.');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return { user, status, error, refresh, logout };
}