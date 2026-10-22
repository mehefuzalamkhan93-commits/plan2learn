'use client';

import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DrawerShellProps {
  side: 'left' | 'right';
  title: string;
  icon: React.ReactNode;
  meta?: React.ReactNode;
  isOpen?: boolean;
  onClose: () => void;
  children: React.ReactNode;
  contentClassName?: string;
}

/**
 * NotebookLM-style collapsible drawer shell.
 *
 * Desktop (>=768px): A static column inside the workspace flex-row that fills
 * 100% height. When closed, it stays mounted with display:none to preserve state
 * and prevent wallpaper remounting while allowing the central chat to expand.
 * Phone (<768px): An overlay drawer pinned below the top toolbar with a subtle backdrop,
 * width bounded to viewport, and accessible close button.
 */
export default function DrawerShell({
  side,
  title,
  icon,
  meta,
  isOpen = true,
  onClose,
  children,
  contentClassName,
}: DrawerShellProps) {
  const isLeft = side === 'left';
  const label = typeof title === 'string' ? title : 'Panel';

  return (
    <>
      {/* Backdrop only for real phone sizes (<768px) when open; at md+ the drawer is a side panel */}
      {isOpen && (
        <div
          className="fixed inset-x-0 bottom-0 top-14 z-40 bg-black/40 backdrop-blur-sm sm:top-16 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        data-drawer={isLeft ? 'sources' : 'studio'}
        aria-label={label}
        aria-hidden={!isOpen}
        className={cn(
          'relative overflow-hidden',
          // Phone (<768px) overlay styling
          'fixed bottom-0 top-14 z-[45] flex w-[min(90vw,360px)] max-w-full flex-col border-white/[0.08] shadow-2xl shadow-black/80 backdrop-blur-2xl md:backdrop-blur-none sm:top-16',
          isLeft ? 'left-0 border-r' : 'right-0 border-l',
          // Tablet/desktop (>=768px) in-flow flex column styling (preserves containing block and layout stability)
          'md:relative md:inset-auto md:top-0 md:bottom-auto md:left-auto md:right-auto md:z-auto md:h-full md:max-h-full md:w-[250px] md:shrink-0 md:shadow-none',
          'lg:w-[290px] xl:w-[325px] 2xl:w-[350px]',
          'border-zinc-800/80 dark:border-white/[0.08] light:border-black/[0.08]',
          // When closed, hide without unmounting to preserve internal inputs, notes, and decoded background
          !isOpen && 'hidden'
        )}
      >
        {/* Isolated wallpaper background layer strictly contained inside this drawer */}
        <div
          className={cn(
            'absolute inset-0 pointer-events-none -z-10 overflow-hidden',
            isLeft ? 'sources-wallpaper' : 'studio-wallpaper'
          )}
          aria-hidden="true"
        />
        {/* Drawer Header */}
        <div className="drawer-header flex h-12 shrink-0 items-center justify-between gap-2 border-b border-black/[0.08] dark:border-white/[0.08] px-3.5 bg-white/40 dark:bg-zinc-950/40 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0">{icon}</span>
            <span className="truncate text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-zinc-100">
              {title}
            </span>
            {meta && (
              <span className="shrink-0 rounded-full border border-slate-200 dark:border-white/[0.08] bg-slate-100 dark:bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-slate-600 dark:text-zinc-400 font-medium">
                {meta}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${label} panel`}
            title={`Close ${label}`}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Drawer Content */}
        <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 space-y-3 custom-scrollbar', contentClassName)}>
          {children}
        </div>
      </aside>
    </>
  );
}
