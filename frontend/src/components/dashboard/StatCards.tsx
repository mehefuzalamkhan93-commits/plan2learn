'use client';

import React from 'react';
import { Clock, Flame, Calendar, TrendingUp } from 'lucide-react';
import { PlanItem, UserProfile } from '@/types';

interface StatCardsProps {
  userProfile: UserProfile | null;
  schedule: PlanItem[];
  completedMinutes: number;
  totalPlannedMinutes: number;
  daysUntilExam: number;
  streakCount: number;
  readinessScore: number;
}

export default function StatCards({
  userProfile,
  schedule,
  completedMinutes,
  totalPlannedMinutes,
  daysUntilExam,
  streakCount,
  readinessScore,
}: StatCardsProps) {
  const progressPercent =
    totalPlannedMinutes > 0 ? Math.min(100, Math.round((completedMinutes / totalPlannedMinutes) * 100)) : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Today's Study Time */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700/80 transition-colors flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-400">Today's Focus</span>
          <div className="w-8 h-8 rounded-lg bg-zinc-800/60 flex items-center justify-center text-zinc-400">
            <Clock className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-zinc-100">{completedMinutes}</span>
            <span className="text-xs text-zinc-400">/ {totalPlannedMinutes} min</span>
          </div>
          <div className="mt-3 w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-zinc-200 h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-2 text-[11px] text-zinc-500 flex justify-between">
            <span>{progressPercent}% completed</span>
            <span>{totalPlannedMinutes - completedMinutes > 0 ? `${totalPlannedMinutes - completedMinutes}m remaining` : 'Goal reached'}</span>
          </div>
        </div>
      </div>

      {/* 2. Streak Count */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700/80 transition-colors flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-400">Current Streak</span>
          <div className="w-8 h-8 rounded-lg bg-zinc-800/60 flex items-center justify-center text-orange-400">
            <Flame className="w-4 h-4 fill-orange-400/20" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-zinc-100">{streakCount}</span>
            <span className="text-xs text-zinc-400">consecutive days</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs text-zinc-400">Active today • Next goal: 14 days</span>
          </div>
        </div>
      </div>

      {/* 3. Exam Countdown */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700/80 transition-colors flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-400">Exam Countdown</span>
          <div className="w-8 h-8 rounded-lg bg-zinc-800/60 flex items-center justify-center text-zinc-400">
            <Calendar className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-zinc-100">{daysUntilExam}</span>
            <span className="text-xs text-zinc-400">days remaining</span>
          </div>
          <div className="mt-3 text-xs text-zinc-400 flex items-center justify-between">
            <span>Target: <span className="text-zinc-200 font-medium">{userProfile?.score_goal || 85}% Score</span></span>
            <span className="text-[11px] text-zinc-500">{userProfile?.exam_date || 'Dec 15, 2026'}</span>
          </div>
        </div>
      </div>

      {/* 4. Readiness Score */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700/80 transition-colors flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-400">Readiness Score</span>
          <div className="w-8 h-8 rounded-lg bg-zinc-800/60 flex items-center justify-center text-emerald-400">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-zinc-100">{readinessScore}%</span>
            <span className="text-xs text-emerald-400 font-medium">On Track</span>
          </div>
          <div className="mt-3 text-xs text-zinc-400 flex items-center justify-between">
            <span>Retention index: <span className="text-zinc-200 font-medium">4.2 / 5.0</span></span>
            <span className="text-[11px] text-zinc-500">Updated today</span>
          </div>
        </div>
      </div>
    </div>
  );
}
