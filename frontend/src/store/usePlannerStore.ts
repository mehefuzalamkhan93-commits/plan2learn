import { create } from 'zustand';
import {
  UserProfile,
  PlanItem,
  PomodoroState,
  SessionType,
  Topic,
  VideoRecommendation,
  TodayTaskOut,
  UpcomingTaskOut,
  ReviewItemOut,
  ExamOut,
  StreakOut,
  ReadinessOut,
} from '@/types';
import { format } from 'date-fns';
import { dashboardAPI, plannerAPI, authAPI } from '@/services/api';

interface PlannerStore {
  // User Profile
  userProfile: UserProfile | null;
  setUserProfile: (profile: UserProfile | null) => void;
  fetchUserProfile: () => Promise<UserProfile | null>;

  // Roadmap freshness flag
  isRoadmapStale: boolean;
  setIsRoadmapStale: (stale: boolean) => void;

  // Schedule & Tasks (from API)
  todayTasks: TodayTaskOut[];
  upcomingTasks: UpcomingTaskOut[];
  setTodayTasks: (tasks: TodayTaskOut[]) => void;
  setUpcomingTasks: (tasks: UpcomingTaskOut[]) => void;
  markTaskComplete: (taskId: string) => void;
  toggleTaskComplete: (taskId: string) => void;
  activeTask: PlanItem | null;
  setActiveTask: (task: PlanItem | null) => void;

  // Pomodoro Timer
  pomodoro: PomodoroState;
  startPomodoro: (topic?: Topic, sessionType?: SessionType) => void;
  pausePomodoro: () => void;
  resumePomodoro: () => void;
  resetPomodoro: () => void;
  tickPomodoro: () => void;
  switchSession: () => void;

  // Streak (from API)
  streak: StreakOut | null;
  setStreak: (streak: StreakOut | null) => void;

  // Readiness Score (from API)
  readinessScore: ReadinessOut | null;
  setReadinessScore: (score: ReadinessOut | null) => void;

  // Review Queue (from API)
  reviewQueue: ReviewItemOut[];
  setReviewQueue: (queue: ReviewItemOut[]) => void;

  // Exams (from API)
  exams: ExamOut[];
  setExams: (exams: ExamOut[]) => void;

  // Recommendations (from API)
  recommendations: VideoRecommendation[];
  setRecommendations: (videos: VideoRecommendation[]) => void;

  // Dashboard Summary
  activePlanVersionId: string | null;
  totalPlannedTodayMinutes: number;
  completedTodayMinutes: number;
  setDashboardSummary: (data: {
    todayTasks: TodayTaskOut[];
    upcomingTasks: UpcomingTaskOut[];
    streak: StreakOut | null;
    readinessScore: ReadinessOut | null;
    reviewQueue: ReviewItemOut[];
    exams: ExamOut[];
    activePlanVersionId: string | null;
    totalPlannedTodayMinutes: number;
    completedTodayMinutes: number;
  }) => void;

  // Dashboard Summary loaded flag
  isDashboardLoaded: boolean;
  setDashboardLoaded: (loaded: boolean) => void;

  // UI State
  isOnboarded: boolean;
  setIsOnboarded: (value: boolean) => void;

  // Fetch dashboard data
  fetchDashboardSummary: () => Promise<void>;
}

const STUDY_DURATION = 25 * 60; // 25 minutes
const BREAK_DURATION = 5 * 60; // 5 minutes

const defaultFocusTopic: Topic = {
  id: 'topic-focus-primary',
  subject: 'General',
  name: 'Focus Session',
  priority: 'HIGH',
  difficulty: 3,
  confidence_score: 3,
  last_studied: format(new Date(), 'yyyy-MM-dd'),
};

export const usePlannerStore = create<PlannerStore>((set, get) => ({
  // User Profile
  userProfile: null,
  setUserProfile: (profile) => set({ userProfile: profile }),
  isRoadmapStale: false,
  setIsRoadmapStale: (stale) => set({ isRoadmapStale: stale }),

  fetchUserProfile: async () => {
    try {
      const res = await authAPI.getProfile();
      if (res && res.data) {
        const p = res.data;
        const mapped: UserProfile = {
          id: p.id || p.user_id || '',
          email: p.email,
          name: p.full_name,
          exam_date: p.exam_date || '',
          score_goal: p.score_goal || 85,
          weak_subjects: p.weak_topics || [],
          daily_time_minutes: p.daily_time_minutes || 120,
          education_level: p.education_level || 'High School',
          board_curriculum: p.board_curriculum || 'CBSE',
          grade_class: p.grade_class || 'Class 12',
          target_subjects: p.target_subjects || [],
          weak_topics: p.weak_topics || [],
          strong_topics: p.strong_topics || [],
          study_routine: p.study_routine || 'evening',
        };
        set({ userProfile: mapped });
        return mapped;
      }
    } catch (err) {
      console.error('Failed to fetch user profile:', err);
    }
    return null;
  },

  // Schedule & Tasks (from API)
  todayTasks: [],
  upcomingTasks: [],
  setTodayTasks: (tasks) => set({ todayTasks: tasks }),
  setUpcomingTasks: (tasks) => set({ upcomingTasks: tasks }),

  markTaskComplete: (taskId) =>
    set((state) => ({
      todayTasks: state.todayTasks.map((task) =>
        task.id === taskId ? { ...task, completed: true } : task
      ),
    })),

  toggleTaskComplete: (taskId) => {
    // Persist to database in background
    plannerAPI.toggleTask(taskId).catch((err) => {
      console.error('Failed to toggle task completion on backend:', err);
    });
    set((state) => ({
      todayTasks: state.todayTasks.map((task) =>
        task.id === taskId ? { ...task, completed: !task.completed } : task
      ),
    }));
  },

  activeTask: null,
  setActiveTask: (task) =>
    set((state) => ({
      activeTask: task,
      pomodoro: task
        ? { ...state.pomodoro, activeTopic: task.topic }
        : state.pomodoro,
    })),

  // Pomodoro State
  pomodoro: {
    status: 'IDLE',
    sessionType: 'STUDY',
    secondsRemaining: STUDY_DURATION,
    totalSeconds: STUDY_DURATION,
    activeTopic: defaultFocusTopic,
  },

  startPomodoro: (topic, sessionType) =>
    set((state) => {
      const nextType = sessionType ?? (state.pomodoro.sessionType === 'BREAK' ? 'BREAK' : 'STUDY');
      const nextDuration = nextType === 'BREAK' ? BREAK_DURATION : STUDY_DURATION;

      return {
        pomodoro: {
          ...state.pomodoro,
          status: 'RUNNING',
          sessionType: nextType,
          secondsRemaining: nextDuration,
          totalSeconds: nextDuration,
          activeTopic: topic || state.pomodoro.activeTopic || defaultFocusTopic,
        },
      };
    }),

  pausePomodoro: () =>
    set((state) => ({
      pomodoro: { ...state.pomodoro, status: 'PAUSED' },
    })),

  resumePomodoro: () =>
    set((state) => ({
      pomodoro: { ...state.pomodoro, status: 'RUNNING' },
    })),

  resetPomodoro: () =>
    set((state) => {
      const currentType = state.pomodoro.sessionType === 'BREAK' ? 'BREAK' : 'STUDY';
      const currentDuration = currentType === 'BREAK' ? BREAK_DURATION : STUDY_DURATION;

      return {
        pomodoro: {
          status: 'IDLE',
          sessionType: currentType,
          secondsRemaining: currentDuration,
          totalSeconds: currentDuration,
          activeTopic: state.pomodoro.activeTopic || defaultFocusTopic,
        },
      };
    }),

  tickPomodoro: () =>
    set((state) => {
      const newSeconds = state.pomodoro.secondsRemaining - 1;
      if (newSeconds <= 0) {
        return {
          pomodoro: {
            ...state.pomodoro,
            status: 'IDLE',
            secondsRemaining: 0,
          },
        };
      }
      return {
        pomodoro: {
          ...state.pomodoro,
          secondsRemaining: newSeconds,
        },
      };
    }),

  switchSession: () =>
    set((state) => {
      const newType = state.pomodoro.sessionType === 'STUDY' ? 'BREAK' : 'STUDY';
      const newDuration = newType === 'STUDY' ? STUDY_DURATION : BREAK_DURATION;
      return {
        pomodoro: {
          ...state.pomodoro,
          sessionType: newType,
          secondsRemaining: newDuration,
          totalSeconds: newDuration,
          status: 'IDLE',
        },
      };
    }),

  // Streak (from API)
  streak: null,
  setStreak: (streak) => set({ streak }),

  // Readiness Score (from API)
  readinessScore: null,
  setReadinessScore: (score) => set({ readinessScore: score }),

  // Review Queue (from API)
  reviewQueue: [],
  setReviewQueue: (queue) => set({ reviewQueue: queue }),

  // Exams (from API)
  exams: [],
  setExams: (exams) => set({ exams }),

  // Recommendations (from API)
  recommendations: [],
  setRecommendations: (videos) => set({ recommendations: videos }),

  // Dashboard Summary
  activePlanVersionId: null,
  totalPlannedTodayMinutes: 0,
  completedTodayMinutes: 0,
  setDashboardSummary: (data) =>
    set({
      todayTasks: data.todayTasks,
      upcomingTasks: data.upcomingTasks,
      streak: data.streak,
      readinessScore: data.readinessScore,
      reviewQueue: data.reviewQueue,
      exams: data.exams,
      activePlanVersionId: data.activePlanVersionId,
      totalPlannedTodayMinutes: data.totalPlannedTodayMinutes,
      completedTodayMinutes: data.completedTodayMinutes,
      isDashboardLoaded: true,
    }),

  // Dashboard Summary loaded flag
  isDashboardLoaded: false,
  setDashboardLoaded: (loaded) => set({ isDashboardLoaded: loaded }),

  // UI State
  isOnboarded: false,
  setIsOnboarded: (value) => set({ isOnboarded: value }),

  // Fetch dashboard data from API
  fetchDashboardSummary: async () => {
    try {
      // Keep profile synced with backend
      get().fetchUserProfile().catch((e) => console.error('Silent profile sync error:', e));

      const response = await dashboardAPI.getSummary();
      if (response) {
        set({
          todayTasks: response.today_tasks || [],
          upcomingTasks: response.upcoming_tasks || [],
          streak: response.streak || null,
          readinessScore: response.readiness || null,
          reviewQueue: response.review_queue || [],
          exams: response.exams || [],
          activePlanVersionId: response.active_plan_version_id || null,
          totalPlannedTodayMinutes: response.total_planned_today_minutes || 0,
          completedTodayMinutes: response.completed_today_minutes || 0,
          isDashboardLoaded: true,
        });
      }
    } catch (error) {
      console.error('Failed to fetch dashboard summary:', error);
      set({ isDashboardLoaded: true });
    }
  },
}));

// Helper to get active plan version id from store
let activePlanVersionId: string | null = null;
export const setActivePlanVersionId = (id: string | null) => {
  activePlanVersionId = id;
};
export const getActivePlanVersionId = () => activePlanVersionId;