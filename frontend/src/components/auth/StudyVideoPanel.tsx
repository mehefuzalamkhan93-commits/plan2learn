'use client';

import React from 'react';

const videoSources = {
  login: '/videos/auth-login-study.mp4',
  signup: '/videos/auth-signup-study.mp4',
};

const reducedMotion = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

interface StudyVideoPanelProps {
  variant: 'login' | 'signup';
  className?: string;
}

export default function StudyVideoPanel({
  variant,
  className,
}: StudyVideoPanelProps) {
  const src = videoSources[variant];

  if (reducedMotion) {
    return <div className={className} />;
  }

  return (
    <div
      className={`absolute inset-0 w-full h-full overflow-hidden pointer-events-none ${className}`}>
      <video
        autoPlay
        muted
        loop
        playsInline
        controls={false}
        preload="metadata"
        className="absolute inset-0 w-full h-full object-cover object-center"
        src={src}
      />
      <div
        className="absolute inset-0 bg-black/30 pointer-events-none"
      />
    </div>
  );
}