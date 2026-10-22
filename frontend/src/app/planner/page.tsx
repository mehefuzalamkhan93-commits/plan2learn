'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import MobilePlanner from '@/components/plan/MobilePlanner';
import AppLogo from '@/components/ui/AppLogo';

export default function PlannerPage() {
  return (
    <main className="min-h-screen bg-[#070A12] dark:bg-[#070A12] light:bg-[#f8fafc] text-slate-100 dark:text-slate-100 light:text-slate-900">
      {/* Mobile Dedicated Planner (< 1024px, matches Screen #7 in UI Showcase) */}
      <div className="block lg:hidden">
        <MobilePlanner />
      </div>

      {/* Desktop Planner View (>= 1024px, desktop preserved) */}
      <div className="hidden lg:block min-h-screen">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between pb-6 border-b border-white/[0.08] dark:border-white/[0.08] light:border-slate-200">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-white/[0.04] dark:bg-white/[0.04] light:bg-white px-3 py-1.5 text-xs font-semibold text-zinc-300 dark:text-zinc-300 light:text-slate-700 hover:text-white dark:hover:text-white transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Dashboard</span>
              </Link>
              <AppLogo size="sm" href="/dashboard" priority />
              <h1 className="text-2xl font-bold tracking-tight text-white dark:text-white light:text-slate-900">
                Study Planner &amp; Schedule
              </h1>
            </div>
            <Link
              href="/ai?tab=roadmap"
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>AI Roadmap Generator</span>
            </Link>
          </div>

          <div className="mt-6 max-w-xl mx-auto">
            <MobilePlanner />
          </div>
        </div>
      </div>
    </main>
  );
}
