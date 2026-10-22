'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Target, TrendingUp, CheckCircle2 } from 'lucide-react';
import MasteryRow from './MasteryRow';
import { itemEntranceVariants, cardHoverProps } from '@/lib/motion';

interface SubjectMasteryData {
  subject: string;
  percentage: number;
  trend?: string;
}

interface MasteryPanelProps {
  subjects?: SubjectMasteryData[];
}

export default function MasteryPanel({ subjects = [] }: MasteryPanelProps) {
  const displaySubjects = subjects;
  const avgMastery =
    displaySubjects.length > 0
      ? Math.round(
          displaySubjects.reduce((sum, s) => sum + s.percentage, 0) / displaySubjects.length
        )
      : 0;

  return (
    <motion.section
      variants={itemEntranceVariants}
      {...cardHoverProps}
      className="rounded-2xl bg-white dark:bg-zinc-900/40 backdrop-blur-md border border-slate-200/80 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.12] p-5 sm:p-6 xl:p-7 space-y-5 transition-colors duration-200 shadow-sm dark:shadow-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-base sm:text-lg xl:text-xl font-semibold text-slate-900 dark:text-zinc-100">
              Subject Mastery
            </h3>
            <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-white/[0.06]">
              {displaySubjects.length > 0 ? `${avgMastery}% Avg` : 'Pending'}
            </span>
          </div>
          <p className="text-sm xl:text-[15px] text-slate-500 dark:text-zinc-400 mt-1">
            Retention weighted by syllabus coverage
          </p>
        </div>

        <div className="w-8 h-8 xl:w-9 xl:h-9 rounded-xl bg-slate-100 dark:bg-zinc-800/40 border border-slate-200 dark:border-white/[0.06] flex items-center justify-center text-slate-500 dark:text-zinc-400">
          <TrendingUp className="w-4 h-4" />
        </div>
      </div>

      {/* Rows or Clean Empty State */}
      {displaySubjects.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-500 dark:text-zinc-400">
          No subject activity recorded yet. Complete study sessions to calculate mastery.
        </div>
      ) : (
        <div className="space-y-3 pt-1">
          {displaySubjects.map((item, index) => (
            <MasteryRow
              key={item.subject}
              subject={item.subject}
              percentage={item.percentage}
              trend={item.trend}
              delay={index * 0.08}
            />
          ))}
        </div>
      )}

      {/* Footer Insight */}
      <div className="pt-3 border-t border-slate-200/80 dark:border-white/[0.06] flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${displaySubjects.length > 0 ? 'bg-emerald-500' : 'bg-zinc-400 dark:bg-zinc-600'}`} />
          <span>{displaySubjects.length > 0 ? 'Curriculum on track' : 'Awaiting study data'}</span>
        </span>
        <span className="font-mono text-slate-700 dark:text-zinc-300">Target: 85%</span>
      </div>
    </motion.section>
  );
}
