'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LoaderCircle, LogIn, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getFirstAuthenticatedRoute } from '@/lib/authRouting';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, status, error } = useAuth();

  useEffect(() => {
    if (status === 'unauthenticated') {
      const next = encodeURIComponent(pathname);
      if (typeof window !== 'undefined') {
        window.location.replace(`/login?next=${next}`);
      }
      return;
    }

    if (!user) return;
    const requiredRoute = getFirstAuthenticatedRoute(user);

    // Root path: redirect to the user's initial landing route
    if (pathname === '/') {
      if (typeof window !== 'undefined') {
        window.location.replace(requiredRoute);
      }
      return;
    }

    // Require student profile onboarding before accessing protected features
    if (!user.has_student_profile && pathname !== '/onboarding') {
      if (typeof window !== 'undefined') {
        window.location.replace('/onboarding');
      }
      return;
    }
  }, [pathname, router, status, user]);

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-300">
        <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
          <LoaderCircle className="h-6 w-6 animate-spin text-indigo-400" />
          <span className="text-sm font-medium">{error || 'Checking your session…'}</span>
        </div>
      </main>
    );
  }

  if (status === 'unauthenticated' || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-300 px-4">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm rounded-2xl border border-white/[0.08] bg-zinc-900/60 p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
            <LogIn className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Sign In Required</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Please sign in to access your study dashboard and AI notebook.
            </p>
          </div>
          <a
            href={`/login?next=${encodeURIComponent(pathname)}`}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500"
          >
            <span>Proceed to Sign In</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </main>
    );
  }

  if (!user.has_student_profile && pathname !== '/onboarding') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-300 px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <LoaderCircle className="h-6 w-6 animate-spin text-indigo-400" />
          <p className="text-sm font-medium text-zinc-200">Setting up your student workspace...</p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}