'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { usePlannerStore } from '@/store/usePlannerStore';
import { format } from 'date-fns';
import { CheckCircle2 } from 'lucide-react';
import StudyTaskItem from './StudyTaskItem';
import { PlanItem } from '@/types';
import { itemEntranceVariants } from '@/lib/motion';

interface StudyScheduleProps {
  onRateTask?: (task: PlanItem) => void;
  schedule: PlanItem[];
}

export default function StudySchedule({ onRateTask, schedule }: StudyScheduleProps) {
  const router = useRouter();
  const { toggleTaskComplete, pomodoro } = usePlannerStore();

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const matchedSchedule = schedule.filter(
    (task) => !task.scheduled_date || task.scheduled_date.slice(0, 10) === todayStr
  );
  const todaySchedule = matchedSchedule.length > 0 ? matchedSchedule : schedule;

  const completedCount = todaySchedule.filter((t) => t.completed).length;
  const progressPercent =
    todaySchedule.length > 0
      ? Math.round((completedCount / todaySchedule.length) * 100)
      : 0;

  const handleToggle = (task: PlanItem) => {
    toggleTaskComplete(task.id);
    if (!task.completed && onRateTask) {
      onRateTask(task);
    }
  };

  const handleStartFocus = (task: PlanItem) => {
    router.push(`/focus?taskId=${encodeURIComponent(task.id)}`);
  };

  return (
    <motion.section
      variants={itemEntranceVariants}
      className="rounded-2xl bg-zinc-900/40 backdrop-blur-md border border-white/[0.08] light:bg-white light:border-slate-200 overflow-hidden"
    >
      {/* Header */}
      <div className="p-5 sm:p-6 xl:p-7 border-b border-white/[0.08] light:border-slate-200 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg sm:text-xl xl:text-2xl font-semibold text-zinc-100 light:text-slate-900">
              Today&apos;s Study Schedule
            </h2>
            <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-zinc-800/80 text-zinc-300 border border-white/[0.06] light:bg-slate-100 light:text-slate-700 light:border-slate-200">
              {completedCount} of {todaySchedule.length} completed
            </span>
          </div>
          <p className="text-sm xl:text-[15px] text-zinc-400 mt-1.5 light:text-slate-500">
            Focus sessions scheduled for today
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-sm sm:text-base xl:text-lg font-mono font-semibold text-zinc-200 hidden sm:block light:text-slate-700">
            {progressPercent}%
          </div>
          <div className="w-28 sm:w-36 xl:w-44 h-2 bg-zinc-800/80 light:bg-slate-200 rounded-full overflow-hidden hidden sm:block">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="bg-zinc-200 h-full rounded-full light:bg-slate-700"
            />
          </div>
        </div>
      </div>

      {/* Task List with layout animation */}
      <div className="divide-y divide-white/[0.05]">
        {todaySchedule.length === 0 ? (
          <div className="p-10 text-center text-zinc-400 text-sm light:text-slate-500">
            No study sessions scheduled for today.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {todaySchedule.map((task) => (
              <StudyTaskItem
                key={task.id}
                task={task}
                onToggle={handleToggle}
                onStartFocus={handleStartFocus}
                isActiveFocus={pomodoro.activeTopic?.id === task.topic.id}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </motion.section>
  );
}