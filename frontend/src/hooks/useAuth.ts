'use client';

import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { authAPI } from '@/services/api';
import { AuthenticatedUser } from '@/types';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export function useAuth() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setStatus('loading');
    setError(null);
    try {
      const response = await authAPI.getCurrentUser();
      setUser(response.data);
      setStatus('authenticated');
      return response.data;
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
          setUser(response.data);
          setStatus('authenticated');
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