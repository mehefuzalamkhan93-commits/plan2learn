'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, VolumeX, ArrowRight, Play } from 'lucide-react';

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);
  const [hasStartedPlaying, setHasStartedPlaying] = useState<boolean>(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);
  const finishTriggeredRef = useRef<boolean>(false);

  // Complete and trigger smooth fade-out
  const handleComplete = useCallback(() => {
    if (finishTriggeredRef.current) return;
    finishTriggeredRef.current = true;

    setIsFadingOut(true);
    setTimeout(() => {
      onFinish();
    }, 400); // 400ms smooth fade-out duration
  }, [onFinish]);

  // Viewport detection (Mobile vs Desktop)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkViewport = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkViewport();
    window.addEventListener('resize', checkViewport);

    // Reduced motion preference
    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionMq.matches) {
      const timer = setTimeout(handleComplete, 1200);
      return () => {
        window.removeEventListener('resize', checkViewport);
        clearTimeout(timer);
      };
    }

    return () => {
      window.removeEventListener('resize', checkViewport);
    };
  }, [handleComplete]);

  const videoSrc = isMobile
    ? '/videos/splash-mobile.mp4'
    : '/videos/splash-desktop.mp4';

  // Handle video element playback & safety timers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.defaultMuted = true;
    video.muted = isMuted;

    const attemptPlay = () => {
      const promise = video.play();
      if (promise !== undefined) {
        promise
          .then(() => {
            setHasStartedPlaying(true);
            setAutoplayBlocked(false);
          })
          .catch((err) => {
            console.warn('Splash autoplay waiting or blocked by browser:', err);
            setAutoplayBlocked(true);
          });
      }
    };

    attemptPlay();
    video.addEventListener('canplay', attemptPlay, { once: true });
    video.addEventListener('loadeddata', attemptPlay, { once: true });

    // Safety timeout: The videos are 10.0 seconds long.
    // 10.8s max ensures completion even if ended event drops.
    const maxTimer = setTimeout(() => {
      handleComplete();
    }, 10800);

    return () => {
      clearTimeout(maxTimer);
      video.removeEventListener('canplay', attemptPlay);
      video.removeEventListener('loadeddata', attemptPlay);
    };
  }, [videoSrc, isMuted, handleComplete]);

  // Toggle sound
  const toggleMute = () => {
    if (videoRef.current) {
      const nextMuted = !isMuted;
      videoRef.current.muted = nextMuted;
      setIsMuted(nextMuted);
    }
  };

  const handleManualPlay = () => {
    if (videoRef.current) {
      videoRef.current.muted = false;
      setIsMuted(false);
      videoRef.current.play().then(() => {
        setHasStartedPlaying(true);
        setAutoplayBlocked(false);
      }).catch(() => {
        handleComplete();
      });
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
      {/* Background fill matching video pixel color exactly */}
      <div className="absolute inset-0 bg-[#F5EFE6]" />

      {/* Responsive Splash Video Playback */}
      <video
        ref={videoRef}
        key={videoSrc}
        src={videoSrc}
        autoPlay
        muted={isMuted}
        playsInline
        preload="auto"
        onPlay={() => {
          setHasStartedPlaying(true);
          setAutoplayBlocked(false);
        }}
        onPlaying={() => {
          setHasStartedPlaying(true);
          setAutoplayBlocked(false);
        }}
        onEnded={handleComplete}
        onError={() => {
          console.warn('Splash video failed to load, continuing gracefully.');
          handleComplete();
        }}
        className="relative z-10 w-full h-full object-contain max-w-full max-h-full"
      />

      {/* Autoplay blocked overlay (common on iPhone battery saver) */}
      {autoplayBlocked && !hasStartedPlaying && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
          <button
            type="button"
            onClick={handleManualPlay}
            className="cursor-pointer flex items-center gap-3 px-6 py-3.5 rounded-full bg-white text-zinc-900 font-bold text-sm shadow-2xl hover:scale-105 active:scale-95 transition-all"
          >
            <Play className="w-4 h-4 fill-current text-indigo-600" />
            <span>Tap to Play Intro</span>
          </button>
        </div>
      )}

      {/* Floating Controls Bar (Mute & Skip) */}
      <div className="absolute top-4 sm:top-6 right-4 sm:right-6 z-30 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleMute}
          className="cursor-pointer flex items-center justify-center h-9 w-9 rounded-full bg-black/15 hover:bg-black/25 text-zinc-800 backdrop-blur-md transition-all active:scale-95"
          title={isMuted ? 'Unmute video audio' : 'Mute audio'}
          aria-label={isMuted ? 'Unmute video' : 'Mute video'}
        >
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-indigo-600" />}
        </button>

        <button
          type="button"
          onClick={handleComplete}
          className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/15 hover:bg-black/25 text-zinc-900 text-xs font-semibold backdrop-blur-md transition-all active:scale-95"
          aria-label="Skip splash screen"
        >
          <span>Skip</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
