'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { syncAPI, setStoredToken } from '@/services/api';
import { usePlannerStore } from '@/store/usePlannerStore';
import { useAuth } from '@/hooks/useAuth';

const SYNC_INTERVAL_MS = 15000; // 15 seconds heartbeat

export function useDeviceSync() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeDevicesCount, setActiveDevicesCount] = useState<number>(1);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const isEvictedRef = useRef<boolean>(false);

  const fetchDashboardSummary = usePlannerStore((state) => state.fetchDashboardSummary);

  const performSync = useCallback(async () => {
    if (!user || !user.is_onboarded || isEvictedRef.current) return;

    try {
      setIsSyncing(true);
      const status = await syncAPI.getStatus();
      if (status) {
        setActiveDevicesCount(status.active_devices_count || 1);
        setLastSyncedAt(new Date());
        // Sync stores across devices (refresh tasks, streaks, and dashboard)
        fetchDashboardSummary().catch(() => {});
      }
    } catch (err: unknown) {
      const errorObj =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { status?: number; data?: { detail?: string } } })
          : null;

      if (errorObj?.response?.status === 401 && !isEvictedRef.current) {
        isEvictedRef.current = true;
        setStoredToken(null);
        alert(
          'Your session has ended because this account was logged into on another device (maximum 2 active devices allowed).'
        );
        router.replace('/login');
      }
    } finally {
      setIsSyncing(false);
    }
  }, [user, router, fetchDashboardSummary]);

  useEffect(() => {
    if (!user || !user.is_onboarded) return;

    // 1. Initial sync
    performSync();

    // 2. Periodic heartbeat sync every 15 seconds
    const interval = setInterval(performSync, SYNC_INTERVAL_MS);

    // 3. Sync immediately when tab/window gains focus (e.g. switching between phone & PC)
    const handleFocus = () => {
      performSync();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        performSync();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, performSync]);

  return {
    activeDevicesCount,
    isSyncing,
    lastSyncedAt,
    syncNow: performSync,
  };
}
