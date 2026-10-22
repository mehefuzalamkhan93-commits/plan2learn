'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface PomodoroRingProps {
  progress: number; // 0 to 1
  minutes: number;
  seconds: number;
  sessionType: 'STUDY' | 'BREAK';
  isRunning: boolean;
}

export default function PomodoroRing({
  progress,
  minutes,
  seconds,
  sessionType,
  isRunning,
}: PomodoroRingProps) {
  const shouldReduceMotion = useReducedMotion();
  // Expanded radius for prominent focal anchor
  const radius = 100;
  const strokeWidth = 4;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - progress * circumference;

  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const ringColor = isRunning ? 'text-indigo-300/90' : 'text-zinc-100';

  return (
    <div className="relative flex items-center justify-center my-4 sm:my-5 select-none">
      {/* Subtle Breathing Container */}
      <motion.div
        animate={
          isRunning && !shouldReduceMotion
            ? { scale: [1, 1.012, 1], opacity: [0.97, 1, 0.97] }
            : { scale: 1, opacity: 1 }
        }
        transition={{
          duration: 4.5,
          repeat: isRunning && !shouldReduceMotion ? Infinity : 0,
          ease: 'easeInOut',
        }}
        className="relative flex items-center justify-center"
      >
        <svg
          className="w-60 h-60 sm:w-64 sm:h-64 xl:w-[18rem] xl:h-[18rem] 2xl:w-[20rem] 2xl:h-[20rem] -rotate-90 transform overflow-visible"
          viewBox="0 0 240 240"
          aria-hidden="true"
        >
          {/* Ambient Background Track */}
          <circle
            cx="120"
            cy="120"
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            className="text-zinc-800/70"
          />

          {/* Smooth Continuous Active Ring */}
          <motion.circle
            cx="120"
            cy="120"
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            animate={{ strokeDashoffset }}
            transition={{
              duration: isRunning ? 0.9 : 0.35,
              ease: 'linear',
            }}
            strokeLinecap="round"
            className={sessionType === 'STUDY' ? ringColor : 'text-emerald-400'}
          />
        </svg>

        {/* Center Digital Display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs xl:text-[13px] uppercase font-mono tracking-widest text-zinc-400 mb-1">
            {sessionType === 'STUDY' ? 'Focus Session' : 'Rest Period'}
          </span>
          <div className="font-mono text-5xl sm:text-6xl xl:text-[4.25rem] 2xl:text-[5rem] font-semibold tracking-tight text-zinc-100 tabular-nums">
            {formattedTime}
          </div>
          <span className="text-sm xl:text-[15px] text-zinc-400 font-mono mt-2">
            {Math.round(progress * 100)}% elapsed
          </span>
        </div>
      </motion.div>
    </div>
  );
}
