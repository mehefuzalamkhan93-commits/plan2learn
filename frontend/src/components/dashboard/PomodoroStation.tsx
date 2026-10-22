'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Focus, Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { usePomodoro } from '@/hooks/usePomodoro';
import { itemEntranceVariants, buttonTapProps } from '@/lib/motion';

export default function PomodoroStation() {
  const router = useRouter();
  const {
    pomodoro,
    startPomodoro,
    pausePomodoro,
    resumePomodoro,
    resetPomodoro,
    switchSession,
  } = usePomodoro();

  useEffect(() => {
    router.prefetch('/focus');
  }, [router]);

  const isStudy = pomodoro.sessionType === 'STUDY';
  const isRunning = pomodoro.status === 'RUNNING';
  const minutes = Math.floor(pomodoro.secondsRemaining / 60);
  const seconds = pomodoro.secondsRemaining % 60;
  const progress =
    pomodoro.totalSeconds > 0
      ? (pomodoro.totalSeconds - pomodoro.secondsRemaining) / pomodoro.totalSeconds
      : 0;

  const timeDisplay = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const handleTogglePlay = () => {
    if (isRunning) {
      pausePomodoro();
    } else if (pomodoro.status === 'PAUSED') {
      resumePomodoro();
    } else {
      startPomodoro();
    }
  };

  const handleEnterFocus = () => {
    router.push('/focus');
  };

  const renderPrimaryAction = () => {
    if (!isStudy) {
      if (pomodoro.status === 'IDLE') {
        return (
          <motion.button
            {...buttonTapProps}
            onClick={handleTogglePlay}
            className="rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-medium text-amber-100 border border-amber-400/25 hover:bg-amber-500/20 transition-colors light:bg-amber-100 light:text-amber-900 light:border-amber-300 light:hover:bg-amber-200"
          >
            Start Break
          </motion.button>
        );
      }

      if (pomodoro.status === 'RUNNING') {
        return (
          <motion.button
            {...buttonTapProps}
            onClick={handleTogglePlay}
            className="rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-medium text-amber-100 border border-amber-400/25 hover:bg-amber-500/20 transition-colors light:bg-amber-100 light:text-amber-900 light:border-amber-300 light:hover:bg-amber-200"
          >
            Pause
          </motion.button>
        );
      }

      return (
        <motion.button
          {...buttonTapProps}
          onClick={handleTogglePlay}
          className="rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-medium text-amber-100 border border-amber-400/25 hover:bg-amber-500/20 transition-colors light:bg-amber-100 light:text-amber-900 light:border-amber-300 light:hover:bg-amber-200"
        >
          Resume
        </motion.button>
      );
    }

    return (
      <motion.button
        {...buttonTapProps}
        onClick={handleEnterFocus}
        className="flex items-center justify-center gap-2 rounded-xl border border-indigo-400/25 bg-indigo-500/12 px-4 py-3 text-sm font-semibold text-indigo-100 transition-colors hover:bg-indigo-500/18 light:bg-indigo-600 light:text-white light:border-indigo-600 light:hover:bg-indigo-500"
      >
        <Focus className="h-4 w-4" />
        <span>Enter Focus Mode</span>
        <ArrowRight className="h-4 w-4" />
      </motion.button>
    );
  };

  return (
    <motion.section
      variants={itemEntranceVariants}
      className="rounded-2xl bg-zinc-900/40 backdrop-blur-md border border-white/[0.08] hover:border-white/[0.12] p-4 sm:p-5 transition-colors duration-200 light:bg-white light:border-slate-200 light:hover:border-slate-300"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative flex rounded-lg bg-zinc-950/80 p-1 border border-white/[0.06] light:bg-slate-100 light:border-slate-200">
          <button
            type="button"
            onClick={() => {
              if (!isStudy) switchSession();
            }}
            className={`relative px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-medium transition-colors duration-150 z-10 ${
              isStudy ? 'text-indigo-200 light:text-indigo-700' : 'text-zinc-300 hover:text-zinc-100 light:text-slate-500 light:hover:text-slate-900'
            }`}
          >
            {isStudy && (
              <motion.div
                layoutId="dashboard-pomodoro-tab-pill"
                className="absolute inset-0 bg-indigo-500/10 border border-indigo-400/20 rounded-md shadow-sm -z-10"
              />
            )}
            Focus (25m)
          </button>
          <button
            type="button"
            onClick={() => {
              if (isStudy) switchSession();
            }}
            className={`relative px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-medium transition-colors duration-150 z-10 ${
              !isStudy ? 'text-amber-200 light:text-amber-800' : 'text-zinc-300 hover:text-zinc-100 light:text-slate-500 light:hover:text-slate-900'
            }`}
          >
            {!isStudy && (
              <motion.div
                layoutId="dashboard-pomodoro-tab-pill"
                className="absolute inset-0 bg-amber-500/10 border border-amber-400/20 rounded-md shadow-sm -z-10"
              />
            )}
            Break (5m)
          </button>
        </div>

        <span
          className={`text-[10px] font-mono uppercase tracking-[0.12em] px-2.5 py-1 rounded-full border ${
            isStudy
              ? isRunning
                ? 'bg-indigo-500/10 text-indigo-200 border-indigo-400/20 light:bg-indigo-50 light:text-indigo-700 light:border-indigo-200'
                : pomodoro.status === 'PAUSED'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 light:bg-amber-50 light:text-amber-800 light:border-amber-200'
                : 'bg-zinc-800/60 text-zinc-400 border-white/[0.06] light:bg-slate-100 light:text-slate-500 light:border-slate-200'
              : isRunning
              ? 'bg-amber-500/10 text-amber-200 border-amber-500/20 light:bg-amber-50 light:text-amber-800 light:border-amber-200'
              : pomodoro.status === 'PAUSED'
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 light:bg-amber-50 light:text-amber-800 light:border-amber-200'
              : 'bg-zinc-800/60 text-zinc-400 border-white/[0.06] light:bg-slate-100 light:text-slate-500 light:border-slate-200'
          }`}
        >
          {pomodoro.status}
        </span>
      </div>

      <div className="flex items-center gap-4 min-w-0">
        <div
          className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border shadow-inner shadow-black/20 ${
            isStudy
              ? 'border-indigo-400/20 bg-zinc-950/70 light:bg-slate-50 light:border-slate-200'
              : 'border-amber-400/20 bg-amber-500/5 light:bg-amber-50/60 light:border-amber-200'
          }`}
        >
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-[0.15em] text-zinc-500 light:text-slate-400">Time</div>
            <div className="mt-1 font-mono text-2xl font-semibold text-zinc-100 tabular-nums light:text-slate-900">
              {timeDisplay}
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500">
            {isStudy ? pomodoro.activeTopic?.subject || 'Active Focus' : 'Break Session'}
          </div>
          <div className="mt-1 text-sm font-medium text-zinc-100 line-clamp-2 light:text-slate-900">
            {isStudy
              ? pomodoro.activeTopic?.name || 'Focus Session'
              : 'Recharge / Rest'}
          </div>

          <div className="mt-3 h-1.5 rounded-full bg-zinc-800/80 overflow-hidden light:bg-slate-200">
            <motion.div
              className={`h-full rounded-full ${
                isStudy
                  ? 'bg-gradient-to-r from-indigo-400/80 via-violet-400/80 to-indigo-300/80'
                  : 'bg-gradient-to-r from-amber-400/80 via-orange-400/80 to-amber-300/80'
              }`}
              initial={{ width: '0%' }}
              animate={{ width: `${Math.min(progress * 100, 100)}%` }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {renderPrimaryAction()}

        {(pomodoro.status !== 'IDLE' || !isStudy) && (
          <motion.button
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.02 }}
            onClick={resetPomodoro}
            title="Reset timer"
            aria-label="Reset timer"
            className="rounded-lg border border-white/[0.08] bg-zinc-900/80 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 light:bg-white light:border-slate-200 light:text-slate-600 light:hover:bg-slate-50"
          >
            <span className="flex items-center justify-center gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </span>
          </motion.button>
        )}

        <motion.button
          whileTap={{ scale: 0.96 }}
          whileHover={{ scale: 1.02 }}
          onClick={switchSession}
          title="Skip session"
          aria-label="Skip session"
          className="rounded-lg border border-white/[0.08] bg-zinc-900/80 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 light:bg-white light:border-slate-200 light:text-slate-600 light:hover:bg-slate-50"
        >
          <span className="flex items-center justify-center gap-1.5">
            <SkipForward className="h-3.5 w-3.5" />
            Skip
          </span>
        </motion.button>
      </div>
    </motion.section>
  );
}
