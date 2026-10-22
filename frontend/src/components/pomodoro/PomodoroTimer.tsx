'use client';

import React from 'react';
import { usePomodoro } from '@/hooks/usePomodoro';
import { Topic } from '@/types';
import { Play, Pause, RotateCcw, SkipForward } from 'lucide-react';

interface PomodoroTimerProps {
  topic?: Topic;
}

export default function PomodoroTimer({ topic }: PomodoroTimerProps) {
  const { pomodoro, startPomodoro, pausePomodoro, resumePomodoro, resetPomodoro, switchSession } =
    usePomodoro();

  const minutes = Math.floor(pomodoro.secondsRemaining / 60);
  const seconds = pomodoro.secondsRemaining % 60;
  const progress =
    pomodoro.totalSeconds > 0
      ? ((pomodoro.totalSeconds - pomodoro.secondsRemaining) / pomodoro.totalSeconds) * 100
      : 0;

  const handleStart = () => {
    if (pomodoro.status === 'IDLE') {
      startPomodoro(topic);
    } else if (pomodoro.status === 'PAUSED') {
      resumePomodoro();
    }
  };

  const isStudySession = pomodoro.sessionType === 'STUDY';
  const isRunning = pomodoro.status === 'RUNNING';

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 space-y-4">
      {/* Header Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex rounded-lg bg-zinc-950 p-1 border border-zinc-800">
          <button
            type="button"
            onClick={() => {
              if (!isStudySession) switchSession();
            }}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              isStudySession
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Focus (25m)
          </button>
          <button
            type="button"
            onClick={() => {
              if (isStudySession) switchSession();
            }}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              !isStudySession
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Break (5m)
          </button>
        </div>

        <span
          className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded ${
            isRunning ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-zinc-500'
          }`}
        >
          {pomodoro.status}
        </span>
      </div>

      {/* Active Focus Subject */}
      <div className="text-center pt-1">
        <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">
          {isStudySession ? 'Active Focus Session' : 'Rest Period'}
        </span>
        <h4 className="text-sm font-medium text-zinc-200 truncate mt-0.5 max-w-[260px] mx-auto">
          {pomodoro.activeTopic?.name || 'General Focus Block'}
        </h4>
      </div>

      {/* Clean Digital Timer */}
      <div className="py-2 text-center">
        <div className="font-mono text-5xl font-semibold tracking-tight text-zinc-100 select-none">
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </div>

        {/* Minimal Progress Bar */}
        <div className="mt-4 w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
          <div
            className="bg-zinc-200 h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Solid Black/Zinc Action Buttons */}
      <div className="flex items-center justify-center gap-2 pt-1">
        <button
          onClick={isRunning ? pausePomodoro : handleStart}
          className="flex-1 py-2 px-4 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-medium flex items-center justify-center gap-2 transition-colors"
        >
          {isRunning ? (
            <>
              <Pause className="w-3.5 h-3.5 fill-current" />
              Pause
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              Start Focus
            </>
          )}
        </button>

        <button
          onClick={resetPomodoro}
          className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
          title="Reset timer"
          aria-label="Reset timer"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          onClick={switchSession}
          className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
          title="Skip session"
          aria-label="Skip session"
        >
          <SkipForward className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
