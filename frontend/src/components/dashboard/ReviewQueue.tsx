'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, ChevronRight, Layers } from 'lucide-react';
import { ReviewItemOut } from '@/types';
import { itemEntranceVariants, springs } from '@/lib/motion';

interface ReviewQueueProps {
  onSelectReview?: (item: ReviewItemOut) => void;
  items: ReviewItemOut[];
}

export default function ReviewQueue({ onSelectReview, items }: ReviewQueueProps) {
  const pendingCount = items.filter((item) => item.confidence_score !== null && item.confidence_score < 3).length;

  const handleReviewClick = (item: ReviewItemOut) => {
    if (onSelectReview) {
      onSelectReview(item);
    }
  };

  const getUrgencyBadge = (confidenceScore: number | null) => {
    if (confidenceScore === null) return 'text-zinc-400 bg-zinc-800/80 border-white/[0.06]';
    if (confidenceScore < 3) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    if (confidenceScore < 4) return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
    return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  };

  const getUrgencyLabel = (confidenceScore: number | null) => {
    if (confidenceScore === null) return 'New';
    if (confidenceScore < 3) return 'Due today';
    if (confidenceScore < 4) return 'Due soon';
    return 'Maintain';
  };

  return (
    <motion.section
      variants={itemEntranceVariants}
      className="rounded-2xl bg-white dark:bg-zinc-900/40 backdrop-blur-md border border-slate-200/80 dark:border-white/[0.08] shadow-sm dark:shadow-none overflow-hidden"
    >
      {/* Header */}
      <div className="p-5 sm:p-6 xl:p-7 border-b border-slate-200/80 dark:border-white/[0.08] flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg sm:text-xl xl:text-2xl font-semibold text-slate-900 dark:text-zinc-100">
              Spaced Repetition Queue
            </h2>
            <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-slate-100 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-white/[0.06]">
              {pendingCount} due
            </span>
          </div>
          <p className="text-sm xl:text-[15px] text-slate-500 dark:text-zinc-400 mt-1.5">
            Active recall intervals based on memory decay
          </p>
        </div>

        <div className="flex items-center gap-2 text-sm xl:text-[15px] text-slate-500 dark:text-zinc-400">
          <Layers className="w-4 h-4 xl:w-5 xl:h-5 text-slate-400 dark:text-zinc-400" />
          <span>
            {items.length} topics
          </span>
        </div>
      </div>

      {/* Review Items List */}
      <div className="divide-y divide-slate-200/80 dark:divide-white/[0.05]">
        {items.length === 0 ? (
          <div className="p-10 text-center text-slate-500 dark:text-zinc-400 text-sm">
            No review items yet. Complete study sessions to populate your review queue.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <motion.div
                key={item.id}
                layout
                transition={springs.layout}
                className="min-h-[78px] sm:min-h-[82px] p-4 sm:p-5 xl:py-5 xl:px-6 flex items-center justify-between gap-4 sm:gap-6 transition-colors duration-200 hover:bg-slate-50 dark:hover:bg-zinc-800/20"
              >
                {/* Topic Details */}
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base sm:text-[17px] xl:text-[18px] font-medium truncate block text-slate-900 dark:text-zinc-100">
                      {item.topic_name}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium border ${getUrgencyBadge(
                        item.confidence_score
                      )}`}
                    >
                      {getUrgencyLabel(item.confidence_score)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 text-[13px] sm:text-[14px] xl:text-[15px] text-slate-500 dark:text-zinc-400 flex-wrap">
                    <span className="text-slate-700 dark:text-zinc-300 font-medium">{item.subject}</span>
                    <span className="text-slate-300 dark:text-zinc-600">·</span>
                    {item.last_studied && (
                      <>
                        <span>Last: {item.last_studied}</span>
                        <span className="text-slate-300 dark:text-zinc-600">·</span>
                      </>
                    )}
                    <span className="font-mono text-slate-500 dark:text-zinc-400">Difficulty: {item.difficulty}/5</span>
                    <span className="text-slate-300 dark:text-zinc-600">·</span>
                    <span>
                      Confidence: <strong className="text-slate-800 dark:text-zinc-300">{item.confidence_score ?? 'N/A'}/5</strong>
                    </span>
                  </div>
                </div>

                {/* Action */}
                <div className="shrink-0 flex items-center gap-2">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => handleReviewClick(item)}
                    className="px-4 py-2.5 sm:px-5 sm:py-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 dark:text-zinc-200 dark:hover:text-white dark:border-white/[0.08] text-sm xl:text-[15px] font-medium inline-flex items-center gap-2 transition-colors shadow-xs dark:shadow-none"
                  >
                    <span>Review</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </motion.section>
  );
}