'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, Mail, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react';
import { authAPI } from '@/services/api';
import { getSafeNextRoute } from '@/lib/authRouting';
import { useSplash } from '@/context/SplashContext';
import { AuthenticatedUser } from '@/types';

interface OTPVerificationFormProps {
  challengeId: string;
  maskedEmail: string;
  expiresInSeconds?: number;
  resendCooldownSeconds?: number;
  onBackToLogin: () => void;
  onSuccess?: (user: AuthenticatedUser) => void;
}

export default function OTPVerificationForm({
  challengeId: initialChallengeId,
  maskedEmail,
  expiresInSeconds = 300,
  resendCooldownSeconds = 60,
  onBackToLogin,
  onSuccess,
}: OTPVerificationFormProps) {
  const { triggerSplash } = useSplash();
  const [challengeId, setChallengeId] = useState(initialChallengeId);
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(resendCooldownSeconds);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Auto-focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleDigitChange = (index: number, value: string) => {
    setError(null);
    setInfoMessage(null);
    // Allow only numeric characters
    const clean = value.replace(/\D/g, '');
    if (!clean) {
      const nextDigits = [...digits];
      nextDigits[index] = '';
      setDigits(nextDigits);
      return;
    }

    // Single digit input
    const nextDigits = [...digits];
    nextDigits[index] = clean.slice(-1);
    setDigits(nextDigits);

    // Auto-focus next input
    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    setError(null);
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const nextDigits = [...digits];
    for (let i = 0; i < 6; i++) {
      nextDigits[i] = pasted[i] || '';
    }
    setDigits(nextDigits);

    const focusIndex = Math.min(pasted.length, 5);
    inputRefs.current[focusIndex]?.focus();

    // If full 6 digits were pasted, optionally auto-submit
    if (pasted.length === 6) {
      submitCode(pasted);
    }
  };

  const submitCode = useCallback(
    async (codeToSubmit: string) => {
      if (codeToSubmit.length !== 6) {
        setError('Please enter all 6 digits of your verification code.');
        return;
      }

      setIsSubmitting(true);
      setError(null);
      setInfoMessage(null);

      try {
        const response = await authAPI.verifyOTP(challengeId, codeToSubmit);
        const user = response.data.user;
        onSuccess?.(user);

        const next =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('next')
            : null;
        const targetRoute = getSafeNextRoute(next, user);
        triggerSplash({ destination: targetRoute });
      } catch (err: unknown) {
        const detail =
          typeof err === 'object' && err !== null && 'response' in err
            ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
            : undefined;
        setError(detail || 'Verification code is invalid or has expired. Please check and try again.');
        // Clear digits on error
        setDigits(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      } finally {
        setIsSubmitting(false);
      }
    },
    [challengeId, onSuccess, triggerSplash]
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const fullCode = digits.join('');
    submitCode(fullCode);
  };

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await authAPI.resendOTP(challengeId);
      if (res.challenge_id) {
        setChallengeId(res.challenge_id);
      }
      setCooldown(res.resend_cooldown_seconds || 60);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      setInfoMessage('A fresh verification code was sent to your email.');
    } catch (err: unknown) {
      const detail =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      setError(detail || 'Could not resend code. Please wait a moment and try again.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6 sm:mb-8 text-center sm:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-3">
          <Sparkles className="h-3.5 w-3.5" />
          Two-Factor Security
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          Check your email
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-zinc-400 leading-relaxed">
          We sent a 6-digit verification code to{' '}
          <span className="font-semibold text-zinc-200">{maskedEmail}</span>.
        </p>
      </div>

      {/* Error alert */}
      {error && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300">
          <ShieldAlert className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
          <div className="flex-1 leading-relaxed">{error}</div>
        </div>
      )}

      {/* Info/Success alert */}
      {infoMessage && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
          <div className="flex-1 leading-relaxed">{infoMessage}</div>
        </div>
      )}

      {/* 6-Digit Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-xs font-medium text-zinc-300 mb-3 text-center sm:text-left">
            Enter 6-digit code
          </label>
          <div className="flex justify-between gap-2 sm:gap-3" onPaste={handlePaste}>
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  inputRefs.current[idx] = el;
                }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                disabled={isSubmitting}
                className="h-12 w-11 sm:h-14 sm:w-14 rounded-xl border border-zinc-800 bg-[#0E121E] text-center text-xl sm:text-2xl font-bold font-mono text-white transition-all focus:border-indigo-500 focus:bg-[#121727] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-50"
                aria-label={`Digit ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || digits.join('').length !== 6}
          className="relative w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#080B14] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-white" />
              Verifying Code…
            </>
          ) : (
            'Verify & Enter Plan2Learn'
          )}
        </button>
      </form>

      {/* Resend and Actions */}
      <div className="mt-6 pt-6 border-t border-zinc-800/80 space-y-3 text-center">
        <div className="text-xs text-zinc-400">
          Didn&apos;t receive the code?{' '}
          {cooldown > 0 ? (
            <span className="text-zinc-500 font-medium">
              Resend available in{' '}
              <span className="font-mono font-semibold text-indigo-400">{cooldown}s</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={isResending}
              className="inline-flex items-center gap-1 font-semibold text-indigo-400 hover:text-indigo-300 transition-colors focus:outline-none disabled:opacity-50"
            >
              {isResending && <RefreshCw className="h-3 w-3 animate-spin" />}
              Resend verification code
            </button>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={onBackToLogin}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors focus:outline-none"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to login with another email
          </button>
        </div>
      </div>
    </div>
  );
}
