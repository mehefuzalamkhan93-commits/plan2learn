'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { itemEntranceVariants, cardHoverProps } from '@/lib/motion';

interface MetricCardProps {
  label: string;
  value: string;
  context: string;
  icon: LucideIcon;
  badge?: {
    text: string;
    variant?: 'emerald' | 'amber' | 'zinc' | 'blue';
  };
  progress?: number;
  highlightText?: string;
}

export default function MetricCard({
  label,
  value,
  context,
  icon: Icon,
  badge,
  progress,
  highlightText,
}: MetricCardProps) {
  const getBadgeStyle = (variant: 'emerald' | 'amber' | 'zinc' | 'blue' = 'zinc') => {
    switch (variant) {
      case 'emerald':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'amber':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      case 'blue':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      default:
        return 'bg-slate-100 dark:bg-zinc-800/60 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-white/[0.08]';
    }
  };

  return (
    <motion.div
      variants={itemEntranceVariants}
      {...cardHoverProps}
      className="group relative rounded-2xl p-5 sm:p-6 xl:p-7 bg-white dark:bg-zinc-900/40 backdrop-blur-md border border-slate-200/80 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.14] transition-colors duration-200 flex flex-col justify-between shadow-sm dark:shadow-none"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] sm:text-[12px] xl:text-[13px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
          {label}
        </span>
        <div className="w-8 h-8 xl:w-9 xl:h-9 rounded-xl bg-slate-100 dark:bg-zinc-800/40 border border-slate-200 dark:border-white/[0.06] flex items-center justify-center text-slate-500 dark:text-zinc-400 group-hover:text-slate-800 dark:group-hover:text-zinc-200 transition-colors">
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div className="mt-4 xl:mt-5">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[2rem] sm:text-[2.6rem] xl:text-[3rem] font-semibold tracking-tight text-slate-900 dark:text-zinc-100 font-sans leading-none">
            {value}
          </span>
          {highlightText && (
            <span className="text-sm xl:text-base text-slate-500 dark:text-zinc-400 font-normal">{highlightText}</span>
          )}
        </div>

        {typeof progress === 'number' && (
          <div className="mt-3.5 w-full bg-slate-200/80 dark:bg-zinc-800/60 rounded-full h-1.5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              className="bg-indigo-600 dark:bg-zinc-200 h-full rounded-full"
            />
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2 text-[11px] sm:text-[12px] xl:text-[13px] text-slate-500 dark:text-zinc-400">
          <span>{context}</span>
          {badge && (
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] xl:text-[11px] font-medium border ${getBadgeStyle(
                badge.variant
              )}`}
            >
              {badge.text}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
