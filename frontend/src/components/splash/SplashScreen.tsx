'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import { Volume2, VolumeX, ArrowRight, Sparkles } from 'lucide-react';

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(false);
  const finishTriggeredRef = useRef<boolean>(false);
  const fallbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Complete and trigger smooth fade-out
  const handleComplete = useCallback(() => {
    if (finishTriggeredRef.current) return;
    finishTriggeredRef.current = true;

    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    setIsFadingOut(true);
    setTimeout(() => {
      onFinish();
    }, 450); // 450ms smooth fade-out duration
  }, [onFinish]);

  // Viewport detection (Mobile vs Desktop)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);

    const handleMediaChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
    };

    mq.addEventListener('change', handleMediaChange);

    // Reduced motion preference
    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionMq.matches) {
      const timer = setTimeout(() => {
        handleComplete();
      }, 1200);
      return () => {
        mq.removeEventListener('change', handleMediaChange);
        clearTimeout(timer);
      };
    }

    return () => {
      mq.removeEventListener('change', handleMediaChange);
    };
  }, [handleComplete]);

  const videoSrc = isMobile
    ? '/videos/splash-mobile.mp4'
    : '/videos/splash-desktop.mp4';

  // Handle video element playback & safety timers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Explicitly enforce muted on the DOM node for strict mobile autoplay policies
    video.muted = true;
    video.currentTime = 0;

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsVideoPlaying(true);
        })
        .catch(() => {
          // Autoplay blocked by browser policy (common on mobile data saver / low power)
          // Keep the branded splash screen visible and transition smoothly after 2.3s
          fallbackTimerRef.current = setTimeout(() => {
            handleComplete();
          }, 2300);
        });
    }

    // Maximum splash duration safety timer (e.g. 7s or if video ends)
    const maxTimer = setTimeout(() => {
      handleComplete();
    }, 7000);

    return () => {
      clearTimeout(maxTimer);
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
      }
    };
  }, [handleComplete]);

  // Toggle sound
  const toggleMute = () => {
    if (videoRef.current) {
      const nextMuted = !isMuted;
      videoRef.current.muted = nextMuted;
      setIsMuted(nextMuted);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Plan2Learn"
      className={`fixed inset-0 z-[99999] flex items-center justify-center bg-zinc-950 select-none overflow-hidden transition-all duration-500 ease-out ${
        isFadingOut ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Ambient background glow */}
      <div className="absolute inset-0 bg-radial-gradient from-indigo-900/25 via-zinc-950 to-zinc-950 pointer-events-none" />

      {/* Decorative ambient blurred orbs */}
      <div className="absolute top-1/4 left-1/4 h-72 w-72 rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 h-72 w-72 rounded-full bg-purple-500/10 blur-[120px] pointer-events-none" />

      {/* Core Branded Splash Layer (Always visible immediately) */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 max-w-sm sm:max-w-md">
        {/* Glowing Logo Card */}
        <div className="relative mb-6">
          <div className="absolute -inset-2 rounded-3xl bg-gradient-to-r from-indigo-500/30 to-purple-500/30 blur-xl opacity-75 animate-pulse" />
          <div className="relative flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-3xl border border-white/15 bg-zinc-900/90 shadow-2xl p-2.5 backdrop-blur-xl">
            <Image
              src="/images/app-logo.jpg"
              alt="Plan2Learn Logo"
              width={96}
              height={96}
              priority
              className="h-full w-full object-contain rounded-2xl"
            />
          </div>
        </div>

        {/* Title & Tagline */}
        <div className="space-y-2 mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-indigo-400/20 bg-indigo-500/10 text-indigo-300 text-[11px] font-semibold tracking-wide uppercase">
            <Sparkles className="h-3 w-3 text-indigo-400" />
            <span>AI Learning Platform</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Plan<span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">2Learn</span>
          </h1>

          <p className="text-xs sm:text-sm text-zinc-400 font-medium">
            Smart, adaptive learning planner tailored to your goals
          </p>
        </div>

        {/* Dynamic Progress Bar */}
        <div className="w-48 sm:w-56 space-y-2">
          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400 rounded-full animate-[progress_2s_ease-in-out_infinite]" />
          </div>
          <span className="text-[11px] font-medium text-zinc-400 animate-pulse block">
            Initializing workspace…
          </span>
        </div>
      </div>

      {/* Video Layer (If loaded and playing, smoothly overlays background) */}
      <video
        ref={videoRef}
        src={videoSrc}
        autoPlay
        muted={isMuted}
        playsInline
        preload="auto"
        onEnded={handleComplete}
        onError={() => {
          // If video fails to load, gracefully continue with the brand splash
          if (!fallbackTimerRef.current) {
            fallbackTimerRef.current = setTimeout(handleComplete, 2200);
          }
        }}
        className={`absolute inset-0 z-20 w-full h-full object-contain pointer-events-none transition-opacity duration-700 ${
          isVideoPlaying ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Floating Controls Bar (Mute & Skip) */}
      <div className="absolute top-4 sm:top-6 right-4 sm:right-6 z-30 flex items-center gap-2">
        {isVideoPlaying && (
          <button
            type="button"
            onClick={toggleMute}
            className="cursor-pointer flex items-center justify-center h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 text-zinc-200 border border-white/10 backdrop-blur-md transition-all active:scale-95"
            title={isMuted ? 'Unmute video audio' : 'Mute audio'}
            aria-label={isMuted ? 'Unmute video' : 'Mute video'}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}

        <button
          type="button"
          onClick={handleComplete}
          className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/10 text-xs font-semibold backdrop-blur-md transition-all hover:scale-105 active:scale-95 shadow-lg"
          aria-label="Skip splash screen"
        >
          <span>Skip</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
