'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface MasteryRowProps {
  subject: string;
  percentage: number;
  trend?: string;
  delay?: number;
}

export default function MasteryRow({
  subject,
  percentage,
  trend,
  delay = 0,
}: MasteryRowProps) {
  return (
    <div className="space-y-2 py-1.5">
      {/* Label and Percentage */}
      <div className="flex items-center justify-between text-sm xl:text-[15px]">
        <span className="font-medium text-slate-700 dark:text-zinc-300">{subject}</span>
        <div className="flex items-center gap-2.5">
          {trend && (
            <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-medium">
              {trend}
            </span>
          )}
          <span className="font-mono font-semibold text-slate-900 dark:text-zinc-100">
            {percentage}%
          </span>
        </div>
      </div>

      {/* Thin Progress Indicator */}
      <div className="w-full bg-slate-200/80 dark:bg-zinc-800/80 rounded-full h-1.5 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{
            duration: 0.85,
            delay: delay + 0.1,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="bg-indigo-600 dark:bg-zinc-200 h-full rounded-full"
        />
      </div>
    </div>
  );
}
