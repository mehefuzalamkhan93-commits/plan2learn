'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI, setStoredToken } from '@/services/api';
import { setManualLogoutInProgress } from '@/hooks/useDeviceSync';

export function useDeviceAwareLogout() {
  const router = useRouter();
  const [isCheckingDevices, setIsCheckingDevices] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [activeDevicesCount, setActiveDevicesCount] = useState(1);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const requestLogout = useCallback(async () => {
    setIsCheckingDevices(true);
    setManualLogoutInProgress(true);
    try {
      const devices = await authAPI.getDevices();
      const count = Array.isArray(devices) ? devices.length : 1;
      setActiveDevicesCount(count);

      if (count > 1) {
        // Multi-device active: show custom branded in-app confirmation modal
        setShowConfirmModal(true);
      } else {
        // Single session: log out immediately without showing the modal
        setIsLoggingOut(true);
        try {
          await authAPI.logout({ allDevices: false });
        } catch (e) {
          console.warn('Logout endpoint response error:', e);
        } finally {
          setStoredToken(null);
          try {
            sessionStorage.removeItem('p2l_session_splash_shown');
          } catch {}
          router.push('/login');
        }
      }
    } catch (err) {
      console.warn('Failed to query device count, performing direct logout:', err);
      // Fallback: direct logout if device check fails
      try {
        await authAPI.logout({ allDevices: false });
      } catch {}
      setStoredToken(null);
      try {
        sessionStorage.removeItem('p2l_session_splash_shown');
      } catch {}
      router.push('/login');
    } finally {
      setIsCheckingDevices(false);
    }
  }, [router]);

  const confirmLogout = useCallback(async (options?: { allDevices?: boolean }) => {
    setIsLoggingOut(true);
    try {
      await authAPI.logout(options);
      setStoredToken(null);
      try {
        sessionStorage.removeItem('p2l_session_splash_shown');
      } catch {}
      setShowConfirmModal(false);
      router.push('/login');
    } catch (err) {
      console.error('Logout failed:', err);
      throw err; // let modal display error feedback
    } finally {
      setIsLoggingOut(false);
    }
  }, [router]);

  const cancelLogout = useCallback(() => {
    if (!isLoggingOut) {
      setShowConfirmModal(false);
      setManualLogoutInProgress(false);
    }
  }, [isLoggingOut]);

  return {
    requestLogout,
    isCheckingDevices,
    showConfirmModal,
    activeDevicesCount,
    confirmLogout,
    cancelLogout,
    isLoggingOut,
  };
}
