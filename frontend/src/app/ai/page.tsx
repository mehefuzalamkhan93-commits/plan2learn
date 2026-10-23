'use client';

import { useEffect, useState, useCallback } from 'react';
import NextLink from 'next/link';
import {
  Sparkles,
  Calendar,
  Brain,
  ArrowLeft,
  Focus,
  Flame,
  FileText,
  Loader2,
  BookOpen,
  Target,
  AlertCircle,
  Plus,
  MoreVertical,
  ArrowRight,
  Sun,
  Moon,
} from 'lucide-react';
import { useToast } from '@/components/ui/useToast';
import { useRouter } from 'next/navigation';
import { aiAPI, plannerAPI } from '@/services/api';
import ChatWindow from '@/components/ai/ChatWindow';
import MobileAIAssistant from '@/components/ai/MobileAIAssistant';
import SourcesDrawer from '@/components/ai/SourcesDrawer';
import StudioDrawer from '@/components/ai/StudioDrawer';
import PlanPreviewModal from '@/components/ai/PlanPreviewModal';
import RoadmapCalibrationModal from '@/components/plan/RoadmapCalibrationModal';
import SettingsButton from '@/components/settings/SettingsButton';
import AppLogo from '@/components/ui/AppLogo';
import { usePlannerStore } from '@/store/usePlannerStore';
import { useTheme } from '@/lib/theme';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  NotebookOut,
  SourceListItem,
  NoteOut,
  StudyPlanProposal,
  PlanProposalGenerateRequest,
} from '@/types';

type ActiveTab = 'chat' | 'roadmap' | 'intel';

const responseStyleLabels = {
  friendly: 'Friendly Mentor',
  strict: 'Strict Study Coach',
};

function ResponseStyleBadge({
  mode,
  onToggle,
}: {
  mode: 'friendly' | 'strict';
  onToggle: (mode: 'friendly' | 'strict') => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex w-full cursor-pointer items-center gap-2 rounded-xl border border-white/[0.08] bg-zinc-900/70 px-3 py-2 text-xs font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 sm:w-auto sm:px-3.5 sm:py-2"
      onClick={() => onToggle(mode === 'friendly' ? 'strict' : 'friendly')}
      title="Click to toggle AI persona"
    >
      <span
        className={cn(
          'h-2.5 w-2.5 shrink-0 rounded-full',
          mode === 'friendly' ? 'bg-emerald-400' : 'bg-rose-400'
        )}
      />
      <span className="font-medium">{responseStyleLabels[mode]}</span>
      <span className="ml-1 hidden text-[10px] uppercase tracking-wider text-zinc-500 sm:inline">
        (toggle)
      </span>
    </button>
  );
}

export default function AIAssistantPage() {
  const { toast } = useToast();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { user, status } = useAuth();

  // Navigation & tabs
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat');
  const [menuOpen, setMenuOpen] = useState(false);

  // Workspace drawers (NotebookLM-style collapsible panels)
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [studioOpen, setStudioOpen] = useState(false);

  // Chat profiling updates
  const [profileUpdates, setProfileUpdates] = useState<any>(null);
  const [missingInfo, setMissingInfo] = useState<any>(null);
  const [responseStyle, setResponseStyle] = useState<'friendly' | 'strict'>('friendly');

  // Proposal & roadmap
  const [proposal, setProposal] = useState<StudyPlanProposal | null>(null);
  const [isGeneratingProposal, setIsGeneratingProposal] = useState(false);
  const [showCalibrationModal, setShowCalibrationModal] = useState(false);
  const [isConfirmingPlan, setIsConfirmingPlan] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Notebooks, Sources & Notes (shared between drawers and chat)
  const [notebooks, setNotebooks] = useState<NotebookOut[]>([]);
  const [currentNotebookId, setCurrentNotebookId] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceListItem[]>([]);
  const [notes, setNotes] = useState<NoteOut[]>([]);
  const [isLoadingNotebooks, setIsLoadingNotebooks] = useState(false);
  const [isLoadingSources, setIsLoadingSources] = useState(false);

  // Planner store
  const {
    userProfile,
    streak,
    readinessScore,
    fetchDashboardSummary,
    fetchUserProfile,
    isDashboardLoaded,
    isRoadmapStale,
    setIsRoadmapStale,
  } = usePlannerStore();

  useEffect(() => {
    if (status === 'authenticated' && user) {
      if (!isDashboardLoaded) {
        fetchDashboardSummary();
      }
      if (!userProfile) {
        fetchUserProfile();
      }
    }
  }, [status, user, isDashboardLoaded, userProfile, fetchDashboardSummary, fetchUserProfile]);

  // Responsive initial drawer state:
  // Desktop (>= 1024px) starts with Sources open; phone (< 768px) keeps drawers closed by default.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.scrollTo(0, 0);
    if (window.innerWidth < 768) {
      setSourcesOpen(false);
      setStudioOpen(false);
    }
  }, []);

  const closeAllDrawers = useCallback(() => {
    setSourcesOpen(false);
    setStudioOpen(false);
  }, []);

  const toggleSources = useCallback(() => {
    setSourcesOpen((prev) => {
      const next = !prev;
      // On mobile phones (<768px), close studio when opening sources to prevent overlapping modal views
      if (next && typeof window !== 'undefined' && window.innerWidth < 768) {
        setStudioOpen(false);
      }
      return next;
    });
  }, []);

  const toggleStudio = useCallback(() => {
    setStudioOpen((prev) => {
      const next = !prev;
      // On mobile phones (<768px), close sources when opening studio to prevent overlapping modal views
      if (next && typeof window !== 'undefined' && window.innerWidth < 768) {
        setSourcesOpen(false);
      }
      return next;
    });
  }, []);

  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    setMenuOpen(false);
  };

  // Load notebooks
  const loadNotebooks = useCallback(async () => {
    setIsLoadingNotebooks(true);
    try {
      const list = await aiAPI.getNotebooks();
      setNotebooks(list);
      if (list.length > 0 && !currentNotebookId) {
        setCurrentNotebookId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load notebooks:', err);
    } finally {
      setIsLoadingNotebooks(false);
    }
  }, [currentNotebookId]);

  useEffect(() => {
    loadNotebooks();
  }, [loadNotebooks]);

  // Load sources & notes for current notebook
  const loadNotebookDetails = useCallback(async (notebookId: string) => {
    setIsLoadingSources(true);
    try {
      const [sourceList, notesList] = await Promise.all([
        aiAPI.getSources(notebookId),
        aiAPI.getNotes(notebookId),
      ]);
      setSources(sourceList);
      setNotes(notesList);
    } catch (err) {
      console.error('Failed to load notebook contents:', err);
    } finally {
      setIsLoadingSources(false);
    }
  }, []);

  useEffect(() => {
    if (currentNotebookId) {
      loadNotebookDetails(currentNotebookId);
    } else {
      setSources([]);
      setNotes([]);
    }
  }, [currentNotebookId, loadNotebookDetails]);

  // Save a chat answer to notebook notes
  const handleSaveChatNote = async (title: string, content: string) => {
    if (!currentNotebookId) {
      toast({
        title: 'No active notebook',
        description: 'Please select or create a notebook first to save notes.',
        variant: 'error',
      });
      return;
    }
    try {
      await aiAPI.saveStudyToolNote({
        title,
        content,
        notebook_id: currentNotebookId,
      });
      toast({
        title: 'Note saved',
        description: 'Added to your notebook notes.',
        variant: 'default',
      });
      loadNotebookDetails(currentNotebookId);
    } catch (err: any) {
      toast({
        title: 'Failed to save note',
        description: err?.response?.data?.detail || 'Error saving note',
        variant: 'error',
      });
    }
  };

  // Proposal generation with student calibration
  const handleGenerateProposal = () => {
    setShowCalibrationModal(true);
  };

  const handleExecuteGenerateProposal = async (calibrationData: PlanProposalGenerateRequest) => {
    setIsGeneratingProposal(true);
    try {
      const response = await plannerAPI.generateProposal(calibrationData);
      if (response.success && response.proposal) {
        setProposal(response.proposal);
        setIsRoadmapStale(false);
        setShowCalibrationModal(false);
        setActiveTab('roadmap');
        closeAllDrawers();

        // Automatically activate and persist plan to database and dashboard
        try {
          await plannerAPI.confirmPlan({ proposal: response.proposal, confirmed: true });
          await fetchDashboardSummary();
          toast({
            title: 'Roadmap Saved to Dashboard!',
            description: `Generated and stored ${response.proposal.tasks.length} study tasks in your dashboard command center.`,
            variant: 'default',
          });
        } catch (confirmErr) {
          console.error('Plan generated but auto-confirmation failed:', confirmErr);
          toast({
            title: 'Study Plan Proposal Ready',
            description: `Generated ${response.proposal.tasks.length} adaptive revision and mastery sessions. Click Confirm to apply.`,
            variant: 'default',
          });
        }
      }
    } catch (err: any) {
      toast({
        title: 'Proposal generation failed',
        description: err?.response?.data?.detail || 'Please check AI provider status and retry.',
        variant: 'error',
      });
    } finally {
      setIsGeneratingProposal(false);
    }
  };

  const handleConfirmPlan = async (prop: StudyPlanProposal) => {
    setIsConfirmingPlan(true);
    try {
      const res = await plannerAPI.confirmPlan({ proposal: prop, confirmed: true });
      if (res.success) {
        toast({
          title: 'Plan activated!',
          description: 'Your study schedule has been updated with these tasks.',
          variant: 'default',
        });
        setShowPreview(false);
        router.push(res.data.next_route || '/dashboard');
      }
    } catch (err: any) {
      toast({
        title: 'Confirmation failed',
        description: err?.response?.data?.detail || 'Error activating plan.',
        variant: 'error',
      });
    } finally {
      setIsConfirmingPlan(false);
    }
  };

  const tabs = [
    {
      id: 'chat' as const,
      label: 'Notebook',
      fullLabel: 'AI Study Notebook',
      icon: Sparkles,
      badge: 'Active',
    },
    {
      id: 'roadmap' as const,
      label: 'Roadmap',
      fullLabel: 'Study Roadmap',
      icon: Calendar,
      badge: proposal ? 'Ready' : undefined,
    },
    {
      id: 'intel' as const,
      label: 'Intel',
      fullLabel: 'Learning Intel',
      icon: Brain,
      badge: profileUpdates ? 'Updated' : undefined,
    },
  ];

  const suggestedActions = [
    {
      id: 'explain',
      title: 'Explain with citations',
      description: 'Break down complex concepts using uploaded materials as factual evidence.',
      prompt:
        'Explain the core principles in my study materials step by step, citing page numbers and source passages.',
      tag: 'Explain',
    },
    {
      id: 'summarize',
      title: 'Summarize study materials',
      description: 'Generate high-yield key takeaways and structured summaries of current sources.',
      prompt:
        'Provide a structured summary of the selected study materials, highlighting key definitions and formulas.',
      tag: 'Summary',
    },
    {
      id: 'mcqs',
      title: 'Test with 5 MCQs',
      description: 'Create multiple-choice questions with answer keys and rationale grounded in sources.',
      prompt:
        'Generate 5 challenging multiple-choice practice questions with full answer explanations based on my notes.',
      tag: 'MCQs',
    },
    {
      id: 'exam-roadmap',
      title: 'Build 14-Day Plan',
      description: 'Generate an adaptive study plan with revision buffers and spaced repetition.',
      prompt: 'Help me plan a 14-day study sprint covering weak areas and exam prep.',
      tag: 'Plan',
    },
  ];

  const activeNotebook = notebooks.find((n) => n.id === currentNotebookId);

  return (
    <main className="viewport-shell animate-fade-in relative flex flex-col bg-[var(--background)] text-[var(--foreground)] antialiased">
      {/* ===== A. DEDICATED MOBILE AI ASSISTANT (< 1024px) ===== */}
      <div className="block lg:hidden h-full flex-1 min-h-0 overflow-hidden">
        <MobileAIAssistant
          notebooks={notebooks}
          setNotebooks={setNotebooks}
          currentNotebookId={currentNotebookId}
          setCurrentNotebookId={setCurrentNotebookId}
          sources={sources}
          setSources={setSources}
          notes={notes}
          setNotes={setNotes}
          isLoadingSources={isLoadingSources}
          isLoadingNotebooks={isLoadingNotebooks}
          onRefreshNotebook={loadNotebookDetails}
          responseStyle={responseStyle}
          setResponseStyle={setResponseStyle}
          onGenerateProposal={handleGenerateProposal}
          isGeneratingProposal={isGeneratingProposal}
          onOpenPlanPreview={() => setShowPreview(true)}
        />
      </div>

      {/* ===== B. DESKTOP WORKSPACE (>= 1024px) — 100% UNTOUCHED ===== */}
      <div className="hidden lg:flex lg:flex-col lg:flex-1 min-h-0 h-full overflow-hidden">
        {/* ===== Compact top navigation (56-64px) ===== */}
        <header className="relative z-50 flex h-14 shrink-0 items-center gap-1.5 border-b border-white/[0.08] bg-zinc-950/85 px-2 backdrop-blur-xl sm:h-16 sm:gap-2 sm:px-4">
        {/* Sources drawer toggle (left) - restricted to chat view */}
        {activeTab === 'chat' && (
          <button
            type="button"
            onClick={toggleSources}
            aria-pressed={sourcesOpen}
            aria-label="Toggle sources panel"
            title="Sources"
            className={cn(
              'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-all sm:px-3',
              sourcesOpen
                ? 'border-indigo-400/40 bg-indigo-500/15 text-indigo-200'
                : 'border-white/[0.08] bg-zinc-900/70 text-zinc-300 hover:bg-zinc-800 hover:text-white'
            )}
          >
            <FileText className="h-4 w-4" />
            <span>Sources</span>
            {sources.length > 0 && (
              <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300">
                {sources.length}
              </span>
            )}
          </button>
        )}

        {/* Brand */}
        <div className="hidden min-w-0 shrink items-center gap-2.5 sm:flex">
          <AppLogo size="sm" href="/dashboard" priority />
          <span className="hidden truncate text-sm font-semibold text-white lg:inline">
            Plan2Learn AI Notebook
          </span>
        </div>

        {/* Streak */}
        {streak && streak.current_streak > 0 && (
          <span className="hidden shrink-0 items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 font-mono text-xs text-amber-300 sm:inline-flex">
            <Flame className="h-3 w-3 fill-amber-400 text-amber-400" />
            {streak.current_streak}d streak
          </span>
        )}

        {/* Feature tabs */}
        <nav className="flex shrink-0 items-center gap-1" aria-label="Feature tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                aria-label={tab.fullLabel}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'group relative flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-all sm:px-3',
                  isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-300')} />
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.badge && (
                  <span
                    className={cn(
                      'hidden rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider 2xl:inline',
                      isActive ? 'bg-white/20 text-white' : 'bg-white/[0.06] text-zinc-400'
                    )}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right cluster */}
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Active notebook label (xl+) */}
          {activeNotebook && (
            <span
              className="hidden max-w-[150px] truncate rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-400 2xl:inline-block"
              title={activeNotebook.title}
            >
              {activeNotebook.title}
            </span>
          )}

          {/* Response style (xl+) */}
          <span className="hidden xl:block">
            <ResponseStyleBadge mode={responseStyle} onToggle={setResponseStyle} />
          </span>

          {/* Nav links */}
          <NextLink
            href="/dashboard"
            className="hidden h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-zinc-900/70 px-3 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white sm:inline-flex"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Dashboard
          </NextLink>
          <NextLink
            href="/focus"
            className="hidden h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-zinc-900/70 px-3 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white xl:inline-flex"
          >
            <Focus className="h-3.5 w-3.5 text-indigo-400" />
            Focus Room
          </NextLink>
          
          {/* Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/[0.08] bg-zinc-900/70 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <span className="hidden xl:block">
            <SettingsButton />
          </span>

          {/* Overflow menu (below xl) */}
          <div className="relative xl:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More options"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/[0.08] bg-zinc-900/70 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                />
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-1.5 w-60 space-y-1 rounded-xl border border-white/[0.1] bg-zinc-900 p-2 shadow-2xl"
                >
                  <div className="px-0.5 pb-1">
                    <ResponseStyleBadge mode={responseStyle} onToggle={setResponseStyle} />
                  </div>
                  <NextLink
                    href="/dashboard"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Dashboard
                  </NextLink>
                  <NextLink
                    href="/focus"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    <Focus className="h-4 w-4 text-indigo-400" />
                    Focus Room
                  </NextLink>
                  <div className="border-t border-white/[0.06] px-2 pt-1">
                    <SettingsButton className="w-full justify-start" />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Studio drawer toggle (right) - restricted to chat view */}
          {activeTab === 'chat' && (
            <button
              type="button"
              onClick={toggleStudio}
              aria-pressed={studioOpen}
              aria-label="Toggle studio panel"
              title="Studio"
              className={cn(
                'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-all sm:px-3',
                studioOpen
                  ? 'border-purple-400/40 bg-purple-500/15 text-purple-200'
                  : 'border-white/[0.08] bg-zinc-900/70 text-zinc-300 hover:bg-zinc-800 hover:text-white'
              )}
            >
              <Sparkles className="h-4 w-4" />
              <span>Studio</span>
              {notes.length > 0 && (
                <span className="rounded-full bg-purple-500/20 px-1.5 py-0.5 font-mono text-[10px] text-purple-300">
                  {notes.length}
                </span>
              )}
            </button>
          )}
        </div>
      </header>

      {/* ===== Workspace row: [Sources drawer] [center] [Studio drawer] ===== */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <SourcesDrawer
          isOpen={activeTab === 'chat' && sourcesOpen}
          notebooks={notebooks}
          setNotebooks={setNotebooks}
          currentNotebookId={currentNotebookId}
          setCurrentNotebookId={setCurrentNotebookId}
          sources={sources}
          setSources={setSources}
          isLoadingSources={isLoadingSources}
          isLoadingNotebooks={isLoadingNotebooks}
          onRefreshNotebook={loadNotebookDetails}
          onClose={() => setSourcesOpen(false)}
        />

        {/* Central conversation / canvas — expands to fill all remaining space */}
        <section className="relative flex min-w-0 flex-1 flex-col min-h-0 overflow-hidden">
          <div className={cn("relative flex min-h-0 flex-1 flex-col overflow-hidden chat-canvas", activeTab !== 'chat' && 'hidden')}>
            {/* Dedicated wallpaper background strictly contained inside chat section */}
            <div
              className="absolute inset-0 pointer-events-none -z-10 overflow-hidden chat-wallpaper"
              aria-hidden="true"
            />
            <ChatWindow
                notebookId={currentNotebookId}
                onOpenSources={toggleSources}
                responseStyle={responseStyle}
                onProfileUpdate={(updates) =>
                  setProfileUpdates(updates ? { ...profileUpdates, ...updates } : profileUpdates)
                }
                onMissingInfo={(info) => setMissingInfo(info)}
                onSaveNote={handleSaveChatNote}
                quickActions={suggestedActions}
                banner={
                  notebooks.length === 0 && !isLoadingNotebooks ? (
                    <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-purple-950/20 to-zinc-900/60 p-4 shadow-xl backdrop-blur-md sm:p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/20 text-indigo-300">
                              <Sparkles className="h-4 w-4" />
                            </span>
                            <h2 className="text-lg font-bold text-white">
                              Get Started with Your AI Study Notebook
                            </h2>
                          </div>
                          <p className="max-w-xl text-xs leading-relaxed text-zinc-300">
                            Your AI Study Notebook turns course slides, PDF textbooks, and lecture
                            notes into a personal interactive tutor with verified citations.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSourcesOpen(true);
                          }}
                          className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500"
                        >
                          <Plus className="h-4 w-4" />
                          Create Your First Notebook
                        </button>
                      </div>

                      <div className="mt-5 grid grid-cols-1 gap-3 border-t border-white/[0.08] pt-4 sm:grid-cols-4">
                        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                          <span className="mb-1 block font-mono text-[10px] font-semibold text-indigo-400">
                            STEP 1
                          </span>
                          <p className="text-xs font-medium text-zinc-200">Create Notebook</p>
                          <p className="mt-0.5 text-[11px] text-zinc-400">
                            Organize your course or exam module.
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                          <span className="mb-1 block font-mono text-[10px] font-semibold text-indigo-400">
                            STEP 2
                          </span>
                          <p className="text-xs font-medium text-zinc-200">Upload Documents</p>
                          <p className="mt-0.5 text-[11px] text-zinc-400">
                            Add PDFs, lecture slides, or folders.
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                          <span className="mb-1 block font-mono text-[10px] font-semibold text-indigo-400">
                            STEP 3
                          </span>
                          <p className="text-xs font-medium text-zinc-200">Ask &amp; Get Citations</p>
                          <p className="mt-0.5 text-[11px] text-zinc-400">
                            Answers cite exact pages and snippets.
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                          <span className="mb-1 block font-mono text-[10px] font-semibold text-indigo-400">
                            STEP 4
                          </span>
                          <p className="text-xs font-medium text-zinc-200">Generate Plans &amp; Notes</p>
                          <p className="mt-0.5 text-[11px] text-zinc-400">
                            Save study notes &amp; build 14-day plans.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : undefined
                }
              />
            </div>

          {/* Roadmap & Intel tabs: independently scrolling workspace content */}
          {activeTab !== 'chat' && (
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
              {/* TAB 2: STUDY ROADMAP & PROPOSALS */}
              {activeTab === 'roadmap' && (
                <div data-tab-panel="roadmap" className="rounded-2xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-zinc-900/40 dark:bg-zinc-900/40 light:bg-white p-6 backdrop-blur-md sm:p-8 light:shadow-sm">
                  <div className="flex flex-col gap-4 border-b border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="mb-1 flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-indigo-400 dark:text-indigo-300 light:text-indigo-600 font-semibold">
                        <Calendar className="h-4 w-4" />
                        Adaptive Curriculum Engine
                      </div>
                      <h2 className="text-xl font-bold text-white dark:text-white light:text-slate-900">
                        Study Plan &amp; Task Roadmap
                      </h2>
                      <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-400 light:text-slate-600">
                        Review, customize, and activate your 14-day study schedule generated by the
                        AI strategist.
                      </p>
                    </div>

                    <button
                      onClick={handleGenerateProposal}
                      disabled={isGeneratingProposal}
                      className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isGeneratingProposal ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Generating Proposal…
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4" />
                          {proposal ? 'Regenerate Proposal' : 'Generate 14-Day Proposal'}
                        </>
                      )}
                    </button>
                  </div>

                  {/* Stale Roadmap Recalibration Notice */}
                  {isRoadmapStale && proposal && (
                    <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/30 dark:border-amber-500/30 light:border-amber-300 bg-amber-500/10 dark:bg-amber-500/10 light:bg-amber-50 p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-amber-400 dark:text-amber-400 light:text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-sm font-semibold text-amber-200 dark:text-amber-200 light:text-amber-900">
                            Profile Updated — Roadmap Recalibration Recommended
                          </h4>
                          <p className="text-xs text-amber-300/80 dark:text-amber-300/80 light:text-amber-700 mt-0.5">
                            Your profile settings (such as target subjects, exam date, or daily study hours) were recently updated in Settings. Regenerate your proposal to align your study roadmap with your latest goals.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleGenerateProposal}
                        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-500 transition-colors cursor-pointer"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Regenerate Now
                      </button>
                    </div>
                  )}

                  {proposal ? (
                    <div className="mt-6 space-y-6">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-white/[0.02] dark:bg-white/[0.02] light:bg-slate-50 p-4">
                          <span className="font-mono text-xs uppercase text-zinc-500 dark:text-zinc-500 light:text-slate-500">
                            Total Planned Hours
                          </span>
                          <p className="mt-1 text-2xl font-bold text-indigo-400 dark:text-indigo-300 light:text-indigo-600">
                            {proposal.total_planned_hours} hrs
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-white/[0.02] dark:bg-white/[0.02] light:bg-slate-50 p-4">
                          <span className="font-mono text-xs uppercase text-zinc-500 dark:text-zinc-500 light:text-slate-500">
                            Total Study Tasks
                          </span>
                          <p className="mt-1 text-2xl font-bold text-white dark:text-white light:text-slate-900">
                            {proposal.tasks.length} tasks
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-white/[0.02] dark:bg-white/[0.02] light:bg-slate-50 p-4">
                          <span className="font-mono text-xs uppercase text-zinc-500 dark:text-zinc-500 light:text-slate-500">
                            Daily Study Target
                          </span>
                          <p className="mt-1 text-2xl font-bold text-white dark:text-white light:text-slate-900">
                            {proposal.daily_study_minutes ?? 160} min
                          </p>
                        </div>
                        <div className="rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-white/[0.02] dark:bg-white/[0.02] light:bg-slate-50 p-4">
                          <span className="font-mono text-xs uppercase text-zinc-500 dark:text-zinc-500 light:text-slate-500">
                            Planned Period
                          </span>
                          <p className="mt-1 text-sm font-semibold text-emerald-400 dark:text-emerald-400 light:text-emerald-700">
                            {proposal.planning_period_start.slice(0, 10)} →{' '}
                            {proposal.planning_period_end.slice(0, 10)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-indigo-500/20 dark:border-indigo-500/20 light:border-indigo-200 bg-indigo-500/5 dark:bg-indigo-500/5 light:bg-indigo-50/70 p-4">
                        <div>
                          <h4 className="text-sm font-semibold text-white dark:text-white light:text-slate-900">
                            Proposal Ready for Review
                          </h4>
                          <p className="text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-600">
                            Inspect day-by-day task distribution, review revision tags, and confirm
                            schedule activation.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <NextLink
                            href="/dashboard"
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-500"
                          >
                            <span>View on Dashboard</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </NextLink>
                          <button
                            onClick={() => setShowPreview(true)}
                            className="cursor-pointer rounded-xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-white/[0.05] dark:bg-white/[0.05] light:bg-white px-4 py-2 text-xs font-medium text-zinc-200 dark:text-zinc-200 light:text-slate-700 transition-colors hover:bg-white/[0.1] light:hover:bg-slate-100"
                          >
                            Inspect Full Modal
                          </button>
                          <button
                            onClick={() => handleConfirmPlan(proposal)}
                            disabled={isConfirmingPlan}
                            className="cursor-pointer rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 transition-colors hover:bg-indigo-500 disabled:opacity-50"
                          >
                            {isConfirmingPlan ? 'Confirming…' : 'Re-apply Plan'}
                          </button>
                        </div>
                      </div>

                      <div>
                        <h3 className="mb-3 text-sm font-semibold text-zinc-300 dark:text-zinc-300 light:text-slate-800">
                          Planned Study Tasks
                        </h3>
                        <div className="grid max-h-[440px] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3 custom-scrollbar">
                          {proposal.tasks.map((task, idx) => (
                            <div
                              key={idx}
                              className="rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-zinc-900/60 dark:bg-zinc-900/60 light:bg-white p-4 transition-colors hover:border-white/20 light:hover:border-indigo-300 light:shadow-sm"
                            >
                              <div className="mb-2 flex items-center justify-between text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                                <span className="font-mono">{task.scheduled_date.slice(0, 10)}</span>
                                <span className="rounded-full bg-white/[0.05] dark:bg-white/[0.05] light:bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-zinc-300 dark:text-zinc-300 light:text-slate-700 font-medium">
                                  {task.duration_minutes}m
                                </span>
                              </div>
                              <h4 className="truncate text-sm font-semibold text-white dark:text-white light:text-slate-900">
                                {task.topic_name}
                              </h4>
                              <div className="mt-2 flex items-center justify-between text-xs">
                                <span className="text-zinc-500 dark:text-zinc-500 light:text-slate-500">{task.subject}</span>
                                <span className="rounded bg-indigo-500/10 dark:bg-indigo-500/10 light:bg-indigo-50 border border-indigo-500/20 dark:border-indigo-500/20 light:border-indigo-200 px-2 py-0.5 font-mono text-[10px] text-indigo-300 dark:text-indigo-300 light:text-indigo-700">
                                  {task.priority_tag}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-white/[0.02] dark:bg-white/[0.02] light:bg-slate-50 text-zinc-500 dark:text-zinc-500 light:text-slate-400">
                        <Calendar className="h-8 w-8 text-indigo-400/80 light:text-indigo-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-white dark:text-white light:text-slate-900">
                        No Active Plan Proposal Yet
                      </h3>
                      <p className="mt-1 max-w-md text-sm text-zinc-400 dark:text-zinc-400 light:text-slate-600">
                        Generate an AI study proposal to automatically structure your next 14 days
                        of revision, spaced repetition, and exam prep.
                      </p>
                      <button
                        onClick={handleGenerateProposal}
                        disabled={isGeneratingProposal}
                        className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500 disabled:opacity-50"
                      >
                        {isGeneratingProposal ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Generating Proposal…
                          </>
                        ) : (
                          <>
                            <FileText className="h-4 w-4" />
                            Generate 14-Day Study Proposal
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: LEARNING INTEL & PROFILE */}
              {activeTab === 'intel' && (
                <div data-tab-panel="intel" className="rounded-2xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-zinc-900/40 dark:bg-zinc-900/40 light:bg-white p-6 backdrop-blur-md sm:p-8 light:shadow-sm">
                  <div className="mb-6 flex items-center justify-between border-b border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 pb-6">
                    <div>
                      <div className="mb-1 flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-indigo-400 dark:text-indigo-300 light:text-indigo-600 font-semibold">
                        <Brain className="h-4 w-4" />
                        Cognitive Student Profiler
                      </div>
                      <h2 className="text-xl font-bold text-white dark:text-white light:text-slate-900">
                        Learning Intelligence &amp; Academic Profile
                      </h2>
                      <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-400 light:text-slate-600">
                        Live understanding of your target goals, weak concepts, and study constraints
                        dynamically calibrated by the AI strategist.
                      </p>
                    </div>
                    {readinessScore && (
                      <div className="rounded-xl border border-emerald-500/30 dark:border-emerald-500/30 light:border-emerald-200 bg-emerald-500/10 dark:bg-emerald-500/10 light:bg-emerald-50 px-4 py-2 text-right">
                        <span className="font-mono text-[10px] uppercase text-emerald-400 dark:text-emerald-400 light:text-emerald-700 font-semibold">
                          Readiness Score
                        </span>
                        <p className="text-xl font-bold text-emerald-300 dark:text-emerald-300 light:text-emerald-800">
                          {Math.round(readinessScore.probability * 100)}%
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {/* Academic Context */}
                    <div className="space-y-4 rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-zinc-900/60 dark:bg-zinc-900/60 light:bg-slate-50/90 p-5 light:shadow-sm">
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200 dark:text-zinc-200 light:text-slate-800">
                        <BookOpen className="h-4 w-4 text-indigo-400" /> Academic Context
                      </h3>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between border-b border-white/[0.04] dark:border-white/[0.04] light:border-slate-200 py-1">
                          <span className="text-zinc-500 dark:text-zinc-500 light:text-slate-500">Education Level:</span>
                          <span className="font-medium text-zinc-300 dark:text-zinc-300 light:text-slate-900">
                            {userProfile?.education_level || profileUpdates?.education_level || 'Not set'}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-white/[0.04] dark:border-white/[0.04] light:border-slate-200 py-1">
                          <span className="text-zinc-500 dark:text-zinc-500 light:text-slate-500">Curriculum:</span>
                          <span className="font-medium text-zinc-300 dark:text-zinc-300 light:text-slate-900">
                            {userProfile?.board_curriculum || profileUpdates?.board_curriculum || 'General'}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-white/[0.04] dark:border-white/[0.04] light:border-slate-200 py-1">
                          <span className="text-zinc-500 dark:text-zinc-500 light:text-slate-500">Grade / Class:</span>
                          <span className="font-medium text-zinc-300 dark:text-zinc-300 light:text-slate-900">
                            {userProfile?.grade_class || profileUpdates?.grade_class || 'Standard'}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-white/[0.04] dark:border-white/[0.04] light:border-slate-200 py-1">
                          <span className="text-zinc-500 dark:text-zinc-500 light:text-slate-500">Target Subjects:</span>
                          <span className="font-medium text-zinc-300 dark:text-zinc-300 light:text-slate-900 text-right max-w-[170px] truncate">
                            {(userProfile?.target_subjects && userProfile.target_subjects.length > 0)
                              ? userProfile.target_subjects.join(', ')
                              : 'General'}
                          </span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-zinc-500 dark:text-zinc-500 light:text-slate-500">Daily Study Target:</span>
                          <span className="font-medium text-indigo-400 dark:text-indigo-300 light:text-indigo-600">
                            {userProfile?.daily_time_minutes || profileUpdates?.daily_time_minutes || 120}{' '}
                            mins/day
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Mastery & Focus Areas */}
                    <div className="space-y-4 rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-zinc-900/60 dark:bg-zinc-900/60 light:bg-slate-50/90 p-5 light:shadow-sm">
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200 dark:text-zinc-200 light:text-slate-800">
                        <Target className="h-4 w-4 text-rose-400" /> Focus &amp; Weak Areas
                      </h3>
                      <div className="space-y-3">
                        <div>
                          <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-rose-400 dark:text-rose-400 light:text-rose-700 font-semibold">
                            High Priority (Weak Topics)
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {(userProfile?.weak_topics || profileUpdates?.weak_topics || []).length > 0 ? (
                              (userProfile?.weak_topics || profileUpdates?.weak_topics || []).map(
                                (topic: string, i: number) => (
                                  <span
                                    key={i}
                                    className="rounded-md border border-rose-500/20 dark:border-rose-500/20 light:border-rose-200 bg-rose-500/10 dark:bg-rose-500/10 light:bg-rose-50 px-2 py-0.5 text-[11px] text-rose-300 dark:text-rose-300 light:text-rose-800 font-medium"
                                  >
                                    {topic}
                                  </span>
                                )
                              )
                            ) : (
                              <span className="text-xs text-zinc-500 dark:text-zinc-500 light:text-slate-400">No weak topics flagged yet.</span>
                            )}
                          </div>
                        </div>

                        <div>
                          <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-emerald-400 dark:text-emerald-400 light:text-emerald-700 font-semibold">
                            Retained (Strong Topics)
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {(userProfile?.strong_topics || profileUpdates?.strong_topics || []).length > 0 ? (
                              (userProfile?.strong_topics || profileUpdates?.strong_topics || []).map(
                                (topic: string, i: number) => (
                                  <span
                                    key={i}
                                    className="rounded-md border border-emerald-500/20 dark:border-emerald-500/20 light:border-emerald-200 bg-emerald-500/10 dark:bg-emerald-500/10 light:bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-300 dark:text-emerald-300 light:text-emerald-800 font-medium"
                                  >
                                    {topic}
                                  </span>
                                )
                              )
                            ) : (
                              <span className="text-xs text-zinc-500 dark:text-zinc-500 light:text-slate-400">No strong topics recorded.</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Exam Date & Goals */}
                    <div className="space-y-4 rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-zinc-900/60 dark:bg-zinc-900/60 light:bg-slate-50/90 p-5 light:shadow-sm">
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200 dark:text-zinc-200 light:text-slate-800">
                        <Calendar className="h-4 w-4 text-amber-400" /> Target Milestone
                      </h3>
                      <div className="space-y-3 text-xs">
                        <div className="rounded-lg border border-white/[0.04] dark:border-white/[0.04] light:border-amber-200 bg-white/[0.02] dark:bg-white/[0.02] light:bg-amber-50/60 p-3">
                          <span className="block font-mono text-[10px] uppercase text-zinc-500 dark:text-zinc-500 light:text-amber-800 font-semibold">
                            Target Exam Date
                          </span>
                          <p className="mt-0.5 text-base font-bold text-amber-300 dark:text-amber-300 light:text-amber-900">
                            {userProfile?.exam_date || profileUpdates?.exam_date || 'None set'}
                          </p>
                        </div>
                        {missingInfo && missingInfo.questions?.length > 0 && (
                          <div className="rounded-lg border border-amber-500/20 dark:border-amber-500/20 light:border-amber-200 bg-amber-500/10 dark:bg-amber-500/10 light:bg-amber-50 p-3">
                            <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 dark:text-amber-400 light:text-amber-800">
                              <AlertCircle className="h-3.5 w-3.5" /> AI Recommended Input
                            </span>
                            <p className="mt-1 text-[11px] text-zinc-300 dark:text-zinc-300 light:text-slate-700">
                              {missingInfo.questions[0]}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <StudioDrawer
          isOpen={activeTab === 'chat' && studioOpen}
          currentNotebookId={currentNotebookId}
          notes={notes}
          setNotes={setNotes}
          onRefreshNotebook={loadNotebookDetails}
          isGeneratingProposal={isGeneratingProposal}
          onGenerateProposal={handleGenerateProposal}
          onClose={() => setStudioOpen(false)}
        />
      </div>
      </div>

      {/* Plan Preview Modal */}
      {showPreview && proposal && (
        <PlanPreviewModal
          proposal={proposal}
          isOpen={showPreview}
          onConfirm={handleConfirmPlan}
          onClose={() => setShowPreview(false)}
          isLoading={isConfirmingPlan}
        />
      )}

      {/* Roadmap Calibration Questionnaire Modal */}
      {showCalibrationModal && (
        <RoadmapCalibrationModal
          isOpen={showCalibrationModal}
          onClose={() => setShowCalibrationModal(false)}
          onSubmit={handleExecuteGenerateProposal}
          isGenerating={isGeneratingProposal}
          availableSubjects={userProfile?.target_subjects || ['Mathematics', 'Physics', 'Chemistry']}
          defaultSubject={userProfile?.target_subjects?.[0] || 'Physics'}
          defaultDailyHours={Math.round((userProfile?.daily_time_minutes || 120) / 60)}
          defaultExamDate={userProfile?.exam_date || ''}
        />
      )}
    </main>
  );
}
