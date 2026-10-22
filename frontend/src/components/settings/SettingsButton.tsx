'use client';

import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import SettingsModal from './SettingsModal';
import { cn } from '@/lib/utils';

interface SettingsButtonProps {
  className?: string;
  variant?: 'compact' | 'standard';
  showLabel?: boolean;
}

export default function SettingsButton({
  className,
  variant = 'standard',
  showLabel = true,
}: SettingsButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="Settings & Profile"
        className={cn(
          'inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.08] bg-zinc-900/60 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white',
          variant === 'compact' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3',
          className
        )}
      >
        <Settings className={cn('h-4 w-4 text-zinc-400 group-hover:text-white', variant === 'compact' && 'h-3.5 w-3.5')} />
        {showLabel && <span>Settings</span>}
      </button>

      {isOpen && <SettingsModal isOpen={isOpen} onClose={() => setIsOpen(false)} />}
    </>
  );
}
