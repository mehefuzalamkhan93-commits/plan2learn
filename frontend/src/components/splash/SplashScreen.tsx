'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, VolumeX, ArrowRight } from 'lucide-react';

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);
  const [hasStartedPlaying, setHasStartedPlaying] = useState<boolean>(false);
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
    }, 400); // 400ms fade-out transition duration
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

    // Respect reduced motion preference if user requested it
    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionMq.matches) {
      // Allow immediate or short dismissal for users who prefer reduced motion
      const reducedMotionTimer = setTimeout(() => {
        handleComplete();
      }, 1500);
      return () => {
        mq.removeEventListener('change', handleMediaChange);
        clearTimeout(reducedMotionTimer);
      };
    }

    return () => {
      mq.removeEventListener('change', handleMediaChange);
    };
  }, [handleComplete]);

  // Determine current video source based on viewport
  const videoSrc = isMobile
    ? '/videos/splash-mobile.mp4'
    : '/videos/splash-desktop.mp4';

  // Handle video element playback & safety timeout
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Reset playback position
    video.currentTime = 0;

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setHasStartedPlaying(true);
        })
        .catch((err) => {
          console.warn('Splash autoplay was blocked or prevented:', err);
          // If browser strictly blocks playback, trigger completion after a short grace period
          // so the user is never stuck on a blank splash screen
          fallbackTimerRef.current = setTimeout(() => {
            handleComplete();
          }, 2000);
        });
    }

    // Safety timeout: Videos are ~10.0 seconds. 10.8s max ensures completion
    // even if background tab throttling or an ended event drop occurs.
    const maxDurationTimer = setTimeout(() => {
      handleComplete();
    }, 10800);

    return () => {
      clearTimeout(maxDurationTimer);
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
      }
    };
  }, [handleComplete]);

  // Handle switching video source smoothly on viewport resize without restarting timer
  const prevSrcRef = useRef(videoSrc);
  useEffect(() => {
    if (prevSrcRef.current !== videoSrc && videoRef.current) {
      const currentTime = videoRef.current.currentTime;
      prevSrcRef.current = videoSrc;
      videoRef.current.src = videoSrc;
      videoRef.current.currentTime = currentTime;
      videoRef.current.play().catch(() => {});
    }
  }, [videoSrc]);

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
      className={`fixed inset-0 z-[99999] flex items-center justify-center bg-[#F5EFE6] select-none overflow-hidden transition-opacity duration-400 ease-out ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Background fill matching video pixel color */}
      <div className="absolute inset-0 bg-[#F5EFE6]" />

      {/* Single responsive video playback */}
      <video
        ref={videoRef}
        src={videoSrc}
        autoPlay
        muted={isMuted}
        playsInline
        preload="auto"
        onEnded={handleComplete}
        onError={() => {
          console.warn('Splash video encountered a load error, continuing gracefully.');
          handleComplete();
        }}
        className="relative z-10 w-full h-full object-contain pointer-events-none max-w-full max-h-full"
      />

      {/* Floating Controls Bar (Mute & Skip) */}
      <div className="absolute top-4 sm:top-6 right-4 sm:right-6 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleMute}
          className="cursor-pointer flex items-center justify-center h-9 w-9 rounded-full bg-black/10 hover:bg-black/20 text-zinc-700 backdrop-blur-md transition-colors"
          title={isMuted ? 'Unmute video audio' : 'Mute audio'}
          aria-label={isMuted ? 'Unmute video' : 'Mute video'}
        >
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={handleComplete}
          className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/10 hover:bg-black/20 text-zinc-800 text-xs font-semibold backdrop-blur-md transition-colors"
          aria-label="Skip splash screen"
        >
          <span>Skip</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
