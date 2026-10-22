'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO, isToday, addDays } from 'date-fns';
import {
  Share2,
  Plus,
  Calendar,
  Clock,
  Check,
  Atom,
  FlaskConical,
  Calculator,
  Code2,
  BookOpen,
  X,
  Loader2,
  Sparkles,
  ChevronRight,
  Flame,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme';
import { plannerAPI, dashboardAPI } from '@/services/api';
import { StudyTaskDetailOut, CreateTaskRequest, DashboardSummary } from '@/types';
import MobileBottomNav from '@/components/navigation/MobileBottomNav';

interface MobilePlannerProps {
  initialSummary?: DashboardSummary | null;
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
      badgeClass: 'bg-emerald-500/10 text-emerald-400 dark:text-emerald-400 light:bg-emerald-50 light:text-emerald-700 border-emerald-500/20',
    };
  }
  if (s.includes('chem')) {
    return {
      icon: FlaskConical,
      containerClass: 'bg-purple-500/15 border-purple-500/25 text-purple-400 dark:text-purple-400 light:text-purple-700 light:bg-purple-50 light:border-purple-200',
      badgeClass: 'bg-purple-500/10 text-purple-400 dark:text-purple-400 light:bg-purple-50 light:text-purple-700 border-purple-500/20',
    };
  }
  if (s.includes('math') || s.includes('calc')) {
    return {
      icon: Calculator,
      containerClass: 'bg-amber-500/15 border-amber-500/25 text-amber-400 dark:text-amber-400 light:text-amber-800 light:bg-amber-50 light:border-amber-200',
      badgeClass: 'bg-amber-500/10 text-amber-400 dark:text-amber-400 light:bg-amber-50 light:text-amber-800 border-amber-500/20',
    };
  }
  if (s.includes('comp') || s.includes('code') || s.includes('cs')) {
    return {
      icon: Code2,
      containerClass: 'bg-blue-500/15 border-blue-500/25 text-blue-400 dark:text-blue-400 light:text-blue-700 light:bg-blue-50 light:border-blue-200',
      badgeClass: 'bg-blue-500/10 text-blue-400 dark:text-blue-400 light:bg-blue-50 light:text-blue-700 border-blue-500/20',
    };
  }
  return {
    icon: BookOpen,
    containerClass: 'bg-indigo-500/15 border-indigo-500/25 text-indigo-400 dark:text-indigo-400 light:text-indigo-700 light:bg-indigo-50 light:border-indigo-200',
    badgeClass: 'bg-indigo-500/10 text-indigo-400 dark:text-indigo-400 light:bg-indigo-50 light:text-indigo-700 border-indigo-500/20',
  };
}

export default function MobilePlanner({ initialSummary }: MobilePlannerProps) {
  const router = useRouter();
  const { theme } = useTheme();

  const [activeTab, setActiveTab] = useState<'today' | 'week' | 'subjects'>('today');
  const [tasks, setTasks] = useState<StudyTaskDetailOut[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Add Task Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSubject, setNewSubject] = useState('Physics');
  const [newDate, setNewDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newTime, setNewTime] = useState('09:00');
  const [newDuration, setNewDuration] = useState(60);
  const [newPriority, setNewPriority] = useState('Regular');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch all tasks from backend
  const loadTasks = async () => {
    setIsLoading(true);
    try {
      const data = await plannerAPI.getTasks();
      if (Array.isArray(data) && data.length > 0) {
        setTasks(data);
      } else if (initialSummary) {
        // Fallback to initialSummary tasks
        const combined: StudyTaskDetailOut[] = [
          ...initialSummary.today_tasks.map((t) => ({
            id: t.id,
            plan_version_id: t.plan_version_id,
            user_id: t.user_id,
            topic_id: t.topic_id,
            topic_name: t.topic?.name || 'Study Task',
            subject: t.topic?.subject || 'General',
            scheduled_date: t.scheduled_date,
            scheduled_time: t.scheduled_time || '09:00',
            duration_minutes: t.duration_minutes || 60,
            completed: t.completed,
            priority_tag: t.priority_tag || 'Regular',
            created_at: t.created_at,
          })),
          ...initialSummary.upcoming_tasks.map((t) => ({
            id: t.id,
            plan_version_id: t.plan_version_id,
            user_id: t.user_id,
            topic_id: t.topic_id,
            topic_name: t.topic?.name || 'Study Task',
            subject: t.topic?.subject || 'General',
            scheduled_date: t.scheduled_date,
            scheduled_time: t.scheduled_time || '10:00',
            duration_minutes: t.duration_minutes || 60,
            completed: t.completed,
            priority_tag: t.priority_tag || 'Regular',
            created_at: t.created_at,
          })),
        ];
        setTasks(combined);
      }
    } catch (err) {
      console.error('Failed to load planner tasks:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  // Show temporary toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Toggle task completion
  const handleToggleTask = async (taskId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
    );
    try {
      await plannerAPI.toggleTask(taskId);
      showToast('Task status updated.');
    } catch (err) {
      console.error('Failed to toggle task:', err);
      // Revert on error
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
      );
      showToast('Failed to update task.');
    }
  };

  // Add Task submit
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setSubmitError('Please enter a task title.');
      return;
    }
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const created = await plannerAPI.createTask({
        title: newTitle.trim(),
        subject: newSubject.trim(),
        scheduled_date: newDate,
        scheduled_time: newTime,
        duration_minutes: Number(newDuration),
        priority_tag: newPriority,
      });
      setTasks((prev) => [...prev, created].sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time)));
      setShowAddModal(false);
      setNewTitle('');
      showToast('Task added to your study plan!');
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to save task. Please try again.';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Share action
  const handleShare = async () => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayList = tasks.filter((t) => t.scheduled_date === todayStr);
    const text = `My Plan2Learn Plan (${format(new Date(), 'MMM d, yyyy')}):\n` +
      todayList.map((t) => `• [${t.scheduled_time}] ${t.topic_name} (${t.subject})`).join('\n');

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My Plan2Learn Plan',
          text,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      showToast('Plan summary copied to clipboard!');
    } else {
      showToast('Study Plan Ready!');
    }
  };

  // Filtering for Today
  const todayDateStr = format(new Date(), 'yyyy-MM-dd');
  const todayTasks = tasks.filter((t) => t.scheduled_date === todayDateStr);
  const sortedTodayTasks = [...todayTasks].sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));

  // Filtering for This Week
  const weekTasks = tasks.filter((t) => {
    // Tasks within next 7 days
    const diff = (new Date(t.scheduled_date).getTime() - new Date(todayDateStr).getTime()) / (1000 * 3600 * 24);
    return diff >= 0 && diff < 7;
  });

  // Grouping for This Week by date
  const weekGroupedByDate = weekTasks.reduce((acc, task) => {
    const d = task.scheduled_date;
    if (!acc[d]) acc[d] = [];
    acc[d].push(task);
    return acc;
  }, {} as Record<string, StudyTaskDetailOut[]>);

  const sortedWeekDates = Object.keys(weekGroupedByDate).sort();

  // Grouping for Subjects tab
  const subjectsMap = tasks.reduce((acc, task) => {
    const s = task.subject || 'General';
    if (!acc[s]) acc[s] = [];
    acc[s].push(task);
    return acc;
  }, {} as Record<string, StudyTaskDetailOut[]>);

  const subjectNames = Object.keys(subjectsMap).sort();

  return (
    <div className="min-h-screen bg-[#070A12] dark:bg-[#070A12] light:bg-[#f8fafc] text-slate-100 dark:text-slate-100 light:text-slate-900 pb-28">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 inset-x-0 z-50 flex justify-center px-4 animate-fade-in pointer-events-none">
          <div className="rounded-xl border border-indigo-500/30 bg-[#0e1424]/95 dark:bg-[#0e1424]/95 light:bg-white/95 px-4 py-2.5 text-xs font-semibold text-white dark:text-white light:text-slate-900 shadow-xl backdrop-blur-md">
            {toastMessage}
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-md px-4 pt-4 sm:px-6">
        
        {/* ====================================================================
            1. COMPACT HEADER (Matches Screen #7 in Showcase)
            - Title: "My Plan"
            - Top-right Share action button
            ==================================================================== */}
        <header className="flex items-center justify-between gap-3 pb-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white dark:text-white light:text-slate-900">
              My Plan
            </h1>
            <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-500">
              {format(new Date(), 'EEEE, MMMM d')}
            </p>
          </div>

          <button
            type="button"
            onClick={handleShare}
            aria-label="Share Study Plan"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200/90 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white text-zinc-300 dark:text-zinc-300 light:text-slate-600 shadow-xs transition-colors hover:border-indigo-500/40 hover:text-white active:scale-95 cursor-pointer"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </header>

        {/* ====================================================================
            2. THREE SEGMENTED TABS (Today | This Week | Subjects)
            ==================================================================== */}
        <div className="mt-1 flex items-center justify-between rounded-2xl border border-white/[0.06] dark:border-white/[0.06] light:border-slate-200 bg-[#0e1424]/80 dark:bg-[#0e1424]/80 light:bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('today')}
            className={cn(
              'flex-1 py-1.5 text-center text-xs font-semibold rounded-xl transition-all cursor-pointer',
              activeTab === 'today'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-zinc-400 dark:text-zinc-400 light:text-slate-600 hover:text-white dark:hover:text-white light:hover:text-slate-900'
            )}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('week')}
            className={cn(
              'flex-1 py-1.5 text-center text-xs font-semibold rounded-xl transition-all cursor-pointer',
              activeTab === 'week'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-zinc-400 dark:text-zinc-400 light:text-slate-600 hover:text-white dark:hover:text-white light:hover:text-slate-900'
            )}
          >
            This Week
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('subjects')}
            className={cn(
              'flex-1 py-1.5 text-center text-xs font-semibold rounded-xl transition-all cursor-pointer',
              activeTab === 'subjects'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-zinc-400 dark:text-zinc-400 light:text-slate-600 hover:text-white dark:hover:text-white light:hover:text-slate-900'
            )}
          >
            Subjects
          </button>
        </div>

        {/* ====================================================================
            3. TAB CONTENT
            ==================================================================== */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-400 light:text-slate-500">
              Loading your study schedule…
            </p>
          </div>
        ) : (
          <div className="mt-5">
            {/* -------------------------------------------------------------
                TAB 1: TODAY (Exact Vertical Schedule Timeline from Screen #7)
                ------------------------------------------------------------- */}
            {activeTab === 'today' && (
              <div>
                {sortedTodayTasks.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/[0.1] dark:border-white/[0.1] light:border-slate-200 bg-[#0e1424]/50 dark:bg-[#0e1424]/50 light:bg-white p-6 text-center shadow-xs">
                    <Calendar className="mx-auto mb-2 h-7 w-7 text-indigo-400/60" />
                    <p className="text-xs font-semibold text-white dark:text-white light:text-slate-900">
                      No tasks scheduled for today
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                      Tap &quot;+ Add Task&quot; below to add a new study session to today&apos;s timeline.
                    </p>
                  </div>
                ) : (
                  <div className="relative pl-0 w-full min-w-0">
                    {/* Vertical Timeline List */}
                    <div className="space-y-4 w-full min-w-0">
                      {sortedTodayTasks.map((task, idx) => {
                        const isCompleted = task.completed;
                        const subjectTheme = getSubjectTheme(task.subject);

                        return (
                          <div key={task.id} className="flex items-start gap-2 sm:gap-2.5 group w-full min-w-0">
                            {/* Time Label (Left) */}
                            <div className="w-10 sm:w-11 pt-2.5 text-right font-mono text-[10px] sm:text-xs font-semibold text-zinc-400 dark:text-zinc-400 light:text-slate-500 shrink-0">
                              {task.scheduled_time}
                            </div>

                            {/* Timeline Column: Node dot + line */}
                            <div className="relative flex flex-col items-center self-stretch shrink-0">
                              {/* Node Circle */}
                              <div
                                className={cn(
                                  'mt-3.5 h-2.5 w-2.5 rounded-full ring-4 transition-transform group-hover:scale-125',
                                  isCompleted
                                    ? 'bg-emerald-400 ring-emerald-400/20'
                                    : 'bg-indigo-500 ring-[#070A12] dark:ring-[#070A12] light:ring-[#f8fafc]'
                                )}
                              />
                              {/* Connecting Line (if not last item) */}
                              {idx < sortedTodayTasks.length - 1 && (
                                <div className="w-0.5 flex-1 bg-white/[0.08] dark:bg-white/[0.08] light:bg-slate-200 -mb-1 mt-1" />
                              )}
                            </div>

                            {/* Task Card (Right) */}
                            <div
                              onClick={() => router.push(`/focus?taskId=${task.id}`)}
                              className={cn(
                                'flex-1 min-w-0 flex items-center justify-between gap-2.5 rounded-2xl border p-2.5 sm:p-3 shadow-xs transition-all cursor-pointer',
                                isCompleted
                                  ? 'border-white/[0.04] bg-[#0a0f1d]/50 dark:bg-[#0a0f1d]/50 light:bg-slate-50 opacity-75'
                                  : 'border-white/[0.08] dark:border-white/[0.08] light:border-slate-200/90 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white hover:border-indigo-500/40 hover:shadow-md'
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <h3
                                  className={cn(
                                    'truncate text-xs sm:text-[13px] font-semibold tracking-tight',
                                    isCompleted
                                      ? 'text-zinc-500 line-through dark:text-zinc-500 light:text-slate-400'
                                      : 'text-white dark:text-white light:text-slate-900'
                                  )}
                                  title={task.topic_name}
                                >
                                  {task.topic_name}
                                </h3>
                                <div className="mt-1 flex items-center gap-2 text-[11px] font-medium text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                                  <span>{task.subject}</span>
                                  <span>•</span>
                                  <span>{task.duration_minutes}m</span>
                                  {task.priority_tag && task.priority_tag !== 'Regular' && (
                                    <span
                                      className={cn(
                                        'rounded border px-1.5 py-0.2 text-[9px] font-semibold',
                                        subjectTheme.badgeClass
                                      )}
                                    >
                                      {task.priority_tag}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Small Circular Completion Indicator */}
                              <button
                                type="button"
                                onClick={(e) => handleToggleTask(task.id, e)}
                                aria-label={isCompleted ? 'Mark task incomplete' : 'Mark task complete'}
                                className={cn(
                                  'flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-all active:scale-90',
                                  isCompleted
                                    ? 'border-emerald-500 bg-emerald-500 text-white shadow-xs shadow-emerald-500/30'
                                    : 'border-zinc-500/50 dark:border-zinc-500/50 light:border-slate-300 hover:border-indigo-400 hover:bg-indigo-500/10'
                                )}
                              >
                                {isCompleted && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* -------------------------------------------------------------
                TAB 2: THIS WEEK
                ------------------------------------------------------------- */}
            {activeTab === 'week' && (
              <div className="space-y-4">
                {sortedWeekDates.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/[0.1] dark:border-white/[0.1] light:border-slate-200 bg-[#0e1424]/50 dark:bg-[#0e1424]/50 light:bg-white p-6 text-center shadow-xs">
                    <Calendar className="mx-auto mb-2 h-7 w-7 text-indigo-400/60" />
                    <p className="text-xs font-semibold text-white dark:text-white light:text-slate-900">
                      No tasks scheduled this week
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                      Use &quot;+ Add Task&quot; below to plan upcoming study sessions.
                    </p>
                  </div>
                ) : (
                  sortedWeekDates.map((dateStr) => {
                    const dayTasks = weekGroupedByDate[dateStr] || [];
                    const parsedDate = parseISO(dateStr);
                    const isTodayDate = dateStr === todayDateStr;

                    return (
                      <div key={dateStr} className="space-y-2">
                        {/* Day Group Header */}
                        <div className="flex items-center justify-between px-1">
                          <span
                            className={cn(
                              'text-xs font-bold',
                              isTodayDate
                                ? 'text-indigo-400 dark:text-indigo-400 light:text-indigo-600'
                                : 'text-zinc-300 dark:text-zinc-300 light:text-slate-700'
                            )}
                          >
                            {isTodayDate ? 'Today — ' : ''}
                            {format(parsedDate, 'EEEE, MMM d')}
                          </span>
                          <span className="rounded-full bg-white/[0.05] dark:bg-white/[0.05] light:bg-slate-200 px-2 py-0.5 text-[10px] font-mono font-semibold text-zinc-400 dark:text-zinc-400 light:text-slate-600">
                            {dayTasks.filter((t) => t.completed).length}/{dayTasks.length}
                          </span>
                        </div>

                        {/* Day's Tasks */}
                        <div className="space-y-1.5">
                          {dayTasks.map((task) => (
                            <div
                              key={task.id}
                              onClick={() => router.push(`/focus?taskId=${task.id}`)}
                              className={cn(
                                'flex items-center justify-between gap-3 rounded-2xl border p-2.5 sm:p-3 shadow-xs transition-colors cursor-pointer',
                                task.completed
                                  ? 'border-white/[0.04] bg-[#0a0f1d]/50 dark:bg-[#0a0f1d]/50 light:bg-slate-50 opacity-75'
                                  : 'border-white/[0.08] dark:border-white/[0.08] light:border-slate-200/90 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white hover:border-indigo-500/40'
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <h4
                                  className={cn(
                                    'truncate text-xs font-semibold',
                                    task.completed
                                      ? 'text-zinc-500 line-through dark:text-zinc-500 light:text-slate-400'
                                      : 'text-white dark:text-white light:text-slate-900'
                                  )}
                                >
                                  {task.topic_name}
                                </h4>
                                <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                                  {task.scheduled_time} • {task.subject} • {task.duration_minutes}m
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => handleToggleTask(task.id, e)}
                                className={cn(
                                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all active:scale-90',
                                  task.completed
                                    ? 'border-emerald-500 bg-emerald-500 text-white'
                                    : 'border-zinc-500/50 dark:border-zinc-500/50 light:border-slate-300'
                                )}
                              >
                                {task.completed && <Check className="h-3 w-3 stroke-[3]" />}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* -------------------------------------------------------------
                TAB 3: SUBJECTS
                ------------------------------------------------------------- */}
            {activeTab === 'subjects' && (
              <div className="space-y-3">
                {subjectNames.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/[0.1] dark:border-white/[0.1] light:border-slate-200 bg-[#0e1424]/50 dark:bg-[#0e1424]/50 light:bg-white p-6 text-center shadow-xs">
                    <BookOpen className="mx-auto mb-2 h-7 w-7 text-indigo-400/60" />
                    <p className="text-xs font-semibold text-white dark:text-white light:text-slate-900">
                      No subjects recorded
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                      Add study tasks to categorize them by subject.
                    </p>
                  </div>
                ) : (
                  subjectNames.map((subjectName) => {
                    const subjTasks = subjectsMap[subjectName] || [];
                    const completedCount = subjTasks.filter((t) => t.completed).length;
                    const totalCount = subjTasks.length;
                    const percent = Math.round((completedCount / totalCount) * 100);
                    const themeInfo = getSubjectTheme(subjectName);
                    const SubjectIcon = themeInfo.icon;

                    return (
                      <div
                        key={subjectName}
                        className="rounded-2xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200/90 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white p-3.5 shadow-xs"
                      >
                        <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-white/[0.06] dark:border-white/[0.06] light:border-slate-100">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={cn(
                                'flex h-8 w-8 items-center justify-center rounded-xl border',
                                themeInfo.containerClass
                              )}
                            >
                              <SubjectIcon className="h-4 w-4" />
                            </div>
                            <div>
                              <h3 className="text-xs sm:text-sm font-bold text-white dark:text-white light:text-slate-900">
                                {subjectName}
                              </h3>
                              <p className="text-[10px] text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                                {completedCount} of {totalCount} tasks completed
                              </p>
                            </div>
                          </div>

                          <span className="font-mono text-xs font-bold text-indigo-400 dark:text-indigo-400 light:text-indigo-600">
                            {percent}%
                          </span>
                        </div>

                        {/* Subject's Task items */}
                        <div className="mt-2.5 space-y-1.5">
                          {subjTasks.slice(0, 5).map((t) => (
                            <div
                              key={t.id}
                              className="flex items-center justify-between gap-2 py-1 text-xs"
                            >
                              <span
                                className={cn(
                                  'truncate max-w-[200px] text-[11px]',
                                  t.completed
                                    ? 'text-zinc-500 line-through dark:text-zinc-500 light:text-slate-400'
                                    : 'text-zinc-300 dark:text-zinc-300 light:text-slate-700'
                                )}
                              >
                                {t.topic_name}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-500">
                                {t.scheduled_date}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ====================================================================
                4. PROMINENT FULL-WIDTH "+ Add Task" BUTTON (Matches Screen #7)
                ==================================================================== */}
            <div className="mt-5">
              <button
                type="button"
                onClick={() => {
                  setSubmitError(null);
                  setShowAddModal(true);
                }}
                className="w-full py-3.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
              >
                <Plus className="h-4 w-4 stroke-[2.5]" />
                <span>+ Add Task</span>
              </button>
            </div>

          </div>
        )}

      </div>

      {/* ====================================================================
          5. ADD TASK MODAL / BOTTOM SHEET
          ==================================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-4">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => !isSubmitting && setShowAddModal(false)}
            aria-hidden="true"
          />

          {/* Modal Container */}
          <div className="relative z-10 w-full max-w-md rounded-t-3xl sm:rounded-3xl border-t sm:border border-white/[0.1] dark:border-white/[0.1] light:border-slate-200 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white p-5 shadow-2xl animate-slide-up">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-600 dark:bg-zinc-600 light:bg-slate-300 sm:hidden" />

            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] dark:border-white/[0.08] light:border-slate-200">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
                  <Plus className="h-4 w-4" />
                </div>
                <h2 className="text-sm font-bold text-white dark:text-white light:text-slate-900">
                  Add Study Task
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                disabled={isSubmitting}
                className="rounded-lg p-1 text-zinc-400 hover:text-white dark:hover:text-white light:text-slate-400 light:hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {submitError && (
              <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-400">
                {submitError}
              </div>
            )}

            <form onSubmit={handleCreateTask} className="mt-4 space-y-3.5">
              {/* Task Title */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 dark:text-zinc-300 light:text-slate-700 mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Electromagnetic Induction Numerical Drill"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-white/[0.04] dark:bg-white/[0.04] light:bg-slate-50 px-3 py-2 text-xs text-white dark:text-white light:text-slate-900 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Subject */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 dark:text-zinc-300 light:text-slate-700 mb-1">
                    Subject *
                  </label>
                  <select
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    className="w-full rounded-xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-[#0e1424] dark:bg-[#0e1424] light:bg-slate-50 px-3 py-2 text-xs text-white dark:text-white light:text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="Physics">Physics</option>
                    <option value="Chemistry">Chemistry</option>
                    <option value="Mathematics">Mathematics</option>
                    <option value="Computer Science">Computer Science</option>
                    <option value="General">General</option>
                  </select>
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-xs font-medium text-zinc-300 dark:text-zinc-300 light:text-slate-700 mb-1">
                    Priority
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="w-full rounded-xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-[#0e1424] dark:bg-[#0e1424] light:bg-slate-50 px-3 py-2 text-xs text-white dark:text-white light:text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="Regular">Regular</option>
                    <option value="Weak Area">Weak Area</option>
                    <option value="Spaced Revision">Spaced Revision</option>
                    <option value="Exam Prep">Exam Prep</option>
                  </select>
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 dark:text-zinc-300 light:text-slate-700 mb-1">
                    Scheduled Date
                  </label>
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full rounded-xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-[#0e1424] dark:bg-[#0e1424] light:bg-slate-50 px-3 py-2 text-xs text-white dark:text-white light:text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 dark:text-zinc-300 light:text-slate-700 mb-1">
                    Time (e.g. 09:00)
                  </label>
                  <input
                    type="time"
                    required
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full rounded-xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-[#0e1424] dark:bg-[#0e1424] light:bg-slate-50 px-3 py-2 text-xs text-white dark:text-white light:text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 dark:text-zinc-300 light:text-slate-700 mb-1">
                  Duration (minutes)
                </label>
                <div className="flex gap-2">
                  {[30, 45, 60, 80, 90].map((dur) => (
                    <button
                      key={dur}
                      type="button"
                      onClick={() => setNewDuration(dur)}
                      className={cn(
                        'flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-colors',
                        newDuration === dur
                          ? 'border-indigo-500 bg-indigo-500/20 text-indigo-400'
                          : 'border-white/[0.08] dark:border-white/[0.08] light:border-slate-300 text-zinc-400 dark:text-zinc-400 light:text-slate-600'
                      )}
                    >
                      {dur}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={isSubmitting}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white dark:hover:text-white light:text-slate-600 light:hover:text-slate-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Saving…</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      <span>Save Task</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          6. FIXED BOTTOM NAVIGATION (Planner Active)
          ==================================================================== */}
      <MobileBottomNav active="planner" />
    </div>
  );
}
