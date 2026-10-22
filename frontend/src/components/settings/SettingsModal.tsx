'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Settings,
  X,
  LogOut,
  Save,
  Loader2,
  BookOpen,
  Calendar,
  Clock,
  Target,
  Sparkles,
  GraduationCap,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  Sun,
  Moon,
  Smartphone,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { authAPI } from '@/services/api';
import { useToast } from '@/components/ui/useToast';
import { usePlannerStore } from '@/store/usePlannerStore';
import { useTheme } from '@/lib/theme';
import { FullProfileData, ProfileUpdateRequest, UserProfile } from '@/types';
import { cn } from '@/lib/utils';
import DeviceSyncManager from './DeviceSyncManager';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'profile' | 'account' | 'devices';
}

const educationLevels = ['High School', 'Undergraduate', 'Postgraduate', 'Other'];

const commonBoards = [
  'CBSE',
  'ICSE / ISC',
  'West Bengal Board (WBCHSE / WBBSE)',
  'Maharashtra State Board (MSBSHSE)',
  'Karnataka State Board (KSEEB / PU)',
  'Tamil Nadu State Board',
  'Uttar Pradesh State Board (UPMSP)',
  'Telangana State Board (TSBIE)',
  'Andhra Pradesh State Board (BIEAP)',
  'Kerala State Board (DHSE)',
  'Gujarat State Board (GSEB)',
  'Rajasthan State Board (RBSE)',
  'Madhya Pradesh State Board (MPBSE)',
  'Bihar State Board (BSEB)',
  'Punjab State Board (PSEB)',
  'NIOS (National Open School)',
  'IB (International Baccalaureate)',
  'Cambridge (IGCSE / A-Level)',
  'Other / Custom',
];

const studyRoutines = [
  { value: 'morning', label: 'Early Bird (6:00 AM – 10:00 AM)' },
  { value: 'afternoon', label: 'Afternoon Sprint (12:00 PM – 4:00 PM)' },
  { value: 'evening', label: 'Evening Focus (5:00 PM – 9:00 PM)' },
  { value: 'night', label: 'Night Owl (9:00 PM – 1:00 AM)' },
  { value: 'flexible', label: 'Flexible Intervals Throughout the Day' },
];

const quickSubjectSuggestions = [
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'English',
  'Bengali',
  'Computer Science',
  'History',
  'Economics',
];

export default function SettingsModal({ isOpen, onClose, initialTab = 'profile' }: SettingsModalProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { userProfile, setUserProfile, fetchDashboardSummary, setIsRoadmapStale } = usePlannerStore();
  const { theme, toggleTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<'profile' | 'account' | 'devices'>(initialTab);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Synchronize activeTab with initialTab when opened
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Profile Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [educationLevel, setEducationLevel] = useState('');
  const [boardCurriculum, setBoardCurriculum] = useState('');
  const [customBoard, setCustomBoard] = useState('');
  const [gradeClass, setGradeClass] = useState('');
  
  // Dynamic Subjects State
  const [subjectsList, setSubjectsList] = useState<string[]>([]);
  const [newSubjectInput, setNewSubjectInput] = useState('');
  const [subjectError, setSubjectError] = useState<string | null>(null);

  const [weakTopics, setWeakTopics] = useState('');
  const [strongTopics, setStrongTopics] = useState('');
  const [dailyTimeMinutes, setDailyTimeMinutes] = useState(120);
  const [examDate, setExamDate] = useState('');
  const [scoreGoal, setScoreGoal] = useState<number | ''>(85);
  const [studyRoutine, setStudyRoutine] = useState('evening');

  // Prevent background scroll while modal is open & add ESC key listener
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      loadProfile();
    }
  }, [isOpen]);

  const loadProfile = async () => {
    setIsLoading(true);
    setSubjectError(null);
    try {
      const res = await authAPI.getProfile();
      if (res && res.data) {
        const p: FullProfileData = res.data;
        setFullName(p.full_name || '');
        setEmail(p.email || '');
        setEducationLevel(p.education_level || 'High School');

        const isKnownBoard = commonBoards.includes(p.board_curriculum || '');
        if (isKnownBoard) {
          setBoardCurriculum(p.board_curriculum || 'CBSE');
          setCustomBoard('');
        } else if (p.board_curriculum) {
          setBoardCurriculum('Other / Custom');
          setCustomBoard(p.board_curriculum);
        } else {
          setBoardCurriculum('CBSE');
          setCustomBoard('');
        }

        setGradeClass(p.grade_class || '');
        
        // Load target subjects into dynamic array
        const rawSubjects = Array.isArray(p.target_subjects)
          ? p.target_subjects.filter(Boolean)
          : typeof p.target_subjects === 'string'
          ? (p.target_subjects as string).split(',').map((s) => s.trim()).filter(Boolean)
          : [];
        setSubjectsList(rawSubjects);

        setWeakTopics((p.weak_topics || []).join(', '));
        setStrongTopics((p.strong_topics || []).join(', '));
        setDailyTimeMinutes(p.daily_time_minutes || 120);
        setExamDate(p.exam_date || '');
        setScoreGoal(p.score_goal ?? 85);
        setStudyRoutine(p.study_routine || 'evening');
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSubject = (subjectToAdd?: string) => {
    const raw = subjectToAdd !== undefined ? subjectToAdd : newSubjectInput;
    const trimmed = raw.trim();
    if (!trimmed) {
      setSubjectError('Please enter a subject name.');
      return;
    }
    // Case-insensitive duplicate prevention
    const isDuplicate = subjectsList.some(
      (s) => s.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      setSubjectError(`"${trimmed}" is already in your subjects.`);
      return;
    }
    setSubjectsList((prev) => [...prev, trimmed]);
    if (subjectToAdd === undefined) {
      setNewSubjectInput('');
    }
    setSubjectError(null);
  };

  const handleRemoveSubject = (indexToRemove: number) => {
    setSubjectsList((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    setSubjectError(null);
  };

  const handleSubjectKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSubject();
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSubjectError(null);
    try {
      const subjectsArray = Array.from(new Set(subjectsList.map((s) => s.trim()).filter(Boolean)));
      const weakArray = Array.from(
        new Set(weakTopics.split(',').map((s) => s.trim()).filter(Boolean))
      );
      const strongArray = Array.from(
        new Set(strongTopics.split(',').map((s) => s.trim()).filter(Boolean))
      );
      const finalBoard = boardCurriculum === 'Other / Custom' ? customBoard.trim() : boardCurriculum;

      const payload: ProfileUpdateRequest = {
        full_name: fullName.trim() || undefined,
        education_level: educationLevel || undefined,
        board_curriculum: finalBoard || undefined,
        grade_class: gradeClass.trim() || undefined,
        target_subjects: subjectsArray,
        weak_topics: weakArray,
        strong_topics: strongArray,
        daily_time_minutes: Number(dailyTimeMinutes) || 120,
        exam_date: examDate || undefined,
        score_goal: scoreGoal !== '' ? Number(scoreGoal) : undefined,
        study_routine: studyRoutine || undefined,
      };

      const res = await authAPI.updateProfile(payload);
      if (res && res.data) {
        toast({
          title: 'Profile Updated',
          description: 'Your learning profile and study settings have been saved.',
          variant: 'default',
        });

        // Determine if roadmap-affecting fields changed to warn about stale plan
        const prevSubs = userProfile?.target_subjects || [];
        const subjectsChanged =
          subjectsArray.length !== prevSubs.length ||
          subjectsArray.some((s, idx) => s.toLowerCase() !== (prevSubs[idx] || '').toLowerCase());
        const examChanged = (examDate || '') !== (userProfile?.exam_date || '');
        const hoursChanged = Number(dailyTimeMinutes) !== (userProfile?.daily_time_minutes || 120);
        const weakChanged = weakArray.join(',') !== (userProfile?.weak_topics || []).join(',');
        const isStale = subjectsChanged || examChanged || hoursChanged || weakChanged;

        // Establish single source of truth in store
        const updatedProfile: UserProfile = {
          id: res.data.id || res.data.user_id || '',
          email: res.data.email,
          name: res.data.full_name || fullName.trim(),
          exam_date: res.data.exam_date || examDate,
          score_goal: res.data.score_goal ?? (scoreGoal !== '' ? Number(scoreGoal) : 85),
          weak_subjects: res.data.weak_topics || weakArray,
          daily_time_minutes: res.data.daily_time_minutes || Number(dailyTimeMinutes) || 120,
          education_level: res.data.education_level || educationLevel,
          board_curriculum: res.data.board_curriculum || finalBoard,
          grade_class: res.data.grade_class || gradeClass.trim(),
          target_subjects: res.data.target_subjects || subjectsArray,
          weak_topics: res.data.weak_topics || weakArray,
          strong_topics: res.data.strong_topics || strongArray,
          study_routine: res.data.study_routine || studyRoutine,
        };
        setUserProfile(updatedProfile);

        if (isStale) {
          setIsRoadmapStale(true);
        }

        // Refresh dependent dashboard stats & summaries
        await fetchDashboardSummary();
        onClose();
      }
    } catch (err: any) {
      toast({
        title: 'Error Saving Profile',
        description: err?.response?.data?.detail || 'Unable to update profile. Please try again.',
        variant: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await authAPI.logout();
      router.push('/login');
    } catch (err) {
      console.error('Logout error:', err);
      router.push('/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (!isOpen) return null;

  /* Portal to <body>: escaped from any transformed/filtered ancestor (e.g. the
     backdrop-blur page header whose backdrop-filter turns it into the containing
     block for fixed-position descendants — collapsing `fixed inset-0` overlays
     to the header's ~64px box). Portalling keeps the overlay viewport-sized. */
  return createPortal(
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/75 backdrop-blur-md overflow-y-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2 }}
          style={{ maxHeight: 'calc(100dvh - 32px)' }}
          className="relative flex flex-col w-full max-w-2xl my-auto max-h-[calc(100dvh-32px)] rounded-2xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-200 bg-zinc-950 dark:bg-zinc-950 light:bg-white shadow-2xl shadow-black/70 light:shadow-xl overflow-hidden text-zinc-100 dark:text-zinc-100 light:text-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header - Pinned */}
          <div className="shrink-0 flex items-center justify-between border-b border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 px-5 sm:px-6 py-4 bg-zinc-900/60 dark:bg-zinc-900/60 light:bg-slate-50">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 light:border-indigo-200 light:bg-indigo-50 light:text-indigo-600">
                {activeTab === 'profile' ? (
                  <User className="h-4 w-4" />
                ) : activeTab === 'devices' ? (
                  <Smartphone className="h-4 w-4" />
                ) : (
                  <Settings className="h-4 w-4" />
                )}
              </div>
              <div>
                <h2 id="settings-modal-title" className="text-base sm:text-lg font-semibold text-white dark:text-white light:text-slate-900">
                  {activeTab === 'profile'
                    ? 'Student Profile'
                    : activeTab === 'devices'
                    ? 'Connected Devices & Sync'
                    : 'Settings & Preferences'}
                </h2>
                <p className="text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                  {activeTab === 'profile'
                    ? 'Manage your learning identity, subjects, and study preferences'
                    : activeTab === 'devices'
                    ? 'Manage 2-device limit, view connected phones/PCs, and sync status'
                    : 'Application preferences, theme appearance, and session security'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:text-white dark:hover:text-white light:text-slate-400 light:hover:text-slate-700 light:hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation Tabs - Pinned */}
          <div className="shrink-0 flex border-b border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-zinc-900/30 dark:bg-zinc-900/30 light:bg-slate-50/70 px-4 sm:px-6 overflow-x-auto no-scrollbar gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={cn(
                'flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap',
                activeTab === 'profile'
                  ? 'border-indigo-500 text-indigo-400 dark:text-white light:text-indigo-600'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200 light:text-slate-500 light:hover:text-slate-900'
              )}
            >
              <User className="h-4 w-4" />
              Student Profile
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('devices')}
              className={cn(
                'flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap',
                activeTab === 'devices'
                  ? 'border-indigo-500 text-indigo-400 dark:text-white light:text-indigo-600'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200 light:text-slate-500 light:hover:text-slate-900'
              )}
            >
              <Smartphone className="h-4 w-4" />
              Devices &amp; Sync
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('account')}
              className={cn(
                'flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors cursor-pointer whitespace-nowrap',
                activeTab === 'account'
                  ? 'border-indigo-500 text-indigo-400 dark:text-white light:text-indigo-600'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200 light:text-slate-500 light:hover:text-slate-900'
              )}
            >
              <Settings className="h-4 w-4" />
              Preferences
            </button>
          </div>

          {/* Content Area - Independently Scrollable Body */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-6 custom-scrollbar">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-400 light:text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
                <p className="mt-3 text-sm">Loading your profile data...</p>
              </div>
            ) : activeTab === 'profile' ? (
              <form onSubmit={handleSaveProfile} className="space-y-5" id="profile-form">
                {/* User Identity Info */}
                <div className="rounded-xl border border-white/[0.06] dark:border-white/[0.06] light:border-slate-200 bg-white/[0.02] dark:bg-white/[0.02] light:bg-slate-50/70 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs uppercase tracking-wider text-indigo-400 light:text-indigo-600 font-semibold">
                      Account Identity
                    </span>
                    <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300 light:text-emerald-700 light:bg-emerald-50 light:border-emerald-200 font-medium">
                      Verified Student
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 dark:text-zinc-300 light:text-slate-700 mb-1">
                        Full Name
                      </label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full rounded-lg border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-zinc-950 dark:bg-zinc-950 light:bg-white px-3 py-2 text-sm text-zinc-100 dark:text-zinc-100 light:text-slate-900 placeholder:text-zinc-600 light:placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 dark:text-zinc-300 light:text-slate-700 mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        disabled
                        value={email}
                        className="w-full rounded-lg border border-white/[0.06] dark:border-white/[0.06] light:border-slate-200 bg-zinc-900/60 dark:bg-zinc-900/60 light:bg-slate-100 px-3 py-2 text-sm text-zinc-400 dark:text-zinc-400 light:text-slate-500 cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>

                {/* Academic Context & Subjects */}
                <div className="space-y-4">
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 light:text-slate-600">
                    <GraduationCap className="h-4 w-4 text-indigo-400" /> Academic Baseline
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs text-zinc-300 dark:text-zinc-300 light:text-slate-700 mb-1">
                        Education Level
                      </label>
                      <select
                        value={educationLevel}
                        onChange={(e) => setEducationLevel(e.target.value)}
                        className="w-full rounded-lg border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-zinc-950 dark:bg-zinc-950 light:bg-white px-2.5 py-2 text-sm text-zinc-100 dark:text-zinc-100 light:text-slate-900 focus:border-indigo-400 focus:outline-none"
                      >
                        {educationLevels.map((lvl) => (
                          <option key={lvl} value={lvl} className="bg-zinc-900 dark:bg-zinc-900 light:bg-white text-zinc-100 dark:text-zinc-100 light:text-slate-900">
                            {lvl}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-zinc-300 dark:text-zinc-300 light:text-slate-700 mb-1">
                        Board / Curriculum
                      </label>
                      <select
                        value={boardCurriculum}
                        onChange={(e) => setBoardCurriculum(e.target.value)}
                        className="w-full rounded-lg border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-zinc-950 dark:bg-zinc-950 light:bg-white px-2.5 py-2 text-sm text-zinc-100 dark:text-zinc-100 light:text-slate-900 focus:border-indigo-400 focus:outline-none"
                      >
                        {commonBoards.map((b) => (
                          <option key={b} value={b} className="bg-zinc-900 dark:bg-zinc-900 light:bg-white text-zinc-100 dark:text-zinc-100 light:text-slate-900">
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-zinc-300 dark:text-zinc-300 light:text-slate-700 mb-1">
                        Grade / Class
                      </label>
                      <input
                        type="text"
                        value={gradeClass}
                        onChange={(e) => setGradeClass(e.target.value)}
                        placeholder="e.g. Class 12, Year 2"
                        className="w-full rounded-lg border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-zinc-950 dark:bg-zinc-950 light:bg-white px-3 py-2 text-sm text-zinc-100 dark:text-zinc-100 light:text-slate-900 placeholder:text-zinc-600 light:placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  {boardCurriculum === 'Other / Custom' && (
                    <div>
                      <label className="block text-xs text-zinc-300 dark:text-zinc-300 light:text-slate-700 mb-1">
                        Custom Board / University Name
                      </label>
                      <input
                        type="text"
                        value={customBoard}
                        onChange={(e) => setCustomBoard(e.target.value)}
                        placeholder="Specify board or university"
                        className="w-full rounded-lg border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-zinc-950 dark:bg-zinc-950 light:bg-white px-3 py-2 text-sm text-zinc-100 dark:text-zinc-100 light:text-slate-900 placeholder:text-zinc-600 light:placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
                      />
                    </div>
                  )}

                  {/* Dynamic Target Subjects Control */}
                  <div className="rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-white/[0.02] dark:bg-white/[0.02] light:bg-slate-50/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-zinc-200 dark:text-zinc-200 light:text-slate-800">
                        Target Subjects ({subjectsList.length})
                      </label>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-500 light:text-slate-400">
                        Add any subject (e.g. Bengali, Physics, English, Economics)
                      </span>
                    </div>

                    {/* Active Subjects Tag List */}
                    <div className="flex flex-wrap gap-2 min-h-[36px] items-center">
                      {subjectsList.length === 0 ? (
                        <p className="text-xs text-zinc-500 dark:text-zinc-500 light:text-slate-400 italic">
                          No subjects added yet. Add your study subjects below.
                        </p>
                      ) : (
                        subjectsList.map((subject, idx) => (
                          <span
                            key={`${subject}-${idx}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 dark:border-indigo-500/30 light:border-indigo-200 bg-indigo-500/10 dark:bg-indigo-500/10 light:bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-300 dark:text-indigo-300 light:text-indigo-800"
                          >
                            <span>{subject}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveSubject(idx)}
                              className="rounded p-0.5 text-indigo-400 hover:text-white dark:hover:text-white light:text-indigo-600 light:hover:text-indigo-900 transition-colors"
                              aria-label={`Remove subject ${subject}`}
                              title={`Remove ${subject}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ))
                      )}
                    </div>

                    {/* Add Subject Input & Action Button */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newSubjectInput}
                        onChange={(e) => {
                          setNewSubjectInput(e.target.value);
                          if (subjectError) setSubjectError(null);
                        }}
                        onKeyDown={handleSubjectKeyDown}
                        placeholder="Type subject name (e.g. Mathematics, Bengali, Chemistry)"
                        className="flex-1 rounded-lg border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-zinc-950 dark:bg-zinc-950 light:bg-white px-3 py-2 text-sm text-zinc-100 dark:text-zinc-100 light:text-slate-900 placeholder:text-zinc-600 light:placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddSubject()}
                        className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-indigo-500"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Add Subject</span>
                      </button>
                    </div>

                    {subjectError && (
                      <div className="flex items-center gap-1.5 text-xs text-rose-400 dark:text-rose-400 light:text-rose-600">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>{subjectError}</span>
                      </div>
                    )}

                    {/* Quick Suggestions Chips */}
                    <div className="pt-1">
                      <span className="block text-[11px] text-zinc-500 dark:text-zinc-500 light:text-slate-500 mb-1.5">
                        Quick Add Suggestions:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {quickSubjectSuggestions.map((sug) => {
                          const alreadyAdded = subjectsList.some(
                            (s) => s.toLowerCase() === sug.toLowerCase()
                          );
                          return (
                            <button
                              key={sug}
                              type="button"
                              onClick={() => handleAddSubject(sug)}
                              disabled={alreadyAdded}
                              className={cn(
                                'rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer',
                                alreadyAdded
                                  ? 'border-transparent text-zinc-600 dark:text-zinc-600 light:text-slate-400 cursor-not-allowed opacity-50'
                                  : 'border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-white/[0.02] dark:bg-white/[0.02] light:bg-white text-zinc-300 dark:text-zinc-300 light:text-slate-700 hover:border-indigo-400 hover:text-indigo-300 light:hover:text-indigo-600'
                              )}
                            >
                              + {sug}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Strengths & Weaknesses */}
                <div className="space-y-4 pt-2 border-t border-white/[0.06] dark:border-white/[0.06] light:border-slate-200">
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 light:text-slate-600">
                    <Target className="h-4 w-4 text-rose-400" /> Strengths &amp; Weak Areas
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs text-rose-300 dark:text-rose-300 light:text-rose-700 font-medium mb-1">
                        Weak Topics / Struggle Areas
                      </label>
                      <textarea
                        rows={2}
                        value={weakTopics}
                        onChange={(e) => setWeakTopics(e.target.value)}
                        placeholder="e.g. Rotational Motion, Thermodynamics, Integral Calculus"
                        className="w-full rounded-lg border border-rose-500/20 dark:border-rose-500/20 light:border-rose-300 bg-zinc-950 dark:bg-zinc-950 light:bg-white px-3 py-2 text-sm text-zinc-100 dark:text-zinc-100 light:text-slate-900 placeholder:text-zinc-600 light:placeholder:text-slate-400 focus:border-rose-400 focus:outline-none"
                      />
                      <span className="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-500 light:text-slate-500">
                        Assigned higher repetition weight in study roadmaps.
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs text-emerald-300 dark:text-emerald-300 light:text-emerald-700 font-medium mb-1">
                        Strong Topics / High Confidence
                      </label>
                      <textarea
                        rows={2}
                        value={strongTopics}
                        onChange={(e) => setStrongTopics(e.target.value)}
                        placeholder="e.g. Kinematics, Modern Physics, Trigonometry"
                        className="w-full rounded-lg border border-emerald-500/20 dark:border-emerald-500/20 light:border-emerald-300 bg-zinc-950 dark:bg-zinc-950 light:bg-white px-3 py-2 text-sm text-zinc-100 dark:text-zinc-100 light:text-slate-900 placeholder:text-zinc-600 light:placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
                      />
                      <span className="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-500 light:text-slate-500">
                        Scheduled for spaced retention maintenance.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Study Routine & Exam Goals */}
                <div className="space-y-4 pt-2 border-t border-white/[0.06] dark:border-white/[0.06] light:border-slate-200">
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 light:text-slate-600">
                    <Clock className="h-4 w-4 text-amber-400" /> Study Routine &amp; Exam Targets
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs text-zinc-300 dark:text-zinc-300 light:text-slate-700 mb-1">
                        Daily Study Target
                      </label>
                      <select
                        value={dailyTimeMinutes}
                        onChange={(e) => setDailyTimeMinutes(Number(e.target.value))}
                        className="w-full rounded-lg border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-zinc-950 dark:bg-zinc-950 light:bg-white px-2.5 py-2 text-sm text-zinc-100 dark:text-zinc-100 light:text-slate-900 focus:border-indigo-400 focus:outline-none"
                      >
                        <option value={60} className="bg-zinc-900 dark:bg-zinc-900 light:bg-white text-zinc-100 dark:text-zinc-100 light:text-slate-900">1 hour (60 min)</option>
                        <option value={90} className="bg-zinc-900 dark:bg-zinc-900 light:bg-white text-zinc-100 dark:text-zinc-100 light:text-slate-900">1.5 hours (90 min)</option>
                        <option value={120} className="bg-zinc-900 dark:bg-zinc-900 light:bg-white text-zinc-100 dark:text-zinc-100 light:text-slate-900">2 hours (120 min)</option>
                        <option value={180} className="bg-zinc-900 dark:bg-zinc-900 light:bg-white text-zinc-100 dark:text-zinc-100 light:text-slate-900">3 hours (180 min)</option>
                        <option value={240} className="bg-zinc-900 dark:bg-zinc-900 light:bg-white text-zinc-100 dark:text-zinc-100 light:text-slate-900">4 hours (240 min)</option>
                        <option value={300} className="bg-zinc-900 dark:bg-zinc-900 light:bg-white text-zinc-100 dark:text-zinc-100 light:text-slate-900">5+ hours (300 min)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-zinc-300 dark:text-zinc-300 light:text-slate-700 mb-1">
                        Target Exam Date
                      </label>
                      <input
                        type="date"
                        value={examDate}
                        onChange={(e) => setExamDate(e.target.value)}
                        className="w-full rounded-lg border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-zinc-950 dark:bg-zinc-950 light:bg-white px-3 py-2 text-sm text-zinc-100 dark:text-zinc-100 light:text-slate-900 focus:border-indigo-400 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-zinc-300 dark:text-zinc-300 light:text-slate-700 mb-1">
                        Target Score Goal (%)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={scoreGoal}
                        onChange={(e) => setScoreGoal(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="e.g. 90"
                        className="w-full rounded-lg border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-zinc-950 dark:bg-zinc-950 light:bg-white px-3 py-2 text-sm text-zinc-100 dark:text-zinc-100 light:text-slate-900 placeholder:text-zinc-600 light:placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-300 dark:text-zinc-300 light:text-slate-700 mb-1">
                      Preferred Time of Day
                    </label>
                    <select
                      value={studyRoutine}
                      onChange={(e) => setStudyRoutine(e.target.value)}
                      className="w-full rounded-lg border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-zinc-950 dark:bg-zinc-950 light:bg-white px-3 py-2 text-sm text-zinc-100 dark:text-zinc-100 light:text-slate-900 focus:border-indigo-400 focus:outline-none"
                    >
                      {studyRoutines.map((r) => (
                        <option key={r.value} value={r.value} className="bg-zinc-900 dark:bg-zinc-900 light:bg-white text-zinc-100 dark:text-zinc-100 light:text-slate-900">
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </form>
            ) : activeTab === 'devices' ? (
              <DeviceSyncManager />
            ) : (
              /* Account & Session Tab */
              <div className="space-y-6">
                <div className="rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-zinc-900/60 dark:bg-zinc-900/60 light:bg-slate-50 p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 light:bg-indigo-50 light:text-indigo-600 light:border-indigo-200">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white dark:text-white light:text-slate-900">
                        {fullName || 'Student'}
                      </h4>
                      <p className="text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-500">{email}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/[0.04] dark:border-white/[0.04] light:border-slate-200 bg-white/[0.02] dark:bg-white/[0.02] light:bg-white p-3 text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-600 space-y-1">
                    <div className="flex justify-between">
                      <span>Session Status:</span>
                      <span className="text-emerald-400 light:text-emerald-600 font-medium">Active &amp; Authenticated</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Curriculum:</span>
                      <span className="text-zinc-200 dark:text-zinc-200 light:text-slate-900 font-medium">
                        {boardCurriculum || 'CBSE'} · {gradeClass || 'Class 12'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Active Subjects:</span>
                      <span className="text-zinc-200 dark:text-zinc-200 light:text-slate-900 font-medium">
                        {subjectsList.length > 0 ? subjectsList.join(', ') : 'None configured'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Theme & Display Preferences Card */}
                <div className="rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-zinc-900/60 dark:bg-zinc-900/60 light:bg-slate-50 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 light:bg-amber-50 light:text-amber-600 light:border-amber-200">
                        {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white dark:text-white light:text-slate-900">
                          Theme Appearance
                        </h4>
                        <p className="text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                          Currently active: {theme === 'dark' ? 'Dark Luxury' : 'Light Mode'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={toggleTheme}
                      className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-white/[0.05] dark:bg-white/[0.05] light:bg-white px-3.5 py-2 text-xs font-semibold text-white dark:text-white light:text-slate-800 shadow-xs transition-colors hover:bg-white/10 dark:hover:bg-white/10 light:hover:bg-slate-100"
                    >
                      Switch to {theme === 'dark' ? 'Light' : 'Dark'}
                    </button>
                  </div>
                </div>

                {/* Connected Devices & Sync Card */}
                <div className="rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-zinc-900/60 dark:bg-zinc-900/60 light:bg-slate-50 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 light:bg-indigo-50 light:text-indigo-600 light:border-indigo-200">
                        <Smartphone className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white dark:text-white light:text-slate-900">
                          Connected Devices &amp; Sync
                        </h4>
                        <p className="text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                          Active on max 2 devices (Phone, PC, Tablet) with real-time sync
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('devices')}
                      className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-2 text-xs font-semibold text-indigo-400 hover:bg-indigo-500/20 light:border-indigo-200 light:bg-indigo-50 light:text-indigo-600 light:hover:bg-indigo-100 transition-colors"
                    >
                      Manage Devices &rarr;
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-rose-500/20 dark:border-rose-500/20 light:border-rose-200 bg-rose-500/5 dark:bg-rose-500/5 light:bg-rose-50/70 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-rose-300 dark:text-rose-300 light:text-rose-700 text-sm font-semibold">
                    <LogOut className="h-4 w-4" /> End Active Session
                  </div>
                  <p className="text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-600">
                    Logging out will clear your local security token and return you to the sign-in screen.
                    Your notebooks, sources, and study progress will remain safely saved in the database.
                  </p>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-rose-600/20 transition-all hover:bg-rose-500 disabled:opacity-50"
                  >
                    {isLoggingOut ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Logging out…
                      </>
                    ) : (
                      <>
                        <LogOut className="h-4 w-4" />
                        Confirm &amp; Log Out
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer (Actions) - Pinned */}
          <div className="shrink-0 flex items-center justify-between border-t border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 px-5 sm:px-6 py-3.5 bg-zinc-900/60 dark:bg-zinc-900/60 light:bg-slate-50">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-300 bg-zinc-900 dark:bg-zinc-900 light:bg-white px-4 py-2 text-xs font-medium text-zinc-300 dark:text-zinc-300 light:text-slate-700 transition-colors hover:bg-zinc-800 dark:hover:bg-zinc-800 light:hover:bg-slate-100 hover:text-white dark:hover:text-white light:hover:text-slate-900"
            >
              Cancel
            </button>

            {activeTab === 'profile' && (
              <button
                type="submit"
                form="profile-form"
                disabled={isSaving}
                className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 transition-all hover:bg-indigo-500 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Changes
                  </>
                )}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
