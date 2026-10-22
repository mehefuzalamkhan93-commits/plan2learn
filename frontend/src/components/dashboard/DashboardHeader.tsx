'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import Link from 'next/link';
import { Calendar, Sparkles, Focus, Sun, Moon } from 'lucide-react';
import { itemEntranceVariants } from '@/lib/motion';
import SettingsButton from '@/components/settings/SettingsButton';
import { useTheme } from '@/lib/theme';

interface DashboardHeaderProps {
  userName?: string;
  tasksCount: number;
  completedTasksCount: number;
  reviewsDueCount: number;
}

export default function DashboardHeader({
  userName = 'Student',
  tasksCount = 0,
  completedTasksCount = 0,
  reviewsDueCount = 0,
}: DashboardHeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const todayFormatted = format(new Date(), 'EEEE, MMMM d, yyyy');
  const remainingTasks = Math.max(0, tasksCount - completedTasksCount);
  const displayName = userName?.trim() ? userName.trim().split(' ')[0] : 'Student';

  return (
    <motion.header
      variants={itemEntranceVariants}
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6 pb-6 xl:pb-8 border-b border-white/[0.08] light:border-slate-200"
    >
      <div className="space-y-3">
        <h1 className="text-[1.9rem] sm:text-[2.2rem] xl:text-[2.4rem] 2xl:text-[2.6rem] font-semibold tracking-tight text-zinc-100 leading-none light:text-slate-900">
          Study Command Center
        </h1>
        <p className="text-sm sm:text-base xl:text-[17px] text-zinc-400 leading-snug light:text-slate-500">
          Welcome back, {displayName}. You have{' '}
          <span className="text-zinc-200 font-medium light:text-slate-700">{remainingTasks} tasks remaining</span> and{' '}
          <span className="text-zinc-200 font-medium light:text-slate-700">{reviewsDueCount} reviews due</span> today.
        </p>

        <nav aria-label="Quick Actions" className="flex flex-wrap items-center gap-2.5 pt-1">
          <Link
            href="/ai"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-zinc-900/60 px-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white light:bg-white light:border-slate-200 light:text-slate-700 light:hover:bg-slate-50 light:hover:text-slate-900"
          >
            <Sparkles className="h-4 w-4 text-indigo-300 light:text-indigo-600" />
            AI Assistant
          </Link>
          <Link
            href="/focus"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-zinc-900/60 px-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white light:bg-white light:border-slate-200 light:text-slate-700 light:hover:bg-slate-50 light:hover:text-slate-900"
          >
            <Focus className="h-4 w-4 text-zinc-300 light:text-slate-500" />
            Focus Room
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/[0.08] bg-zinc-900/60 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white light:bg-white light:border-slate-200 light:text-slate-600 light:hover:bg-slate-50 light:hover:text-slate-900"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <SettingsButton />
        </nav>
      </div>

      <div className="flex items-center gap-3 self-start sm:self-auto shrink-0">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900/60 border border-white/[0.08] text-sm xl:text-[15px] text-zinc-300 light:bg-slate-100 light:border-slate-200 light:text-slate-700">
          <Calendar className="w-4 h-4 text-zinc-400 shrink-0 light:text-slate-500" />
          <span>{todayFormatted}</span>
        </div>

        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-zinc-900/60 border border-white/[0.08] text-sm xl:text-[15px] text-zinc-300 light:bg-slate-100 light:border-slate-200 light:text-slate-700">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="text-zinc-400 light:text-slate-500">Status:</span>
          <span className="font-medium text-zinc-200 light:text-slate-700">Focus Ready</span>
        </div>
      </div>
    </motion.header>
  );
}
