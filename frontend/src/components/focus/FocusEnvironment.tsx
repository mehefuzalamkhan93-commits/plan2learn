'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface FocusEnvironmentProps {
  onReady?: () => void;
}

/**
 * FocusEnvironment: Fullscreen immersive lofi study video background
 * Uses specific YouTube video with controlled autoplay, mute, loop, and no controls
 */
export default function FocusEnvironment({ onReady }: FocusEnvironmentProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [showFallback, setShowFallback] = useState(false);
  const [isStarted, setIsStarted] = useState(false);

  const VIDEO_ID = 'eArLcYCwQbs';
  const START_TIME = 145;
  const embedUrl = `https://www.youtube.com/embed/${VIDEO_ID}?autoplay=1&mute=1&start=${START_TIME}&controls=0&disablekb=1&playsinline=1&fs=0&loop=1&playlist=${VIDEO_ID}&rel=0&modestbranding=1&iv_load_policy=3`;

  useEffect(() => {
    if (onReady) {
      onReady();
    }
    setIsStarted(true);
  }, [onReady]);

  const handleStartEnvironment = () => {
    setShowFallback(false);
    setIsStarted(true);
    if (onReady) {
      onReady();
    }
  };

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden">
      <div className="absolute inset-0 w-full h-full">
        <iframe
          ref={iframeRef}
          src={embedUrl}
          title="Focus Environment"
          allow="autoplay; fullscreen"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            width: '100vw',
            height: '56.25vw',
            minWidth: '177.78vh',
            minHeight: '100vh',
          }}
        />

        <div className="absolute inset-0 w-full h-full pointer-events-auto" />
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2 }}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.15) 70%, rgba(0,0,0,0.35) 100%),
            linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, transparent 20%, transparent 80%, rgba(0,0,0,0.24) 100%)
          `,
        }}
      />

      <div
        className="absolute inset-0 w-full h-full bg-black/20 pointer-events-none"
        style={{ mixBlendMode: 'multiply' }}
      />

      {showFallback && !isStarted && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-40 flex items-center justify-center bg-zinc-950"
        >
          <motion.button
            onClick={handleStartEnvironment}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-8 py-4 rounded-xl bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/20 text-white text-lg font-medium transition-colors"
          >
            Start Study Environment
          </motion.button>
        </motion.div>
      )}
    </div>
  );
}
