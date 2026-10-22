'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoaderCircle, Sparkles, Mail, Lock, Eye, EyeOff, ArrowRight, UserPlus, AlertCircle } from 'lucide-react';
import StudyVideoPanel from '@/components/auth/StudyVideoPanel';
import { getSafeNextRoute } from '@/lib/authRouting';
import { authAPI } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import AppLogo from '@/components/ui/AppLogo';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';
import OTPVerificationForm from '@/components/auth/OTPVerificationForm';
import { useSplash } from '@/context/SplashContext';

export default function LoginPage() {
  const router = useRouter();
  const { triggerSplash } = useSplash();
  const { user, status, setUser, refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [otpChallenge, setOtpChallenge] = useState<{
    challengeId: string;
    maskedEmail: string;
    expiresInSeconds?: number;
    resendCooldownSeconds?: number;
  } | null>(null);

  // Auto pre-fill email if passed in query string (e.g. from /signup)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const queryEmail = params.get('email');
      if (queryEmail && !email) {
        setEmail(queryEmail);
      }
    }
  }, [email]);

  // Session restoration: if already authenticated, redirect straight to dashboard
  useEffect(() => {
    if (status === 'authenticated' && user) {
      const next = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('next') : null;
      const targetRoute = getSafeNextRoute(next, user);
      router.replace(targetRoute);
    }
  }, [status, user, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await authAPI.login({ email: email.trim(), password });
      if (response.requires_otp && response.challenge_id) {
        setOtpChallenge({
          challengeId: response.challenge_id,
          maskedEmail: response.masked_email || email.trim(),
          expiresInSeconds: response.expires_in_seconds,
          resendCooldownSeconds: response.resend_cooldown_seconds,
        });
        return;
      }
      const next = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('next') : null;
      const targetRoute = getSafeNextRoute(next, response.data.user);
      setUser(response.data.user);
      triggerSplash({ destination: targetRoute });
    } catch (requestError) {
      const message =
        typeof requestError === 'object' && requestError !== null && 'response' in requestError
          ? (requestError as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      setError(message || 'Unable to log in. Check your email and password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#080B14] text-zinc-300 gap-3">
        <LoaderCircle className="h-8 w-8 animate-spin text-indigo-500" />
        <span className="text-sm font-medium text-zinc-400">Checking your session…</span>
      </div>
    );
  }

  if (status === 'authenticated') {
    return null;
  }

  const isUnknownAccount = error && (error.toLowerCase().includes('no account found') || error.toLowerCase().includes('sign up to create'));

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#080B14] text-zinc-100 selection:bg-indigo-500/30 selection:text-white">
      {/* Left Column: Video & Brand Showcase */}
      <div className="relative w-full lg:w-1/2 xl:w-[52%] h-[180px] sm:h-[220px] lg:h-auto lg:min-h-screen bg-black overflow-hidden flex flex-col justify-between p-5 sm:p-8 lg:p-12 shrink-0">
        <StudyVideoPanel variant="login" className="h-full w-full object-cover" />
        
        {/* Subtle dark film + gradient blend */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#080B14] via-[#080B14]/40 to-black/30 lg:bg-gradient-to-r lg:from-black/40 lg:via-black/20 lg:to-[#080B14] pointer-events-none z-10" />

        {/* Top Brand Tag */}
        <div className="relative z-20 flex items-center gap-3">
          <AppLogo size="md" priority />
          <div>
            <span className="text-sm sm:text-base font-bold tracking-tight text-white">Plan2Learn</span>
            <span className="hidden sm:inline-block ml-2 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[11px] font-medium text-indigo-300 border border-indigo-500/30">
              AI-Powered
            </span>
          </div>
        </div>

        {/* Bottom Motivational Quote Card (Desktop only) */}
        <div className="relative z-20 hidden lg:block max-w-lg">
          <div className="rounded-2xl border border-white/10 bg-black/50 p-6 backdrop-blur-xl shadow-2xl">
            <div className="flex items-center gap-2 mb-2.5 text-indigo-300 text-xs font-semibold uppercase tracking-wider">
              <span className="inline-block h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
              Daily Discipline
            </div>
            <p className="text-sm sm:text-base font-medium text-zinc-100 leading-relaxed italic">
              &ldquo;Success is the sum of small efforts, repeated day in and day out.&rdquo;
            </p>
            <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
              <span>— Robert Collier</span>
              <span className="text-emerald-400 font-medium flex items-center gap-1">
                <span>✦</span> Stay consistent
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Auth Form */}
      <div className="relative w-full lg:w-1/2 xl:w-[48%] flex-1 flex flex-col justify-center px-5 py-8 sm:px-8 sm:py-12 md:px-12 lg:px-14 xl:px-20 z-20">
        <div className="mx-auto w-full max-w-md">
          {otpChallenge ? (
            <OTPVerificationForm
              challengeId={otpChallenge.challengeId}
              maskedEmail={otpChallenge.maskedEmail}
              expiresInSeconds={otpChallenge.expiresInSeconds}
              resendCooldownSeconds={otpChallenge.resendCooldownSeconds}
              onBackToLogin={() => {
                setOtpChallenge(null);
                setError(null);
              }}
              onSuccess={(verifiedUser) => {
                setUser(verifiedUser);
              }}
            />
          ) : (
            <>
              {/* Header */}
              <div className="mb-6 sm:mb-8 text-center sm:text-left">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  Welcome back
                </h1>
                <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-zinc-400">
                  Pick up your study plan where you left off.
                </p>
              </div>

              {/* Google Sign-in */}
              <div className="mb-5 sm:mb-6">
                <GoogleSignInButton
                  onSuccess={() => {
                    refresh();
                  }}
                  onError={(message) => setError(message)}
                />

                <div className="relative my-5 sm:my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-zinc-800" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-[#080B14] px-3 text-zinc-500 tracking-wider font-medium text-[11px]">
                      or continue with email
                    </span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5 sm:mb-2">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="name@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full rounded-xl border border-zinc-800 bg-[#0E121E] pl-10 pr-4 py-3 text-base sm:text-sm text-zinc-100 placeholder-zinc-500 transition-colors focus:border-indigo-500 focus:bg-[#121727] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                    <label className="block text-xs font-medium text-zinc-300">
                      Password
                    </label>
                    <Link
                      href={`/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`}
                      className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full rounded-xl border border-zinc-800 bg-[#0E121E] pl-10 pr-11 py-3 text-base sm:text-sm text-zinc-100 placeholder-zinc-500 transition-colors focus:border-indigo-500 focus:bg-[#121727] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors p-2 focus:outline-none"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Error handling: Distinct Unknown Account Guidance vs Generic Error */}
                {isUnknownAccount ? (
                  <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 text-sm text-indigo-200 flex flex-col gap-2.5">
                    <div className="flex items-center gap-2 font-semibold text-white">
                      <Sparkles className="h-4 w-4 text-indigo-400 shrink-0" />
                      <span>No account found with this email</span>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {error}
                    </p>
                    <Link
                      href={`/signup?email=${encodeURIComponent(email.trim())}`}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-semibold text-white transition-all w-fit shadow-lg shadow-indigo-600/30"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Create an account</span>
                    </Link>
                  </div>
                ) : error ? (
                  <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 flex items-start gap-2.5">
                    <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="flex-1">{error}</div>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-400 hover:to-purple-500 active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      <span>Signing in…</span>
                    </>
                  ) : (
                    <>
                      <span>Log in</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 sm:mt-8 text-center text-xs sm:text-sm text-zinc-400">
                Don&apos;t have an account?{' '}
                <Link
                  href={`/signup${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`}
                  className="font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Create an account
                </Link>
              </div>

              <div className="mt-6 pt-5 border-t border-zinc-800/60 text-center text-[11px] text-zinc-500 flex items-center justify-center gap-3">
                <Link href="/terms" className="hover:text-zinc-300 transition-colors underline underline-offset-2">
                  Terms of Service
                </Link>
                <span>•</span>
                <Link href="/privacy" className="hover:text-zinc-300 transition-colors underline underline-offset-2">
                  Privacy Policy
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}