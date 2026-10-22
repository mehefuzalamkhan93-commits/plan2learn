'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Send,
  Loader2,
  Sparkles,
  X,
  Copy,
  Check,
  Target,
  BookOpen,
  Trash2,
  Bot,
  User,
  Plus,
  ChevronDown,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { aiAPI } from '@/services/api';
import { AIChatRequest, AIChatResponse, ChatMessage } from '@/types';
import MarkdownContent from './MarkdownContent';

export interface ChatQuickAction {
  id: string;
  title: string;
  description: string;
  prompt: string;
  tag?: string;
}

interface ChatWindowProps {
  notebookId?: string | null;
  onOpenSources?: () => void;
  responseStyle?: 'friendly' | 'strict';
  onProfileUpdate?: (updates: AIChatResponse['profile_updates']) => void;
  onAcademicContextUpdate?: (updates: AIChatResponse['academic_context_updates']) => void;
  onMissingInfo?: (info: AIChatResponse['missing_information']) => void;
  externalPrompt?: string | null;
  onClearExternalPrompt?: () => void;
  onSaveNote?: (title: string, content: string) => void;
  quickActions?: ChatQuickAction[];
  banner?: React.ReactNode;
}

const STARTER_PROMPTS = [
  {
    icon: Target,
    title: 'Plan a Project',
    desc: 'Break down a goal into clear, actionable steps',
    prompt: 'Help me break down my goal into a clear, step-by-step plan with milestones.',
    tag: 'Planning',
  },
  {
    icon: BookOpen,
    title: 'Explain a Concept',
    desc: 'Understand a topic clearly with examples',
    prompt: 'Explain this concept to me step by step with clear examples and analogies.',
    tag: 'Learning',
  },
  {
    icon: Sparkles,
    title: 'Write & Edit',
    desc: 'Draft, rewrite, or improve any content',
    prompt: 'Help me write and polish this content for clarity and impact.',
    tag: 'Writing',
  },
  {
    icon: Zap,
    title: 'Code & Debug',
    desc: 'Get help with programming tasks',
    prompt: 'Help me understand this code, find the bug, or plan the implementation.',
    tag: 'Coding',
  },
];

type Citation = NonNullable<ChatMessage['citations']>[number];

/**
 * Compact, clickable citation chip: collapsed by default, expands to reveal
 * the full retrieved passage without flooding the chat bubble.
 */
function CitationItem({ citation, domId }: { citation: Citation; domId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={`${domId}-passage`}
        title={open ? 'Hide source passage' : 'Show source passage'}
        className="inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/90 px-2 py-1 text-[11px] font-medium text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100 dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:border-indigo-400/50 dark:hover:bg-indigo-500/15"
      >
        <BookOpen className="h-3 w-3 shrink-0 text-indigo-600 dark:text-indigo-400" />
        <span className="truncate font-medium">{citation.source_title}</span>
        {citation.page_number && (
          <span className="shrink-0 font-mono text-[10px] text-indigo-600 dark:text-indigo-400">
            p.{citation.page_number}
          </span>
        )}
        <ChevronDown
          className={cn('h-3 w-3 shrink-0 text-indigo-600 dark:text-indigo-400 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <p
          id={`${domId}-passage`}
          className="mt-1 border-l-2 border-indigo-400 pl-2.5 text-[11px] leading-relaxed text-slate-600 dark:border-indigo-500/40 dark:text-zinc-400"
        >
          {citation.passage || 'No passage preview is available for this citation.'}
        </p>
      )}
    </li>
  );
}

export default function ChatWindow({
  notebookId,
  onOpenSources,
  responseStyle,
  onProfileUpdate,
  onAcademicContextUpdate,
  onMissingInfo,
  externalPrompt,
  onClearExternalPrompt,
  onSaveNote,
  quickActions,
  banner,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load saved conversation history when active notebook switches or mounts
  useEffect(() => {
    if (!notebookId) {
      setConversationId(null);
      setMessages([]);
      setError(null);
      setIsLoadingHistory(false);
      return;
    }

    let isMounted = true;
    setIsLoadingHistory(true);
    setError(null);

    aiAPI
      .getNotebookMessages(notebookId)
      .then((history) => {
        if (!isMounted) return;
        setConversationId(history.conversation_id || null);
        const mappedMessages: ChatMessage[] = (history.messages || []).map((m: any) => ({
          role: m.role,
          content: m.content,
          provider_used: m.provider_used,
          model_used: m.model_used,
          citations: m.citations,
          created_at: m.created_at || new Date().toISOString(),
        }));
        setMessages(mappedMessages);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Failed to load notebook conversation memory:', err);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingHistory(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [notebookId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!text || isLoading) return;

      if (!notebookId) {
        setError('A study notebook is required to chat with the AI Tutor. Please create or select a notebook from the left panel so your conversation memory and study notes are preserved.');
        return;
      }

      const userMessage: ChatMessage = {
        role: 'user',
        content: text,
        created_at: new Date().toISOString(),
      };

      setInput('');
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setError(null);

      const request: AIChatRequest = {
        message: text,
        conversation_id: conversationId || undefined,
        notebook_id: notebookId || undefined,
        response_style: responseStyle || undefined,
      };

      try {
        const response = await aiAPI.sendMessage(request);
        setConversationId(response.conversation_id);

        const aiMessage: ChatMessage = {
          role: 'assistant',
          content: response.ai_response,
          provider_used: response.profile_updates ? 'structured' : undefined,
          model_used: response.confidence ? `${Math.round(response.confidence * 100)}% match` : undefined,
          citations: response.citations,
          created_at: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, aiMessage]);

        if (response.profile_updates && onProfileUpdate) {
          onProfileUpdate(response.profile_updates);
        }
        if (response.academic_context_updates && onAcademicContextUpdate) {
          onAcademicContextUpdate(response.academic_context_updates);
        }
        if (response.missing_information && onMissingInfo) {
          onMissingInfo(response.missing_information);
        }
      } catch (err: any) {
        // Remove the optimistically added user message to prevent orphaned messages
        setMessages((prev) => prev.slice(0, -1));
        setInput(text);
        const message =
          err?.response?.data?.detail ||
          (err instanceof Error ? err.message : 'Failed to connect to AI Strategist. Please try again in a few moments.');
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [conversationId, isLoading, notebookId, onAcademicContextUpdate, onMissingInfo, onProfileUpdate, responseStyle]
  );

  // Handle external prompt injection from parent chips or quick actions
  useEffect(() => {
    if (externalPrompt && externalPrompt.trim()) {
      handleSendMessage(externalPrompt.trim());
      onClearExternalPrompt?.();
    }
  }, [externalPrompt, handleSendMessage, onClearExternalPrompt]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(input.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const handleCopy = (content: string, index: number) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleClearChat = async () => {
    if (notebookId) {
      try {
        await aiAPI.clearNotebookMessages(notebookId);
      } catch (err) {
        console.error('Failed to clear notebook messages on backend:', err);
      }
    }
    setMessages([]);
    setConversationId(null);
    setError(null);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Session action bar (outside the scrolling history) */}
      {messages.length > 0 && (
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200/90 bg-white/85 px-3 py-1.5 backdrop-blur-md shadow-xs dark:border-white/[0.06] dark:bg-zinc-950/70">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-zinc-400">
            <span className="flex h-2 w-2 animate-pulse rounded-full bg-emerald-500 dark:bg-emerald-400" />
            <span>Active Session ({messages.length} messages)</span>
          </div>
          <button
            type="button"
            onClick={handleClearChat}
            className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-200"
            title="Reset conversation"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      )}

      {/* Messages scroll area — the only scrolling region of the chat column */}
      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 sm:px-6 py-4 custom-scrollbar bg-transparent">
        <div className="mx-auto max-w-4xl w-full space-y-4">
          {banner}

        {messages.length === 0 ? (
          isLoadingHistory ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 dark:text-zinc-400">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400 mb-3" />
              <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">Loading Notebook Memory</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">Restoring verified conversation history and source grounding...</p>
            </div>
          ) : !notebookId ? (
            <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center max-w-lg mx-auto">
              <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50 text-indigo-600 shadow-md dark:border-indigo-400/30 dark:bg-gradient-to-br dark:from-indigo-500/20 dark:to-purple-600/20 dark:text-indigo-300 dark:shadow-xl dark:shadow-indigo-500/10">
                <BookOpen className="h-8 w-8 text-indigo-600 dark:text-indigo-300" />
              </div>

              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 font-mono text-[11px] font-semibold text-indigo-700 uppercase tracking-wider mb-2 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                Study Notebook Required
              </span>

              <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
                Create or Select a Study Notebook
              </h2>

              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                AI tutoring sessions must be linked to a study notebook so your grounded sources, lecture notes, and conversation memory are automatically preserved across sessions.
              </p>

              {onOpenSources && (
                <button
                  type="button"
                  onClick={onOpenSources}
                  className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500"
                >
                  <Plus className="h-4 w-4" />
                  Open Notebooks &amp; Sources
                </button>
              )}
            </div>
          ) : (
          <div className="flex flex-col items-center justify-center py-4 text-center sm:py-8">
            {/* Glowing Hero Icon */}
            <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50 text-indigo-600 shadow-md dark:border-indigo-400/30 dark:bg-gradient-to-br dark:from-indigo-500/20 dark:to-purple-600/20 dark:text-indigo-300 dark:shadow-lg dark:shadow-indigo-500/10">
              <Sparkles className="h-7 w-7 animate-pulse text-indigo-600 dark:text-indigo-300" />
              <div className="absolute -inset-0.5 -z-10 rounded-2xl bg-indigo-500/10 dark:bg-indigo-500/20 blur-sm" />
            </div>

            <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl dark:text-zinc-100">
              How can I help you today?
            </h2>
            <p className="mt-2 max-w-md text-sm text-slate-600 dark:text-zinc-400">
              Ask questions, explore topics, get help with writing or coding, or select a starter prompt below.
            </p>

            {/* Starter Prompt Cards */}
            <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 text-left sm:grid-cols-2">
              {STARTER_PROMPTS.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(item.prompt)}
                    className="group relative flex cursor-pointer flex-col justify-between rounded-xl border border-slate-200/90 bg-white/95 p-4 text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-400/60 hover:bg-indigo-50/40 hover:shadow-md dark:border-white/[0.08] dark:bg-zinc-900/60 dark:hover:border-indigo-400/40 dark:hover:bg-zinc-800/80 dark:hover:shadow-lg dark:hover:shadow-indigo-500/5"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-indigo-600 transition-colors group-hover:border-indigo-300 group-hover:bg-indigo-100/50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-indigo-300 dark:group-hover:border-indigo-400/30 dark:group-hover:bg-indigo-500/15">
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[10px] uppercase text-slate-600 transition-colors group-hover:text-indigo-700 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-400 dark:group-hover:text-indigo-300">
                        {item.tag}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 transition-colors group-hover:text-indigo-950 dark:text-zinc-200 dark:group-hover:text-white">
                        {item.title}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600 transition-colors group-hover:text-slate-800 dark:text-zinc-500 dark:group-hover:text-zinc-400">
                        {item.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          )
        ) : (
          messages.map((message, index) => {
            const isUser = message.role === 'user';
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-xs',
                    isUser
                      ? 'border-indigo-500/40 bg-indigo-600 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-indigo-600 shadow-sm dark:border-white/[0.1] dark:bg-zinc-800 dark:text-indigo-300 dark:shadow-inner'
                  )}
                >
                  {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>

                {/* Bubble */}
                <div
                  className={cn(
                    'relative max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed transition-all sm:max-w-[85%]',
                    isUser
                      ? 'rounded-tr-sm border border-indigo-600 bg-indigo-600 text-white shadow-md'
                      : 'rounded-tl-sm border border-slate-200/90 bg-white/95 text-slate-900 shadow-md bot-bubble dark:border-white/[0.12] dark:bg-zinc-900/95 dark:text-zinc-100'
                  )}
                >
                  {isUser ? (
                    <p className="whitespace-pre-wrap leading-relaxed select-text">{message.content}</p>
                  ) : (
                    <MarkdownContent content={message.content} className="text-slate-900 dark:text-zinc-200" />
                  )}

                  {/* Grounded source citations — compact chips, expandable passages */}
                  {!isUser && message.citations && message.citations.length > 0 && (
                    <div className="mt-3 border-t border-slate-200/80 pt-2.5 dark:border-white/[0.05]">
                      <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-indigo-700 dark:text-indigo-300 font-semibold">
                        <BookOpen className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                        <span>{message.citations.length} grounded source citation(s)</span>
                      </div>
                      <ul className="space-y-1.5">
                        {message.citations.map((c, cIdx) => (
                          <CitationItem
                            key={cIdx}
                            citation={c}
                            domId={`msg-${index}-cite-${cIdx}`}
                          />
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Metadata & Actions footer */}
                  <div
                    className={cn(
                      'mt-2.5 flex items-center justify-between gap-4 border-t pt-1.5 font-mono text-[11px]',
                      isUser
                        ? 'border-indigo-400/30 text-indigo-200'
                        : 'border-slate-200/80 text-slate-500 dark:border-white/[0.08] dark:text-zinc-500'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {message.created_at && (
                        <span className={isUser ? 'text-indigo-200 font-medium' : 'text-slate-500 dark:text-zinc-400'}>
                          {new Date(message.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>

                    {!isUser && (
                      <div className="flex items-center gap-3">
                        {onSaveNote && (
                          <button
                            type="button"
                            onClick={() => onSaveNote('Study Note from AI', message.content)}
                            className="flex cursor-pointer items-center gap-1 text-slate-500 transition-colors hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-300"
                            title="Save this answer to notebook notes"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Save Note</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCopy(message.content, index)}
                          className="flex cursor-pointer items-center gap-1 text-slate-500 transition-colors hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                          title="Copy text"
                        >
                          {copiedIndex === index ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                              <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })
        )}

        {/* Loading Indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-indigo-600 shadow-sm dark:border-indigo-400/20 dark:bg-indigo-500/10 dark:text-indigo-300">
              <Bot className="h-4 w-4" />
            </div>
            <div className="rounded-2xl rounded-tl-sm border border-slate-200/90 bg-white/95 px-4 py-3 shadow-md dark:border-white/[0.08] dark:bg-zinc-900/80">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-zinc-400">
                <span className="h-2 w-2 animate-ping rounded-full bg-indigo-600 dark:bg-indigo-400" />
                <span>Strategist formulating response...</span>
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Error Alert (pinned above composer, outside scrolling history) */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mx-auto mb-2 flex w-full max-w-4xl shrink-0 items-start gap-2 px-3 sm:px-6"
          >
            <div className="flex w-full items-start justify-between rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              <div className="flex-1 text-xs sm:text-sm">{error}</div>
              <button
                onClick={() => setError(null)}
                className="cursor-pointer text-rose-300 transition-colors hover:text-rose-100"
                aria-label="Dismiss error"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer — pinned to the bottom of the workspace, never inside the scroll area */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-slate-200/90 bg-white/95 backdrop-blur-md px-3 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.03)] dark:border-white/[0.1] dark:bg-zinc-900/90 dark:shadow-none"
      >
        <div className="mx-auto max-w-4xl w-full">
          {/* Quick chip bar */}
          <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs text-slate-500 dark:text-zinc-500 no-scrollbar">
            <span className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
              Suggestions:
            </span>
            <button
              type="button"
              onClick={() => setInput('Help me plan and organize this project into clear steps.')}
              className="shrink-0 cursor-pointer rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-zinc-400 dark:shadow-none dark:hover:border-white/[0.2] dark:hover:bg-white/[0.1] dark:hover:text-zinc-200"
            >
              📋 Plan Project
            </button>
            <button
              type="button"
              onClick={() => setInput('Explain this concept clearly with examples.')}
              className="shrink-0 cursor-pointer rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-zinc-400 dark:shadow-none dark:hover:border-white/[0.2] dark:hover:bg-white/[0.1] dark:hover:text-zinc-200"
            >
              💡 Explain Concept
            </button>
            <button
              type="button"
              onClick={() => setInput('Help me write and improve this content.')}
              className="shrink-0 cursor-pointer rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-zinc-400 dark:shadow-none dark:hover:border-white/[0.2] dark:hover:bg-white/[0.1] dark:hover:text-zinc-200"
            >
              ✍️ Write & Edit
            </button>

            {/* Page-level fast actions */}
            {quickActions?.map((action) => (
              <button
                key={action.id}
                type="button"
                title={action.description}
                onClick={() => handleSendMessage(action.prompt)}
                className="shrink-0 cursor-pointer rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-zinc-400 dark:shadow-none dark:hover:border-white/[0.2] dark:hover:bg-white/[0.1] dark:hover:text-zinc-200"
              >
                {action.title}
              </button>
            ))}
          </div>

          <div className="relative flex items-center rounded-xl border border-slate-300 bg-white shadow-xs transition-all focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-white/[0.12] dark:bg-zinc-900/80 dark:shadow-inner dark:focus-within:border-indigo-400/40 dark:focus-within:ring-1 dark:focus-within:ring-indigo-400/20">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading || !notebookId}
              rows={1}
              placeholder={
                !notebookId
                  ? 'Please select or create a study notebook above to begin chatting with your AI tutor...'
                  : 'Type your message, ask a study question, or request a plan...'
              }
              className="max-h-[140px] min-h-[48px] w-full resize-none bg-transparent px-4 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              aria-label="Message the AI Assistant"
            />
            <div className="pr-2">
              <button
                type="submit"
                disabled={isLoading || !input.trim() || !notebookId}
                title={!notebookId ? 'Create or select a study notebook first' : 'Send message'}
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-indigo-600 text-white shadow-md shadow-indigo-600/30 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/50 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500 disabled:opacity-60 disabled:shadow-none"
                aria-label="Send message"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-slate-500 dark:text-zinc-400">
            <span>
              Press <kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-600 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-zinc-300">Enter</kbd> to send,{' '}
              <kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-600 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-zinc-300">Shift + Enter</kbd> for new line
            </span>
            <span className="hidden sm:inline text-slate-400 dark:text-zinc-500">Adaptive AI Learning Model</span>
          </div>
        </div>
      </form>
    </div>
  );
}
