import { useEffect, useRef } from 'react';
import { usePlannerStore } from '@/store/usePlannerStore';

export function usePomodoro() {
  const {
    pomodoro,
    startPomodoro,
    pausePomodoro,
    resumePomodoro,
    resetPomodoro,
    tickPomodoro,
    switchSession,
  } = usePlannerStore();

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (pomodoro.status === 'RUNNING') {
      intervalRef.current = setInterval(() => {
        tickPomodoro();
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [pomodoro.status, tickPomodoro]);

  // Auto-complete detection
  useEffect(() => {
    if (pomodoro.secondsRemaining === 0 && pomodoro.status === 'IDLE') {
      // Could trigger notification here
      console.log('Pomodoro session completed!');
    }
  }, [pomodoro.secondsRemaining, pomodoro.status]);

  return {
    pomodoro,
    startPomodoro,
    pausePomodoro,
    resumePomodoro,
    resetPomodoro,
    switchSession,
  };
}
