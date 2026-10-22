'use client';

import { useAuthContext, AuthStatus } from '@/context/AuthContext';
export type { AuthStatus };

export function useAuth() {
  return useAuthContext();
}