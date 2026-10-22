'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoaderCircle, Sparkles, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import StudyVideoPanel from '@/components/auth/StudyVideoPanel';
import { getSafeNextRoute } from '@/lib/authRouting';
import { authAPI } from '@/services/api';
import AppLogo from '@/components/ui/AppLogo';
import GoogleSignInButton from '@/components/auth/GoogleSignInButton';
import OTPVerificationForm from '@/components/auth/OTPVerificationForm';
import { useSplash } from '@/context/SplashContext';

export default function LoginPage() {
  const router = useRouter();
  const { triggerSplash } = useSplash();
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
      const next = new URLSearchParams(window.location.search).get('next');
      const targetRoute = getSafeNextRoute(next, response.data.user);
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

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#080B14] text-zinc-100 selection:bg-indigo-500/30 selection:text-white">
      {/* Left Column: Video & Brand Showcase (Desktop: 52% full-bleed height; Mobile: compact 180px-220px hero banner) */}
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

        {/* Bottom Motivational Quote Card (Desktop only, untouched for PC) */}
        <div className="relative z-20 hidden lg:block max-w-lg">
          <div className="rounded-2xl border border-white/10 bg-black/50 p-6 backdrop-blur-xl shadow-2xl">
            <div className="flex items-center gap-2 mb-2.5 text-indigo-300 text-xs font-semibold uppercase tracking-wider">
              <span className="inline-block h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
              Daily Discipline
            </div>
            <p className="text-sm sm:text-base font-medium text-zinc-100 leading-relaxed italic">
              &ldquo;Success is the sum of small efforts, repeated day in and day out.&rdquo;
            </p>
            <div className="mt-4 flex items-center justify-between text-xs text-zinc-400 border-t border-white/10 pt-3">
              <span className="text-zinc-300 font-medium">— Robert Collier</span>
              <span className="text-emerald-400 font-medium flex items-center gap-1">✦ Stay consistent</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Auth Form Container (Responsive padding & smooth scroll for mobile, untouched on PC) */}
      <div className="relative w-full lg:w-1/2 xl:w-[48%] flex-1 flex flex-col justify-center items-center px-5 sm:px-10 lg:p-16 lg:overflow-y-auto bg-[#080B14]">
        <div className="w-full max-w-[420px] mx-auto z-10 pt-4 pb-8 sm:py-6 lg:py-6">
          {otpChallenge ? (
            <OTPVerificationForm
              challengeId={otpChallenge.challengeId}
              maskedEmail={otpChallenge.maskedEmail}
              expiresInSeconds={otpChallenge.expiresInSeconds}
              resendCooldownSeconds={otpChallenge.resendCooldownSeconds}
              onBackToLogin={() => setOtpChallenge(null)}
            />
          ) : (
            <>
              <div className="mb-6 sm:mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  Welcome back
                </h1>
                <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  Pick up your study plan where you left off.
                </p>
              </div>

              {/* Google One-Click Authentication */}
              <div className="mb-5 sm:mb-6">
                <GoogleSignInButton mode="signin" />

                <div className="relative my-5 sm:my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-zinc-800" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-[#080B14] px-3 text-zinc-500 font-medium tracking-wider">
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

                {error && (
                  <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                    {error}
                  </div>
                )}

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
                  href="/signup"
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