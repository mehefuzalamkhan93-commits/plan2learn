'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { BookOpen, ExternalLink, ArrowUpRight } from 'lucide-react';
import { itemEntranceVariants, cardHoverProps } from '@/lib/motion';

interface ResourceItem {
  id: string;
  title: string;
  subject: string;
  type: string;
  estimatedTime: string;
  url: string;
}

interface StudyResourcesProps {
  resources?: ResourceItem[];
}

export default function StudyResources({ resources = [] }: StudyResourcesProps) {
  return (
    <motion.section
      variants={itemEntranceVariants}
      className="rounded-2xl bg-zinc-900/40 backdrop-blur-md border border-white/[0.08] overflow-hidden"
    >
      {/* Header */}
      <div className="p-5 sm:p-6 xl:p-7 border-b border-white/[0.08] flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg sm:text-xl xl:text-2xl font-semibold text-zinc-100">
              Curated Study References
            </h2>
            <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-zinc-800/80 text-zinc-300 border border-white/[0.06]">
              {resources.length} Guides
            </span>
          </div>
          <p className="text-sm xl:text-[15px] text-zinc-400 mt-1.5">
            High-yield reference material synchronized with your active syllabus
          </p>
        </div>
      </div>

      {/* Resource Table / List or Clean Empty State */}
      <div className="divide-y divide-white/[0.05]">
        {resources.length === 0 ? (
          <div className="p-10 text-center text-zinc-400 text-sm">
            <p>No curated study references attached to your current plan yet.</p>
            <p className="mt-1.5 text-xs text-zinc-500">
              Verified references are linked as you complete and confirm syllabus topics with the AI Assistant.
            </p>
          </div>
        ) : (
          resources.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 sm:p-5 xl:p-6 flex items-center justify-between gap-4 hover:bg-zinc-800/20 transition-colors duration-150 group"
            >
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm xl:text-base xl:text-[17px] font-medium text-zinc-200 group-hover:text-zinc-100 transition-colors truncate block">
                    {item.title}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 text-sm xl:text-[15px] text-zinc-400 flex-wrap">
                  <span className="text-zinc-300 font-medium">{item.subject}</span>
                  <span className="text-zinc-600">·</span>
                  <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-800/80 text-zinc-300 border border-white/[0.06]">
                    {item.type}
                  </span>
                  <span className="text-zinc-600">·</span>
                  <span>{item.estimatedTime}</span>
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-1.5 text-sm xl:text-[15px] text-zinc-400 group-hover:text-zinc-200 transition-colors">
                <span className="hidden sm:inline">Open</span>
                <ArrowUpRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </a>
          ))
        )}
      </div>
    </motion.section>
  );
}
