'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, RotateCcw, SkipForward } from 'lucide-react';
import { PomodoroState } from '@/types';
import { usePomodoro } from '@/hooks/usePomodoro';
import { buttonTapProps } from '@/lib/motion';

interface FocusHudProps {
  pomodoro: PomodoroState;
}

export default function FocusHud({ pomodoro }: FocusHudProps) {
  const {
    startPomodoro,
    pausePomodoro,
    resumePomodoro,
    resetPomodoro,
    switchSession,
  } = usePomodoro();

  const minutes = Math.floor(pomodoro.secondsRemaining / 60);
  const seconds = pomodoro.secondsRemaining % 60;
  const progress =
    pomodoro.totalSeconds > 0
      ? (pomodoro.totalSeconds - pomodoro.secondsRemaining) / pomodoro.totalSeconds
      : 0;

  const isRunning = pomodoro.status === 'RUNNING';
  const isStudy = pomodoro.sessionType === 'STUDY';

  const handleTogglePlay = () => {
    if (isRunning) {
      pausePomodoro();
    } else if (pomodoro.status === 'PAUSED') {
      resumePomodoro();
    } else {
      startPomodoro();
    }
  };

  const timeDisplay = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  const totalMinutes = Math.floor(pomodoro.totalSeconds / 60);
  const elapsedMinutes = Math.floor((pomodoro.totalSeconds - pomodoro.secondsRemaining) / 60);
  const elapsedSeconds = (pomodoro.totalSeconds - pomodoro.secondsRemaining) % 60;
  const progressDisplay = `${elapsedMinutes.toString().padStart(2, '0')}:${elapsedSeconds.toString().padStart(2, '0')} / ${totalMinutes}:00`;

  return (
    <motion.div
      className="w-[min(100vw-32px,500px)] max-w-[500px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <div
        className="relative overflow-hidden rounded-2xl border"
        style={{
          background: 'rgba(10, 10, 12, 0.78)',
          backdropFilter: 'blur(24px)',
          borderColor: 'rgba(255, 255, 255, 0.12)',
          boxShadow: `
            0 12px 28px rgba(0, 0, 0, 0.35),
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            inset 0 -1px 0 rgba(255, 255, 255, 0.02)
          `,
        }}
      >
        <div
          className="absolute left-0 right-0 top-0 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15) 50%, transparent)',
          }}
        />

        <div className="relative p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-300/80">
              {isStudy ? 'Focus Session' : 'Break Session'}
            </div>

            <div
              className="flex items-center gap-2 rounded-full border px-2.5 py-1 text-[9px] font-mono uppercase tracking-[0.14em]"
              style={{
                background: isRunning
                  ? 'rgba(99, 102, 241, 0.12)'
                  : pomodoro.status === 'PAUSED'
                  ? 'rgba(251, 191, 36, 0.12)'
                  : 'rgba(255, 255, 255, 0.04)',
                borderColor: isRunning
                  ? 'rgba(129, 140, 248, 0.2)'
                  : pomodoro.status === 'PAUSED'
                  ? 'rgba(251, 191, 36, 0.2)'
                  : 'rgba(255, 255, 255, 0.08)',
                color: isRunning
                  ? 'rgba(199, 210, 254, 0.9)'
                  : pomodoro.status === 'PAUSED'
                  ? 'rgba(253, 224, 71, 0.9)'
                  : 'rgba(244, 244, 245, 0.6)',
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: isRunning
                    ? 'rgba(129, 140, 248, 0.9)'
                    : pomodoro.status === 'PAUSED'
                    ? 'rgba(251, 191, 36, 0.9)'
                    : 'rgba(161, 161, 170, 0.5)',
                }}
              />
              <span>{pomodoro.status}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <motion.div
              key={timeDisplay}
              initial={{ scale: 1 }}
              animate={{ scale: isRunning ? [1, 1.01, 1] : 1 }}
              transition={{ duration: 1, repeat: isRunning ? Infinity : 0 }}
              className="shrink-0 font-light tabular-nums tracking-[-0.06em] text-zinc-50"
              style={{
                fontSize: 'clamp(2.25rem, 5vw, 3.5rem)',
                lineHeight: 1,
                color: isRunning ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.74)',
                textShadow: '0 2px 12px rgba(0, 0, 0, 0.28)',
              }}
            >
              {timeDisplay}
            </motion.div>

            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-400">
                {isStudy ? pomodoro.activeTopic?.subject || 'Study Session' : 'Break'}
              </div>
              <div className="mt-1 line-clamp-2 text-sm font-medium text-zinc-100 sm:text-[15px]">
                {isStudy ? pomodoro.activeTopic?.name || 'Focus Mode' : 'Recharge / Rest'}
              </div>
            </div>
          </div>

          <div className="mt-3">
            <div
              className="relative h-1.5 overflow-hidden rounded-full"
              style={{ background: 'rgba(255, 255, 255, 0.08)' }}
            >
              <motion.div
                className="absolute left-0 top-0 h-full rounded-full"
                style={{
                  background: isStudy
                    ? 'linear-gradient(90deg, rgba(99, 102, 241, 0.8), rgba(139, 92, 246, 0.8))'
                    : 'linear-gradient(90deg, rgba(34, 197, 94, 0.7), rgba(16, 185, 129, 0.7))',
                }}
                initial={{ width: '0%' }}
                animate={{ width: `${Math.min(progress * 100, 100)}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>
            <div className="mt-2 text-[10px] font-mono text-zinc-400/80 tabular-nums">
              {progressDisplay}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <motion.button
              {...buttonTapProps}
              onClick={handleTogglePlay}
              className="flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200 sm:text-sm"
              style={{
                background: isRunning
                  ? 'rgba(99, 102, 241, 0.12)'
                  : 'rgba(255, 255, 255, 0.9)',
                border: isRunning
                  ? '1px solid rgba(99, 102, 241, 0.25)'
                  : '1px solid rgba(255, 255, 255, 0.2)',
                color: isRunning ? 'rgba(199, 210, 254, 0.95)' : 'rgba(24, 24, 27, 0.95)',
                boxShadow: isRunning ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.15)',
              }}
            >
              {isRunning ? (
                <span className="flex items-center justify-center gap-1.5">
                  <Pause className="h-3.5 w-3.5 fill-current" />
                  Pause
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  <Play className="h-3.5 w-3.5 fill-current" />
                  {pomodoro.status === 'PAUSED' ? 'Resume' : 'Start'}
                </span>
              )}
            </motion.button>

            {pomodoro.status !== 'IDLE' && (
              <motion.button
                onClick={resetPomodoro}
                whileTap={{ scale: 0.96 }}
                whileHover={{ scale: 1.02 }}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/8 sm:text-sm"
              >
                <span className="flex items-center justify-center gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </span>
              </motion.button>
            )}

            <motion.button
              onClick={switchSession}
              whileTap={{ scale: 0.96 }}
              whileHover={{ scale: 1.02 }}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/8 sm:text-sm"
            >
              <span className="flex items-center justify-center gap-1.5">
                <SkipForward className="h-3.5 w-3.5" />
                Skip
              </span>
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
