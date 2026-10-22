'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import { usePomodoro } from '@/hooks/usePomodoro';
import FocusHud from '@/components/focus/FocusHud';
import FocusEnvironment from '@/components/focus/FocusEnvironment';
import { buttonTapProps } from '@/lib/motion';
import { usePlannerStore } from '@/store/usePlannerStore';
import AppLogo from '@/components/ui/AppLogo';

export default function FocusPage() {
  const router = useRouter();
  const { pomodoro, startPomodoro } = usePomodoro();
  const { todayTasks, upcomingTasks, setActiveTask } = usePlannerStore();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEnvironmentReady, setIsEnvironmentReady] = useState(false);
  const initializedTaskId = useRef<string | null>(null);

  useEffect(() => {
    // Combine today and upcoming tasks for lookup
    const allTasks = [...todayTasks, ...upcomingTasks];

    const taskId = new URLSearchParams(window.location.search).get('taskId');
    if (!taskId || initializedTaskId.current === taskId) return;
    initializedTaskId.current = taskId;

    const task = allTasks.find((item) => item.id === taskId);
    if (!task) return;

    // Convert to PlanItem format for setActiveTask
    const planItem = {
      id: task.id,
      topic_id: task.topic_id,
      topic: {
        id: task.topic?.id || task.topic_id,
        subject: task.topic?.subject || 'Unknown',
        name: task.topic?.name || task.topic_id,
        priority: 'HIGH' as const,
        difficulty: task.topic?.difficulty || 3,
        confidence_score: 3,
      },
      scheduled_date: task.scheduled_date,
      scheduled_time: task.scheduled_time,
      duration_minutes: task.duration_minutes,
      completed: task.completed,
      priority_tag: task.priority_tag as 'High' | 'Weak Area' | 'Spaced Revision' | 'Regular',
    };

    setActiveTask(planItem);
    if (usePlannerStore.getState().pomodoro.status === 'IDLE') {
      startPomodoro(planItem.topic, 'STUDY');
    }
  }, [todayTasks, upcomingTasks, setActiveTask, startPomodoro]);

  // Fullscreen management
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error('Fullscreen toggle failed:', error);
    }
  };

  const handleBackToDashboard = () => {
    router.push('/dashboard');
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-zinc-950">
      {/* Fullscreen Immersive Lofi Environment */}
      <FocusEnvironment onReady={() => setIsEnvironmentReady(true)} />

      {/* Minimal Top Navigation */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4 sm:py-5"
      >
        {/* Back to Dashboard */}
        <motion.button
          {...buttonTapProps}
          onClick={handleBackToDashboard}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg bg-black/20 hover:bg-black/30 backdrop-blur-md border border-white/[0.08] hover:border-white/[0.12] text-zinc-200 hover:text-white text-sm font-medium transition-colors"
          aria-label="Back to Dashboard"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back to Dashboard</span>
        </motion.button>

        {/* Center: AppLogo */}
        <AppLogo size="sm" showText href="/dashboard" priority />

        {/* Fullscreen Toggle */}
        <motion.button
          {...buttonTapProps}
          onClick={toggleFullscreen}
          className="p-2.5 sm:p-3 rounded-lg bg-black/20 hover:bg-black/30 backdrop-blur-md border border-white/[0.08] hover:border-white/[0.12] text-zinc-200 hover:text-white transition-colors"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4 sm:w-5 sm:h-5" />
          ) : (
            <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5" />
          )}
        </motion.button>
      </motion.div>

      {/* Compact Glass-Prism Focus HUD */}
      <AnimatePresence>
        {isEnvironmentReady && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ delay: 0.5, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-4 top-20 z-20 pointer-events-none sm:left-6 sm:top-24"
          >
            <div className="pointer-events-auto">
              <FocusHud pomodoro={pomodoro} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
