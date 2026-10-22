'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { authAPI } from '@/services/api';
import { getSafeNextRoute } from '@/lib/authRouting';
import { useSplash } from '@/context/SplashContext';

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const FALLBACK_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  '192302751238-oapbc9avo7g4eaoq6ok373p1j3k07nlp.apps.googleusercontent.com';

interface GoogleSignInButtonProps {
  mode?: 'signin' | 'signup';
  className?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export default function GoogleSignInButton({
  mode = 'signin',
  className = '',
  onSuccess,
  onError,
}: GoogleSignInButtonProps) {
  const router = useRouter();
  const { triggerSplash } = useSplash();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGisReady, setIsGisReady] = useState(false);
  const buttonContainerRef = useRef<HTMLDivElement>(null);

  const handleCredentialResponse = useCallback(
    async (response: { credential: string }) => {
      if (!response.credential) {
        const msg = 'Google authentication did not return a valid credential.';
        setErrorMessage(msg);
        onError?.(msg);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const result = await authAPI.googleLogin(response.credential);
        const user = result.data.user;
        onSuccess?.();
        const next =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('next')
            : null;
        const targetRoute = getSafeNextRoute(next, user);
        triggerSplash({ destination: targetRoute });
      } catch (err: unknown) {
        const errorDetail =
          typeof err === 'object' && err !== null && 'response' in err
            ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
            : undefined;
        const msg = errorDetail || 'Unable to authenticate with Google. Please try again.';
        setErrorMessage(msg);
        onError?.(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [onSuccess, onError, triggerSplash]
  );

  useEffect(() => {
    let isCancelled = false;

    async function initGis() {
      // 1. Fetch configured client_id from backend or use fallback
      let clientId = FALLBACK_CLIENT_ID;
      try {
        const config = await authAPI.getGoogleAuthConfig();
        if (config.client_id) {
          clientId = config.client_id;
        }
      } catch {
        // Fallback to client-side env / constant
      }

      if (!clientId) return;

      // 2. Load GIS script if not present
      if (!window.google?.accounts?.id) {
        await new Promise<void>((resolve, reject) => {
          const existingScript = document.querySelector<HTMLScriptElement>(
            `script[src="${GIS_SCRIPT_URL}"]`
          );
          if (existingScript) {
            if (existingScript.dataset.loaded === 'true') {
              resolve();
              return;
            }
            existingScript.addEventListener('load', () => resolve());
            existingScript.addEventListener('error', () =>
              reject(new Error('Failed to load Google script'))
            );
            return;
          }
          const script = document.createElement('script');
          script.src = GIS_SCRIPT_URL;
          script.async = true;
          script.defer = true;
          script.onload = () => {
            script.dataset.loaded = 'true';
            resolve();
          };
          script.onerror = () => reject(new Error('Failed to load Google script'));
          document.head.appendChild(script);
        });
      }

      if (isCancelled) return;

      // 3. Initialize Google Identity Services
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        if (buttonContainerRef.current) {
          buttonContainerRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(buttonContainerRef.current, {
            type: 'standard',
            theme: 'filled_black',
            size: 'large',
            text: mode === 'signup' ? 'signup_with' : 'signin_with',
            shape: 'rectangular',
            logo_alignment: 'left',
            width: '100%',
          });
        }

        setIsGisReady(true);
      }
    }

    initGis().catch((err) => {
      console.warn('Google Identity Services init failed:', err);
    });

    return () => {
      isCancelled = true;
    };
  }, [mode, handleCredentialResponse]);

  return (
    <div className={`w-full flex flex-col items-center ${className}`}>
      {/* Official Google Identity Services Button Container */}
      <div className="w-full relative flex items-center justify-center min-h-[44px]">
        {/* Render container where GIS mounts the official secure Google button */}
        <div
          ref={buttonContainerRef}
          className={`w-full flex justify-center [&>div]:!w-full [&_iframe]:!w-full [&_iframe]:!rounded-xl transition-opacity duration-200 ${
            isGisReady && !isLoading ? 'opacity-100' : 'opacity-0 pointer-events-none absolute'
          }`}
        />

        {/* Custom Fallback / Loading State Button */}
        {(!isGisReady || isLoading) && (
          <button
            type="button"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 rounded-xl border border-zinc-700/80 bg-[#121624] px-4 py-3 text-sm font-semibold text-zinc-100 shadow-sm transition-all hover:bg-[#181E32] hover:border-zinc-600 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                <span>Authenticating with Google…</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.87c2.26-2.09 3.67-5.17 3.67-9.15z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3.05c-1.08.72-2.45 1.16-4.06 1.16-3.13 0-5.78-2.11-6.73-4.96H1.27v3.13C3.25 21.31 7.31 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.63H1.27C.46 8.24 0 10.06 0 12s.46 3.76 1.27 5.37l4-3.13z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.69 1.27 6.63l4 3.13c.95-2.85 3.6-4.96 6.73-4.96z"
                  />
                </svg>
                <span>
                  {mode === 'signup' ? 'Sign up with Google' : 'Sign in with Google'}
                </span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Error feedback if any */}
      {errorMessage && (
        <div className="mt-2 w-full rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
