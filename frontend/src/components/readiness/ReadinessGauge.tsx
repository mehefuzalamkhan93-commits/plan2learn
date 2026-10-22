'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { usePlannerStore } from '@/store/usePlannerStore';
import { Target, TrendingUp, CheckCircle2, AlertCircle } from 'lucide-react';
import { itemEntranceVariants, cardHoverProps } from '@/lib/motion';

export default function ReadinessGauge() {
  const { readinessScore } = usePlannerStore();
  const probability = Math.round(readinessScore?.probability || 0);

  const getStatus = (score: number) => {
    if (score >= 80) {
      return {
        label: 'Optimal Readiness',
        badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        strokeColor: 'text-emerald-400',
        icon: CheckCircle2,
      };
    }
    if (score >= 60) {
      return {
        label: 'On Track',
        badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
        strokeColor: 'text-zinc-100',
        icon: TrendingUp,
      };
    }
    return {
      label: 'Needs Attention',
      badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      strokeColor: 'text-amber-400',
      icon: AlertCircle,
    };
  };

  const status = getStatus(probability);
  const StatusIcon = status.icon;

  const radius = 64;
  const strokeWidth = 5;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (probability / 100) * circumference;

  return (
    <motion.section
      variants={itemEntranceVariants}
      {...cardHoverProps}
      className="rounded-2xl bg-zinc-900/40 backdrop-blur-md border border-white/[0.08] hover:border-white/[0.12] p-5 sm:p-6 space-y-4 transition-colors duration-200"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-semibold text-zinc-100">
              Exam Readiness Score
            </h3>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono border ${status.badge}`}
            >
              <StatusIcon className="w-3 h-3" />
              {status.label}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Predictive probability based on active recall and syllabus completion
          </p>
        </div>

        <div className="w-8 h-8 rounded-lg bg-zinc-800/40 border border-white/[0.06] flex items-center justify-center text-zinc-400">
          <Target className="w-4 h-4" />
        </div>
      </div>

      {/* Circular Gauge Display */}
      <div className="relative flex items-center justify-center my-3 select-none">
        <svg
          className="w-44 h-44 -rotate-90 transform overflow-visible"
          viewBox="0 0 160 160"
          aria-hidden="true"
        >
          {/* Background Track */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            className="text-zinc-800/70"
          />

          {/* Animated Active Stroke */}
          <motion.circle
            cx="80"
            cy="80"
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            strokeLinecap="round"
            className={status.strokeColor}
          />
        </svg>

        {/* Center Readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-mono text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-100">
            {probability}%
          </span>
          <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 mt-0.5">
            Success Prob
          </span>
        </div>
      </div>

      {/* Telemetry Breakdown */}
      <div className="pt-3 border-t border-white/[0.06] space-y-2 text-xs">
        <div className="flex items-center justify-between text-zinc-400">
          <span>Retention Index</span>
          <span className="font-mono font-medium text-zinc-200">
            {(readinessScore?.avg_confidence || 0).toFixed(1)} / 5.0
          </span>
        </div>
        <div className="flex items-center justify-between text-zinc-400">
          <span>Days Remaining</span>
          <span className="font-mono font-medium text-zinc-200">
            {readinessScore?.days_remaining ? String(readinessScore.days_remaining) : 'N/A'} Days
          </span>
        </div>
        <div className="flex items-center justify-between text-zinc-400">
          <span>Syllabus Covered</span>
          <span className="font-mono font-medium text-zinc-200">
            {Math.round((readinessScore?.completion_rate || 0) * 100)}%
          </span>
        </div>
      </div>
    </motion.section>
  );
}