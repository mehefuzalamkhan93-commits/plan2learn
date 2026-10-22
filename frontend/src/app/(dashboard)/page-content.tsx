'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { usePlannerStore } from '@/store/usePlannerStore';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import KpiGrid from '@/components/dashboard/KpiGrid';
import StudySchedule from '@/components/dashboard/StudySchedule';
import ReviewQueue from '@/components/dashboard/ReviewQueue';
import PomodoroStation from '@/components/dashboard/PomodoroStation';
import MasteryPanel from '@/components/dashboard/MasteryPanel';
import StreakWidget from '@/components/streak/StreakWidget';
import StudyResources from '@/components/recommendations/StudyResources';
import ConfidenceSlider from '@/components/slider/ConfidenceSlider';
import MobileDashboard from '@/components/dashboard/MobileDashboard';
import { useAuth } from '@/hooks/useAuth';
import { PlanItem, TodayTaskOut, ReviewItemOut } from '@/types';
import { pageContainerVariants } from '@/lib/motion';

export default function DashboardPage() {
  const { user } = useAuth();
  const {
    userProfile,
    todayTasks,
    upcomingTasks,
    streak,
    readinessScore,
    reviewQueue,
    exams,
    markTaskComplete,
    fetchDashboardSummary,
    isDashboardLoaded,
    activePlanVersionId,
    totalPlannedTodayMinutes,
    completedTodayMinutes,
  } = usePlannerStore();

  const [ratingTopic, setRatingTopic] = useState<{ id: string; name: string } | null>(null);

  // Fetch dashboard data on mount
  useEffect(() => {
    fetchDashboardSummary();
  }, [fetchDashboardSummary]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todaySchedule = todayTasks; // Already filtered for today
  const totalPlannedMinutesCalc = todaySchedule.reduce((sum, task) => sum + task.duration_minutes, 0);
  const completedMinutesCalc = todaySchedule
    .filter((task) => task.completed)
    .reduce((sum, task) => sum + task.duration_minutes, 0);
  const daysUntilExam = userProfile?.exam_date
    ? Math.max(
        0,
        Math.ceil(
          (new Date(userProfile.exam_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  const handleRateTask = (task: PlanItem) => {
    // Find the corresponding TodayTaskOut to get the full topic info
    const todayTask = todayTasks.find((t) => t.id === task.id);
    const taskName = todayTask?.topic?.name || task.topic?.name || task.topic_id;
    setRatingTopic({ id: task.id, name: taskName });
  };

  const handleSelectReview = (item: ReviewItemOut) => {
    setRatingTopic({ id: item.id, name: item.topic_name });
  };

  const handleConfidenceSubmit = () => {
    if (ratingTopic) {
      markTaskComplete(ratingTopic.id);
      setRatingTopic(null);
    }
  };

  // Convert TodayTaskOut to PlanItem format for StudySchedule component
  const scheduleForComponents: PlanItem[] = todaySchedule.map((task) => ({
    id: task.id,
    topic_id: task.topic_id,
    topic: {
      id: task.topic?.id || task.topic_id,
      subject: task.topic?.subject || 'Unknown',
      name: task.topic?.name || task.topic_id,
      priority: 'HIGH',
      difficulty: task.topic?.difficulty || 3,
      confidence_score: 3,
    },
    scheduled_date: task.scheduled_date,
    scheduled_time: task.scheduled_time,
    duration_minutes: task.duration_minutes,
    completed: task.completed,
    priority_tag: task.priority_tag as 'High' | 'Weak Area' | 'Spaced Revision' | 'Regular',
  }));

  // Show loading state while fetching
  if (!isDashboardLoaded) {
    return (
      <div className="relative min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 overflow-x-hidden">
        <div
          className="relative z-10 mx-auto min-h-screen flex items-center justify-center px-4 animate-fade-in"
          style={{ width: 'min(calc(100vw - 56px), 1840px)' }}
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-400/30 border-t-indigo-400" />
            <p className="text-zinc-600 dark:text-zinc-300 font-medium text-sm">Loading your study dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  // Derive subject mastery from real scheduled and completed tasks
  const allTasks = [...todayTasks, ...upcomingTasks];
  const subjectMap = allTasks.reduce((acc, t) => {
    const subj = t.topic?.subject || 'General';
    if (!acc[subj]) acc[subj] = { total: 0, completed: 0 };
    acc[subj].total += 1;
    if (t.completed) acc[subj].completed += 1;
    return acc;
  }, {} as Record<string, { total: number; completed: number }>);

  const masterySubjects = Object.entries(subjectMap).map(([subject, stats]) => ({
    subject,
    percentage: Math.round((stats.completed / stats.total) * 100),
  }));

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 overflow-x-hidden">
      {/* ===== MOBILE DASHBOARD (< 1024px, matches Screen #3 in UI Showcase) ===== */}
      <div className="block lg:hidden">
        <MobileDashboard
          user={user}
          userProfile={userProfile}
          todayTasks={todaySchedule}
          completedTodayMinutes={completedMinutesCalc}
          totalPlannedTodayMinutes={totalPlannedMinutesCalc}
          daysUntilExam={daysUntilExam}
          streak={streak}
          reviewQueueCount={reviewQueue.length}
          onRateTask={handleRateTask}
        />
      </div>

      {/* ===== DESKTOP DASHBOARD (>= 1024px, 100% UNCHANGED) ===== */}
      <div
        className="hidden lg:block relative z-10 w-full max-w-[1840px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 py-6 sm:py-8 lg:py-9 xl:py-10 space-y-7 sm:space-y-8 xl:space-y-10 animate-fade-in"
      >
        <DashboardHeader
          userName={user?.full_name || userProfile?.name || 'Student'}
          tasksCount={todaySchedule.length}
          completedTasksCount={todaySchedule.filter((task) => task.completed).length}
          reviewsDueCount={reviewQueue.length}
        />
        <KpiGrid
          userProfile={userProfile}
          schedule={scheduleForComponents}
          completedMinutes={completedMinutesCalc}
          totalPlannedMinutes={totalPlannedMinutesCalc}
          daysUntilExam={daysUntilExam}
          streakCount={streak?.current_streak ?? 0}
          retentionPercent={readinessScore?.probability ?? 0}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-7 xl:gap-8 2xl:gap-10 items-start">
          <main className="lg:col-span-8 xl:col-span-8 space-y-7 xl:space-y-8">
            <StudySchedule onRateTask={handleRateTask} schedule={scheduleForComponents} />
            <ReviewQueue onSelectReview={handleSelectReview} items={reviewQueue} />
            <StudyResources />
          </main>
          <aside className="lg:col-span-4 xl:col-span-4 space-y-7 xl:space-y-8">
            <PomodoroStation />
            <MasteryPanel subjects={masterySubjects} />
            <StreakWidget streak={streak} />
          </aside>
        </div>
      </div>

      <AnimatePresence>
        {ratingTopic && (
          <ConfidenceSlider
            topicName={ratingTopic.name}
            onSubmit={handleConfidenceSubmit}
            onClose={() => setRatingTopic(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}