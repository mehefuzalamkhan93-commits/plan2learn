'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
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
  Edit2,
  Trash2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme';
import { StudyTaskDetailOut, DashboardSummary } from '@/types';
import { usePlannerStore } from '@/store/usePlannerStore';
import { useAuth } from '@/hooks/useAuth';
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

const DEFAULT_SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Computer Science', 'General'];

export default function MobilePlanner({ initialSummary }: MobilePlannerProps) {
  const router = useRouter();
  const { theme } = useTheme();

  const {
    allTasks,
    isLoadingTasks,
    taskError,
    fetchAllTasks,
    createTask,
    updateTask,
    deleteTask,
    toggleTaskComplete,
    userProfile,
    fetchUserProfile,
  } = usePlannerStore();

  const [activeTab, setActiveTab] = useState<'today' | 'week' | 'subjects'>('today');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Add / Edit Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<StudyTaskDetailOut | null>(null);

  const [taskTitle, setTaskTitle] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [scheduledDate, setScheduledDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [priorityTag, setPriorityTag] = useState('Regular');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  const { user, status } = useAuth();

  // On mount: fetch tasks and user profile from backend only when authenticated
  useEffect(() => {
    if (status === 'authenticated' && user) {
      fetchAllTasks().catch(() => {});
      if (!userProfile) {
        fetchUserProfile().catch(() => {});
      }
    }
  }, [status, user, fetchAllTasks, fetchUserProfile, userProfile]);

  // Derived subjects from user profile or fallback defaults
  const availableSubjects = useMemo(() => {
    if (userProfile?.target_subjects && userProfile.target_subjects.length > 0) {
      const set = new Set([...userProfile.target_subjects, 'General']);
      return Array.from(set);
    }
    return DEFAULT_SUBJECTS;
  }, [userProfile]);

  // Toast feedback
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Open modal in Create mode
  const openCreateModal = () => {
    setEditingTask(null);
    setTaskTitle('');
    setSelectedSubject(availableSubjects[0] || 'General');
    setCustomSubject('');
    setScheduledDate(format(new Date(), 'yyyy-MM-dd'));
    setScheduledTime('09:00');
    setDurationMinutes(60);
    setPriorityTag('Regular');
    setSubmitError(null);
    setShowModal(true);
  };

  // Open modal in Edit mode
  const openEditModal = (task: StudyTaskDetailOut, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingTask(task);
    setTaskTitle(task.topic_name);

    if (availableSubjects.includes(task.subject)) {
      setSelectedSubject(task.subject);
      setCustomSubject('');
    } else {
      setSelectedSubject('__custom__');
      setCustomSubject(task.subject);
    }

    setScheduledDate(task.scheduled_date);
    setScheduledTime(task.scheduled_time || '09:00');
    setDurationMinutes(task.duration_minutes || 60);
    setPriorityTag(task.priority_tag || 'Regular');
    setSubmitError(null);
    setShowModal(true);
  };

  // Toggle task completion
  const handleToggle = async (taskId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await toggleTaskComplete(taskId);
      showToast('Task status updated.');
    } catch {
      showToast('Failed to update task.');
    }
  };

  // Delete task
  const handleDeleteTask = async (taskId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (deletingTaskId) return;
    setDeletingTaskId(taskId);
    try {
      await deleteTask(taskId);
      showToast('Task removed from your study plan.');
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to delete task.';
      showToast(msg);
    } finally {
      setDeletingTaskId(null);
    }
  };

  // Form submit for create or update
  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) {
      setSubmitError('Please enter a task title.');
      return;
    }

    const finalSubject =
      selectedSubject === '__custom__'
        ? customSubject.trim() || 'General'
        : selectedSubject || 'General';

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      if (editingTask) {
        await updateTask(editingTask.id, {
          title: taskTitle.trim(),
          subject: finalSubject,
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime,
          duration_minutes: Number(durationMinutes),
          priority_tag: priorityTag,
        });
        showToast('Task updated successfully.');
      } else {
        await createTask({
          title: taskTitle.trim(),
          subject: finalSubject,
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime,
          duration_minutes: Number(durationMinutes),
          priority_tag: priorityTag,
        });
        showToast('Task saved to your study plan and dashboard!');
      }
      setShowModal(false);
      setEditingTask(null);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to save task. Please try again.';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Share action
  const handleShare = async () => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayList = allTasks.filter((t) => t.scheduled_date === todayStr);
    const text =
      `My Plan2Learn Plan (${format(new Date(), 'MMM d, yyyy')}):\n` +
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

  // Date and filter calculations based on allTasks
  const todayDateStr = format(new Date(), 'yyyy-MM-dd');
  const todayTasks = allTasks.filter((t) => t.scheduled_date === todayDateStr);
  const sortedTodayTasks = [...todayTasks].sort((a, b) =>
    (a.scheduled_time || '00:00').localeCompare(b.scheduled_time || '00:00')
  );

  // Filtering for This Week
  const weekTasks = allTasks.filter((t) => {
    const diff =
      (new Date(t.scheduled_date).getTime() - new Date(todayDateStr).getTime()) /
      (1000 * 3600 * 24);
    return diff >= 0 && diff < 7;
  });

  const weekGroupedByDate = weekTasks.reduce((acc, task) => {
    const d = task.scheduled_date;
    if (!acc[d]) acc[d] = [];
    acc[d].push(task);
    return acc;
  }, {} as Record<string, StudyTaskDetailOut[]>);

  const sortedWeekDates = Object.keys(weekGroupedByDate).sort();

  // Grouping for Subjects tab
  const subjectsMap = allTasks.reduce((acc, task) => {
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
            1. COMPACT HEADER (Matches Screen #7)
            ==================================================================== */}
        <header className="flex items-center justify-between gap-3 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white dark:text-white light:text-slate-900">
                My Plan
              </h1>
              <span className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-400">
                {allTasks.length} {allTasks.length === 1 ? 'task' : 'tasks'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-500">
              {format(new Date(), 'EEEE, MMMM d')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchAllTasks()}
              disabled={isLoadingTasks}
              aria-label="Refresh study plan"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200/90 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white text-zinc-300 dark:text-zinc-300 light:text-slate-600 shadow-xs transition-colors hover:border-indigo-500/40 hover:text-white active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4', isLoadingTasks && 'animate-spin')} />
            </button>

            <button
              type="button"
              onClick={handleShare}
              aria-label="Share Study Plan"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200/90 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white text-zinc-300 dark:text-zinc-300 light:text-slate-600 shadow-xs transition-colors hover:border-indigo-500/40 hover:text-white active:scale-95 cursor-pointer"
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>
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
            Today ({todayTasks.length})
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
            This Week ({weekTasks.length})
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
            Subjects ({subjectNames.length})
          </button>
        </div>

        {/* Global Error Banner */}
        {taskError && (
          <div className="mt-3 flex items-center justify-between rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{taskError}</span>
            </div>
            <button
              type="button"
              onClick={() => fetchAllTasks()}
              className="font-semibold underline text-rose-300 hover:text-rose-100"
            >
              Retry
            </button>
          </div>
        )}

        {/* ====================================================================
            3. TAB CONTENT
            ==================================================================== */}
        {isLoadingTasks && allTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-400 light:text-slate-500">
              Loading your study schedule…
            </p>
          </div>
        ) : (
          <div className="mt-5">
            {/* TAB 1: TODAY */}
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

                            {/* Timeline Node + line */}
                            <div className="relative flex flex-col items-center self-stretch shrink-0">
                              <div
                                className={cn(
                                  'mt-3.5 h-2.5 w-2.5 rounded-full ring-4 transition-transform group-hover:scale-125',
                                  isCompleted
                                    ? 'bg-emerald-400 ring-emerald-400/20'
                                    : 'bg-indigo-500 ring-[#070A12] dark:ring-[#070A12] light:ring-[#f8fafc]'
                                )}
                              />
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
                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-400 light:text-slate-500">
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

                              {/* Action Buttons: Edit, Delete, Toggle Complete */}
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => openEditModal(task, e)}
                                  title="Edit Task"
                                  aria-label="Edit Task"
                                  className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:text-white dark:hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteTask(task.id, e)}
                                  disabled={deletingTaskId === task.id}
                                  title="Delete Task"
                                  aria-label="Delete Task"
                                  className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  {deletingTaskId === task.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-400" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => handleToggle(task.id, e)}
                                  aria-label={isCompleted ? 'Mark task incomplete' : 'Mark task complete'}
                                  className={cn(
                                    'flex h-6 w-6 ml-0.5 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-all active:scale-90',
                                    isCompleted
                                      ? 'border-emerald-500 bg-emerald-500 text-white shadow-xs shadow-emerald-500/30'
                                      : 'border-zinc-500/50 dark:border-zinc-500/50 light:border-slate-300 hover:border-indigo-400 hover:bg-indigo-500/10'
                                  )}
                                >
                                  {isCompleted && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: THIS WEEK */}
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

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => openEditModal(task, e)}
                                  title="Edit Task"
                                  className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:text-white transition-colors"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteTask(task.id, e)}
                                  disabled={deletingTaskId === task.id}
                                  title="Delete Task"
                                  className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:text-rose-400 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleToggle(task.id, e)}
                                  className={cn(
                                    'flex h-5 w-5 ml-0.5 shrink-0 items-center justify-center rounded-full border transition-all active:scale-90',
                                    task.completed
                                      ? 'border-emerald-500 bg-emerald-500 text-white'
                                      : 'border-zinc-500/50 dark:border-zinc-500/50 light:border-slate-300'
                                  )}
                                >
                                  {task.completed && <Check className="h-3 w-3 stroke-[3]" />}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB 3: SUBJECTS */}
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
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-500">
                                  {t.scheduled_date}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => openEditModal(t, e)}
                                  className="text-zinc-400 hover:text-white"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </button>
                              </div>
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
                4. PROMINENT FULL-WIDTH "+ Add Task" BUTTON
                ==================================================================== */}
            <div className="mt-5">
              <button
                type="button"
                onClick={openCreateModal}
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
          5. ADD / EDIT TASK MODAL
          ==================================================================== */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => !isSubmitting && setShowModal(false)}
            aria-hidden="true"
          />

          <div className="relative z-10 w-full max-w-md rounded-t-3xl sm:rounded-3xl border-t sm:border border-white/[0.1] dark:border-white/[0.1] light:border-slate-200 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white p-5 shadow-2xl animate-slide-up">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-600 dark:bg-zinc-600 light:bg-slate-300 sm:hidden" />

            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] dark:border-white/[0.08] light:border-slate-200">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
                  {editingTask ? <Edit2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </div>
                <h2 className="text-sm font-bold text-white dark:text-white light:text-slate-900">
                  {editingTask ? 'Edit Study Task' : 'Add Study Task'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={isSubmitting}
                className="rounded-lg p-1 text-zinc-400 hover:text-white dark:hover:text-white light:text-slate-400 light:hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {submitError && (
              <div className="mt-3 flex items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitTask} className="mt-4 space-y-3.5">
              {/* Task Title */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 dark:text-zinc-300 light:text-slate-700 mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Electromagnetic Induction Numerical Drill"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-white/[0.04] dark:bg-white/[0.04] light:bg-slate-50 px-3 py-2 text-xs text-white dark:text-white light:text-slate-900 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Subject & Custom input */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 dark:text-zinc-300 light:text-slate-700 mb-1">
                    Subject *
                  </label>
                  <select
                    value={selectedSubject}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                    className="w-full rounded-xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-[#0e1424] dark:bg-[#0e1424] light:bg-slate-50 px-3 py-2 text-xs text-white dark:text-white light:text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    {availableSubjects.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                    <option value="__custom__">+ Custom Subject...</option>
                  </select>
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-xs font-medium text-zinc-300 dark:text-zinc-300 light:text-slate-700 mb-1">
                    Priority
                  </label>
                  <select
                    value={priorityTag}
                    onChange={(e) => setPriorityTag(e.target.value)}
                    className="w-full rounded-xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-[#0e1424] dark:bg-[#0e1424] light:bg-slate-50 px-3 py-2 text-xs text-white dark:text-white light:text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="Regular">Regular</option>
                    <option value="Weak Area">Weak Area</option>
                    <option value="Spaced Revision">Spaced Revision</option>
                    <option value="Exam Prep">Exam Prep</option>
                  </select>
                </div>
              </div>

              {selectedSubject === '__custom__' && (
                <div>
                  <label className="block text-xs font-medium text-zinc-300 dark:text-zinc-300 light:text-slate-700 mb-1">
                    Custom Subject Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bengali, Sociology, Robotics"
                    value={customSubject}
                    onChange={(e) => setCustomSubject(e.target.value)}
                    className="w-full rounded-xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-white/[0.04] dark:bg-white/[0.04] light:bg-slate-50 px-3 py-2 text-xs text-white dark:text-white light:text-slate-900 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 dark:text-zinc-300 light:text-slate-700 mb-1">
                    Scheduled Date
                  </label>
                  <input
                    type="date"
                    required
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
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
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
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
                      onClick={() => setDurationMinutes(dur)}
                      className={cn(
                        'flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-colors',
                        durationMinutes === dur
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
                  onClick={() => setShowModal(false)}
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
                      {editingTask ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      <span>{editingTask ? 'Update Task' : 'Save Task'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          6. FIXED BOTTOM NAVIGATION
          ==================================================================== */}
      <MobileBottomNav active="planner" />
    </div>
  );
}
