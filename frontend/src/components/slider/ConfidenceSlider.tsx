'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Brain, Clock, ShieldCheck } from 'lucide-react';
import { buttonTapProps, springs } from '@/lib/motion';

interface ConfidenceSliderProps {
  topicName: string;
  onSubmit: (rating: number) => void;
  onClose: () => void;
}

const TIERS = [
  {
    level: 1,
    title: 'Lost',
    description: 'No recall without substantial review prompts',
    interval: '12 hours',
    color: 'text-rose-400',
    border: 'border-rose-500/20',
  },
  {
    level: 2,
    title: 'Shaky',
    description: 'Vague recollection with considerable effort',
    interval: '24 hours',
    color: 'text-amber-400',
    border: 'border-amber-500/20',
  },
  {
    level: 3,
    title: 'Moderate',
    description: 'Adequate recall after slight hesitation',
    interval: '3 days',
    color: 'text-zinc-200',
    border: 'border-white/[0.08]',
  },
  {
    level: 4,
    title: 'Solid',
    description: 'Confident, fluent recall without hesitation',
    interval: '7 days',
    color: 'text-indigo-400',
    border: 'border-indigo-500/20',
  },
  {
    level: 5,
    title: 'Mastered',
    description: 'Flawless instant recall, second nature',
    interval: '14 days',
    color: 'text-emerald-400',
    border: 'border-emerald-500/20',
  },
];

export default function ConfidenceSlider({
  topicName,
  onSubmit,
  onClose,
}: ConfidenceSliderProps) {
  const [rating, setRating] = useState<number>(3);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeTier = TIERS[rating - 1];

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        setRating((prev) => Math.min(5, prev + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        setRating((prev) => Math.max(1, prev - 1));
      } else if (e.key === 'Enter') {
        onSubmit(rating);
        onClose();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rating, onSubmit, onClose]);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const newRating = Math.max(1, Math.min(5, Math.round(percent * 4) + 1));
    setRating(newRating);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={springs.gentle}
        className="w-full max-w-[460px] bg-zinc-950/95 border border-white/[0.1] rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-zinc-400" />
              <h3 className="text-base font-semibold text-zinc-100">
                Log Recall Confidence
              </h3>
            </div>
            <p className="text-xs text-zinc-400 truncate max-w-[320px]">
              {topicName}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selected Tier Card */}
        <div className="p-4 rounded-xl bg-zinc-900/40 border border-white/[0.08] flex items-center justify-between transition-all duration-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 border border-white/[0.06]">
                Level {activeTier.level}
              </span>
              <span className={`text-sm font-semibold ${activeTier.color}`}>
                {activeTier.title}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1.5 max-w-[240px]">
              {activeTier.description}
            </p>
          </div>

          <div className="text-right pl-3 border-l border-white/[0.06]">
            <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
              Next Recall
            </div>
            <div className="text-sm font-semibold text-zinc-100 mt-0.5">
              +{activeTier.interval}
            </div>
          </div>
        </div>

        {/* Spring Draggable Track Control */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Recall Retention Scale</span>
            <span className="font-mono text-zinc-300">Level {rating} of 5</span>
          </div>

          {/* Interactive Notch Track */}
          <div
            ref={trackRef}
            onClick={handleTrackClick}
            className="relative h-9 w-full bg-zinc-900/80 rounded-xl border border-white/[0.08] flex items-center px-4 cursor-pointer select-none"
          >
            {/* Filled background track */}
            <div
              className="absolute left-1 top-1 bottom-1 bg-zinc-800/80 rounded-lg transition-all duration-200 pointer-events-none"
              style={{
                width: `calc(${((rating - 1) / 4) * 100}% - 2px)`,
              }}
            />

            {/* 5 Notch Step Buttons */}
            <div className="relative w-full flex items-center justify-between z-10">
              {TIERS.map((tier) => (
                <button
                  key={tier.level}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRating(tier.level);
                  }}
                  className={`w-7 h-7 rounded-lg text-xs font-mono font-medium flex items-center justify-center transition-all duration-150 ${
                    rating === tier.level
                      ? 'bg-zinc-100 text-zinc-950 font-bold shadow-md scale-110'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {tier.level}
                </button>
              ))}
            </div>
          </div>

          {/* Notch Labels */}
          <div className="flex justify-between px-1 text-[10px] font-mono text-zinc-400">
            <span>1 · Immediate</span>
            <span>3 · Moderate</span>
            <span>5 · Mastered</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium border border-white/[0.08] transition-colors"
          >
            Cancel
          </button>

          <motion.button
            {...buttonTapProps}
            onClick={() => {
              onSubmit(rating);
              onClose();
            }}
            className="flex-1 py-2.5 px-4 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
          >
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Confirm & Update</span>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
