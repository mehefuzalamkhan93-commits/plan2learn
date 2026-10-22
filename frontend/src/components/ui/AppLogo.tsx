import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface AppLogoProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  href?: string;
  priority?: boolean;
  subtitle?: string;
}

const sizeConfig = {
  xs: { box: 'h-6 w-6 rounded-md', imgSize: 24, text: 'text-xs', subtitle: 'text-[9px]' },
  sm: { box: 'h-8 w-8 rounded-lg', imgSize: 32, text: 'text-sm', subtitle: 'text-[10px]' },
  md: { box: 'h-10 w-10 rounded-xl', imgSize: 40, text: 'text-base', subtitle: 'text-xs' },
  lg: { box: 'h-14 w-14 rounded-2xl', imgSize: 56, text: 'text-lg', subtitle: 'text-xs' },
  xl: { box: 'h-20 w-20 rounded-3xl', imgSize: 80, text: 'text-2xl', subtitle: 'text-sm' },
};

export default function AppLogo({
  className,
  size = 'md',
  showText = false,
  href,
  priority = false,
  subtitle,
}: AppLogoProps) {
  const { box, imgSize, text, subtitle: subtitleClass } = sizeConfig[size];

  const content = (
    <div className={cn('inline-flex items-center gap-2.5 shrink-0', className)}>
      <div
        className={cn(
          'relative overflow-hidden border border-white/10 dark:border-white/10 light:border-slate-200 bg-white shadow-sm flex items-center justify-center shrink-0 p-0.5',
          box
        )}
      >
        <Image
          src="/images/app-logo.jpg"
          alt="Plan2Learn"
          width={imgSize * 2}
          height={imgSize * 2}
          priority={priority}
          className="h-full w-full object-contain rounded-md"
        />
      </div>
      {showText && (
        <div className="flex flex-col leading-tight">
          <span className={cn('font-bold tracking-tight text-white dark:text-white light:text-slate-900', text)}>
            Plan2Learn
          </span>
          {subtitle && (
            <span className={cn('font-medium text-indigo-400 dark:text-indigo-400 light:text-indigo-600 tracking-wide', subtitleClass)}>
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex transition-opacity hover:opacity-90 active:scale-95">
        {content}
      </Link>
    );
  }

  return content;
}
