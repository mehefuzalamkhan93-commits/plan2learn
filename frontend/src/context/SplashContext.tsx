'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import SplashScreen from '@/components/splash/SplashScreen';

interface TriggerOptions {
  destination?: string;
  onComplete?: () => void;
}

interface SplashContextType {
  isSplashActive: boolean;
  triggerSplash: (options?: TriggerOptions) => void;
  closeSplash: () => void;
}

const SplashContext = createContext<SplashContextType>({
  isSplashActive: false,
  triggerSplash: () => {},
  closeSplash: () => {},
});

const SPLASH_SESSION_KEY = 'p2l_session_splash_shown';

export function SplashProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isSplashActive, setIsSplashActive] = useState<boolean>(false);
  const [destination, setDestination] = useState<string | null>(null);
  const [onCompleteCallback, setOnCompleteCallback] = useState<(() => void) | null>(null);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // Check session on initial client-side load (fresh session / reopened tab)
  useEffect(() => {
    setIsMounted(true);
    try {
      const lastShown = sessionStorage.getItem(SPLASH_SESSION_KEY);
      const isForced = typeof window !== 'undefined' && window.location.search.includes('splash=');
      const now = Date.now();
      const COOLDOWN_MS = 5 * 60 * 1000; // 5-minute session cooldown

      if (isForced || !lastShown || now - Number(lastShown) > COOLDOWN_MS) {
        sessionStorage.setItem(SPLASH_SESSION_KEY, String(now));
        setIsSplashActive(true);
      }
    } catch {
      // If sessionStorage is unavailable (e.g. private browsing restrictions), do not crash
    }
  }, []);

  const triggerSplash = useCallback((options?: TriggerOptions) => {
    try {
      sessionStorage.setItem(SPLASH_SESSION_KEY, String(Date.now()));
    } catch {
      // Ignore sessionStorage errors
    }
    setDestination(options?.destination || null);
    setOnCompleteCallback(() => options?.onComplete || null);
    setIsSplashActive(true);
  }, []);

  const closeSplash = useCallback(() => {
    setIsSplashActive(false);
  }, []);

  const handleSplashFinished = useCallback(() => {
    setIsSplashActive(false);

    if (onCompleteCallback) {
      onCompleteCallback();
      setOnCompleteCallback(null);
    }

    if (destination) {
      router.replace(destination);
      setDestination(null);
    }
  }, [destination, onCompleteCallback, router]);

  return (
    <SplashContext.Provider value={{ isSplashActive, triggerSplash, closeSplash }}>
      {children}
      {isMounted && isSplashActive && (
        <SplashScreen onFinish={handleSplashFinished} />
      )}
    </SplashContext.Provider>
  );
}

export function useSplash() {
  return useContext(SplashContext);
}
