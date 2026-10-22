'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Clock, AlertTriangle, CheckCircle, Loader2, Coffee, ShieldCheck } from 'lucide-react';
import { StudyPlanProposal, StudyTaskProposal } from '@/types';

interface PlanPreviewModalProps {
  proposal: StudyPlanProposal | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (proposal: StudyPlanProposal) => void;
  isLoading?: boolean;
  error?: string | null;
}

export default function PlanPreviewModal({
  proposal,
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  error = null,
}: PlanPreviewModalProps) {
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  // Lock background scroll and handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isLoading, onClose]);

  if (!isOpen || !proposal) return null;

  // Helper to ensure clean YYYY-MM-DD keys
  const cleanDate = (dateVal: string) => String(dateVal).slice(0, 10);

  // Group tasks by date strictly using clean YYYY-MM-DD
  const tasksByDate = proposal.tasks.reduce((acc, task) => {
    const dateKey = cleanDate(task.scheduled_date);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(task);
    return acc;
  }, {} as Record<string, StudyTaskProposal[]>);

  const sortedDates = Object.keys(tasksByDate).sort();

  // Derive start and end dates strictly from actual tasks (or fall back to proposal fields)
  const startDateStr = sortedDates[0] ?? cleanDate(proposal.planning_period_start);
  const endDateStr = sortedDates[sortedDates.length - 1] ?? cleanDate(proposal.planning_period_end);

  // Calculate actual total study time directly from task records
  const totalStudyMinutes = proposal.tasks.reduce((sum, task) => sum + task.duration_minutes, 0);
  const totalHours = Math.floor(totalStudyMinutes / 60);
  const totalRemainingMinutes = totalStudyMinutes % 60;
  const daysCount = sortedDates.length;
  const dailyBreakMinutes = proposal.daily_break_minutes ?? 20;
  const dailyStudyLimit = proposal.daily_study_minutes ?? 160;

  const toggleDay = (date: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const getPriorityColor = (tag: string) => {
    switch (tag) {
      case 'Weak Area':
        return 'border-rose-400/30 bg-rose-500/10 text-rose-300 dark:text-rose-300 light:text-rose-700 light:border-rose-200 light:bg-rose-50';
      case 'Spaced Revision':
        return 'border-amber-400/30 bg-amber-500/10 text-amber-300 dark:text-amber-300 light:text-amber-800 light:border-amber-200 light:bg-amber-50';
      case 'Exam Prep':
        return 'border-indigo-400/30 bg-indigo-500/10 text-indigo-300 dark:text-indigo-300 light:text-indigo-700 light:border-indigo-200 light:bg-indigo-50';
      default:
        return 'border-zinc-600/30 bg-zinc-700/30 text-zinc-300 dark:text-zinc-300 light:text-slate-700 light:border-slate-200 light:bg-slate-100';
    }
  };

  const formatDate = (dateStr: string) => {
    const cleanStr = cleanDate(dateStr);
    const [year, month, day] = cleanStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  /* Portal to <body>: escaped from any transformed/filtered ancestor (the roadmap
     workspace layer uses backdrop-blur, which becomes the containing block for
     fixed-position descendants and collapses `fixed inset-0` overlays). */
  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/75 backdrop-blur-md overflow-y-auto"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={{ maxHeight: 'calc(100dvh - 32px)' }}
          className="relative flex flex-col w-full max-w-3xl my-auto max-h-[calc(100dvh-32px)] rounded-2xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-zinc-900/95 dark:bg-zinc-900/95 light:bg-white shadow-2xl shadow-black/80 light:shadow-xl overflow-hidden text-zinc-100 dark:text-zinc-100 light:text-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header - Pinned */}
          <div className="shrink-0 flex items-center justify-between border-b border-white/[0.06] dark:border-white/[0.06] light:border-slate-200 px-5 sm:px-6 py-4 bg-zinc-900 dark:bg-zinc-900 light:bg-slate-50">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400 dark:text-emerald-400 light:text-emerald-600" />
                <h2 id="modal-title" className="text-base sm:text-lg font-semibold text-zinc-100 dark:text-zinc-100 light:text-slate-900">
                  14-Day Study Plan Proposal
                </h2>
              </div>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                {formatDate(startDateStr)} – {formatDate(endDateStr)} ({startDateStr} to {endDateStr}) · {daysCount} Calendar Days · Evening Window (7:00 PM – 10:00 PM)
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-zinc-800/50 dark:bg-zinc-800/50 light:bg-white text-zinc-300 dark:text-zinc-300 light:text-slate-600 transition-colors hover:bg-zinc-800 light:hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Modal Body - Independently Scrollable */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-5 sm:space-y-6 custom-scrollbar">
            {/* Error Banner */}
            {error && (
              <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 dark:bg-rose-500/10 light:bg-rose-50 p-4 text-rose-200 dark:text-rose-200 light:text-rose-800">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400 dark:text-rose-400 light:text-rose-600" />
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            )}

            {/* Metrics Overview Grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-white/[0.06] dark:border-white/[0.06] light:border-slate-200 bg-zinc-950/50 dark:bg-zinc-950/50 light:bg-slate-50 p-3.5">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                  <Calendar className="h-3.5 w-3.5 text-indigo-400 dark:text-indigo-400 light:text-indigo-600" />
                  <span>Period</span>
                </div>
                <p className="mt-1 text-base font-semibold text-zinc-100 dark:text-zinc-100 light:text-slate-900">{daysCount} Days</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-500 light:text-slate-400">14 consecutive days</p>
              </div>

              <div className="rounded-xl border border-white/[0.06] dark:border-white/[0.06] light:border-slate-200 bg-zinc-950/50 dark:bg-zinc-950/50 light:bg-slate-50 p-3.5">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                  <Clock className="h-3.5 w-3.5 text-indigo-400 dark:text-indigo-400 light:text-indigo-600" />
                  <span>Total Workload</span>
                </div>
                <p className="mt-1 text-base font-semibold text-zinc-100 dark:text-zinc-100 light:text-slate-900">
                  {totalHours}h {totalRemainingMinutes}m
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-500 light:text-slate-400">{totalStudyMinutes} mins total</p>
              </div>

              <div className="rounded-xl border border-white/[0.06] dark:border-white/[0.06] light:border-slate-200 bg-zinc-950/50 dark:bg-zinc-950/50 light:bg-slate-50 p-3.5">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                  <Clock className="h-3.5 w-3.5 text-indigo-400 dark:text-indigo-400 light:text-indigo-600" />
                  <span>Daily Study</span>
                </div>
                <p className="mt-1 text-base font-semibold text-zinc-100 dark:text-zinc-100 light:text-slate-900">
                  Max {dailyStudyLimit}m
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-500 light:text-slate-400">{Math.floor(dailyStudyLimit / 60)}h {dailyStudyLimit % 60}m / day</p>
              </div>

              <div className="rounded-xl border border-white/[0.06] dark:border-white/[0.06] light:border-slate-200 bg-zinc-950/50 dark:bg-zinc-950/50 light:bg-slate-50 p-3.5">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                  <Coffee className="h-3.5 w-3.5 text-emerald-400 dark:text-emerald-400 light:text-emerald-600" />
                  <span>Daily Break</span>
                </div>
                <p className="mt-1 text-base font-semibold text-zinc-100 dark:text-zinc-100 light:text-slate-900">
                  {dailyBreakMinutes}m / day
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-500 light:text-slate-400">In 7 PM–10 PM window</p>
              </div>
            </div>

            {/* Proposal Summary */}
            {proposal.summary && (
              <div className="rounded-xl border border-indigo-300/20 dark:border-indigo-300/20 light:border-indigo-200 bg-indigo-400/[0.05] dark:bg-indigo-400/[0.05] light:bg-indigo-50/70 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-indigo-300 dark:text-indigo-300 light:text-indigo-600" />
                  <p className="text-sm text-zinc-300 dark:text-zinc-300 light:text-slate-700 leading-relaxed">{proposal.summary}</p>
                </div>
              </div>
            )}

            {/* Daily Schedule Breakdown */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-100 dark:text-zinc-100 light:text-slate-900">
                  Daily Schedule Breakdown ({daysCount} Days)
                </h3>
                <span className="text-xs text-zinc-500 dark:text-zinc-500 light:text-slate-500">
                  Total {proposal.tasks.length} tasks scheduled
                </span>
              </div>

              <div className="space-y-3">
                {sortedDates.map((date, idx) => {
                  const dayTasks = tasksByDate[date];
                  // Calculate exact sum of task durations for this day
                  const dayStudyMinutes = dayTasks.reduce((sum, t) => sum + t.duration_minutes, 0);
                  const dayStudyHours = Math.floor(dayStudyMinutes / 60);
                  const dayStudyMins = dayStudyMinutes % 60;
                  const isExpanded = expandedDays.has(date);

                  return (
                    <motion.div
                      key={date}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="rounded-xl border border-white/[0.06] dark:border-white/[0.06] light:border-slate-200 bg-zinc-950/50 dark:bg-zinc-950/50 light:bg-slate-50 overflow-hidden"
                    >
                      <button
                        onClick={() => toggleDay(date)}
                        className="w-full px-4 py-3 flex items-center justify-between gap-4 text-left hover:bg-zinc-900/50 dark:hover:bg-zinc-900/50 light:hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-400/10 text-[10px] font-mono text-indigo-300 dark:text-indigo-300 light:text-indigo-600">
                            {idx + 1}
                          </span>
                          <span className="font-medium text-zinc-100 dark:text-zinc-100 light:text-slate-900">{formatDate(date)}</span>
                          <span className="text-xs font-mono text-zinc-500 dark:text-zinc-500 light:text-slate-400">{date}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="flex items-center gap-1 text-zinc-300 dark:text-zinc-300 light:text-slate-700 font-mono">
                            <Clock className="h-3 w-3 text-indigo-400 dark:text-indigo-400 light:text-indigo-600" />
                            {dayStudyHours}h {dayStudyMins}m study
                          </span>
                          <span className="hidden sm:inline-flex items-center gap-1 text-emerald-400/90 dark:text-emerald-400/90 light:text-emerald-700 font-mono">
                            <Coffee className="h-3 w-3" />
                            {dailyBreakMinutes}m break
                          </span>
                          <span className="text-zinc-500 dark:text-zinc-500 light:text-slate-400">{dayTasks.length} tasks</span>
                        </div>
                      </button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="border-t border-white/[0.04] dark:border-white/[0.04] light:border-slate-200 p-4 space-y-3 bg-zinc-950/20 dark:bg-zinc-950/20 light:bg-white"
                          >
                            <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-500 light:text-slate-400 pb-1">
                              <span>Window: 19:00 – 22:00</span>
                              <span>Daily study total: {dayStudyMinutes} min (Cap: {dailyStudyLimit} min)</span>
                            </div>

                            {dayTasks.map((task, index) => (
                              <div
                                key={`${date}-${index}`}
                                className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border p-3 ${getPriorityColor(task.priority_tag)}`}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-zinc-100 dark:text-zinc-100 light:text-slate-900 truncate">{task.topic_name}</span>
                                    <span className="text-xs text-zinc-500 dark:text-zinc-500 light:text-slate-500">({task.subject})</span>
                                  </div>
                                  <div className="mt-1 flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                                    <span className="flex items-center gap-1 font-mono text-indigo-300 dark:text-indigo-300 light:text-indigo-600">
                                      <Clock className="h-3 w-3" />
                                      {task.scheduled_time} · {task.duration_minutes} min
                                    </span>
                                    {task.rationale && (
                                      <span className="text-zinc-500 dark:text-zinc-500 light:text-slate-500 line-clamp-1">{task.rationale}</span>
                                    )}
                                  </div>
                                </div>
                                <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider">
                                  {task.priority_tag}
                                </span>
                              </div>
                            ))}

                            <div className="flex items-center gap-2 rounded-lg border border-emerald-400/20 dark:border-emerald-400/20 light:border-emerald-200 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.04] light:bg-emerald-50 px-3 py-2 text-xs text-emerald-300 dark:text-emerald-300 light:text-emerald-800">
                              <Coffee className="h-3.5 w-3.5" />
                              <span>{dailyBreakMinutes}-minute daily break allowance scheduled within 19:00–22:00 window.</span>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer Actions - Pinned */}
          <div className="shrink-0 border-t border-white/[0.06] dark:border-white/[0.06] light:border-slate-200 px-5 sm:px-6 py-4 bg-zinc-900 dark:bg-zinc-900 light:bg-slate-50">
            <div className="flex flex-col sm:flex-row gap-3 justify-end">
              <button
                onClick={onClose}
                disabled={isLoading}
                className="flex h-10 sm:h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-300 bg-zinc-800/50 dark:bg-zinc-800/50 light:bg-white px-5 text-sm font-medium text-zinc-300 dark:text-zinc-300 light:text-slate-700 transition-colors hover:bg-zinc-800 light:hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Make Changes
              </button>
              <button
                onClick={() => onConfirm(proposal)}
                disabled={isLoading}
                className="flex h-10 sm:h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white shadow-md shadow-indigo-600/30 transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Building Plan…
                  </>
                ) : (
                  'Build My Plan'
                )}
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-zinc-500 dark:text-zinc-500 light:text-slate-500">
              This will create your 14-day study plan and update your active schedule.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}