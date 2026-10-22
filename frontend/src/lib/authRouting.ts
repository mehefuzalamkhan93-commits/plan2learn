import { AuthenticatedUser } from '@/types';

export function getFirstAuthenticatedRoute(user: AuthenticatedUser): string {
  if (!user.has_student_profile) return '/onboarding';
  if (!user.is_onboarded) return '/ai';
  return '/dashboard';
}

export function getSafeNextRoute(next: string | null, user: AuthenticatedUser): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) {
    return getFirstAuthenticatedRoute(user);
  }
  return next;
}