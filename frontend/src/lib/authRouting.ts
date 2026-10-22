import { AuthenticatedUser } from '@/types';

export function getFirstAuthenticatedRoute(user: AuthenticatedUser): string {
  // If the user is new (has not filled basic info / completed onboarding), redirect to /onboarding
  if (!user.is_onboarded) {
    return '/onboarding';
  }
  // Old / existing users go straight to the dashboard (never directly to /ai on auth)
  return '/dashboard';
}

export function getSafeNextRoute(next: string | null, user: AuthenticatedUser): string {
  // 1. If the user is new, they must fill basic info first regardless of next param
  if (!user.is_onboarded) {
    return '/onboarding';
  }

  // 2. If the user is old, redirect them to dashboard (never directly to /ai on auth)
  if (!next || next === '/' || next === '/ai' || next === '/login' || next === '/signup') {
    return '/dashboard';
  }

  // Allow specific deep-links if valid
  if (next.startsWith('/') && !next.startsWith('//')) {
    return next;
  }

  return '/dashboard';
}