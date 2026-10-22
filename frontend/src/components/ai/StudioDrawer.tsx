'use client';

import { useState } from 'react';
import {
  Sparkles,
  FileText,
  BookOpen,
  Trash2,
  Calendar,
  Target,
  Brain,
  Loader2,
  Plus,
  HelpCircle,
  AlertCircle,
  Focus,
  X,
  Maximize2,
  PenLine,
  Wrench,
  StickyNote,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/useToast';
import { aiAPI } from '@/services/api';
import { NoteOut, StudyToolResponse } from '@/types';
import DrawerShell from './DrawerShell';
import MarkdownContent from './MarkdownContent';
import { useTheme } from '@/lib/theme';

interface StudioDrawerProps {
  isOpen?: boolean;
  currentNotebookId: string | null;
  notes: NoteOut[];
  setNotes: React.Dispatch<React.SetStateAction<NoteOut[]>>;
  onRefreshNotebook: (notebookId: string) => void;
  isGeneratingProposal: boolean;
  onGenerateProposal: () => void;
  onClose: () => void;
}

type StudyToolId =
  | 'explain'
  | 'summarize'
  | 'revision-notes'
  | 'mcqs'
  | 'practice-questions'
  | 'weak-areas'
  | 'optimize-routine'
  | 'high-yield';

const TOOLS: Array<{
  id: StudyToolId;
  label: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  hoverBorder: string;
}> = [
  { id: 'explain', label: 'Explain', title: 'Explanation', icon: HelpCircle, color: 'text-indigo-400', hoverBorder: 'hover:border-indigo-500/40' },
  { id: 'summarize', label: 'Summarize', title: 'Summary', icon: FileText, color: 'text-emerald-400', hoverBorder: 'hover:border-emerald-500/40' },
  { id: 'revision-notes', label: 'Revision Notes', title: 'Revision Notes', icon: BookOpen, color: 'text-amber-400', hoverBorder: 'hover:border-amber-500/40' },
  { id: 'mcqs', label: 'Generate MCQs', title: 'MCQ Quiz', icon: Target, color: 'text-purple-400', hoverBorder: 'hover:border-purple-500/40' },
  { id: 'practice-questions', label: 'Practice Qs', title: 'Practice Questions', icon: Brain, color: 'text-blue-400', hoverBorder: 'hover:border-blue-500/40' },
  { id: 'weak-areas', label: 'Weak Areas', title: 'Weak Areas Diagnostic', icon: AlertCircle, color: 'text-rose-400', hoverBorder: 'hover:border-rose-500/40' },
  { id: 'optimize-routine', label: 'Routine Plan', title: 'Study Routine', icon: Focus, color: 'text-amber-400', hoverBorder: 'hover:border-amber-500/40' },
  { id: 'high-yield', label: 'High-Yield', title: 'High-Yield Strategy', icon: Sparkles, color: 'text-cyan-400', hoverBorder: 'hover:border-cyan-500/40' },
];

export default function StudioDrawer({
  isOpen = true,
  currentNotebookId,
  notes,
  setNotes,
  onRefreshNotebook,
  isGeneratingProposal,
  onGenerateProposal,
  onClose,
}: StudioDrawerProps) {
  const { toast } = useToast();
  const { theme } = useTheme();
  const [tab, setTab] = useState<'tools' | 'notes'>('tools');

  // Study tools
  const [studyToolTopic, setStudyToolTopic] = useState('');
  const [studyToolLoading, setStudyToolLoading] = useState<string | null>(null);
  const [studyToolResult, setStudyToolResult] = useState<StudyToolResponse | null>(null);
  const [showResultViewer, setShowResultViewer] = useState(false);

  // Notes
  const [showNewNoteModal, setShowNewNoteModal] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [viewingNote, setViewingNote] = useState<NoteOut | null>(null);

  // Run study tool
  const handleRunStudyTool = async (tool: StudyToolId, toolTitle: string) => {
    if (!currentNotebookId) {
      toast({
        title: 'Notebook required',
        description: 'Please select or create a notebook to run study tools against.',
        variant: 'error',
      });
      return;
    }
    setStudyToolLoading(tool);
    setStudyToolResult(null);
    try {
      const res = await aiAPI.runStudyTool(tool, {
        notebook_id: currentNotebookId,
        topic: studyToolTopic.trim() || undefined,
      });
      setStudyToolResult(res);
      toast({
        title: `${toolTitle} generated`,
        description: res.source_references?.length
          ? `Grounded with ${res.source_references.length} source citations.`
          : 'Answer generated from study context.',
        variant: 'default',
      });
    } catch (err: any) {
      toast({
        title: `Failed to run ${toolTitle}`,
        description: err?.response?.data?.detail || 'AI service temporarily unavailable.',
        variant: 'error',
      });
    } finally {
      setStudyToolLoading(null);
    }
  };

  // Save tool output as a note
  const handleSaveToolOutput = async () => {
    if (!studyToolResult || !currentNotebookId) return;
    try {
      await aiAPI.saveStudyToolNote({
        title: `AI Note: ${studyToolResult.topic || 'Study Insights'}`,
        content: studyToolResult.content,
        notebook_id: currentNotebookId,
      });
      toast({
        title: 'Note saved',
        description: 'Added to your notebook notes.',
        variant: 'default',
      });
      onRefreshNotebook(currentNotebookId);
    } catch (err: any) {
      toast({
        title: 'Failed to save',
        description: err?.response?.data?.detail || 'Could not save note.',
        variant: 'error',
      });
    }
  };

  // Manual note creation
  const handleCreateManualNote = async () => {
    if (!newNoteTitle.trim() || !newNoteContent.trim() || !currentNotebookId) return;
    try {
      await aiAPI.createNote({
        notebook_id: currentNotebookId,
        title: newNoteTitle.trim(),
        content: newNoteContent.trim(),
      });
      setShowNewNoteModal(false);
      setNewNoteTitle('');
      setNewNoteContent('');
      toast({
        title: 'Note created',
        description: 'Saved to your notebook notes.',
        variant: 'default',
      });
      onRefreshNotebook(currentNotebookId);
    } catch (err: any) {
      toast({
        title: 'Failed to create note',
        description: err?.response?.data?.detail || 'Error creating note',
        variant: 'error',
      });
    }
  };

  // Delete note
  const handleDeleteNote = async (noteId: string) => {
    try {
      await aiAPI.deleteNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      setViewingNote((prev) => (prev && prev.id === noteId ? null : prev));
      toast({
        title: 'Note removed',
        description: 'Note was deleted from this notebook.',
        variant: 'default',
      });
    } catch (err: any) {
      toast({
        title: 'Failed to delete note',
        description: err?.response?.data?.detail || 'Error deleting note',
        variant: 'error',
      });
    }
  };

  return (
    <>
      <DrawerShell
        side="right"
        title="Studio"
        isOpen={isOpen}
        icon={<Sparkles className="h-4 w-4 shrink-0 text-purple-400" />}
        meta={notes.length > 0 ? <span className="hidden sm:inline">{notes.length} notes</span> : undefined}
        onClose={onClose}
      >
        {/* Tabs */}
        <div className="sticky top-0 z-10 -mx-3 -mt-3 mb-1 flex gap-1 border-b border-black/[0.08] dark:border-white/[0.08] bg-white/50 dark:bg-zinc-950/60 px-3 py-2 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setTab('tools')}
            aria-pressed={tab === 'tools'}
            className={cn(
              'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              tab === 'tools'
                ? 'border border-purple-400/60 bg-purple-100/80 text-purple-900 dark:border-purple-500/30 dark:bg-purple-500/15 dark:text-purple-200'
                : 'border border-transparent text-slate-700 hover:bg-white/60 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-200'
            )}
          >
            <Wrench className="h-3.5 w-3.5" />
            Tools
          </button>
          <button
            type="button"
            onClick={() => setTab('notes')}
            aria-pressed={tab === 'notes'}
            className={cn(
              'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              tab === 'notes'
                ? 'border border-emerald-400/60 bg-emerald-100/80 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200'
                : 'border border-transparent text-slate-700 hover:bg-white/60 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-200'
            )}
          >
            <StickyNote className="h-3.5 w-3.5" />
            Notes ({notes.length})
          </button>
        </div>

        {tab === 'tools' ? (
          <div className="space-y-3">
            {/* Focus topic */}
            <div>
              <label htmlFor="study-tool-topic" className="mb-1 block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-400">
                Focus topic (optional)
              </label>
              <input
                id="study-tool-topic"
                type="text"
                value={studyToolTopic}
                onChange={(e) => setStudyToolTopic(e.target.value)}
                placeholder="e.g. SN1 Mechanism"
                className="w-full rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-xs font-medium text-slate-900 shadow-xs outline-none placeholder:text-slate-500 focus:border-indigo-500 backdrop-blur-sm dark:border-white/[0.08] dark:bg-zinc-800/60 dark:text-zinc-200 dark:placeholder:text-zinc-500 dark:shadow-none"
              />
            </div>

            {/* Tool grid */}
            <div className="grid grid-cols-2 gap-2">
              {TOOLS.map((tool) => {
                const Icon = tool.icon;
                const loading = studyToolLoading === tool.id;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    disabled={!!studyToolLoading}
                    onClick={() => handleRunStudyTool(tool.id, tool.title)}
                    className={cn(
                      'flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/60 bg-white/65 p-2 text-xs font-semibold text-slate-900 shadow-xs backdrop-blur-sm transition-all hover:bg-white/90 disabled:opacity-50 dark:border-white/[0.08] dark:bg-zinc-800/80 dark:text-zinc-200 dark:shadow-none dark:hover:bg-zinc-700',
                      tool.hoverBorder
                    )}
                  >
                    {loading ? (
                      <Loader2 className={cn('h-3.5 w-3.5 animate-spin', tool.color)} />
                    ) : (
                      <Icon className={cn('h-3.5 w-3.5', tool.color)} />
                    )}
                    <span className="truncate">{tool.label}</span>
                  </button>
                );
              })}
            </div>

            {/* 14-Day Study Plan */}
            <button
              type="button"
              disabled={isGeneratingProposal}
              onClick={onGenerateProposal}
              className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-indigo-300/80 bg-indigo-50/80 p-2 text-xs font-bold text-indigo-900 shadow-xs backdrop-blur-sm transition-all hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:shadow-none dark:hover:bg-indigo-500/20"
            >
              {isGeneratingProposal ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
              ) : (
                <Calendar className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              )}
              <span>Generate 14-Day Study Plan</span>
            </button>

            {/* Latest tool result — compact card with dedicated full viewer */}
            {studyToolResult && (
              <div className="rounded-xl border border-indigo-500/30 bg-zinc-950/80 p-3 text-xs">
                <div className="flex items-start justify-between gap-2 border-b border-white/[0.08] pb-2">
                  <div className="min-w-0">
                    <span className="block truncate font-semibold text-indigo-300">
                      {studyToolResult.topic}
                    </span>
                    <span className="font-mono text-[10px] text-zinc-500">
                      Generated {new Date(studyToolResult.generated_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStudyToolResult(null)}
                    className="shrink-0 cursor-pointer text-zinc-500 hover:text-white"
                    aria-label="Dismiss result"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <p className="mt-2 line-clamp-3 whitespace-pre-wrap leading-relaxed text-zinc-400">
                  {studyToolResult.content}
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowResultViewer(true)}
                    className="flex cursor-pointer items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5 text-[11px] font-medium text-indigo-300 transition-colors hover:bg-indigo-500/20"
                  >
                    <Maximize2 className="h-3 w-3" />
                    Open full result
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveToolOutput}
                    className="flex cursor-pointer items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
                  >
                    <Plus className="h-3 w-3" />
                    Save to Notes
                  </button>
                </div>

                {studyToolResult.source_references &&
                  studyToolResult.source_references.length > 0 && (
                    <div className="mt-2.5 border-t border-white/[0.06] pt-2 text-[10px] text-zinc-500">
                      <span className="font-semibold text-zinc-400">
                        {studyToolResult.source_references.length} citation(s) · open full result to
                        review
                      </span>
                    </div>
                  )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Add note */}
            <button
              type="button"
              disabled={!currentNotebookId}
              onClick={() => setShowNewNoteModal(true)}
              className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-emerald-400/60 bg-emerald-50/80 py-2.5 text-xs font-bold text-emerald-900 backdrop-blur-sm transition-colors hover:border-emerald-600 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-500/40 dark:bg-emerald-500/5 dark:text-emerald-300 dark:hover:border-emerald-400 dark:hover:bg-emerald-500/10"
            >
              <PenLine className="h-3.5 w-3.5" />
              Add Note
            </button>

            {/* Notes list */}
            <div className="space-y-2">
              {notes.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/60 bg-white/60 p-4 text-center text-[11px] leading-relaxed text-slate-700 backdrop-blur-sm font-medium dark:border-white/[0.04] dark:bg-white/[0.01] dark:text-zinc-500">
                  No notes saved yet. Use study tools, ask AI questions, or add manual notes to save
                  key takeaways.
                </p>
              ) : (
                notes.map((note) => (
                  <div
                    key={note.id}
                    className="group rounded-xl border border-white/60 bg-white/65 p-2.5 shadow-xs backdrop-blur-sm transition-colors hover:bg-white/80 dark:border-white/[0.06] dark:bg-zinc-800/40 dark:shadow-none"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setViewingNote(note)}
                        className="min-w-0 flex-1 cursor-pointer text-left"
                        title="Open full note"
                      >
                        <span className="block truncate text-xs font-bold text-slate-900 transition-colors group-hover:text-emerald-700 dark:text-zinc-200 dark:group-hover:text-emerald-300">
                          {note.title}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteNote(note.id)}
                        className="cursor-pointer p-0.5 text-slate-500 transition-colors hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400"
                        title="Delete note"
                        aria-label={`Delete note ${note.title}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-slate-700 font-medium line-clamp-2 dark:text-zinc-400">
                      {note.content}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-slate-600 font-medium dark:text-zinc-500">
                      <span>{new Date(note.created_at).toLocaleDateString()}</span>
                      <span className="uppercase">{note.note_type}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </DrawerShell>

      {/* ===== Tool result full viewer ===== */}
      {showResultViewer && studyToolResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm sm:p-6">
          <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/[0.1] dark:bg-zinc-900">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-3.5 dark:border-white/[0.08] dark:bg-transparent">
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold text-slate-900 dark:text-white">{studyToolResult.topic}</h2>
                <p className="font-mono text-[10px] text-slate-500 dark:text-zinc-500">
                  Generated {new Date(studyToolResult.generated_at).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveToolOutput}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Save to Notes
                </button>
                <button
                  type="button"
                  onClick={() => setShowResultViewer(false)}
                  className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
                  aria-label="Close result viewer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <MarkdownContent content={studyToolResult.content} className="text-slate-900 dark:text-zinc-200" />

              {studyToolResult.source_references &&
                studyToolResult.source_references.length > 0 && (
                  <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 dark:border-indigo-500/20 dark:bg-indigo-950/30">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                      <BookOpen className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                      Grounded Citations
                    </div>
                    <ul className="space-y-1.5">
                      {studyToolResult.source_references.map((c, i) => (
                        <li key={i} className="text-[11px] leading-relaxed text-slate-700 dark:text-zinc-400">
                          <span className="mr-1.5 rounded border border-indigo-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-indigo-700 dark:border-transparent dark:bg-white/[0.08] dark:text-zinc-200">
                            {c.source_title}
                          </span>
                          {c.passage}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Note full viewer ===== */}
      {viewingNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm sm:p-6">
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/[0.1] dark:bg-zinc-900">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-3.5 dark:border-white/[0.08] dark:bg-transparent">
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold text-slate-900 dark:text-white">{viewingNote.title}</h2>
                <p className="font-mono text-[10px] uppercase text-slate-500 dark:text-zinc-500">
                  {viewingNote.note_type} · {new Date(viewingNote.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDeleteNote(viewingNote.id)}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-500/20 dark:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setViewingNote(null)}
                  className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
                  aria-label="Close note viewer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <MarkdownContent content={viewingNote.content} className="text-slate-900 dark:text-zinc-200" />
            </div>
          </div>
        </div>
      )}

      {/* ===== New note modal ===== */}
      {showNewNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8 dark:border-white/[0.1] dark:bg-zinc-900">
            <h2 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">Create New Note</h2>
            <p className="mb-4 text-xs text-slate-600 dark:text-zinc-400">
              Add key takeaways, formulas, or summaries to your active notebook.
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-300">Note Title *</label>
                <input
                  value={newNoteTitle}
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                  placeholder="e.g. SN1 vs SN2 Comparison Table"
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/[0.08] dark:bg-zinc-800/80 dark:text-white dark:placeholder:text-zinc-500"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-300">Content *</label>
                <textarea
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  placeholder="Write your study notes, definitions, or equations here..."
                  rows={4}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/[0.08] dark:bg-zinc-800/80 dark:text-white dark:placeholder:text-zinc-500"
                  required
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowNewNoteModal(false)}
                className="flex-1 cursor-pointer rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateManualNote}
                disabled={!newNoteTitle.trim() || !newNoteContent.trim()}
                className="flex-1 cursor-pointer rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-emerald-600/30 transition-all hover:bg-emerald-500 disabled:opacity-50"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
