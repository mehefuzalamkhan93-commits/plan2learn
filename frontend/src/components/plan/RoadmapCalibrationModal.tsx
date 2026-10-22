'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  Sparkles,
  X,
  Target,
  Brain,
  Clock,
  BookOpen,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { PlanProposalGenerateRequest } from '@/types';
import { format, addDays } from 'date-fns';
import { cn } from '@/lib/utils';

interface RoadmapCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: PlanProposalGenerateRequest) => Promise<void>;
  isGenerating: boolean;
  defaultSubject?: string;
  defaultDailyHours?: number;
  availableSubjects?: string[];
  defaultExamDate?: string;
}

const UNDERSTANDING_LEVELS = [
  {
    value: 'beginner',
    label: 'Beginner / Foundation',
    badge: 'Step-by-Step Concepts',
    desc: 'Starting fresh or missing core fundamentals. AI will prioritize basic theories, concept summaries, and guided examples before harder practice.',
  },
  {
    value: 'intermediate',
    label: 'Intermediate / Concept Clear',
    badge: 'Targeted Problem Solving',
    desc: 'Understand the main concepts but struggle with numerical problems, formula recall, or speed. AI focuses on rigorous problem-solving and weak-area drills.',
  },
  {
    value: 'advanced',
    label: 'Advanced / Exam Mastery',
    badge: 'High-Yield Speed & Depth',
    desc: 'Strong grasp across syllabus. AI will focus on high-weightage topics, complex multi-concept challenges, timed drills, and spaced repetition.',
  },
];

export default function RoadmapCalibrationModal({
  isOpen,
  onClose,
  onSubmit,
  isGenerating,
  defaultSubject = '',
  defaultDailyHours = 2,
  availableSubjects = [],
  defaultExamDate = '',
}: RoadmapCalibrationModalProps) {
  const [subject, setSubject] = useState(defaultSubject || (availableSubjects[0] || 'Physics'));
  const [customSubject, setCustomSubject] = useState('');
  const [understandingLevel, setUnderstandingLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate');
  const [weaknessDetails, setWeaknessDetails] = useState('');
  const [dailyHours, setDailyHours] = useState(defaultDailyHours || 2);
  const [examDate, setExamDate] = useState(
    defaultExamDate || format(addDays(new Date(), 14), 'yyyy-MM-dd')
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const effectiveSubject = subject === 'custom' ? customSubject.trim() : subject.trim();
    if (!effectiveSubject) {
      setValidationError('Please choose or enter a subject for this roadmap.');
      return;
    }

    if (!weaknessDetails.trim()) {
      setValidationError('Please describe which specific topics or question types you struggle with.');
      return;
    }

    const payload: PlanProposalGenerateRequest = {
      subject: effectiveSubject,
      understanding_level: understandingLevel,
      weakness_details: weaknessDetails.trim(),
      daily_hours: Number(dailyHours),
      exam_date: examDate || undefined,
      start_date: format(new Date(), 'yyyy-MM-dd'),
    };

    await onSubmit(payload);
  };

  // Lock background scroll and handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isGenerating) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isGenerating, onClose]);

  if (!isOpen) return null;

  /* Portal to <body>: escaped from any transformed/filtered ancestor (the roadmap
     workspace layer uses backdrop-blur, which becomes the containing block for
     fixed-position descendants and collapses `fixed inset-0` overlays). */
  return createPortal(
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/75 backdrop-blur-md overflow-y-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isGenerating) onClose();
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calibration-modal-title"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2 }}
          style={{ maxHeight: 'calc(100dvh - 32px)' }}
          className="relative flex flex-col w-full max-w-2xl my-auto max-h-[calc(100dvh-32px)] rounded-2xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-200 bg-zinc-950 dark:bg-zinc-950 light:bg-white shadow-2xl shadow-black/80 light:shadow-xl overflow-hidden text-zinc-100 dark:text-zinc-100 light:text-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header - Pinned */}
          <div className="shrink-0 flex items-center justify-between border-b border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 px-5 sm:px-6 py-4 bg-zinc-900/70 dark:bg-zinc-900/70 light:bg-slate-50">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/30 dark:border-indigo-500/30 light:border-indigo-200 bg-indigo-500/10 dark:bg-indigo-500/10 light:bg-indigo-50 text-indigo-300 dark:text-indigo-300 light:text-indigo-600">
                <Brain className="h-5 w-5" />
              </div>
              <div>
                <h2 id="calibration-modal-title" className="text-base sm:text-lg font-semibold text-white dark:text-white light:text-slate-900">
                  Calibrate AI Study Roadmap
                </h2>
                <p className="text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                  Provide your subject proficiency and weaknesses so the AI strategist can build an exact 14-day schedule.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isGenerating}
              className="rounded-lg p-1.5 text-zinc-400 hover:text-white dark:hover:text-white light:text-slate-400 light:hover:text-slate-700 light:hover:bg-slate-100 transition-colors disabled:opacity-40"
              aria-label="Close calibration"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form Body - Independently Scrollable */}
          <form onSubmit={handleSubmit} id="calibration-form" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-5 custom-scrollbar">
            {validationError && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 dark:bg-rose-500/10 light:bg-rose-50 p-3 text-xs text-rose-300 dark:text-rose-300 light:text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            {/* 1. Subject Selection */}
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-zinc-300 mb-2">
                <BookOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                1. Target Subject
              </label>
              <div className="flex flex-wrap gap-2">
                {availableSubjects.map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => {
                      setSubject(sub);
                      setCustomSubject('');
                    }}
                    className={cn(
                      'rounded-xl border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer',
                      subject === sub
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-indigo-200 dark:shadow-md dark:shadow-indigo-500/20'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900 dark:border-white/[0.08] dark:bg-zinc-900/60 dark:text-zinc-400 dark:hover:border-white/20 dark:hover:text-white'
                    )}
                  >
                    {sub}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSubject('custom')}
                  className={cn(
                    'rounded-xl border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer',
                    subject === 'custom'
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-indigo-200 dark:shadow-md dark:shadow-indigo-500/20'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900 dark:border-white/[0.08] dark:bg-zinc-900/60 dark:text-zinc-400 dark:hover:border-white/20 dark:hover:text-white'
                  )}
                >
                  + Other Subject
                </button>
              </div>

              {subject === 'custom' && (
                <input
                  type="text"
                  required
                  value={customSubject}
                  onChange={(e) => setCustomSubject(e.target.value)}
                  placeholder="Enter subject name (e.g. Calculus, Organic Chemistry, Microeconomics)"
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-indigo-400"
                />
              )}
            </div>

            {/* 2. Understanding Level */}
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-zinc-300 mb-2">
                <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                2. Current Understanding Level
              </label>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {UNDERSTANDING_LEVELS.map((lvl) => (
                  <div
                    key={lvl.value}
                    onClick={() => setUnderstandingLevel(lvl.value as any)}
                    className={cn(
                      'cursor-pointer rounded-xl border p-3.5 transition-all text-left flex flex-col justify-between',
                      understandingLevel === lvl.value
                        ? 'border-indigo-500 bg-indigo-50/70 shadow-sm dark:border-indigo-400 dark:bg-indigo-500/10 dark:shadow-lg dark:shadow-indigo-500/10'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.08] dark:bg-zinc-900/50 dark:hover:border-white/20'
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{lvl.label}</span>
                        {understandingLevel === lvl.value && (
                          <CheckCircle2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        )}
                      </div>
                      <span className="inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-indigo-700 mb-2 dark:bg-white/[0.05] dark:text-indigo-300">
                        {lvl.badge}
                      </span>
                      <p className="text-[11px] leading-relaxed text-slate-600 dark:text-zinc-400">
                        {lvl.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Specific Weaknesses & Struggle Points */}
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300 mb-1.5">
                <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                3. What specific topics or question types are you weak in?
              </label>
              <p className="text-xs text-slate-600 dark:text-zinc-400 mb-2">
                Be specific (e.g. formulas, derivation steps, conceptual reasoning, specific chapters). The AI will inject heavy revision blocks for these.
              </p>
              <textarea
                rows={3}
                required
                value={weaknessDetails}
                onChange={(e) => setWeaknessDetails(e.target.value)}
                placeholder="e.g. I struggle with Rotational Inertia integration, Lenz's law numericals, and thermodynamics cycle calculations..."
                className="w-full rounded-xl border border-rose-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none dark:border-rose-500/30 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-rose-400"
              />
            </div>

            {/* 4. Time Constraints & Target Date */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
              <div>
                <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-zinc-300 mb-1">
                  <Clock className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
                  Daily Study Hours Available
                </label>
                <select
                  value={dailyHours}
                  onChange={(e) => setDailyHours(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/[0.1] dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-indigo-400"
                >
                  <option value={1} className="bg-white text-slate-900 dark:bg-zinc-900 dark:text-zinc-100">1 hour per day</option>
                  <option value={1.5} className="bg-white text-slate-900 dark:bg-zinc-900 dark:text-zinc-100">1.5 hours per day</option>
                  <option value={2} className="bg-white text-slate-900 dark:bg-zinc-900 dark:text-zinc-100">2 hours per day (Recommended)</option>
                  <option value={2.5} className="bg-white text-slate-900 dark:bg-zinc-900 dark:text-zinc-100">2.5 hours per day</option>
                  <option value={3} className="bg-white text-slate-900 dark:bg-zinc-900 dark:text-zinc-100">3 hours per day</option>
                  <option value={4} className="bg-white text-slate-900 dark:bg-zinc-900 dark:text-zinc-100">4+ hours per day (Intensive)</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-zinc-300 mb-1">
                  <Calendar className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                  Target Exam Date
                </label>
                <input
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/[0.1] dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-indigo-400"
                />
              </div>
            </div>
          </form>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-white/[0.08] px-5 sm:px-6 py-4 bg-slate-50 dark:bg-zinc-900/70">
            <button
              type="button"
              onClick={onClose}
              disabled={isGenerating}
              className="cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:border-white/[0.08] dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              Cancel
            </button>

            <button
              type="submit"
              form="calibration-form"
              disabled={isGenerating}
              className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating Calibrated Roadmap…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Tailored Roadmap
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
