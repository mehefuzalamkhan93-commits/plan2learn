'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Music,
} from 'lucide-react';
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

  // Audio / Sound controls for the ambient YouTube video
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [volume, setVolume] = useState<number>(75);
  const [isPlayingMusic, setIsPlayingMusic] = useState<boolean>(true);

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

  const toggleSound = () => {
    setIsMuted((prev) => !prev);
  };

  const togglePlayback = () => {
    setIsPlayingMusic((prev) => !prev);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-zinc-950">
      {/* Fullscreen Immersive Lofi Environment with Dynamic Audio Control */}
      <FocusEnvironment
        onReady={() => setIsEnvironmentReady(true)}
        isMuted={isMuted}
        volume={volume}
        isPlaying={isPlayingMusic}
      />

      {/* Minimal Top Navigation */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4 sm:py-5 pointer-events-none"
      >
        {/* Back to Dashboard */}
        <motion.button
          {...buttonTapProps}
          onClick={handleBackToDashboard}
          className="pointer-events-auto flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/[0.1] text-zinc-200 hover:text-white text-sm font-medium transition-colors shadow-lg"
          aria-label="Back to Dashboard"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back to Dashboard</span>
        </motion.button>

        {/* Center: AppLogo */}
        <div className="pointer-events-auto">
          <AppLogo size="sm" showText href="/dashboard" priority />
        </div>

        {/* Right Controls: Audio + Fullscreen */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Audio Sound Quick-Toggle Button */}
          <motion.button
            {...buttonTapProps}
            onClick={toggleSound}
            className={`flex items-center gap-2 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-lg backdrop-blur-md border text-sm font-medium transition-all shadow-lg ${
              isMuted
                ? 'bg-black/40 hover:bg-black/60 border-white/[0.1] text-zinc-300 hover:text-white'
                : 'bg-indigo-600/70 hover:bg-indigo-600/90 border-indigo-400/40 text-white'
            }`}
            aria-label={isMuted ? 'Unmute video audio' : 'Mute video audio'}
            title={isMuted ? 'Unmute Lofi Study Music' : 'Mute Lofi Study Music'}
          >
            {isMuted ? (
              <>
                <VolumeX className="w-4 h-4 text-zinc-400" />
                <span className="hidden md:inline text-xs">Sound: Off</span>
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4 text-emerald-300 animate-pulse" />
                <span className="hidden md:inline text-xs font-semibold">Sound: On</span>
              </>
            )}
          </motion.button>

          {/* Fullscreen Toggle */}
          <motion.button
            {...buttonTapProps}
            onClick={toggleFullscreen}
            className="p-2 sm:p-2.5 rounded-lg bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/[0.1] text-zinc-200 hover:text-white transition-colors shadow-lg"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 sm:w-5 sm:h-5" />
            ) : (
              <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
          </motion.button>
        </div>
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

      {/* Floating Lofi Music Ambient Player (Bottom Center) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.5 }}
        className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-auto"
      >
        <div className="flex items-center gap-3 px-4 py-2 sm:px-5 sm:py-2.5 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-xl border border-white/15 shadow-2xl shadow-black/50 transition-all">
          {/* Pulse equalizer / Music icon */}
          <div className="flex items-center gap-1.5 text-indigo-400">
            <Music className="w-3.5 h-3.5" />
            <div className="flex items-end gap-0.5 h-3">
              <span className={`w-0.5 bg-indigo-400 rounded-full transition-all ${!isMuted && isPlayingMusic ? 'h-3 animate-pulse' : 'h-1'}`} />
              <span className={`w-0.5 bg-purple-400 rounded-full transition-all ${!isMuted && isPlayingMusic ? 'h-2 animate-bounce' : 'h-1'}`} />
              <span className={`w-0.5 bg-indigo-300 rounded-full transition-all ${!isMuted && isPlayingMusic ? 'h-3.5 animate-pulse' : 'h-1'}`} />
            </div>
          </div>

          <span className="text-xs font-medium text-zinc-300 hidden sm:inline truncate max-w-[140px]">
            Lofi Cat Beats
          </span>

          <div className="h-4 w-px bg-white/10" />

          {/* Play/Pause */}
          <button
            type="button"
            onClick={togglePlayback}
            className="cursor-pointer p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95"
            title={isPlayingMusic ? 'Pause Video/Audio' : 'Play Video/Audio'}
            aria-label={isPlayingMusic ? 'Pause Video/Audio' : 'Play Video/Audio'}
          >
            {isPlayingMusic ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          </button>

          {/* Mute/Unmute */}
          <button
            type="button"
            onClick={toggleSound}
            className={`cursor-pointer p-1.5 rounded-full transition-all active:scale-95 ${
              isMuted
                ? 'bg-white/10 hover:bg-white/20 text-zinc-400 hover:text-white'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }`}
            title={isMuted ? 'Unmute Lofi Audio' : 'Mute Lofi Audio'}
            aria-label={isMuted ? 'Unmute Lofi Audio' : 'Mute Lofi Audio'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          {/* Volume Slider */}
          <div className="flex items-center gap-1.5 pl-1">
            <input
              type="range"
              min="0"
              max="100"
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                const newVol = Number(e.target.value);
                setVolume(newVol);
                if (isMuted && newVol > 0) {
                  setIsMuted(false);
                }
              }}
              className="w-16 sm:w-20 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-400 hover:accent-indigo-300"
              title={`Volume: ${isMuted ? 0 : volume}%`}
              aria-label="Lofi Music Volume Slider"
            />
            <span className="text-[10px] font-mono text-zinc-400 w-6 text-right">
              {isMuted ? '0%' : `${volume}%`}
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
