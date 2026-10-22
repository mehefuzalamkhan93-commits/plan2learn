'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Home,
  Calendar,
  Sparkles,
  Flame,
  MoreHorizontal,
  X,
  Settings,
  Compass,
  FileText,
  Moon,
  Sun,
  LogOut,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme';
import { useAuth } from '@/hooks/useAuth';
import SettingsModal from '@/components/settings/SettingsModal';
import AppLogo from '@/components/ui/AppLogo';

interface MobileBottomNavProps {
  active: 'home' | 'planner' | 'ai' | 'focus' | 'more';
}

export default function MobileBottomNav({ active }: MobileBottomNavProps) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const [showMoreDrawer, setShowMoreDrawer] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'profile' | 'account'>('account');

  return (
    <>
      <nav
        aria-label="Mobile Navigation"
        className="fixed bottom-0 inset-x-0 z-40 block lg:hidden border-t border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-[#070A12]/95 dark:bg-[#070A12]/95 light:bg-white/95 backdrop-blur-xl shadow-lg pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5"
      >
        <div className="mx-auto flex max-w-md items-center justify-around px-2">
          {/* 1. Home */}
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            aria-current={active === 'home' ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center justify-center gap-1 py-1 px-3 cursor-pointer group transition-colors',
              active === 'home'
                ? 'text-indigo-400 dark:text-indigo-400 light:text-indigo-600'
                : 'text-zinc-400 dark:text-zinc-400 light:text-slate-500 hover:text-white dark:hover:text-white light:hover:text-slate-900'
            )}
          >
            <Home className="h-5 w-5" />
            <span
              className={cn(
                'text-[10px]',
                active === 'home' ? 'font-bold' : 'font-medium'
              )}
            >
              Home
            </span>
            <span
              className={cn(
                'h-1 w-1 rounded-full -mt-0.5 transition-opacity',
                active === 'home'
                  ? 'bg-indigo-400 dark:bg-indigo-400 light:bg-indigo-600 opacity-100'
                  : 'opacity-0'
              )}
            />
          </button>

          {/* 2. Planner */}
          <button
            type="button"
            onClick={() => router.push('/planner')}
            aria-current={active === 'planner' ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center justify-center gap-1 py-1 px-3 cursor-pointer group transition-colors',
              active === 'planner'
                ? 'text-indigo-400 dark:text-indigo-400 light:text-indigo-600'
                : 'text-zinc-400 dark:text-zinc-400 light:text-slate-500 hover:text-white dark:hover:text-white light:hover:text-slate-900'
            )}
          >
            <Calendar className="h-5 w-5" />
            <span
              className={cn(
                'text-[10px]',
                active === 'planner' ? 'font-bold' : 'font-medium'
              )}
            >
              Planner
            </span>
            <span
              className={cn(
                'h-1 w-1 rounded-full -mt-0.5 transition-opacity',
                active === 'planner'
                  ? 'bg-indigo-400 dark:bg-indigo-400 light:bg-indigo-600 opacity-100'
                  : 'opacity-0'
              )}
            />
          </button>

          {/* 3. AI (Center Action) */}
          <button
            type="button"
            onClick={() => router.push('/ai')}
            aria-current={active === 'ai' ? 'page' : undefined}
            className="flex flex-col items-center justify-center gap-1 py-1 px-3 cursor-pointer text-zinc-400 dark:text-zinc-400 light:text-slate-500 hover:text-white dark:hover:text-white light:hover:text-slate-900 transition-colors"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md shadow-indigo-600/40 -mt-2.5 ring-4 ring-[#070A12] dark:ring-[#070A12] light:ring-white transition-transform active:scale-95">
              <Sparkles className="h-4 w-4" />
            </div>
            <span
              className={cn(
                'text-[10px]',
                active === 'ai' ? 'font-bold text-indigo-400 dark:text-indigo-400 light:text-indigo-600' : 'font-medium'
              )}
            >
              AI
            </span>
            <span className="h-1 w-1 opacity-0 -mt-0.5" />
          </button>

          {/* 4. Focus */}
          <button
            type="button"
            onClick={() => router.push('/focus')}
            aria-current={active === 'focus' ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center justify-center gap-1 py-1 px-3 cursor-pointer group transition-colors',
              active === 'focus'
                ? 'text-indigo-400 dark:text-indigo-400 light:text-indigo-600'
                : 'text-zinc-400 dark:text-zinc-400 light:text-slate-500 hover:text-white dark:hover:text-white light:hover:text-slate-900'
            )}
          >
            <Flame className="h-5 w-5" />
            <span
              className={cn(
                'text-[10px]',
                active === 'focus' ? 'font-bold' : 'font-medium'
              )}
            >
              Focus
            </span>
            <span
              className={cn(
                'h-1 w-1 rounded-full -mt-0.5 transition-opacity',
                active === 'focus'
                  ? 'bg-indigo-400 dark:bg-indigo-400 light:bg-indigo-600 opacity-100'
                  : 'opacity-0'
              )}
            />
          </button>

          {/* 5. More */}
          <button
            type="button"
            onClick={() => setShowMoreDrawer(true)}
            aria-expanded={showMoreDrawer}
            className="flex flex-col items-center justify-center gap-1 py-1 px-3 cursor-pointer text-zinc-400 dark:text-zinc-400 light:text-slate-500 hover:text-white dark:hover:text-white light:hover:text-slate-900 transition-colors"
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] font-medium">More</span>
            <span className="h-1 w-1 opacity-0 -mt-0.5" />
          </button>
        </div>
      </nav>

      {/* Slide-Up More Drawer (Screen #9) */}
      {showMoreDrawer && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end block lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setShowMoreDrawer(false)}
            aria-hidden="true"
          />

          <div className="relative z-10 w-full max-w-md mx-auto rounded-t-3xl border-t border-white/[0.1] dark:border-white/[0.1] light:border-slate-200 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white p-5 shadow-2xl animate-slide-up">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-600 dark:bg-zinc-600 light:bg-slate-300" />

            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] dark:border-white/[0.08] light:border-slate-200">
              <div className="flex items-center gap-2.5">
                <AppLogo size="xs" />
                <span className="text-sm font-bold text-white dark:text-white light:text-slate-900">
                  Plan2Learn Menu
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowMoreDrawer(false)}
                className="rounded-lg p-1 text-zinc-400 hover:text-white dark:hover:text-white light:text-slate-400 light:hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-1">
              <button
                type="button"
                onClick={() => {
                  setShowMoreDrawer(false);
                  setSettingsInitialTab('account');
                  setShowSettingsModal(true);
                }}
                className="flex w-full items-center justify-between rounded-xl p-3 text-xs font-semibold text-zinc-200 dark:text-zinc-200 light:text-slate-800 hover:bg-white/[0.05] dark:hover:bg-white/[0.05] light:hover:bg-slate-50 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
                    <Settings className="h-4 w-4" />
                  </div>
                  <span>Settings &amp; Preferences</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMoreDrawer(false);
                  setSettingsInitialTab('profile');
                  setShowSettingsModal(true);
                }}
                className="flex w-full items-center justify-between rounded-xl p-3 text-xs font-semibold text-zinc-200 dark:text-zinc-200 light:text-slate-800 hover:bg-white/[0.05] dark:hover:bg-white/[0.05] light:hover:bg-slate-50 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/15 text-purple-400">
                    <User className="h-4 w-4" />
                  </div>
                  <span>Student Profile</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMoreDrawer(false);
                  router.push('/planner');
                }}
                className="flex w-full items-center justify-between rounded-xl p-3 text-xs font-semibold text-zinc-200 dark:text-zinc-200 light:text-slate-800 hover:bg-white/[0.05] dark:hover:bg-white/[0.05] light:hover:bg-slate-50 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/15 text-purple-400">
                    <Compass className="h-4 w-4" />
                  </div>
                  <span>Study Roadmap / Planner</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMoreDrawer(false);
                  router.push('/ai?tab=intel');
                }}
                className="flex w-full items-center justify-between rounded-xl p-3 text-xs font-semibold text-zinc-200 dark:text-zinc-200 light:text-slate-800 hover:bg-white/[0.05] dark:hover:bg-white/[0.05] light:hover:bg-slate-50 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
                    <FileText className="h-4 w-4" />
                  </div>
                  <span>Academic Intel</span>
                </div>
              </button>

              {/* Theme Toggle */}
              <div className="flex w-full items-center justify-between rounded-xl p-3 text-xs font-semibold text-zinc-200 dark:text-zinc-200 light:text-slate-800 border-t border-white/[0.06] dark:border-white/[0.06] light:border-slate-200 mt-2 pt-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                    {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  </div>
                  <span>Theme: {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                </div>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="rounded-lg border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-white/[0.05] dark:bg-white/[0.05] light:bg-slate-100 px-3 py-1.5 text-[11px] font-medium text-white dark:text-white light:text-slate-800 transition-colors"
                >
                  Switch
                </button>
              </div>

              {/* Logout */}
              <button
                type="button"
                onClick={async () => {
                  setShowMoreDrawer(false);
                  await logout();
                  router.push('/login');
                }}
                className="flex w-full items-center justify-between rounded-xl p-3 text-xs font-semibold text-rose-400 dark:text-rose-400 light:text-rose-600 hover:bg-rose-500/10 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/15 text-rose-400">
                    <LogOut className="h-4 w-4" />
                  </div>
                  <span>Logout</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          initialTab={settingsInitialTab}
        />
      )}
    </>
  );
}
