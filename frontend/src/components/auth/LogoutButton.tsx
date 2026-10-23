'use client';

import { LogOut, Loader2 } from 'lucide-react';
import { useDeviceAwareLogout } from '@/hooks/useDeviceAwareLogout';
import LogoutConfirmModal from '@/components/auth/LogoutConfirmModal';

export default function LogoutButton() {
  const {
    requestLogout,
    isCheckingDevices,
    showConfirmModal,
    activeDevicesCount,
    confirmLogout,
    cancelLogout,
    isLoggingOut,
  } = useDeviceAwareLogout();

  return (
    <>
      <button
        type="button"
        onClick={requestLogout}
        disabled={isLoggingOut || isCheckingDevices}
        className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100 disabled:opacity-50 cursor-pointer"
        aria-label="Log out"
      >
        {isLoggingOut || isCheckingDevices ? (
          <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
        ) : (
          <LogOut className="h-4 w-4" />
        )}
        <span>{isCheckingDevices ? 'Checking…' : isLoggingOut ? 'Logging out…' : 'Log out'}</span>
      </button>

      <LogoutConfirmModal
        isOpen={showConfirmModal}
        onClose={cancelLogout}
        onConfirm={confirmLogout}
        activeDevicesCount={activeDevicesCount}
      />
    </>
  );
}