'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Clock, Play, Check } from 'lucide-react';
import { PlanItem } from '@/types';
import { springs } from '@/lib/motion';

interface StudyTaskItemProps {
  task: PlanItem;
  onToggle: (task: PlanItem) => void;
  onStartFocus: (task: PlanItem) => void;
  isActiveFocus?: boolean;
}

export default function StudyTaskItem({
  task,
  onToggle,
  onStartFocus,
  isActiveFocus = false,
}: StudyTaskItemProps) {
  const isCompleted = task.completed;

  const getPriorityStyle = (tag: string) => {
    switch (tag) {
      case 'High':
        return 'bg-rose-500/10 text-rose-300 border-rose-500/20 light:bg-rose-50 light:text-rose-700 light:border-rose-200';
      case 'Weak Area':
        return 'bg-amber-500/10 text-amber-300 border-amber-500/20 light:bg-amber-50 light:text-amber-800 light:border-amber-200';
      case 'Spaced Revision':
        return 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20 light:bg-indigo-50 light:text-indigo-700 light:border-indigo-200';
      default:
        return 'bg-zinc-800/60 text-zinc-400 border-white/[0.06] light:bg-slate-100 light:text-slate-500 light:border-slate-200';
    }
  };

  return (
    <motion.div
      layout
      transition={springs.layout}
      className={`group relative min-h-[76px] sm:min-h-[82px] p-4 sm:p-5 xl:py-5 xl:px-6 flex items-center justify-between gap-4 sm:gap-6 transition-colors duration-200 ${
        isCompleted
          ? 'bg-zinc-950/40 text-zinc-400'
          : isActiveFocus
          ? 'bg-indigo-500/[0.04] border-l border-indigo-400/25'
          : 'hover:bg-zinc-800/20'
      }`}
    >
      {/* Left: Checkbox & Fluid Task Content */}
      <div className="flex items-start gap-3.5 sm:gap-4 min-w-0 flex-1">
        {/* Animated Tactile Checkbox */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onClick={() => onToggle(task)}
          aria-label={isCompleted ? `Mark ${task.topic.name} as incomplete` : `Mark ${task.topic.name} as complete`}
          className={`mt-0.5 h-5 w-5 rounded-md border flex items-center justify-center transition-colors duration-200 shrink-0 ${
            isCompleted
              ? 'bg-zinc-100 border-zinc-100 text-zinc-950'
              : 'border-white/20 bg-zinc-900/80 hover:border-white/40 light:border-slate-300 light:bg-white light:hover:border-indigo-400'
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none">
            <motion.path
              d="M2.5 6L5 8.5L9.5 3.5"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{
                pathLength: isCompleted ? 1 : 0,
                opacity: isCompleted ? 1 : 0,
              }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            />
          </svg>
        </motion.button>

        {/* Task Title & Streamlined Metadata */}
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="relative inline-block max-w-full">
              <span
                className={`text-base sm:text-[17px] xl:text-[18px] font-medium transition-colors duration-200 truncate block ${
                  isCompleted ? 'text-zinc-400' : 'text-zinc-100 light:text-slate-900'
                }`}
              >
                {task.topic.name}
              </span>

              {/* Animated SVG Strike-through */}
              <svg
                className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 pointer-events-none overflow-visible"
                aria-hidden="true"
              >
                <motion.line
                  x1="0"
                  y1="2"
                  x2="100%"
                  y2="2"
                  stroke="#71717a"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  initial={false}
                  animate={{
                    pathLength: isCompleted ? 1 : 0,
                    opacity: isCompleted ? 0.9 : 0,
                  }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                />
              </svg>
            </div>
          </div>

          {/* Clean Scannable Metadata */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 text-[13px] sm:text-[14px] xl:text-[15px] text-zinc-400 light:text-slate-500">
            <span className="text-zinc-300 font-medium light:text-slate-700">{task.topic.subject}</span>
            <span className="text-zinc-600 light:text-slate-400">·</span>
            <span className="text-zinc-400 light:text-slate-500">
              {task.scheduled_time} ({task.duration_minutes} min)
            </span>
            <span className="text-zinc-600 light:text-slate-400">·</span>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-medium border ${getPriorityStyle(
                task.priority_tag
              )}`}
            >
              {task.priority_tag}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Tactile Action Button */}
      <div className="shrink-0 flex items-center gap-2">
        {isCompleted ? (
          <span className="text-xs text-zinc-400 font-mono px-2.5 py-1 rounded bg-zinc-900/60 border border-white/[0.04] light:bg-slate-100 light:border-slate-200">
            Completed
          </span>
        ) : (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onStartFocus(task)}
            className="px-4 py-2.5 sm:px-5 sm:py-3 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-sm xl:text-[15px] font-medium inline-flex items-center gap-2 transition-colors shadow-sm light:bg-indigo-600 light:text-white light:hover:bg-indigo-500"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Focus</span>
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}
