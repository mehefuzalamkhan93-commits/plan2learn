'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Laptop, Smartphone, AlertTriangle, Loader2, X, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LogoutConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (options?: { allDevices?: boolean }) => Promise<void>;
  activeDevicesCount?: number;
}

export default function LogoutConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  activeDevicesCount = 2,
}: LogoutConfirmModalProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutTarget, setLogoutTarget] = useState<'current' | 'all' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Focus management & Escape key handling
  useEffect(() => {
    if (!isOpen) {
      setErrorMessage(null);
      setIsLoggingOut(false);
      setLogoutTarget(null);
      return;
    }

    // Auto-focus cancel button for safe keyboard navigation
    const timeout = setTimeout(() => {
      cancelButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!isLoggingOut) {
          e.preventDefault();
          onClose();
        }
      }

      // Simple focus trap
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isLoggingOut, onClose]);

  if (!isOpen) return null;

  const handleLogoutCurrent = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutTarget('current');
    setErrorMessage(null);
    try {
      await onConfirm({ allDevices: false });
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to complete logout. Please check connection and try again.';
      setErrorMessage(msg);
      setIsLoggingOut(false);
      setLogoutTarget(null);
    }
  };

  const handleLogoutAll = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutTarget('all');
    setErrorMessage(null);
    try {
      await onConfirm({ allDevices: true });
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to log out all devices. Please retry.';
      setErrorMessage(msg);
      setIsLoggingOut(false);
      setLogoutTarget(null);
    }
  };

  return createPortal(
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-dialog-title"
        aria-describedby="logout-dialog-desc"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isLoggingOut) {
            onClose();
          }
        }}
      >
        <motion.div
          ref={dialogRef}
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="relative w-full max-w-md rounded-2xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-200 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white p-5 sm:p-6 shadow-2xl overflow-hidden"
        >
          {/* Subtle top indicator bar */}
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-500" />

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            disabled={isLoggingOut}
            aria-label="Cancel and close dialog"
            className="absolute top-4 right-4 rounded-lg p-1 text-zinc-400 hover:text-white dark:hover:text-white light:text-slate-400 light:hover:text-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Icon & Title */}
          <div className="flex items-start gap-3.5 pt-1">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-400 dark:text-amber-400 light:text-amber-600 light:bg-amber-50">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h2
                id="logout-dialog-title"
                className="text-base sm:text-lg font-bold tracking-tight text-white dark:text-white light:text-slate-900"
              >
                Sign Out of Current Device?
              </h2>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-400/90 dark:text-amber-400/90 light:text-amber-700 font-medium">
                <Laptop className="h-3.5 w-3.5" />
                <span>Signed in on {activeDevicesCount} active devices</span>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="mt-4 rounded-xl border border-white/[0.06] dark:border-white/[0.06] light:border-slate-200/80 bg-white/[0.02] dark:bg-white/[0.02] light:bg-slate-50 p-3.5 space-y-2">
            <p
              id="logout-dialog-desc"
              className="text-xs sm:text-sm leading-relaxed text-zinc-300 dark:text-zinc-300 light:text-slate-700"
            >
              Your account is currently signed in on multiple devices. Do you want to log out from this device?
            </p>
            <p className="text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-400 light:text-slate-500">
              Logging out will invalidate the session on this device and return to sign in. Your other device session will remain safely active.
            </p>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="mt-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400 dark:text-rose-400 light:text-rose-600 flex items-start gap-2 animate-fade-in">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
            <button
              ref={cancelButtonRef}
              type="button"
              onClick={onClose}
              disabled={isLoggingOut}
              className="w-full sm:w-auto rounded-xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-white/[0.04] dark:bg-white/[0.04] light:bg-slate-100 px-4 py-2.5 text-xs font-semibold text-zinc-300 dark:text-zinc-300 light:text-slate-700 hover:text-white dark:hover:text-white light:hover:text-slate-900 hover:bg-white/[0.08] transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleLogoutCurrent}
              disabled={isLoggingOut}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-rose-600/30 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
            >
              {isLoggingOut && logoutTarget === 'current' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Logging out…</span>
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4" />
                  <span>Log out this device</span>
                </>
              )}
            </button>
          </div>

          {/* Secondary subtle action: Log out all devices */}
          <div className="mt-3 pt-3 border-t border-white/[0.06] dark:border-white/[0.06] light:border-slate-100 flex justify-center">
            <button
              type="button"
              onClick={handleLogoutAll}
              disabled={isLoggingOut}
              className="text-[11px] font-medium text-zinc-400 dark:text-zinc-400 light:text-slate-500 hover:text-rose-400 dark:hover:text-rose-400 light:hover:text-rose-600 transition-colors underline underline-offset-4 cursor-pointer disabled:opacity-40"
            >
              {isLoggingOut && logoutTarget === 'all'
                ? 'Revoking all sessions…'
                : 'Or sign out of all devices'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
