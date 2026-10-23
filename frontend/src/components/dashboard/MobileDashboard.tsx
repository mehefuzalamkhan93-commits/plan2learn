'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Sparkles,
  Target,
  Settings,
  Calendar,
  Play,
  Check,
  Atom,
  FlaskConical,
  Calculator,
  Code2,
  BookOpen,
  Home,
  Flame,
  MoreHorizontal,
  X,
  Moon,
  Sun,
  LogOut,
  Compass,
  FileText,
  UserRound,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme';
import { useAuth } from '@/hooks/useAuth';
import SettingsModal from '@/components/settings/SettingsModal';
import AppLogo from '@/components/ui/AppLogo';
import LogoutConfirmModal from '@/components/auth/LogoutConfirmModal';
import { useDeviceAwareLogout } from '@/hooks/useDeviceAwareLogout';
import { AuthenticatedUser, UserProfile, TodayTaskOut, StreakOut, PlanItem } from '@/types';

interface MobileDashboardProps {
  user: AuthenticatedUser | null;
  userProfile: UserProfile | null;
  todayTasks: TodayTaskOut[];
  upcomingTasks?: TodayTaskOut[];
  completedTodayMinutes: number;
  totalPlannedTodayMinutes: number;
  daysUntilExam: number;
  streak: StreakOut | null;
  reviewQueueCount: number;
  onRateTask: (task: PlanItem) => void;
}

/**
 * Returns subject-specific icon and theme colors matching the reference design.
 */
function getSubjectTheme(subjectName?: string) {
  const s = (subjectName || '').toLowerCase();
  if (s.includes('physic')) {
    return {
      icon: Atom,
      containerClass: 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400 dark:text-emerald-400 light:text-emerald-700 light:bg-emerald-50 light:border-emerald-200',
    };
  }
  if (s.includes('chem')) {
    return {
      icon: FlaskConical,
      containerClass: 'bg-purple-500/15 border-purple-500/25 text-purple-400 dark:text-purple-400 light:text-purple-700 light:bg-purple-50 light:border-purple-200',
    };
  }
  if (s.includes('math') || s.includes('calc')) {
    return {
      icon: Calculator,
      containerClass: 'bg-amber-500/15 border-amber-500/25 text-amber-400 dark:text-amber-400 light:text-amber-800 light:bg-amber-50 light:border-amber-200',
    };
  }
  if (s.includes('comp') || s.includes('code') || s.includes('cs')) {
    return {
      icon: Code2,
      containerClass: 'bg-blue-500/15 border-blue-500/25 text-blue-400 dark:text-blue-400 light:text-blue-700 light:bg-blue-50 light:border-blue-200',
    };
  }
  return {
    icon: BookOpen,
    containerClass: 'bg-indigo-500/15 border-indigo-500/25 text-indigo-400 dark:text-indigo-400 light:text-indigo-700 light:bg-indigo-50 light:border-indigo-200',
  };
}

/**
 * Format study minutes compactly (e.g. "0m", "45m", "1h 20m").
 */
function formatStudyTime(minutes: number): string {
  if (!minutes || minutes <= 0) return '0m';
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hrs}h ${remainder}m` : `${hrs}h`;
}

export default function MobileDashboard({
  user,
  userProfile,
  todayTasks,
  upcomingTasks = [],
  completedTodayMinutes,
  totalPlannedTodayMinutes,
  daysUntilExam,
  streak,
  reviewQueueCount,
  onRateTask,
}: MobileDashboardProps) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const {
    requestLogout,
    isCheckingDevices,
    showConfirmModal,
    activeDevicesCount,
    confirmLogout,
    cancelLogout,
    isLoggingOut,
  } = useDeviceAwareLogout();

  const [taskTab, setTaskTab] = useState<'today' | 'upcoming'>('today');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'profile' | 'account'>('profile');
  const [showMoreDrawer, setShowMoreDrawer] = useState(false);

  // User name display
  const displayName = user?.full_name || userProfile?.name || 'Mahafuz';
  const firstName = displayName.split(' ')[0] || displayName;
  const userInitial = firstName.charAt(0).toUpperCase() || 'M';

  // Task metrics
  const totalTasksCount = todayTasks.length;
  const completedTasksCount = todayTasks.filter((t) => t.completed).length;
  const remainingTasksCount = Math.max(0, totalTasksCount - completedTasksCount);

  // Formatted date (e.g. "Thu, Oct 22, 2026")
  const currentDateFormatted = format(new Date(), 'EEE, MMM d, yyyy');

  // Next exam badge text (e.g. "Nov 20")
  const examDateBadge = userProfile?.exam_date
    ? format(new Date(userProfile.exam_date), 'MMM d')
    : 'Nov 20';

  // Study time string
  const studyTimeDisplay = formatStudyTime(completedTodayMinutes);

  return (
    <div className="min-h-screen bg-[#070A12] dark:bg-[#070A12] light:bg-[#f8fafc] text-slate-100 dark:text-slate-100 light:text-slate-900 pb-28">
      <div className="mx-auto w-full max-w-md px-4 pt-4 sm:px-6">
        
        {/* ====================================================================
            A. COMPACT TOP HEADER
            - Main heading: "Study Command Center"
            - Profile avatar on upper-right
            - Greeting and remaining task count
            - 3 compact action tiles: AI Assistant, Focus Room, Settings
            - Compact date and "Focus Ready" status row
            ==================================================================== */}
        <header className="space-y-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <AppLogo size="sm" href="/dashboard" priority />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 leading-none mb-0.5">
                  <span className="text-[10px] font-bold tracking-wider uppercase text-indigo-400 dark:text-indigo-400 light:text-indigo-600">Plan2Learn</span>
                </div>
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white dark:text-white light:text-slate-900 truncate">
                  Study Command Center
                </h1>
                <p className="mt-0.5 text-xs font-medium text-zinc-400 dark:text-zinc-400 light:text-slate-500 truncate">
                  Welcome back, {firstName}.
                </p>
                <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                  {totalTasksCount === 0 ? (
                    <span>Ready for a new study session today.</span>
                  ) : remainingTasksCount === 0 ? (
                    <span className="text-emerald-400 dark:text-emerald-400 light:text-emerald-700 font-medium">
                      All {totalTasksCount} tasks completed today!
                    </span>
                  ) : (
                    <span>You have {remainingTasksCount} tasks remaining today.</span>
                  )}
                </p>
              </div>
            </div>

            {/* Profile Avatar */}
            <button
              type="button"
              onClick={() => {
                setSettingsInitialTab('profile');
                setShowSettingsModal(true);
              }}
              aria-label="Open Student Profile"
              className="relative shrink-0 cursor-pointer rounded-full p-0.5 ring-2 ring-purple-500/50 transition-transform active:scale-95"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-sm font-bold text-white shadow-md shadow-purple-600/30">
                {userInitial}
              </div>
              <span
                className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#070A12] dark:ring-[#070A12] light:ring-white"
                aria-hidden="true"
              />
            </button>
          </div>

          {/* Compact Action Shortcut: Focus Room */}
          <div>
            <button
              type="button"
              onClick={() => router.push('/focus')}
              className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200/90 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white px-3.5 py-2 text-xs font-semibold text-zinc-200 dark:text-zinc-200 light:text-slate-800 shadow-xs transition-all hover:border-blue-500/40 active:scale-95 cursor-pointer"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-blue-500/25 bg-blue-500/15 text-blue-400 dark:text-blue-400 light:text-blue-600 light:bg-blue-50 light:border-blue-200">
                <Target className="h-3.5 w-3.5" />
              </div>
              <span>Focus Room</span>
            </button>
          </div>

          {/* Date & Focus Ready Row */}
          <div className="flex items-center justify-between px-0.5 pt-0.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 dark:text-zinc-400 light:text-slate-600">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>{currentDateFormatted}</span>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 dark:bg-emerald-500/10 light:bg-emerald-50 light:border-emerald-200 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400 dark:text-emerald-400 light:text-emerald-700">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              <span>Focus Ready</span>
            </div>
          </div>
        </header>


        {/* ====================================================================
            B. THREE COMPACT SUMMARY CARDS
            - Study Time
            - Current Streak
            - Next Exam (with date badge)
            ==================================================================== */}
        <section className="mt-4 grid grid-cols-3 gap-2 sm:gap-2.5" aria-label="Study metrics summary">
          {/* Card 1: Study Time */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200/90 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white p-2.5 sm:p-3 text-center shadow-xs">
            <span className="text-lg sm:text-xl font-bold tracking-tight text-white dark:text-white light:text-slate-900">
              {studyTimeDisplay}
            </span>
            <span className="mt-0.5 text-[10px] font-medium text-zinc-400 dark:text-zinc-400 light:text-slate-500">
              Study Time
            </span>
          </div>

          {/* Card 2: Current Streak */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200/90 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white p-2.5 sm:p-3 text-center shadow-xs">
            <span className="text-lg sm:text-xl font-bold tracking-tight text-white dark:text-white light:text-slate-900">
              {streak?.current_streak ?? 0}
            </span>
            <span className="mt-0.5 text-[10px] font-medium text-zinc-400 dark:text-zinc-400 light:text-slate-500">
              days <span className="text-zinc-500 dark:text-zinc-500">Streak</span>
            </span>
          </div>

          {/* Card 3: Next Exam */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200/90 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white p-2.5 sm:p-3 text-center shadow-xs">
            <span className="text-lg sm:text-xl font-bold tracking-tight text-white dark:text-white light:text-slate-900">
              {daysUntilExam > 0 ? `D-${daysUntilExam}` : 'D-Day'}
            </span>
            <span className="mt-0.5 text-[10px] font-medium text-zinc-400 dark:text-zinc-400 light:text-slate-500">
              Next Exam
            </span>
            <span className="mt-1 inline-block rounded border border-amber-500/30 bg-amber-500/15 dark:bg-amber-500/15 light:bg-amber-50 dark:border-amber-500/30 light:border-amber-200 px-1.5 py-0.2 font-mono text-[9px] font-semibold text-amber-300 dark:text-amber-300 light:text-amber-800">
              {examDateBadge}
            </span>
          </div>
        </section>


        {/* ====================================================================
            C. STUDY TASKS SECTION (Today & Upcoming Tabs)
            - Toggle between Today and Upcoming tasks
            - Completed/total task count on the right
            - Compact horizontal task rows: subject icon, title, duration, circular play button
            ==================================================================== */}
        <section className="mt-5" aria-labelledby="todays-study-heading">
          <div className="mb-2.5 flex items-center justify-between px-0.5">
            <div className="flex items-center gap-1 bg-white/[0.04] dark:bg-white/[0.04] light:bg-slate-100 p-0.5 rounded-xl border border-white/[0.06] light:border-slate-200">
              <button
                type="button"
                onClick={() => setTaskTab('today')}
                className={cn(
                  'px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                  taskTab === 'today'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-zinc-400 hover:text-white light:text-slate-600'
                )}
              >
                Today ({todayTasks.length})
              </button>
              <button
                type="button"
                onClick={() => setTaskTab('upcoming')}
                className={cn(
                  'px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                  taskTab === 'upcoming'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-zinc-400 hover:text-white light:text-slate-600'
                )}
              >
                Upcoming ({upcomingTasks.length})
              </button>
            </div>
            {taskTab === 'today' && (
              <span className="rounded-full bg-white/[0.05] dark:bg-white/[0.05] light:bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-zinc-400 dark:text-zinc-400 light:text-slate-600">
                {completedTasksCount}/{totalTasksCount}
              </span>
            )}
          </div>

          {taskTab === 'today' ? (
            todayTasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[0.1] dark:border-white/[0.1] light:border-slate-200 bg-[#0e1424]/50 dark:bg-[#0e1424]/50 light:bg-white p-6 text-center shadow-xs">
                <Calendar className="mx-auto mb-2 h-8 w-8 text-indigo-400/60" />
                <p className="text-xs font-semibold text-white dark:text-white light:text-slate-900">
                  No tasks scheduled for today
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                  {upcomingTasks.length > 0
                    ? `You have ${upcomingTasks.length} upcoming study plan ${upcomingTasks.length === 1 ? 'task' : 'tasks'} scheduled.`
                    : 'Add or calibrate your study plan to get personalized daily tasks.'}
                </p>
                <div className="mt-3.5 flex items-center justify-center gap-2">
                  {upcomingTasks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setTaskTab('upcoming')}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-2 text-xs font-semibold text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                    >
                      <span>View Upcoming ({upcomingTasks.length})</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => router.push('/planner')}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 transition-colors hover:bg-indigo-500"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Open Study Planner</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {todayTasks.map((task) => {
                  const subjectName = task.topic?.subject || 'General';
                  const taskTitle = task.topic?.name || task.topic_id;
                  const themeInfo = getSubjectTheme(subjectName);
                  const SubjectIcon = themeInfo.icon;
                  const isCompleted = task.completed;

                  return (
                    <div
                      key={task.id}
                      className={cn(
                        'flex items-center justify-between gap-3 rounded-2xl border p-2.5 sm:p-3 shadow-xs transition-colors',
                        isCompleted
                          ? 'border-white/[0.04] bg-[#0a0f1d]/50 dark:bg-[#0a0f1d]/50 light:bg-slate-50 opacity-75'
                          : 'border-white/[0.08] dark:border-white/[0.08] light:border-slate-200/90 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white hover:border-white/20 dark:hover:border-white/20 light:hover:border-indigo-300'
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                          themeInfo.containerClass
                        )}
                      >
                        <SubjectIcon className="h-5 w-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3
                          className={cn(
                            'truncate text-xs sm:text-[13px] font-semibold',
                            isCompleted
                              ? 'text-zinc-500 line-through dark:text-zinc-500 light:text-slate-400'
                              : 'text-white dark:text-white light:text-slate-900'
                          )}
                          title={taskTitle}
                        >
                          {taskTitle}
                        </h3>
                        <p className="mt-0.5 truncate text-[11px] font-medium text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                          {subjectName} • {task.duration_minutes} min
                        </p>
                      </div>

                      {isCompleted ? (
                        <button
                          type="button"
                          onClick={() => {
                            const planItem: PlanItem = {
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
                              completed: true,
                              priority_tag: task.priority_tag as any,
                            };
                            onRateTask(planItem);
                          }}
                          aria-label={`Completed task: ${taskTitle}`}
                          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 text-emerald-400 dark:text-emerald-400 light:text-emerald-700 light:bg-emerald-100 transition-colors hover:bg-emerald-500/25"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => router.push(`/focus?taskId=${task.id}`)}
                          aria-label={`Start Focus Session for ${taskTitle}`}
                          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-indigo-600 text-white shadow-md shadow-indigo-600/30 transition-transform hover:bg-indigo-500 active:scale-90"
                        >
                          <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            upcomingTasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[0.1] dark:border-white/[0.1] light:border-slate-200 bg-[#0e1424]/50 dark:bg-[#0e1424]/50 light:bg-white p-6 text-center shadow-xs">
                <Calendar className="mx-auto mb-2 h-8 w-8 text-indigo-400/60" />
                <p className="text-xs font-semibold text-white dark:text-white light:text-slate-900">
                  No upcoming tasks scheduled
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                  Use the Study Planner to schedule topics for the upcoming days.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/planner')}
                  className="mt-3.5 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 transition-colors hover:bg-indigo-500"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Open Study Planner</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingTasks.map((task) => {
                  const subjectName = task.topic?.subject || 'General';
                  const taskTitle = task.topic?.name || task.topic_id;
                  const themeInfo = getSubjectTheme(subjectName);
                  const SubjectIcon = themeInfo.icon;
                  const isCompleted = task.completed;

                  return (
                    <div
                      key={task.id}
                      className={cn(
                        'flex items-center justify-between gap-3 rounded-2xl border p-2.5 sm:p-3 shadow-xs transition-colors',
                        isCompleted
                          ? 'border-white/[0.04] bg-[#0a0f1d]/50 dark:bg-[#0a0f1d]/50 light:bg-slate-50 opacity-75'
                          : 'border-white/[0.08] dark:border-white/[0.08] light:border-slate-200/90 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white hover:border-white/20 dark:hover:border-white/20 light:hover:border-indigo-300'
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                          themeInfo.containerClass
                        )}
                      >
                        <SubjectIcon className="h-5 w-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3
                          className={cn(
                            'truncate text-xs sm:text-[13px] font-semibold',
                            isCompleted
                              ? 'text-zinc-500 line-through dark:text-zinc-500 light:text-slate-400'
                              : 'text-white dark:text-white light:text-slate-900'
                          )}
                          title={taskTitle}
                        >
                          {taskTitle}
                        </h3>
                        <p className="mt-0.5 truncate text-[11px] font-medium text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                          <span className="text-indigo-400 font-semibold">{task.scheduled_date}</span> • {subjectName} • {task.duration_minutes} min
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => router.push(`/focus?taskId=${task.id}`)}
                        aria-label={`Start Focus Session for ${taskTitle}`}
                        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-indigo-600 text-white shadow-md shadow-indigo-600/30 transition-transform hover:bg-indigo-500 active:scale-90"
                      >
                        <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </section>

      </div>

      {/* ====================================================================
          D. COMPACT FIXED BOTTOM NAVIGATION
          - Home (active)
          - Planner
          - AI (prominent)
          - Focus
          - More
          ==================================================================== */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed bottom-0 inset-x-0 z-40 block lg:hidden border-t border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-[#070A12]/95 dark:bg-[#070A12]/95 light:bg-white/95 backdrop-blur-xl shadow-lg pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5"
      >
        <div className="mx-auto flex max-w-md items-center justify-around px-2">
          {/* 1. Home (Active) */}
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            aria-current="page"
            className="flex flex-col items-center justify-center gap-1 py-1 px-3 cursor-pointer group"
          >
            <Home className="h-5 w-5 text-indigo-400 dark:text-indigo-400 light:text-indigo-600" />
            <span className="text-[10px] font-bold text-indigo-400 dark:text-indigo-400 light:text-indigo-600">
              Home
            </span>
            <span className="h-1 w-1 rounded-full bg-indigo-400 dark:bg-indigo-400 light:bg-indigo-600 -mt-0.5" />
          </button>

          {/* 2. Planner */}
          <button
            type="button"
            onClick={() => router.push('/planner')}
            className="flex flex-col items-center justify-center gap-1 py-1 px-3 cursor-pointer text-zinc-400 dark:text-zinc-400 light:text-slate-500 hover:text-white dark:hover:text-white light:hover:text-slate-900 transition-colors"
          >
            <Calendar className="h-5 w-5" />
            <span className="text-[10px] font-medium">Planner</span>
            <span className="h-1 w-1 opacity-0 -mt-0.5" />
          </button>

          {/* 3. AI (Center Action) */}
          <button
            type="button"
            onClick={() => router.push('/ai')}
            className="flex flex-col items-center justify-center gap-1 py-1 px-3 cursor-pointer text-zinc-400 dark:text-zinc-400 light:text-slate-500 hover:text-white dark:hover:text-white light:hover:text-slate-900 transition-colors"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md shadow-indigo-600/40 -mt-2.5 ring-4 ring-[#070A12] dark:ring-[#070A12] light:ring-white transition-transform active:scale-95">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="text-[10px] font-medium">AI</span>
            <span className="h-1 w-1 opacity-0 -mt-0.5" />
          </button>

          {/* 4. Focus */}
          <button
            type="button"
            onClick={() => router.push('/focus')}
            className="flex flex-col items-center justify-center gap-1 py-1 px-3 cursor-pointer text-zinc-400 dark:text-zinc-400 light:text-slate-500 hover:text-white dark:hover:text-white light:hover:text-slate-900 transition-colors"
          >
            <Flame className="h-5 w-5" />
            <span className="text-[10px] font-medium">Focus</span>
            <span className="h-1 w-1 opacity-0 -mt-0.5" />
          </button>

          {/* 5. More */}
          <button
            type="button"
            onClick={() => setShowMoreDrawer(true)}
            aria-expanded={showMoreDrawer}
            className="flex flex-col items-center justify-center gap-1 py-1 px-3 cursor-pointer text-zinc-400 dark:text-zinc-400 light:text-slate-500 hover:text-white dark:hover:text-white light:hover:text-slate-900 transition-colors"
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] font-medium">More</span>
            <span className="h-1 w-1 opacity-0 -mt-0.5" />
          </button>
        </div>
      </nav>

      {/* ====================================================================
          E. SLIDE-UP MORE DRAWER (Matches Screen #9 in Showcase)
          - Settings, Roadmap, Intel, Downloads, Profile, Theme Switcher, Logout
          ==================================================================== */}
      {showMoreDrawer && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setShowMoreDrawer(false)}
            aria-hidden="true"
          />

          {/* Sheet Container */}
          <div className="relative z-10 w-full max-w-md mx-auto rounded-t-3xl border-t border-white/[0.1] dark:border-white/[0.1] light:border-slate-200 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white p-5 shadow-2xl animate-slide-up">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-600 dark:bg-zinc-600 light:bg-slate-300" />
            
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] dark:border-white/[0.08] light:border-slate-200">
              <span className="text-sm font-bold text-white dark:text-white light:text-slate-900">
                Menu &amp; Quick Links
              </span>
              <button
                type="button"
                onClick={() => setShowMoreDrawer(false)}
                className="rounded-lg p-1 text-zinc-400 hover:text-white dark:hover:text-white light:text-slate-400 light:hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-1">
              <button
                type="button"
                onClick={() => {
                  setShowMoreDrawer(false);
                  setSettingsInitialTab('account');
                  setShowSettingsModal(true);
                }}
                className="flex w-full items-center justify-between rounded-xl p-3 text-xs font-semibold text-zinc-200 dark:text-zinc-200 light:text-slate-800 hover:bg-white/[0.05] dark:hover:bg-white/[0.05] light:hover:bg-slate-50 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
                    <Settings className="h-4 w-4" />
                  </div>
                  <span>Settings &amp; Preferences</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMoreDrawer(false);
                  setSettingsInitialTab('profile');
                  setShowSettingsModal(true);
                }}
                className="flex w-full items-center justify-between rounded-xl p-3 text-xs font-semibold text-zinc-200 dark:text-zinc-200 light:text-slate-800 hover:bg-white/[0.05] dark:hover:bg-white/[0.05] light:hover:bg-slate-50 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/15 text-purple-400">
                    <User className="h-4 w-4" />
                  </div>
                  <span>Student Profile</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMoreDrawer(false);
                  router.push('/planner');
                }}
                className="flex w-full items-center justify-between rounded-xl p-3 text-xs font-semibold text-zinc-200 dark:text-zinc-200 light:text-slate-800 hover:bg-white/[0.05] dark:hover:bg-white/[0.05] light:hover:bg-slate-50 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/15 text-purple-400">
                    <Compass className="h-4 w-4" />
                  </div>
                  <span>Study Roadmap</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMoreDrawer(false);
                  router.push('/ai?tab=intel');
                }}
                className="flex w-full items-center justify-between rounded-xl p-3 text-xs font-semibold text-zinc-200 dark:text-zinc-200 light:text-slate-800 hover:bg-white/[0.05] dark:hover:bg-white/[0.05] light:hover:bg-slate-50 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
                    <FileText className="h-4 w-4" />
                  </div>
                  <span>Academic Intel</span>
                </div>
              </button>

              {/* Theme Toggle in More Menu */}
              <div className="flex w-full items-center justify-between rounded-xl p-3 text-xs font-semibold text-zinc-200 dark:text-zinc-200 light:text-slate-800 border-t border-white/[0.06] dark:border-white/[0.06] light:border-slate-200 mt-2 pt-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                    {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  </div>
                  <span>Theme: {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                </div>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="rounded-lg border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-white/[0.05] dark:bg-white/[0.05] light:bg-slate-100 px-3 py-1.5 text-[11px] font-medium text-white dark:text-white light:text-slate-800 transition-colors"
                >
                  Switch
                </button>
              </div>

              {/* Logout */}
              <button
                type="button"
                onClick={() => {
                  setShowMoreDrawer(false);
                  requestLogout();
                }}
                disabled={isLoggingOut || isCheckingDevices}
                className="flex w-full items-center justify-between rounded-xl p-3 text-xs font-semibold text-rose-400 dark:text-rose-400 light:text-rose-600 hover:bg-rose-500/10 cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/15 text-rose-400">
                    <LogOut className="h-4 w-4" />
                  </div>
                  <span>{isCheckingDevices ? 'Checking sessions…' : 'Logout'}</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          initialTab={settingsInitialTab}
        />
      )}

      {/* Device-Aware Logout Confirmation Modal */}
      <LogoutConfirmModal
        isOpen={showConfirmModal}
        onClose={cancelLogout}
        onConfirm={confirmLogout}
        activeDevicesCount={activeDevicesCount}
      />
    </div>
  );
}
