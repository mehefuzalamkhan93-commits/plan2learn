'use client';

import React from 'react';
import { Clock, Flame, Brain, Calendar } from 'lucide-react';
import MetricCard from './MetricCard';
import { PlanItem, UserProfile } from '@/types';

interface KpiGridProps {
  userProfile: UserProfile | null;
  schedule: PlanItem[];
  completedMinutes: number;
  totalPlannedMinutes: number;
  daysUntilExam: number;
  streakCount: number;
  retentionPercent?: number;
}

export default function KpiGrid({
  userProfile,
  schedule,
  completedMinutes,
  totalPlannedMinutes,
  daysUntilExam,
  streakCount,
  retentionPercent = 0,
}: KpiGridProps) {
  // Format minutes into clean "Xh Ym"
  const formatHoursMinutes = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  const studyTimeFormatted =
    completedMinutes > 0 ? formatHoursMinutes(completedMinutes) : '0m';
  const studyProgress =
    totalPlannedMinutes > 0
      ? Math.round((completedMinutes / totalPlannedMinutes) * 100)
      : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 xl:gap-5">
      {/* 1. Today's Hours */}
      <MetricCard
        label="Today's Study"
        value={studyTimeFormatted}
        highlightText={totalPlannedMinutes > 0 ? `/ ${formatHoursMinutes(totalPlannedMinutes)}` : undefined}
        context={totalPlannedMinutes > 0 ? `${studyProgress}% of daily target` : 'No study planned today'}
        progress={studyProgress}
        icon={Clock}
        badge={{
          text: totalPlannedMinutes === 0
            ? 'No Target'
            : studyProgress >= 100
            ? 'Target Reached'
            : `${Math.max(0, totalPlannedMinutes - completedMinutes)}m left`,
          variant: studyProgress >= 100 ? 'emerald' : 'zinc',
        }}
      />

      {/* 2. Study Streak */}
      <MetricCard
        label="Current Streak"
        value={`${streakCount} days`}
        context={streakCount > 0 ? 'Consistent study pattern' : 'Complete study to build streak'}
        icon={Flame}
        badge={{
          text: streakCount > 0 ? 'Active' : 'Day 0',
          variant: streakCount > 0 ? 'emerald' : 'zinc',
        }}
      />

      {/* 3. Retention */}
      <MetricCard
        label="Average Retention"
        value={retentionPercent > 0 ? `${retentionPercent}%` : '—'}
        context={retentionPercent > 0 ? 'Calculated from active recall' : 'No recall reviews recorded'}
        icon={Brain}
        badge={{
          text: retentionPercent > 0 ? 'Active' : 'Unrated',
          variant: retentionPercent > 0 ? 'blue' : 'zinc',
        }}
      />

      {/* 4. Exam D-Day */}
      <MetricCard
        label="Next Exam"
        value={userProfile?.exam_date ? (daysUntilExam > 0 ? `D-${daysUntilExam}` : 'Today') : '—'}
        context={userProfile?.score_goal ? `Target: ${userProfile.score_goal}% Score` : (userProfile?.exam_date ? 'Exam scheduled' : 'No exam date set')}
        icon={Calendar}
        badge={{
          text: userProfile?.exam_date
            ? new Date(userProfile.exam_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : 'Unscheduled',
          variant: daysUntilExam > 0 && daysUntilExam <= 30 ? 'amber' : 'zinc',
        }}
      />
    </div>
  );
}
