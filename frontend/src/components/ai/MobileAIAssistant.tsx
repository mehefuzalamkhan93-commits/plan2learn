'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Send,
  Paperclip,
  X,
  Plus,
  Sparkles,
  BookOpen,
  FileText,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  Bookmark,
  Target,
  Calendar,
  MoreHorizontal,
  Globe,
  Video,
  Loader2,
  Sun,
  Moon,
  Trash2,
  Menu,
  Upload,
  Pin,
  PinOff,
  Edit3,
  Clock,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme';
import { useToast } from '@/components/ui/useToast';
import { aiAPI } from '@/services/api';
import {
  NotebookOut,
  SourceListItem,
  NoteOut,
  ChatMessage,
  AIChatRequest,
  AIChatResponse,
  ConversationOut,
} from '@/types';
import MarkdownContent from './MarkdownContent';
import MobileBottomNav from '@/components/navigation/MobileBottomNav';
import AppLogo from '@/components/ui/AppLogo';

interface MobileAIAssistantProps {
  notebooks?: NotebookOut[];
  setNotebooks?: React.Dispatch<React.SetStateAction<NotebookOut[]>>;
  currentNotebookId?: string | null;
  setCurrentNotebookId?: (id: string | null) => void;
  sources?: SourceListItem[];
  setSources?: React.Dispatch<React.SetStateAction<SourceListItem[]>>;
  notes?: NoteOut[];
  setNotes?: React.Dispatch<React.SetStateAction<NoteOut[]>>;
  isLoadingSources?: boolean;
  isLoadingNotebooks?: boolean;
  onRefreshNotebook?: (notebookId: string) => void;
  responseStyle: 'friendly' | 'strict';
  setResponseStyle: (style: 'friendly' | 'strict') => void;
  onGenerateProposal?: () => void;
  isGeneratingProposal?: boolean;
  onOpenPlanPreview?: () => void;
}

const SUGGESTIONS = [
  {
    id: 'explain',
    title: 'Explain a concept',
    desc: 'Get simple, clear explanations',
    prompt: 'Explain electromagnetic induction in simple words with real-world examples.',
    icon: Sparkles,
    colorClass:
      'bg-purple-500/15 border-purple-500/25 text-purple-400 dark:text-purple-400 light:text-purple-700 light:bg-purple-50 light:border-purple-200',
  },
  {
    id: 'solve',
    title: 'Solve a problem',
    desc: 'Step by step solutions',
    prompt: 'Help me solve a step-by-step numerical on Thermodynamics First Law applications.',
    icon: Target,
    colorClass:
      'bg-cyan-500/15 border-cyan-500/25 text-cyan-400 dark:text-cyan-400 light:text-cyan-700 light:bg-cyan-50 light:border-cyan-200',
  },
  {
    id: 'plan',
    title: 'Plan my study',
    desc: 'Create personalized study plan',
    prompt: 'Help me organize a personalized study plan for physics and chemistry topics.',
    icon: Calendar,
    colorClass:
      'bg-indigo-500/15 border-indigo-500/25 text-indigo-400 dark:text-indigo-400 light:text-indigo-700 light:bg-indigo-50 light:border-indigo-200',
  },
  {
    id: 'summarize',
    title: 'Summarize content',
    desc: 'Notes, PDFs, or videos',
    prompt: 'Summarize the core principles, formulas, and takeaways from my study materials.',
    icon: FileText,
    colorClass:
      'bg-amber-500/15 border-amber-500/25 text-amber-400 dark:text-amber-400 light:text-amber-700 light:bg-amber-50 light:border-amber-200',
  },
];

type SourceFilter = 'all' | 'notes' | 'youtube' | 'pdf' | 'web';

export default function MobileAIAssistant({
  notebooks = [],
  currentNotebookId = null,
  setCurrentNotebookId,
  notes = [],
  setNotes,
  responseStyle,
  setResponseStyle,
}: MobileAIAssistantProps) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();

  // Active conversation state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [currentTitle, setCurrentTitle] = useState<string>('New Chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [feedbackState, setFeedbackState] = useState<Record<number, 'up' | 'down'>>({});

  // Drafts cache per conversation ID (preserves unsent drafts across chat switching)
  const draftsRef = useRef<Record<string, string>>({});

  // Recent Chats state
  const [conversations, setConversations] = useState<ConversationOut[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [showRecentChatsDrawer, setShowRecentChatsDrawer] = useState(false);
  const [activeMenuChatId, setActiveMenuChatId] = useState<string | null>(null);

  // Rename modal state
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [editingChat, setEditingChat] = useState<ConversationOut | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Conversation Sources (Strict isolation)
  const [conversationSources, setConversationSources] = useState<SourceListItem[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState(false);
  const [showSourcesDrawer, setShowSourcesDrawer] = useState(false);
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  // Add Source Form State
  const [addSourceTab, setAddSourceTab] = useState<'upload' | 'youtube' | 'url'>('upload');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [webUrl, setWebUrl] = useState('');
  const [isSubmittingSource, setIsSubmittingSource] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // More options dropdown
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ---------------------------------------------------------------------------
  // Load conversation list
  // ---------------------------------------------------------------------------
  const loadConversations = useCallback(async () => {
    try {
      setIsLoadingConversations(true);
      const res = await aiAPI.getConversations();
      if (res?.conversations) {
        setConversations(res.conversations);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setIsLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // ---------------------------------------------------------------------------
  // Load sources for active conversation (Strict Isolation)
  // ---------------------------------------------------------------------------
  const loadConversationSources = useCallback(async (convId: string | null) => {
    if (!convId) {
      // New chat starts with 0 inherited sources
      setConversationSources([]);
      return;
    }
    try {
      setIsLoadingSources(true);
      const list = await aiAPI.getConversationSources(convId);
      setConversationSources(list || []);
    } catch (err) {
      console.error('Failed to load conversation sources:', err);
      setConversationSources([]);
    } finally {
      setIsLoadingSources(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Select an existing conversation from Recent Chats
  // ---------------------------------------------------------------------------
  const handleSelectConversation = async (convId: string) => {
    // Save draft for current conversation
    draftsRef.current[conversationId || '__new__'] = input;

    setShowRecentChatsDrawer(false);
    setActiveMenuChatId(null);
    setIsLoading(true);

    try {
      const history = await aiAPI.getConversation(convId);
      setConversationId(convId);
      setCurrentTitle(history.title || 'Chat');
      setMessages(history.messages || []);
      if (history.response_style === 'friendly' || history.response_style === 'strict') {
        setResponseStyle(history.response_style);
      }

      // Restore unsent draft if any
      setInput(draftsRef.current[convId] || '');

      // Load conversation's isolated sources
      await loadConversationSources(convId);
    } catch (err: any) {
      toast({
        title: 'Failed to load conversation',
        description: err?.response?.data?.detail || 'Could not fetch conversation history.',
        variant: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Start New Chat (+)
  // ---------------------------------------------------------------------------
  const handleNewChat = useCallback(() => {
    // Save draft for current conversation if active
    if (conversationId) {
      draftsRef.current[conversationId] = input;
    }

    setConversationId(null);
    setCurrentTitle('New Chat');
    setMessages([]);
    setConversationSources([]); // New chat starts with 0 sources!
    setInput(draftsRef.current['__new__'] || '');
    setIsLoading(false);
    setCopiedIndex(null);
    setFeedbackState({});
    setShowRecentChatsDrawer(false);
    setShowSourcesDrawer(false);
    setShowMoreMenu(false);

    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [conversationId, input]);

  // ---------------------------------------------------------------------------
  // Scroll to bottom (only scrolls the chat messages container, NEVER the window)
  // ---------------------------------------------------------------------------
  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    } else if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'nearest' });
    }
  }, []);

  // Only auto-scroll when messages exist; NEVER scroll on initial mount when messages is empty
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom(false);
    }
  }, [messages, scrollToBottom]);

  // Ensure window is at (0, 0) when entering the AI page so the mobile header is immediately visible
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Handle Send Message
  // ---------------------------------------------------------------------------
  const handleSendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    draftsRef.current[conversationId || '__new__'] = '';
    setIsLoading(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      // Build selected source IDs array from active conversation's sources
      const selectedSourceIds = conversationSources
        .filter((s) => s.is_selected)
        .map((s) => s.id);

      const request: AIChatRequest = {
        message: trimmed,
        conversation_id: conversationId || undefined,
        response_style: responseStyle,
        selected_source_ids: selectedSourceIds,
      };

      const res: AIChatResponse = await aiAPI.sendMessage(request);

      const newConvId = res.conversation_id;
      setConversationId(newConvId);

      // If backend generated or returned title, update it
      if (res.title) {
        setCurrentTitle(res.title);
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: res.ai_response,
        citations: res.citations,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Refresh recent chats to update title and last active time
      loadConversations();
    } catch (err: any) {
      toast({
        title: 'Message Error',
        description: err?.response?.data?.detail || 'Failed to get a response. Please check your connection.',
        variant: 'error',
      });
    } finally {
      setIsLoading(false);
      setTimeout(() => scrollToBottom(true), 100);
    }
  };

  // Auto-grow textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(input);
    }
  };

  // Copy message text
  const handleCopy = (content: string, idx: number) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(idx);
    toast({ title: 'Copied to clipboard', description: 'Message text copied.' });
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Save answer as note
  const handleSaveNote = async (content: string) => {
    try {
      const title = content.slice(0, 32).replace(/[#*`]/g, '').trim() || 'Study Note from AI';
      const newNote = await aiAPI.createNote({
        conversation_id: conversationId || undefined,
        notebook_id: currentNotebookId || undefined,
        title,
        content,
        note_type: 'general',
      });
      if (setNotes) {
        setNotes((prev) => [newNote, ...prev]);
      }
      toast({ title: 'Note Saved', description: 'Answer saved to study notes.' });
    } catch (err) {
      toast({ title: 'Save Failed', description: 'Could not save note.', variant: 'error' });
    }
  };

  // ---------------------------------------------------------------------------
  // Pin / Unpin Conversation
  // ---------------------------------------------------------------------------
  const handleTogglePin = async (chat: ConversationOut, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveMenuChatId(null);
    try {
      const updated = await aiAPI.updateConversation(chat.id, {
        is_pinned: !chat.is_pinned,
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === chat.id ? { ...c, is_pinned: updated.is_pinned } : c))
      );
      toast({
        title: updated.is_pinned ? 'Conversation Pinned' : 'Conversation Unpinned',
        description: `"${chat.title || 'Chat'}" has been ${updated.is_pinned ? 'pinned to the top' : 'moved to recent chats'}.`,
      });
    } catch (err: any) {
      toast({
        title: 'Action Failed',
        description: err?.response?.data?.detail || 'Failed to update pin state.',
        variant: 'error',
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Rename Conversation
  // ---------------------------------------------------------------------------
  const handleOpenRename = (chat: ConversationOut, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveMenuChatId(null);
    setEditingChat(chat);
    setRenameInput(chat.title || 'Chat');
    setShowRenameModal(true);
  };

  const handleSaveRename = async () => {
    if (!editingChat || !renameInput.trim()) return;
    setIsRenaming(true);
    try {
      const updated = await aiAPI.updateConversation(editingChat.id, {
        title: renameInput.trim(),
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === editingChat.id ? { ...c, title: updated.title, custom_title: true } : c))
      );
      if (conversationId === editingChat.id) {
        setCurrentTitle(updated.title || renameInput.trim());
      }
      setShowRenameModal(false);
      setEditingChat(null);
      toast({ title: 'Conversation Renamed', description: `Title saved as "${updated.title}".` });
    } catch (err: any) {
      toast({
        title: 'Rename Failed',
        description: err?.response?.data?.detail || 'Failed to update title.',
        variant: 'error',
      });
    } finally {
      setIsRenaming(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Delete Conversation
  // ---------------------------------------------------------------------------
  const handleDeleteConversation = async (chatId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveMenuChatId(null);
    try {
      await aiAPI.deleteConversation(chatId);
      setConversations((prev) => prev.filter((c) => c.id !== chatId));
      toast({ title: 'Conversation Deleted', description: 'Chat removed successfully.' });
      if (conversationId === chatId) {
        handleNewChat();
      }
    } catch (err: any) {
      toast({
        title: 'Delete Failed',
        description: err?.response?.data?.detail || 'Failed to delete conversation.',
        variant: 'error',
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Source Selection Toggle (Conversation-isolated)
  // ---------------------------------------------------------------------------
  const handleToggleSource = async (sourceId: string) => {
    if (!conversationId) {
      setConversationSources((prev) =>
        prev.map((s) => (s.id === sourceId ? { ...s, is_selected: !s.is_selected } : s))
      );
      return;
    }

    try {
      const res = await aiAPI.toggleConversationSource(conversationId, sourceId);
      setConversationSources((prev) =>
        prev.map((s) => (s.id === sourceId ? { ...s, is_selected: res.is_selected } : s))
      );
    } catch (e) {
      toast({ title: 'Selection Error', description: 'Failed to toggle source.', variant: 'error' });
    }
  };

  // ---------------------------------------------------------------------------
  // File Upload (Directly linked to Conversation)
  // ---------------------------------------------------------------------------
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSubmittingSource(true);
    try {
      let activeConvId = conversationId;
      if (!activeConvId) {
        const newConv = await aiAPI.createConversation({ title: 'New Chat' });
        activeConvId = newConv.id;
        setConversationId(newConv.id);
        setCurrentTitle(newConv.title || 'New Chat');
        loadConversations();
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('conversation_id', activeConvId);

      const res = await aiAPI.uploadSource(formData);
      if (res?.source) {
        setConversationSources((prev) => [res.source, ...prev.filter((s) => s.id !== res.source.id)]);
        toast({
          title: 'Source Uploaded',
          description: `Extracted and indexed "${file.name}" into this chat's context.`,
        });
        setShowAddSourceModal(false);
      }
    } catch (err: any) {
      toast({
        title: 'Upload Failed',
        description: err?.response?.data?.detail || 'Failed to upload document.',
        variant: 'error',
      });
    } finally {
      setIsSubmittingSource(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ---------------------------------------------------------------------------
  // YouTube Video Import
  // ---------------------------------------------------------------------------
  const handleImportYouTube = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrl.trim()) return;

    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = youtubeUrl.match(regExp);
    const videoId = match && match[2].length === 11 ? match[2] : null;

    if (!videoId) {
      toast({ title: 'Invalid URL', description: 'Please enter a valid YouTube video link.', variant: 'error' });
      return;
    }

    setIsSubmittingSource(true);
    try {
      let activeConvId = conversationId;
      if (!activeConvId) {
        const newConv = await aiAPI.createConversation({ title: 'New Chat' });
        activeConvId = newConv.id;
        setConversationId(newConv.id);
        setCurrentTitle(newConv.title || 'New Chat');
        loadConversations();
      }

      const res = await aiAPI.saveYouTubeSource({
        video_id: videoId,
        url: youtubeUrl.trim(),
        title: `YouTube: ${videoId}`,
        conversation_id: activeConvId,
      });

      if (res?.source) {
        setConversationSources((prev) => [res.source, ...prev.filter((s) => s.id !== res.source.id)]);
        toast({ title: 'Video Added', description: res.message || 'YouTube video source linked.' });
        setShowAddSourceModal(false);
        setYoutubeUrl('');
      }
    } catch (err: any) {
      toast({
        title: 'Import Failed',
        description: err?.response?.data?.detail || 'Failed to import video.',
        variant: 'error',
      });
    } finally {
      setIsSubmittingSource(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Web URL Import
  // ---------------------------------------------------------------------------
  const handleImportUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webUrl.trim()) return;

    setIsSubmittingSource(true);
    try {
      let activeConvId = conversationId;
      if (!activeConvId) {
        const newConv = await aiAPI.createConversation({ title: 'New Chat' });
        activeConvId = newConv.id;
        setConversationId(newConv.id);
        setCurrentTitle(newConv.title || 'New Chat');
        loadConversations();
      }

      const res = await aiAPI.importUrl({
        url: webUrl.trim(),
        conversation_id: activeConvId,
      });

      if (res?.source) {
        setConversationSources((prev) => [res.source, ...prev.filter((s) => s.id !== res.source.id)]);
        toast({ title: 'URL Added', description: res.message || 'Web source indexed and linked.' });
        setShowAddSourceModal(false);
        setWebUrl('');
      }
    } catch (err: any) {
      toast({
        title: 'Import Failed',
        description: err?.response?.data?.detail || 'Failed to import URL.',
        variant: 'error',
      });
    } finally {
      setIsSubmittingSource(false);
    }
  };

  // Filter sources in drawer
  const filteredSources = useMemo(() => {
    return conversationSources.filter((s) => {
      if (sourceFilter === 'all') return true;
      if (sourceFilter === 'notes') return s.source_type === 'note';
      if (sourceFilter === 'youtube') return s.source_type === 'youtube';
      if (sourceFilter === 'pdf') return s.source_type === 'pdf' || s.title?.toLowerCase().endsWith('.pdf');
      if (sourceFilter === 'web') return s.source_type === 'url';
      return true;
    });
  }, [conversationSources, sourceFilter]);

  const selectedSourcesCount = conversationSources.filter((s) => s.is_selected).length;

  // Split conversations into pinned and recent
  const pinnedConversations = useMemo(
    () => conversations.filter((c) => c.is_pinned),
    [conversations]
  );
  const recentConversations = useMemo(
    () => conversations.filter((c) => !c.is_pinned),
    [conversations]
  );

  // ---------------------------------------------------------------------------
  // Three-Dot Menu Handlers
  // ---------------------------------------------------------------------------
  const handleTogglePersona = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nextStyle = responseStyle === 'friendly' ? 'strict' : 'friendly';
    setResponseStyle(nextStyle);
    if (conversationId) {
      try {
        await aiAPI.setResponseStyle(conversationId, nextStyle);
      } catch (err) {
        console.error('Failed to sync response style with server:', err);
      }
    }
    toast({
      title: `Persona: ${nextStyle === 'friendly' ? 'Friendly Mentor' : 'Strict Study Coach'}`,
      description: `AI will now respond as a ${nextStyle === 'friendly' ? 'supportive mentor' : 'strict exam coach'}.`,
    });
    setShowMoreMenu(false);
  };

  const handleToggleTheme = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleTheme();
    setShowMoreMenu(false);
  };

  const handleOpenPlanner = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMoreMenu(false);
    router.push('/planner');
  };

  const handleStartNewChat = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMoreMenu(false);
    handleNewChat();
  };

  return (
    <div className="relative flex h-full max-h-[100dvh] w-full flex-col overflow-hidden bg-[#070A12] dark:bg-[#070A12] light:bg-[#f8fafc] text-slate-100 dark:text-slate-100 light:text-slate-900">
      {/* ====================================================================
          1. COMPACT MOBILE HEADER (Clean, Minimal, ChatGPT-like)
          ==================================================================== */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 w-full items-center justify-between border-b border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-[#070A12]/95 dark:bg-[#070A12]/95 light:bg-white/95 px-3 backdrop-blur-md">
        {/* Left: Recent Chats Drawer Toggle */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              setActiveMenuChatId(null);
              setShowRecentChatsDrawer(true);
            }}
            aria-label="Open Recent Chats"
            title="Recent Chats"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-[#0e1424] dark:bg-[#0e1424] light:bg-slate-100 text-zinc-300 dark:text-zinc-300 light:text-slate-700 transition-colors active:scale-95 cursor-pointer"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-white dark:text-white light:text-slate-900 truncate max-w-[170px] sm:max-w-[220px]">
              {conversationId ? currentTitle : 'New Chat'}
            </h1>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-400 light:text-slate-500 truncate max-w-[170px]">
              {conversationId
                ? `${selectedSourcesCount} source${selectedSourcesCount === 1 ? '' : 's'} linked`
                : 'Adaptive AI Study Partner'}
            </p>
          </div>
        </div>

        {/* Right: Sources Drawer, New Chat (+), More */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Sources button with isolated count badge */}
          <button
            type="button"
            onClick={() => setShowSourcesDrawer(true)}
            aria-label="Open Sources Panel"
            title="Sources for this conversation"
            className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-[#0e1424] dark:bg-[#0e1424] light:bg-slate-100 text-zinc-300 dark:text-zinc-300 light:text-slate-700 transition-colors active:scale-95 cursor-pointer"
          >
            <BookOpen className="h-4 w-4 text-indigo-400 dark:text-indigo-400 light:text-indigo-600" />
            {selectedSourcesCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-bold text-white shadow-xs">
                {selectedSourcesCount}
              </span>
            )}
          </button>

          {/* New Chat (+) */}
          <button
            type="button"
            onClick={handleNewChat}
            aria-label="Start new chat"
            title="Start new chat"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-[#0e1424] dark:bg-[#0e1424] light:bg-slate-100 text-zinc-300 dark:text-zinc-300 light:text-slate-700 transition-colors active:scale-95 cursor-pointer hover:border-indigo-500/40"
          >
            <Plus className="h-4 w-4" />
          </button>

          {/* More Menu */}
          <button
            type="button"
            onClick={() => setShowMoreMenu((v) => !v)}
            aria-label="More options"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-[#0e1424] dark:bg-[#0e1424] light:bg-slate-100 text-zinc-300 dark:text-zinc-300 light:text-slate-700 transition-colors active:scale-95 cursor-pointer"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>

        {/* Dropdown Overflow Menu */}
        {showMoreMenu && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs"
              onClick={() => setShowMoreMenu(false)}
            />
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-3 top-14 z-50 w-56 rounded-2xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-200 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white p-2 shadow-2xl space-y-1 animate-slide-up"
            >
              {/* 1. Persona Toggle */}
              <button
                type="button"
                onClick={handleTogglePersona}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-zinc-200 dark:text-zinc-200 light:text-slate-800 hover:bg-white/[0.05] dark:hover:bg-white/[0.05] light:hover:bg-slate-100 cursor-pointer transition-colors"
              >
                <span>Persona: {responseStyle === 'friendly' ? 'Friendly' : 'Strict'}</span>
                <span className="text-[10px] font-bold text-indigo-400 dark:text-indigo-400 light:text-indigo-600">Toggle</span>
              </button>

              {/* 2. Theme Toggle */}
              <button
                type="button"
                onClick={handleToggleTheme}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-zinc-200 dark:text-zinc-200 light:text-slate-800 hover:bg-white/[0.05] dark:hover:bg-white/[0.05] light:hover:bg-slate-100 cursor-pointer transition-colors"
              >
                <span>Theme: {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                {theme === 'dark' ? <Moon className="h-3.5 w-3.5 text-indigo-400" /> : <Sun className="h-3.5 w-3.5 text-amber-500" />}
              </button>

              {/* 3. Open Study Planner */}
              <button
                type="button"
                onClick={handleOpenPlanner}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-200 dark:text-zinc-200 light:text-slate-800 hover:bg-white/[0.05] dark:hover:bg-white/[0.05] light:hover:bg-slate-100 cursor-pointer transition-colors"
              >
                <Calendar className="h-3.5 w-3.5 text-indigo-400 dark:text-indigo-400 light:text-indigo-600" />
                <span>Open Study Planner</span>
              </button>

              {/* 4. Start New Chat */}
              <button
                type="button"
                onClick={handleStartNewChat}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-indigo-400 dark:text-indigo-400 light:text-indigo-600 hover:bg-indigo-500/10 cursor-pointer transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Start New Chat</span>
              </button>
            </div>
          </>
        )}
      </header>

      {/* ====================================================================
          2. CHAT STREAM / START SCREEN (Clean, Minimal, No Avatars)
          ==================================================================== */}
      <main ref={messagesContainerRef} className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4 space-y-4 pb-44 custom-scrollbar bg-[#070A12] dark:bg-[#070A12] light:bg-[#f8fafc]">
        {messages.length === 0 ? (
          /* Minimal Start Screen */
          <div className="flex min-h-[50vh] flex-col items-center justify-center text-center px-2 py-6">
            <AppLogo size="lg" className="mb-4" priority />
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white dark:text-white light:text-slate-900 max-w-xs">
              How can I help you with your studies?
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-zinc-400 dark:text-zinc-400 light:text-slate-600 max-w-sm">
              Ask anything, get clear explanations, solve problems, plan your studies and more.
            </p>

            {/* 4 Suggestion Cards */}
            <div className="mt-6 w-full max-w-md space-y-2.5 text-left">
              {SUGGESTIONS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSendMessage(item.prompt)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200/90 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white p-3.5 shadow-xs transition-all hover:border-indigo-500/40 active:scale-[0.98] cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border', item.colorClass)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold text-white dark:text-white light:text-slate-900 truncate">
                          {item.title}
                        </h3>
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-400 light:text-slate-500 truncate">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-500 light:text-slate-400" />
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* ChatGPT-style minimal conversation (NO USER/AI AVATARS) */
          messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={idx}
                className={cn('flex w-full flex-col', isUser ? 'items-end' : 'items-start')}
              >
                {/* Message Bubble - NO AVATARS */}
                <div
                  className={cn(
                    'text-sm leading-relaxed max-w-[90%] sm:max-w-[85%] select-text',
                    isUser
                      ? 'rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-white shadow-sm'
                      : 'w-full text-slate-100 dark:text-slate-100 light:text-slate-900 py-1'
                  )}
                >
                  {isUser ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <MarkdownContent
                      content={msg.content}
                      className="text-slate-100 dark:text-slate-100 light:text-slate-900"
                    />
                  )}
                </div>

                {/* Assistant Message Actions Row */}
                {!isUser && (
                  <div className="mt-1.5 flex items-center gap-1 text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.content, idx)}
                      aria-label="Copy response"
                      className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/[0.05] dark:hover:bg-white/[0.05] light:hover:bg-slate-100 hover:text-white dark:hover:text-white light:hover:text-slate-900 transition-colors cursor-pointer"
                    >
                      {copiedIndex === idx ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setFeedbackState((prev) => ({ ...prev, [idx]: 'up' }))}
                      aria-label="Helpful"
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/[0.05] dark:hover:bg-white/[0.05] light:hover:bg-slate-100 transition-colors cursor-pointer',
                        feedbackState[idx] === 'up' && 'text-emerald-400'
                      )}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setFeedbackState((prev) => ({ ...prev, [idx]: 'down' }))}
                      aria-label="Needs improvement"
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/[0.05] dark:hover:bg-white/[0.05] light:hover:bg-slate-100 transition-colors cursor-pointer',
                        feedbackState[idx] === 'down' && 'text-rose-400'
                      )}
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSaveNote(msg.content)}
                      aria-label="Save as study note"
                      className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/[0.05] dark:hover:bg-white/[0.05] light:hover:bg-slate-100 hover:text-white dark:hover:text-white light:hover:text-slate-900 transition-colors cursor-pointer"
                      title="Save note"
                    >
                      <Bookmark className="h-3.5 w-3.5" />
                    </button>

                    {msg.created_at && (
                      <span className="ml-2 font-mono text-[10px] text-zinc-500">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-center gap-2 py-2 text-xs text-zinc-400">
            <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-ping" />
            <span>Thinking and formulating explanation…</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* ====================================================================
          3. FIXED QUICK TOOLS & COMPOSER (Pinned above Bottom Nav)
          ==================================================================== */}
      <div className="fixed bottom-[max(env(safe-area-inset-bottom),3.75rem)] inset-x-0 z-30 bg-gradient-to-t from-[#070A12] via-[#070A12]/95 to-transparent dark:from-[#070A12] dark:via-[#070A12]/95 light:from-white light:via-white/95 pb-1 pt-2">
        <div className="mx-auto w-full max-w-md px-3 sm:px-4 space-y-2">
          {/* Quick Action Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <button
              type="button"
              onClick={() => setShowSourcesDrawer(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-[#0e1424] dark:bg-[#0e1424] light:bg-slate-100 px-3 py-1 text-[11px] font-medium text-zinc-200 dark:text-zinc-200 light:text-slate-800 shadow-xs active:scale-95 cursor-pointer"
            >
              <BookOpen className="h-3 w-3 text-indigo-400" />
              <span>Sources {selectedSourcesCount > 0 && `(${selectedSourcesCount})`}</span>
            </button>

            <button
              type="button"
              onClick={() => handleSendMessage('Summarize the key takeaways and core concepts of this discussion.')}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-[#0e1424] dark:bg-[#0e1424] light:bg-slate-100 px-3 py-1 text-[11px] font-medium text-zinc-200 dark:text-zinc-200 light:text-slate-800 shadow-xs active:scale-95 cursor-pointer"
            >
              <Sparkles className="h-3 w-3 text-purple-400" />
              <span>Summarize</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
                if (lastAssistant) {
                  handleSaveNote(lastAssistant.content);
                } else {
                  toast({ title: 'No response to save yet', description: 'Ask a question first to create a note.' });
                }
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-[#0e1424] dark:bg-[#0e1424] light:bg-slate-100 px-3 py-1 text-[11px] font-medium text-zinc-200 dark:text-zinc-200 light:text-slate-800 shadow-xs active:scale-95 cursor-pointer"
            >
              <Bookmark className="h-3 w-3 text-emerald-400" />
              <span>Create Notes</span>
            </button>

            <button
              type="button"
              onClick={() => setShowMoreMenu(true)}
              className="inline-flex shrink-0 items-center justify-center rounded-full border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-[#0e1424] dark:bg-[#0e1424] light:bg-slate-100 h-6 w-6 text-zinc-400 active:scale-95 cursor-pointer"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Clean Composer */}
          <div className="flex items-end gap-2 rounded-2xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white p-1.5 shadow-lg">
            {/* Attachment Pin */}
            <button
              type="button"
              onClick={() => setShowAddSourceModal(true)}
              aria-label="Add Source"
              title="Add source to this conversation"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-400 dark:text-zinc-400 light:text-slate-500 hover:text-white dark:hover:text-white light:hover:text-slate-900 active:scale-95 cursor-pointer"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            {/* Multiline Textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Message AI..."
              className="flex-1 max-h-28 min-h-[38px] resize-none bg-transparent py-2 text-xs sm:text-sm text-zinc-100 dark:text-zinc-100 light:text-slate-900 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 light:placeholder:text-slate-400 focus:outline-none"
            />

            {/* Send Button */}
            <button
              type="button"
              onClick={() => handleSendMessage(input)}
              disabled={!input.trim() && !isLoading}
              aria-label="Send message"
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer',
                input.trim()
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500'
                  : 'bg-white/[0.05] dark:bg-white/[0.05] light:bg-slate-100 text-zinc-500 dark:text-zinc-500 light:text-slate-400 cursor-not-allowed'
              )}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ====================================================================
          4. RECENT CHATS DRAWER (ChatGPT-Style with Pinned + Recent Sections)
          ==================================================================== */}
      {showRecentChatsDrawer && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setShowRecentChatsDrawer(false);
              setActiveMenuChatId(null);
            }}
          />
          <div className="relative z-10 w-full max-w-md mx-auto max-h-[82dvh] flex flex-col rounded-t-3xl border-t border-white/[0.1] dark:border-white/[0.1] light:border-slate-200 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white p-5 shadow-2xl animate-slide-up">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-600" />
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] dark:border-white/[0.08] light:border-slate-200">
              <div className="flex items-center gap-2.5">
                <AppLogo size="xs" />
                <h3 className="text-sm font-bold text-white dark:text-white light:text-slate-900">
                  Recent Chats
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 active:scale-95 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>New Chat</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRecentChatsDrawer(false);
                    setActiveMenuChatId(null);
                  }}
                  className="text-zinc-400 hover:text-white p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto py-3 space-y-4 custom-scrollbar min-h-0">
              {isLoadingConversations ? (
                <div className="flex items-center justify-center py-10 text-xs text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span>Loading conversations…</span>
                </div>
              ) : conversations.length === 0 ? (
                <div className="text-center py-12 text-xs text-zinc-400">
                  No conversations yet. Tap <span className="font-semibold text-indigo-400">+ New Chat</span> to start one.
                </div>
              ) : (
                <>
                  {/* PINNED SECTION */}
                  {pinnedConversations.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-indigo-400">
                        <Pin className="h-3 w-3" />
                        <span>Pinned</span>
                      </div>
                      <div className="space-y-1.5">
                        {pinnedConversations.map((chat) => (
                          <div
                            key={chat.id}
                            className={cn(
                              'relative flex items-center justify-between rounded-xl p-3 text-xs font-semibold transition-all cursor-pointer border',
                              chat.id === conversationId
                                ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300'
                                : 'border-white/[0.06] bg-white/[0.02] text-zinc-300 hover:bg-white/[0.05]'
                            )}
                            onClick={() => handleSelectConversation(chat.id)}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              <Pin className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium text-white dark:text-white light:text-slate-900">
                                  {chat.title || 'Untitled Conversation'}
                                </p>
                                <span className="text-[10px] text-zinc-500 dark:text-zinc-500 light:text-slate-500">
                                  {new Date(chat.last_active_at).toLocaleDateString([], {
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </span>
                              </div>
                            </div>

                            {/* 3 dots action menu */}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuChatId(activeMenuChatId === chat.id ? null : chat.id);
                                }}
                                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08]"
                                aria-label="Conversation options"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>

                              {activeMenuChatId === chat.id && (
                                <div className="absolute right-0 top-7 z-30 w-36 rounded-xl border border-white/[0.1] bg-[#070A12] p-1.5 shadow-xl space-y-1">
                                  <button
                                    type="button"
                                    onClick={(e) => handleTogglePin(chat, e)}
                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-white/[0.06]"
                                  >
                                    <PinOff className="h-3 w-3" />
                                    <span>Unpin</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => handleOpenRename(chat, e)}
                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-white/[0.06]"
                                  >
                                    <Edit3 className="h-3 w-3" />
                                    <span>Rename</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => handleDeleteConversation(chat.id, e)}
                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-rose-400 hover:bg-rose-500/10"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* RECENT CHATS SECTION */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                      <Clock className="h-3 w-3" />
                      <span>Recent</span>
                    </div>
                    <div className="space-y-1.5">
                      {recentConversations.map((chat) => (
                        <div
                          key={chat.id}
                          className={cn(
                            'relative flex items-center justify-between rounded-xl p-3 text-xs font-semibold transition-all cursor-pointer border',
                            chat.id === conversationId
                              ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300'
                              : 'border-white/[0.06] bg-white/[0.02] text-zinc-300 hover:bg-white/[0.05]'
                          )}
                          onClick={() => handleSelectConversation(chat.id)}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <MessageSquare className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-white dark:text-white light:text-slate-900">
                                {chat.title || 'Untitled Conversation'}
                              </p>
                              <span className="text-[10px] text-zinc-500 dark:text-zinc-500 light:text-slate-500">
                                {new Date(chat.last_active_at).toLocaleDateString([], {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            </div>
                          </div>

                          {/* 3 dots action menu */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuChatId(activeMenuChatId === chat.id ? null : chat.id);
                              }}
                              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08]"
                              aria-label="Conversation options"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>

                            {activeMenuChatId === chat.id && (
                              <div className="absolute right-0 top-7 z-30 w-36 rounded-xl border border-white/[0.1] bg-[#070A12] p-1.5 shadow-xl space-y-1">
                                <button
                                  type="button"
                                  onClick={(e) => handleTogglePin(chat, e)}
                                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-white/[0.06]"
                                >
                                  <Pin className="h-3 w-3" />
                                  <span>Pin</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleOpenRename(chat, e)}
                                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-white/[0.06]"
                                >
                                  <Edit3 className="h-3 w-3" />
                                  <span>Rename</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteConversation(chat.id, e)}
                                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-rose-400 hover:bg-rose-500/10"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          5. RENAME CONVERSATION MODAL
          ==================================================================== */}
      {showRenameModal && editingChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setShowRenameModal(false)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-200 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white p-5 shadow-2xl space-y-4 animate-slide-up">
            <h3 className="text-sm font-bold text-white dark:text-white light:text-slate-900">
              Rename Conversation
            </h3>
            <input
              type="text"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              className="w-full rounded-xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-zinc-900/60 dark:bg-zinc-900/60 light:bg-slate-50 px-3 py-2 text-xs text-white dark:text-white light:text-slate-900 focus:border-indigo-400 focus:outline-none"
              placeholder="Conversation title"
              autoFocus
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRenameModal(false)}
                className="rounded-xl px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRename}
                disabled={!renameInput.trim() || isRenaming}
                className="rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-indigo-500 disabled:opacity-50 cursor-pointer"
              >
                {isRenaming ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          6. SOURCES DRAWER (Strictly Conversation-Isolated)
          ==================================================================== */}
      {showSourcesDrawer && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setShowSourcesDrawer(false)}
            aria-hidden="true"
          />

          <div className="relative z-10 w-full max-w-md mx-auto max-h-[85dvh] flex flex-col rounded-t-3xl border-t border-white/[0.1] dark:border-white/[0.1] light:border-slate-200 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white shadow-2xl animate-slide-up">
            {/* Grab handle */}
            <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-zinc-600 dark:bg-zinc-600 light:bg-slate-300" />

            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white dark:text-white light:text-slate-900">
                  Sources for this Chat
                </h3>
                <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-400">
                  {conversationSources.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowSourcesDrawer(false)}
                aria-label="Close sources drawer"
                className="rounded-lg p-1 text-zinc-400 hover:text-white dark:hover:text-white light:text-slate-400 light:hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b border-white/[0.06] dark:border-white/[0.06] light:border-slate-200 px-5 py-2.5">
              {(['all', 'pdf', 'youtube', 'web', 'notes'] as SourceFilter[]).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setSourceFilter(filter)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-semibold capitalize transition-all cursor-pointer',
                    sourceFilter === filter
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white/[0.05] dark:bg-white/[0.05] light:bg-slate-100 text-zinc-400 dark:text-zinc-400 light:text-slate-600 hover:text-white'
                  )}
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* Source Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar min-h-0">
              {isLoadingSources ? (
                <div className="flex items-center justify-center py-10 text-xs text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span>Loading sources…</span>
                </div>
              ) : filteredSources.length === 0 ? (
                <div className="py-10 text-center text-xs text-zinc-400">
                  No sources attached to this chat yet.
                  <br />
                  <span className="text-[11px] text-zinc-500">
                    Tap <strong className="text-indigo-400">+ Add Study Source</strong> below to attach documents or links.
                  </span>
                </div>
              ) : (
                filteredSources.map((source) => (
                  <div
                    key={source.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] dark:border-white/[0.06] light:border-slate-200 bg-white/[0.02] dark:bg-white/[0.02] light:bg-slate-50/70 p-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Source Type Icon */}
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white font-bold text-xs',
                          source.source_type === 'youtube'
                            ? 'bg-rose-600'
                            : source.source_type === 'note'
                            ? 'bg-emerald-600'
                            : source.title.toLowerCase().endsWith('.pdf')
                            ? 'bg-red-500'
                            : 'bg-cyan-600'
                        )}
                      >
                        {source.source_type === 'youtube' ? (
                          <Video className="h-4 w-4" />
                        ) : source.source_type === 'note' ? (
                          <BookOpen className="h-4 w-4" />
                        ) : source.source_type === 'url' ? (
                          <Globe className="h-4 w-4" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <h4 className="text-xs font-semibold text-white dark:text-white light:text-slate-900 truncate">
                          {source.title}
                        </h4>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-400 light:text-slate-500 capitalize">
                          {source.source_type === 'note'
                            ? 'Study Note'
                            : source.source_type === 'youtube'
                            ? 'YouTube'
                            : source.source_type === 'pdf'
                            ? 'PDF Document'
                            : source.source_type === 'url'
                            ? 'Web Source'
                            : source.source_type}
                        </p>
                      </div>
                    </div>

                    {/* Checkbox */}
                    <button
                      type="button"
                      onClick={() => handleToggleSource(source.id)}
                      aria-label={source.is_selected ? 'Deselect source' : 'Select source'}
                      className="p-1 cursor-pointer"
                    >
                      {source.is_selected ? (
                        <div className="flex h-5 w-5 items-center justify-center rounded bg-indigo-600 text-white">
                          <Check className="h-3.5 w-3.5" />
                        </div>
                      ) : (
                        <div className="h-5 w-5 rounded border border-zinc-500 dark:border-zinc-500 light:border-slate-400" />
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Bottom Add Action */}
            <div className="border-t border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 p-4">
              <button
                type="button"
                onClick={() => setShowAddSourceModal(true)}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500 active:scale-95"
              >
                <Plus className="h-4 w-4" />
                <span>+ Add Study Source to Chat</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          7. ADD SOURCE SUB-MODAL (Upload, YouTube, Web URL)
          ==================================================================== */}
      {showAddSourceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setShowAddSourceModal(false)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-200 bg-[#0e1424] dark:bg-[#0e1424] light:bg-white p-5 shadow-2xl space-y-4 text-slate-100 dark:text-slate-100 light:text-slate-900 animate-slide-up">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.08] dark:border-white/[0.08] light:border-slate-200">
              <h3 className="text-sm font-bold text-white dark:text-white light:text-slate-900">
                Add Study Material
              </h3>
              <button
                type="button"
                onClick={() => setShowAddSourceModal(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tab switch */}
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/20 p-1 text-xs">
              <button
                type="button"
                onClick={() => setAddSourceTab('upload')}
                className={cn(
                  'rounded-lg py-1.5 font-medium transition-all cursor-pointer text-center',
                  addSourceTab === 'upload' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                )}
              >
                File / PDF
              </button>
              <button
                type="button"
                onClick={() => setAddSourceTab('youtube')}
                className={cn(
                  'rounded-lg py-1.5 font-medium transition-all cursor-pointer text-center',
                  addSourceTab === 'youtube' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                )}
              >
                YouTube
              </button>
              <button
                type="button"
                onClick={() => setAddSourceTab('url')}
                className={cn(
                  'rounded-lg py-1.5 font-medium transition-all cursor-pointer text-center',
                  addSourceTab === 'url' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                )}
              >
                Web URL
              </button>
            </div>

            {/* Upload File */}
            {addSourceTab === 'upload' && (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md,.pptx,.docx"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmittingSource}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-500/40 bg-indigo-500/10 p-6 text-center cursor-pointer hover:bg-indigo-500/15"
                >
                  <Upload className="h-6 w-6 text-indigo-400" />
                  <span className="text-xs font-semibold text-indigo-300">
                    {isSubmittingSource ? 'Uploading…' : 'Choose PDF, TXT or DOCX'}
                  </span>
                  <span className="text-[10px] text-zinc-400">Max size: 25MB</span>
                </button>
              </div>
            )}

            {/* YouTube URL */}
            {addSourceTab === 'youtube' && (
              <form onSubmit={handleImportYouTube} className="space-y-3">
                <input
                  type="text"
                  placeholder="https://youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-zinc-900/60 dark:bg-zinc-900/60 light:bg-white px-3 py-2 text-xs focus:border-indigo-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isSubmittingSource || !youtubeUrl.trim()}
                  className="w-full rounded-xl bg-indigo-600 py-2 text-xs font-semibold text-white shadow-md hover:bg-indigo-500 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingSource ? 'Importing…' : 'Import Video'}
                </button>
              </form>
            )}

            {/* Web URL */}
            {addSourceTab === 'url' && (
              <form onSubmit={handleImportUrl} className="space-y-3">
                <input
                  type="url"
                  placeholder="https://en.wikipedia.org/wiki/..."
                  value={webUrl}
                  onChange={(e) => setWebUrl(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-zinc-900/60 dark:bg-zinc-900/60 light:bg-white px-3 py-2 text-xs focus:border-indigo-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isSubmittingSource || !webUrl.trim()}
                  className="w-full rounded-xl bg-indigo-600 py-2 text-xs font-semibold text-white shadow-md hover:bg-indigo-500 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingSource ? 'Importing…' : 'Import Web Page'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          8. STRICTLY PROTECTED MOBILE BOTTOM NAVIGATION (UNTOUCHED)
          ==================================================================== */}
      <MobileBottomNav active="ai" />
    </div>
  );
}
