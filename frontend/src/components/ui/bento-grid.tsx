'use client';

import { motion, type Variants } from 'framer-motion';
import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface BentoGridProps {
  className?: string;
  children?: ReactNode;
}

export interface BentoCardProps {
  className?: string;
  children?: ReactNode;
  glowColor?: 'cyan' | 'violet' | 'amber' | 'emerald' | 'rose';
  colSpan?: 1 | 2 | 3 | 4;
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 260,
      damping: 24,
    },
  },
};

export function BentoGrid({ className, children }: BentoGridProps) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={cn(
        'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 w-full',
        className
      )}
    >
      {children}
    </motion.div>
  );
}

const glowColorMap = {
  cyan: 'hover:border-cyan-500/40 hover:shadow-[0_0_30px_-5px_rgba(6,182,212,0.25)] group-hover:bg-cyan-500/5',
  violet: 'hover:border-violet-500/40 hover:shadow-[0_0_30px_-5px_rgba(139,92,246,0.25)] group-hover:bg-violet-500/5',
  amber: 'hover:border-amber-500/40 hover:shadow-[0_0_30px_-5px_rgba(245,158,11,0.25)] group-hover:bg-amber-500/5',
  emerald: 'hover:border-emerald-500/40 hover:shadow-[0_0_30px_-5px_rgba(16,185,129,0.25)] group-hover:bg-emerald-500/5',
  rose: 'hover:border-rose-500/40 hover:shadow-[0_0_30px_-5px_rgba(244,63,94,0.25)] group-hover:bg-rose-500/5',
};

const colSpanMap = {
  1: 'col-span-1',
  2: 'col-span-1 md:col-span-2',
  3: 'col-span-1 md:col-span-3',
  4: 'col-span-1 md:col-span-2 lg:col-span-4',
};

export function BentoCard({
  className,
  children,
  glowColor = 'cyan',
  colSpan = 1,
}: BentoCardProps) {
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      className={cn(
        'relative group overflow-hidden rounded-2xl p-5',
        'bg-[#0f1322]/80 backdrop-blur-xl border border-white/[0.08]',
        'transition-all duration-300',
        glowColorMap[glowColor],
        colSpanMap[colSpan],
        className
      )}
    >
      {/* Subtle ambient light gradient inside */}
      <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-cyan-500/5 blur-3xl pointer-events-none group-hover:bg-cyan-500/10 transition-colors" />
      
      {/* Corner cyber ticks */}
      <div className="absolute top-2 left-2 w-1.5 h-1.5 border-t border-l border-white/20" />
      <div className="absolute top-2 right-2 w-1.5 h-1.5 border-t border-r border-white/20" />
      <div className="absolute bottom-2 left-2 w-1.5 h-1.5 border-b border-l border-white/20" />
      <div className="absolute bottom-2 right-2 w-1.5 h-1.5 border-b border-r border-white/20" />

      {children}
    </motion.div>
  );
}
