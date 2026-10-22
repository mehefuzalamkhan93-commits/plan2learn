'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Flame, Check, Sparkles } from 'lucide-react';
import { StreakOut } from '@/types';
import { itemEntranceVariants, cardHoverProps } from '@/lib/motion';

interface StreakWidgetProps {
  streak: StreakOut | null;
}

export default function StreakWidget({ streak }: StreakWidgetProps) {
  const currentStreak = streak?.current_streak ?? 0;
  const longestStreak = streak?.longest_streak ?? 0;
  const nextMilestone = Math.max(14, longestStreak + 1);
  const progressPercent = Math.min(
    100,
    Math.round((currentStreak / nextMilestone) * 100)
  );

  // 7-day weekly study log - can be enhanced with real data later
  const weeklyDays = [
    { day: 'M', hours: 0, completed: false },
    { day: 'T', hours: 0, completed: false },
    { day: 'W', hours: 0, completed: false },
    { day: 'T', hours: 0, completed: false },
    { day: 'F', hours: 0, completed: false, isToday: true },
    { day: 'S', hours: 0, completed: false },
    { day: 'S', hours: 0, completed: false },
  ];

  // If streak has last_study_date, we could populate recent days
  // For now, show empty state if no streak
  if (currentStreak === 0) {
    return (
      <motion.section
        variants={itemEntranceVariants}
        {...cardHoverProps}
        className="rounded-2xl bg-white dark:bg-zinc-900/40 backdrop-blur-md border border-slate-200/80 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.12] p-5 sm:p-6 xl:p-7 space-y-4 xl:space-y-5 transition-colors duration-200 shadow-sm dark:shadow-none"
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs sm:text-sm xl:text-[15px] font-medium text-slate-500 dark:text-zinc-400">
              Study Consistency
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <h3 className="text-xl sm:text-2xl xl:text-3xl font-semibold text-slate-900 dark:text-zinc-100">
                0 Day Streak
              </h3>
            </div>
          </div>
          <div className="w-8 h-8 xl:w-9 xl:h-9 rounded-xl bg-slate-100 dark:bg-zinc-800/40 border border-slate-200 dark:border-white/[0.06] flex items-center justify-center text-slate-500 dark:text-zinc-300">
            <Flame className="w-4 h-4 text-slate-400 dark:text-zinc-300" />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-slate-500 dark:text-zinc-400 text-sm text-center py-4">
            Complete your first study session to start your streak!
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 xl:gap-3 pt-1 text-xs">
          <div className="bg-slate-50 dark:bg-zinc-950/60 p-3 xl:p-4 rounded-xl border border-slate-200/80 dark:border-white/[0.06]">
            <div className="text-slate-500 dark:text-zinc-400 text-[10px] xl:text-xs uppercase font-mono font-medium tracking-wider">
              All-Time Best
            </div>
            <div className="text-slate-900 dark:text-zinc-200 text-base xl:text-lg font-semibold font-mono mt-0.5">
              {longestStreak} Days
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-zinc-950/60 p-3 xl:p-4 rounded-xl border border-slate-200/80 dark:border-white/[0.06]">
            <div className="text-slate-500 dark:text-zinc-400 text-[10px] xl:text-xs uppercase font-mono font-medium tracking-wider">
              7-Day Volume
            </div>
            <div className="text-slate-900 dark:text-zinc-200 text-base xl:text-lg font-semibold font-mono mt-0.5">
              0 Hours
            </div>
          </div>
        </div>
      </motion.section>
    );
  }

  return (
    <motion.section
      variants={itemEntranceVariants}
      {...cardHoverProps}
      className="rounded-2xl bg-white dark:bg-zinc-900/40 backdrop-blur-md border border-slate-200/80 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.12] p-5 sm:p-6 xl:p-7 space-y-4 xl:space-y-5 transition-colors duration-200 shadow-sm dark:shadow-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs sm:text-sm xl:text-[15px] font-medium text-slate-500 dark:text-zinc-400">
            Study Consistency
          </span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <h3 className="text-xl sm:text-2xl xl:text-3xl font-semibold text-slate-900 dark:text-zinc-100">
              {currentStreak} Day Streak
            </h3>
          </div>
        </div>
        <div className="w-8 h-8 xl:w-9 xl:h-9 rounded-xl bg-slate-100 dark:bg-zinc-800/40 border border-slate-200 dark:border-white/[0.06] flex items-center justify-center text-slate-500 dark:text-zinc-300">
          <Flame className="w-4 h-4 text-slate-400 dark:text-zinc-300" />
        </div>
      </div>

      {/* 7-Day Activity Bars */}
      <div className="space-y-2">
        <div className="grid grid-cols-7 gap-1.5 xl:gap-2 pt-1">
          {weeklyDays.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className="w-full bg-slate-100 dark:bg-zinc-800/60 h-16 xl:h-20 rounded-md flex items-end p-0.5 overflow-hidden border border-slate-200/50 dark:border-transparent">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{
                    height: d.hours > 0 ? `${Math.min(100, (d.hours / 4) * 100)}%` : '0%',
                  }}
                  transition={{ duration: 0.6, delay: i * 0.05, ease: 'easeOut' }}
                  className={`w-full rounded-sm transition-colors ${
                    d.isToday
                      ? 'bg-indigo-600 dark:bg-zinc-100'
                      : d.completed
                      ? 'bg-indigo-400 dark:bg-zinc-400'
                      : 'bg-transparent'
                  }`}
                />
              </div>
              <span
                className={`text-[11px] xl:text-xs font-mono ${
                  d.isToday ? 'text-indigo-600 dark:text-zinc-100 font-bold' : 'text-slate-400 dark:text-zinc-500'
                }`}
              >
                {d.day}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Progress towards Next Milestone */}
      <div className="pt-2 border-t border-slate-200/80 dark:border-white/[0.06] space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
          <span>Next Milestone ({nextMilestone} Days)</span>
          <span className="text-slate-800 dark:text-zinc-200 font-mono font-medium">
            {currentStreak}/{nextMilestone}d
          </span>
        </div>
        <div className="w-full bg-slate-200/80 dark:bg-zinc-800/80 rounded-full h-1 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="bg-indigo-600 dark:bg-zinc-200 h-full rounded-full"
          />
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 gap-2.5 xl:gap-3 pt-1 text-xs">
        <div className="bg-slate-50 dark:bg-zinc-950/60 p-3 xl:p-4 rounded-xl border border-slate-200/80 dark:border-white/[0.06]">
          <div className="text-slate-500 dark:text-zinc-400 text-[10px] xl:text-xs uppercase font-mono font-medium tracking-wider">
            All-Time Best
          </div>
          <div className="text-slate-900 dark:text-zinc-200 text-base xl:text-lg font-semibold font-mono mt-0.5">
            {longestStreak} Days
          </div>
        </div>
        <div className="bg-slate-50 dark:bg-zinc-950/60 p-3 xl:p-4 rounded-xl border border-slate-200/80 dark:border-white/[0.06]">
          <div className="text-slate-500 dark:text-zinc-400 text-[10px] xl:text-xs uppercase font-mono font-medium tracking-wider">
            7-Day Volume
          </div>
          <div className="text-slate-900 dark:text-zinc-200 text-base xl:text-lg font-semibold font-mono mt-0.5">
            0 Hours
          </div>
        </div>
      </div>
    </motion.section>
  );
}