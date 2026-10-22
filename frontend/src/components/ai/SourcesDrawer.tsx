'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileText,
  Folder,
  Upload,
  Globe,
  Video,
  Loader2,
  Plus,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  BookOpen,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/useToast';
import { aiAPI, getApiBaseOrigin } from '@/services/api';
import { NotebookOut, SourceListItem, YouTubeVideoResult, DriveStatusResponse } from '@/types';
import DrawerShell from './DrawerShell';
import DrivePickerModal, { PickedDriveFile } from './DrivePickerModal';
import { useTheme } from '@/lib/theme';

interface SourcesDrawerProps {
  isOpen?: boolean;
  notebooks: NotebookOut[];
  setNotebooks: React.Dispatch<React.SetStateAction<NotebookOut[]>>;
  currentNotebookId: string | null;
  setCurrentNotebookId: (id: string | null) => void;
  sources: SourceListItem[];
  setSources: React.Dispatch<React.SetStateAction<SourceListItem[]>>;
  isLoadingSources: boolean;
  isLoadingNotebooks: boolean;
  onRefreshNotebook: (notebookId: string) => void;
  onClose: () => void;
}

function SourceStatusBadge({ status }: { status: SourceListItem['status'] }) {
  const statusMap: Record<SourceListItem['status'], [string, string]> = {
    ready: ['Ready', 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'],
    processing: ['Processing', 'bg-amber-500/10 text-amber-300 border-amber-500/20'],
    failed: ['Failed', 'bg-rose-500/10 text-rose-300 border-rose-500/20'],
    no_transcript: ['No Transcript', 'bg-amber-500/10 text-amber-300 border-amber-500/20'],
    unsupported: ['Unsupported', 'bg-rose-500/10 text-rose-300 border-rose-500/20'],
  };
  const [label, classes] =
    statusMap[status] || ['Unknown', 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20'];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono ${classes}`}
    >
      {label}
    </span>
  );
}

function SourceTypeIcon({ source_type }: { source_type: string }) {
  switch (source_type) {
    case 'pptx':
      return <Layers className="h-4 w-4 text-amber-400" />;
    case 'note':
      return <BookOpen className="h-4 w-4 text-emerald-400" />;
    case 'google_drive':
      return <Folder className="h-4 w-4 text-blue-400" />;
    case 'youtube':
      return <Video className="h-4 w-4 text-rose-400" />;
    case 'url':
      return <Globe className="h-4 w-4 text-cyan-400" />;
    default:
      return <FileText className="h-4 w-4 text-indigo-400" />;
  }
}

function CollapsibleSection({
  icon,
  label,
  badge,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/60 bg-white/65 backdrop-blur-md shadow-xs dark:border-white/[0.08] dark:bg-zinc-900/40 dark:shadow-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left cursor-pointer"
      >
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate text-xs font-semibold text-slate-800 dark:text-zinc-200">{label}</span>
          {badge}
        </span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-zinc-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-zinc-400" />
        )}
      </button>
      {open && <div className="border-t border-slate-200/80 p-3 pt-2.5 dark:border-white/[0.06]">{children}</div>}
    </div>
  );
}

function SourcePreview({ source }: { source: SourceListItem }) {
  const meta = (source.meta_info || {}) as Record<string, any>;
  const rows: Array<[string, React.ReactNode]> = [];

  rows.push(['Origin', <span key="o" className="capitalize text-zinc-300">{source.origin.replace('_', ' ')}</span>]);
  rows.push([
    'Added',
    <span key="d" className="text-zinc-300">{new Date(source.created_at).toLocaleString()}</span>,
  ]);
  if (source.file_size > 0) {
    rows.push(['Size', <span key="s" className="text-zinc-300">{(source.file_size / 1024).toFixed(1)} KB</span>]);
  }
  if (source.page_count) {
    rows.push(['Pages', <span key="p" className="text-zinc-300">{source.page_count}</span>]);
  }
  if (meta.chunk_count !== undefined) {
    rows.push(['Chunks', <span key="c" className="text-zinc-300">{meta.chunk_count} indexed</span>]);
  }
  if (meta.channel) {
    rows.push(['Channel', <span key="ch" className="text-zinc-300">{meta.channel}</span>]);
  }
  if (meta.original_filename && meta.original_filename !== source.title) {
    rows.push(['File', <span key="f" className="truncate text-zinc-300">{meta.original_filename}</span>]);
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-white/[0.06] bg-black/25 p-2.5 text-[11px]">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex min-w-0 items-baseline justify-between gap-2">
            <span className="shrink-0 text-zinc-500 uppercase tracking-wider text-[9px] font-mono">{k}</span>
            <span className="truncate text-right">{v}</span>
          </div>
        ))}
      </div>

      {meta.url && (
        <a
          href={meta.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 truncate text-[11px] text-cyan-400 hover:text-cyan-300"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">{meta.url}</span>
        </a>
      )}

      {meta.thumbnail && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={meta.thumbnail} alt={source.title} className="h-20 w-full rounded-md object-cover" />
      )}

      {meta.description && (
        <p className="max-h-24 overflow-y-auto whitespace-pre-wrap leading-relaxed text-zinc-400">
          {meta.description}
        </p>
      )}
    </div>
  );
}

export default function SourcesDrawer({
  isOpen = true,
  notebooks,
  setNotebooks,
  currentNotebookId,
  setCurrentNotebookId,
  sources,
  setSources,
  isLoadingSources,
  isLoadingNotebooks,
  onRefreshNotebook,
  onClose,
}: SourcesDrawerProps) {
  const { toast } = useToast();
  const { theme } = useTheme();

  // Notebook modals
  const [showNewNotebookModal, setShowNewNotebookModal] = useState(false);
  const [newNotebookTitle, setNewNotebookTitle] = useState('');
  const [newNotebookDesc, setNewNotebookDesc] = useState('');
  const [showRenameNotebookModal, setShowRenameNotebookModal] = useState(false);
  const [renameNotebookTitle, setRenameNotebookTitle] = useState('');
  const [renameNotebookDesc, setRenameNotebookDesc] = useState('');
  const [isRenamingNotebook, setIsRenamingNotebook] = useState(false);

  // Uploads
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingSource, setIsUploadingSource] = useState(false);
  const [isUploadingFolder, setIsUploadingFolder] = useState(false);

  // URL import
  const [showImportUrlModal, setShowImportUrlModal] = useState(false);
  const [importUrlInput, setImportUrlInput] = useState('');
  const [isImportingUrl, setIsImportingUrl] = useState(false);

  // Transcript
  const [pasteTranscriptSource, setPasteTranscriptSource] = useState<SourceListItem | null>(null);
  const [pasteTranscriptText, setPasteTranscriptText] = useState('');
  const [isSubmittingTranscript, setIsSubmittingTranscript] = useState(false);

  // Expanded source preview
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);

  // YouTube search
  const [youtubeQuery, setYoutubeQuery] = useState('');
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeResults, setYoutubeResults] = useState<YouTubeVideoResult[]>([]);
  const [youtubeSearched, setYoutubeSearched] = useState(false);
  const [youtubeConfigured, setYoutubeConfigured] = useState(true);
  const [youtubeMessage, setYoutubeMessage] = useState('');
  const [savingVideoId, setSavingVideoId] = useState<string | null>(null);

  // Google Drive
  const [driveStatus, setDriveStatus] = useState<DriveStatusResponse | null>(null);
  const [driveFilesModalOpen, setDriveFilesModalOpen] = useState(false);
  const [drivePickerModalOpen, setDrivePickerModalOpen] = useState(false);
  const [driveFiles, setDriveFiles] = useState<Array<{ id: string; name: string; mimeType: string; size?: number }>>([]);
  const [isLoadingDriveFiles, setIsLoadingDriveFiles] = useState(false);
  const [isImportingDriveFile, setIsImportingDriveFile] = useState<string | null>(null);

  const refreshDriveStatus = useCallback(async () => {
    try {
      const drive = await aiAPI.getDriveStatus();
      setDriveStatus(drive);
      return drive;
    } catch (err) {
      console.warn('Drive status check failed:', err);
      return null;
    }
  }, []);

  // Load drive status when the drawer mounts
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await refreshDriveStatus();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshDriveStatus]);

  // Handle the OAuth callback landing back on /ai?drive=connected|error
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const drive = params.get('drive');
    if (!drive) return;

    const reason = params.get('drive_reason') || '';
    if (drive === 'connected') {
      toast({
        title: 'Google Drive connected',
        description: 'Your Google account is authorized. Pick files to import.',
        variant: 'default',
      });
    } else {
      const readable: Record<string, string> = {
        invalid_state: 'The sign-in link expired or was already used. Please try Connect again.',
        token_exchange: 'Google refused the authorization code. The OAuth client credentials or redirect URI may be misconfigured.',
        google_access_denied: 'Authorization was declined in the Google consent screen.',
        drive_disabled: 'Google Drive integration is disabled on the backend.',
        not_configured: 'Google Drive OAuth is not configured on the backend.',
      };
      toast({
        title: 'Google Drive connection failed',
        description: readable[reason] || 'An error occurred during Google authorization. Please try connecting again.',
        variant: 'error',
      });
    }

    // Clean the URL so reload/refresh does not re-toast stale results
    params.delete('drive');
    params.delete('drive_reason');
    const remainder = params.toString();
    const cleanUrl = `${window.location.pathname}${remainder ? `?${remainder}` : ''}`;
    window.history.replaceState({}, '', cleanUrl);
  }, [toast]);

  // Notebook CRUD
  const handleCreateNotebook = async () => {
    if (!newNotebookTitle.trim()) return;
    try {
      const created = await aiAPI.createNotebook({
        title: newNotebookTitle.trim(),
        description: newNotebookDesc.trim() || undefined,
      });
      setNotebooks((prev) => [created, ...prev]);
      setCurrentNotebookId(created.id);
      setShowNewNotebookModal(false);
      setNewNotebookTitle('');
      setNewNotebookDesc('');
      toast({
        title: 'Notebook created',
        description: `"${created.title}" is ready. Upload materials to ground the AI.`,
        variant: 'default',
      });
    } catch (err: any) {
      toast({
        title: 'Error creating notebook',
        description: err?.response?.data?.detail || 'Failed to create notebook',
        variant: 'error',
      });
    }
  };

  const handleDeleteNotebook = async (id: string) => {
    if (!confirm('Are you sure you want to delete this notebook and all its sources?')) return;
    try {
      await aiAPI.deleteNotebook(id);
      const remaining = notebooks.filter((n) => n.id !== id);
      setNotebooks(remaining);
      if (currentNotebookId === id) {
        setCurrentNotebookId(remaining.length > 0 ? remaining[0].id : null);
      }
      toast({
        title: 'Notebook deleted',
        description: 'Notebook and associated sources removed.',
        variant: 'default',
      });
    } catch (err: any) {
      toast({
        title: 'Failed to delete',
        description: err?.response?.data?.detail || 'Error deleting notebook',
        variant: 'error',
      });
    }
  };

  const handleStartRenameNotebook = () => {
    if (!currentNotebookId) return;
    const current = notebooks.find((n) => n.id === currentNotebookId);
    if (!current) return;
    setRenameNotebookTitle(current.title);
    setRenameNotebookDesc(current.description || '');
    setShowRenameNotebookModal(true);
  };

  const handleRenameNotebook = async () => {
    if (!currentNotebookId || !renameNotebookTitle.trim()) return;
    setIsRenamingNotebook(true);
    try {
      const updated = await aiAPI.updateNotebook(currentNotebookId, {
        title: renameNotebookTitle.trim(),
        description: renameNotebookDesc.trim() || undefined,
      });
      setNotebooks((prev) =>
        prev.map((n) =>
          n.id === currentNotebookId
            ? { ...n, title: updated.title, description: updated.description }
            : n
        )
      );
      setShowRenameNotebookModal(false);
      toast({
        title: 'Notebook renamed',
        description: `Updated title to "${updated.title}"`,
        variant: 'default',
      });
    } catch (err: any) {
      toast({
        title: 'Rename failed',
        description: err?.response?.data?.detail || 'Failed to rename notebook',
        variant: 'error',
      });
    } finally {
      setIsRenamingNotebook(false);
    }
  };

  // URL import
  const handleImportUrl = async () => {
    if (!currentNotebookId || !importUrlInput.trim()) return;
    setIsImportingUrl(true);
    try {
      const res = await aiAPI.importUrl({
        url: importUrlInput.trim(),
        notebook_id: currentNotebookId,
      });
      if (res.success) {
        toast({
          title: 'URL imported',
          description: res.message || 'Page content indexed into study context.',
          variant: 'default',
        });
        setImportUrlInput('');
        setShowImportUrlModal(false);
        onRefreshNotebook(currentNotebookId);
      }
    } catch (err: any) {
      toast({
        title: 'URL import failed',
        description: err?.response?.data?.detail || 'Could not import or extract content from this URL.',
        variant: 'error',
      });
    } finally {
      setIsImportingUrl(false);
    }
  };

  // Transcript
  const handlePasteTranscript = async () => {
    if (!pasteTranscriptSource || !pasteTranscriptText.trim()) return;
    setIsSubmittingTranscript(true);
    try {
      const res = await aiAPI.pasteTranscript(pasteTranscriptSource.id, pasteTranscriptText.trim());
      if (res.success) {
        toast({
          title: 'Transcript processed',
          description: res.message || 'Transcript indexed for AI grounding.',
          variant: 'default',
        });
        setPasteTranscriptSource(null);
        setPasteTranscriptText('');
        if (currentNotebookId) onRefreshNotebook(currentNotebookId);
      }
    } catch (err: any) {
      toast({
        title: 'Failed to process transcript',
        description: err?.response?.data?.detail || 'Error indexing transcript.',
        variant: 'error',
      });
    } finally {
      setIsSubmittingTranscript(false);
    }
  };

  // File upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentNotebookId) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('notebook_id', currentNotebookId);
    formData.append('origin', 'upload');

    setIsUploadingSource(true);
    try {
      const response = await aiAPI.uploadSource(formData);
      if (response.success) {
        toast({
          title: 'Source uploaded',
          description: `Extracted and indexed "${file.name}" into study context.`,
          variant: 'default',
        });
        onRefreshNotebook(currentNotebookId);
      }
    } catch (err: any) {
      toast({
        title: 'Upload failed',
        description:
          err?.response?.data?.detail ||
          'Failed to extract document. Supported formats: .pdf, .docx, .txt, .pptx',
        variant: 'error',
      });
    } finally {
      setIsUploadingSource(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Folder upload
  const handleFolderUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0 || !currentNotebookId) return;

    const files = Array.from(fileList);
    const validExtensions = ['.pdf', '.docx', '.txt', '.md', '.pptx'];
    const eligibleFiles = files.filter((f) =>
      validExtensions.some((ext) => f.name.toLowerCase().endsWith(ext))
    );

    if (eligibleFiles.length === 0) {
      toast({
        title: 'No supported documents found',
        description:
          'The selected folder does not contain supported study documents (.pdf, .docx, .txt, .md, .pptx).',
        variant: 'error',
      });
      if (folderInputRef.current) folderInputRef.current.value = '';
      return;
    }

    setIsUploadingFolder(true);
    toast({
      title: 'Importing folder',
      description: `Importing ${eligibleFiles.length} study documents into active notebook...`,
      variant: 'default',
    });

    let successCount = 0;
    let failCount = 0;

    for (const file of eligibleFiles) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('notebook_id', currentNotebookId);
      formData.append('origin', 'folder');
      try {
        await aiAPI.uploadSource(formData);
        successCount++;
      } catch (err) {
        failCount++;
      }
    }

    setIsUploadingFolder(false);
    if (folderInputRef.current) folderInputRef.current.value = '';

    toast({
      title: 'Folder import complete',
      description: `Indexed ${successCount} document(s).${failCount > 0 ? ` (${failCount} failed)` : ''}`,
      variant: successCount > 0 ? 'default' : 'error',
    });

    onRefreshNotebook(currentNotebookId);
  };

  // Source selection / deletion
  const handleToggleSource = async (sourceId: string) => {
    try {
      const updated = await aiAPI.toggleSourceSelection(sourceId);
      setSources((prev) =>
        prev.map((s) => (s.id === sourceId ? { ...s, is_selected: updated.is_selected } : s))
      );
    } catch (err) {
      console.error('Failed to toggle source:', err);
    }
  };

  const handleToggleAllSources = async () => {
    if (sources.length === 0) return;
    const shouldSelectAll = activeCount < sources.length;
    const targets = sources.filter((s) => s.is_selected !== shouldSelectAll);
    setSources((prev) => prev.map((s) => ({ ...s, is_selected: shouldSelectAll })));
    await Promise.allSettled(targets.map((s) => aiAPI.toggleSourceSelection(s.id)));
  };

  const handleDeleteSource = async (sourceId: string) => {
    try {
      await aiAPI.deleteSource(sourceId);
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
      toast({
        title: 'Source removed',
        description: 'Document removed from notebook grounding.',
        variant: 'default',
      });
    } catch (err: any) {
      toast({
        title: 'Failed to delete',
        description: err?.response?.data?.detail || 'Error removing source',
        variant: 'error',
      });
    }
  };

  // YouTube search
  const handleSearchYouTube = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!youtubeQuery.trim()) return;
    setYoutubeLoading(true);
    setYoutubeSearched(true);
    try {
      const res = await aiAPI.searchYouTube(youtubeQuery.trim());
      setYoutubeResults(res.results || []);
      setYoutubeConfigured(res.configured ?? true);
      setYoutubeMessage(res.message || '');
    } catch (err: any) {
      setYoutubeConfigured(false);
      setYoutubeMessage(err?.response?.data?.detail || 'YouTube Data API key is not configured.');
      toast({
        title: 'Search failed',
        description: err?.response?.data?.detail || 'Could not fetch YouTube videos.',
        variant: 'error',
      });
    } finally {
      setYoutubeLoading(false);
    }
  };

  const handleSaveYouTubeVideo = async (v: YouTubeVideoResult) => {
    if (!currentNotebookId) {
      toast({
        title: 'No active notebook',
        description: 'Please select or create a notebook first before saving video materials.',
        variant: 'error',
      });
      return;
    }
    setSavingVideoId(v.video_id);
    try {
      const res = await aiAPI.saveYouTubeSource({
        video_id: v.video_id,
        notebook_id: currentNotebookId,
        title: v.title,
        channel: v.channel,
        thumbnail: v.thumbnail,
        url: v.url,
        description: v.description,
      });
      if (res.transcript_status === 'ready') {
        toast({
          title: 'Video saved with transcript',
          description: `"${v.title}" transcript extracted and indexed for AI grounding!`,
          variant: 'default',
        });
      } else {
        toast({
          title: 'Video saved (no transcript)',
          description: `"${v.title}" saved. Subtitles are unavailable; you can paste the transcript to ground AI answers.`,
          variant: 'default',
        });
      }
      onRefreshNotebook(currentNotebookId);
    } catch (err: any) {
      toast({
        title: 'Failed to save video',
        description: err?.response?.data?.detail || 'Error saving video to notebook.',
        variant: 'error',
      });
    } finally {
      setSavingVideoId(null);
    }
  };

  // Google Drive
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const driveConnectUrl = driveStatus?.connect_url
    ? `${getApiBaseOrigin()}${driveStatus.connect_url}`
    : null;

  const handleConnectDrive = async () => {
    try {
      setIsConnectingDrive(true);
      const res = await aiAPI.getDriveConnectUrl();
      if (res?.url) {
        window.location.href = res.url;
        return;
      }
      // Fallback: direct redirect with token query param if available
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (token && driveConnectUrl) {
        window.location.href = `${driveConnectUrl}?token=${encodeURIComponent(token)}`;
        return;
      }
      if (driveConnectUrl) {
        window.location.href = driveConnectUrl;
      }
    } catch (err: any) {
      toast({
        title: 'Google Drive error',
        description: err?.response?.data?.detail || 'Failed to start Google Drive connection.',
        variant: 'error',
      });
    } finally {
      setIsConnectingDrive(false);
    }
  };

  const handleOpenDriveFiles = async () => {
    setIsLoadingDriveFiles(true);
    setDriveFilesModalOpen(true);
    try {
      const data = await aiAPI.getDriveFiles();
      setDriveFiles(data.files || []);
    } catch (err: any) {
      toast({
        title: 'Google Drive error',
        description: err?.response?.data?.detail || 'Could not fetch files from Google Drive.',
        variant: 'error',
      });
    } finally {
      setIsLoadingDriveFiles(false);
    }
  };

  const importDriveFilesById = async (files: Array<{ id: string; name?: string }>) => {
    if (!currentNotebookId) return;
    const succeeded: string[] = [];
    const failed: string[] = [];
    for (const f of files) {
      setIsImportingDriveFile(f.id);
      try {
        const res = await aiAPI.importDriveFile({
          file_id: f.id,
          notebook_id: currentNotebookId,
        });
        if (res.success) succeeded.push(res.duplicate ? `${res.message}` : res.message);
      } catch (err: any) {
        failed.push(
          `${f.name || 'A selected file'}: ${err?.response?.data?.detail || 'import failed'}`
        );
      }
    }
    setIsImportingDriveFile(null);

    if (succeeded.length > 0) {
      toast({
        title: 'Google Drive import complete',
        description: succeeded.join(' • '),
        variant: 'default',
      });
      onRefreshNotebook(currentNotebookId);
    }
    if (failed.length > 0) {
      toast({
        title: 'Some files could not be imported',
        description: failed.join(' • '),
        variant: 'error',
      });
    }
  };

  const handlePickDriveFiles = (picked: PickedDriveFile[]) => {
    setDrivePickerModalOpen(false);
    if (!currentNotebookId) return;
    importDriveFilesById(picked);
  };

  const handleImportDriveFile = async (file: { id: string; name: string }) => {
    await importDriveFilesById([file]);
    setDriveFilesModalOpen(false);
  };

  const handleDisconnectDrive = async () => {
    try {
      await aiAPI.disconnectDrive();
      toast({
        title: 'Google Drive disconnected',
        description: 'Authorization revoked at Google and stored credentials removed.',
        variant: 'default',
      });
      await refreshDriveStatus();
    } catch (err: any) {
      toast({
        title: 'Disconnect failed',
        description: err?.response?.data?.detail || 'Error disconnecting Drive',
        variant: 'error',
      });
    }
  };

  // Picker modal lazily mounts; its open flag lives with the drawer
  const showDriveChooseFiles = () => {
    if (!currentNotebookId) {
      toast({
        title: 'No active notebook',
        description: 'Select or create a notebook before importing Drive files.',
        variant: 'error',
      });
      return;
    }
    if (driveStatus?.picker_ready) {
      setDrivePickerModalOpen(true);
    } else {
      handleOpenDriveFiles();
    }
  };

  const activeCount = sources.filter((s) => s.is_selected).length;
  const busy = isUploadingSource || isUploadingFolder || isImportingUrl;

  return (
    <>
      <DrawerShell
        side="left"
        title="Sources"
        isOpen={isOpen}
        icon={<FileText className="h-4 w-4 shrink-0 text-indigo-400" />}
        meta={
          sources.length > 0 ? (
            <span className="hidden sm:inline">
              {activeCount}/{sources.length} active
            </span>
          ) : undefined
        }
        onClose={onClose}
      >
        {/* Hidden file & folder inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.pptx,.md"
          onChange={handleFileUpload}
          className="hidden"
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          onChange={handleFolderUpload}
          className="hidden"
          {...({ webkitdirectory: '', directory: '' } as any)}
        />

        {/* Active Notebook */}
        <div className="rounded-xl border border-white/60 bg-white/65 p-3 shadow-xs backdrop-blur-md dark:border-white/[0.08] dark:bg-zinc-900/40 dark:shadow-none">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300">
              <Folder className="h-3.5 w-3.5" />
              Active Notebook
            </span>
            <button
              type="button"
              onClick={() => setShowNewNotebookModal(true)}
              className="flex items-center gap-1 text-[11px] font-semibold text-indigo-700 transition-colors hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </button>
          </div>

          {isLoadingNotebooks ? (
            <div className="flex items-center gap-2 py-2 text-[11px] text-slate-600 dark:text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
              Loading notebooks…
            </div>
          ) : notebooks.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={currentNotebookId || ''}
                  onChange={(e) => setCurrentNotebookId(e.target.value)}
                  aria-label="Active notebook"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300/80 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-slate-900 outline-none backdrop-blur-sm focus:border-indigo-500 dark:border-white/[0.08] dark:bg-zinc-800/80 dark:text-zinc-100"
                >
                  {notebooks.map((n) => (
                    <option key={n.id} value={n.id} className="bg-white text-slate-900 dark:bg-zinc-900 dark:text-zinc-200">
                      {n.title} ({n.source_count} {n.source_count === 1 ? 'source' : 'sources'})
                    </option>
                  ))}
                </select>
                {currentNotebookId && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={handleStartRenameNotebook}
                      className="rounded-lg border border-slate-300/80 bg-white/80 p-1.5 text-slate-700 transition-colors hover:bg-white hover:text-slate-900 dark:border-white/[0.08] dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-white cursor-pointer"
                      title="Rename current notebook"
                      aria-label="Rename current notebook"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteNotebook(currentNotebookId)}
                      className="rounded-lg border border-rose-300 bg-rose-50/80 p-1.5 text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20 cursor-pointer"
                      title="Delete current notebook"
                      aria-label="Delete current notebook"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              {currentNotebookId && (
                <p className="line-clamp-2 px-0.5 text-[11px] italic leading-relaxed text-slate-700 dark:text-zinc-400 font-medium">
                  {notebooks.find((n) => n.id === currentNotebookId)?.description ||
                    'General study notebook for grounded questions.'}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-300/80 bg-white/60 p-3 text-center backdrop-blur-sm dark:border-white/[0.04] dark:bg-white/[0.01]">
              <p className="mb-2 text-[11px] text-slate-600 dark:text-zinc-500">No notebooks created yet.</p>
              <button
                type="button"
                onClick={() => setShowNewNotebookModal(true)}
                className="cursor-pointer rounded-lg border border-indigo-500/30 bg-indigo-600/30 px-3 py-1.5 text-[11px] text-indigo-300 transition-colors hover:bg-indigo-600/50"
              >
                Create Your First Notebook
              </button>
            </div>
          )}
        </div>

        {/* Add sources */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={!currentNotebookId || busy}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-1 rounded-xl border border-dashed border-indigo-400/60 bg-white/70 py-2.5 text-xs font-semibold text-indigo-900 backdrop-blur-sm transition-all hover:border-indigo-600 hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-500/40 dark:bg-indigo-500/5 dark:text-indigo-300 dark:hover:border-indigo-400 dark:hover:bg-indigo-500/10 cursor-pointer"
          >
            {isUploadingSource ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Uploading…</span>
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" />
                <span>File</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={!currentNotebookId || busy}
            onClick={() => setShowImportUrlModal(true)}
            className="flex items-center justify-center gap-1 rounded-xl border border-dashed border-cyan-400/60 bg-white/70 py-2.5 text-xs font-semibold text-cyan-900 backdrop-blur-sm transition-all hover:border-cyan-600 hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-500/40 dark:bg-cyan-500/5 dark:text-cyan-300 dark:hover:border-cyan-400 dark:hover:bg-cyan-500/10 cursor-pointer"
          >
            {isImportingUrl ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Importing…</span>
              </>
            ) : (
              <>
                <Globe className="h-3.5 w-3.5" />
                <span>URL</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={!currentNotebookId || busy}
            onClick={() => folderInputRef.current?.click()}
            className="flex items-center justify-center gap-1 rounded-xl border border-dashed border-indigo-400/60 bg-white/70 py-2.5 text-xs font-semibold text-indigo-900 backdrop-blur-sm transition-all hover:border-indigo-600 hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-500/40 dark:bg-indigo-500/5 dark:text-indigo-300 dark:hover:border-indigo-400 dark:hover:bg-indigo-500/10 cursor-pointer"
          >
            {isUploadingFolder ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Importing…</span>
              </>
            ) : (
              <>
                <Folder className="h-3.5 w-3.5" />
                <span>Folder</span>
              </>
            )}
          </button>
        </div>

        {/* Source list */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-400">
              Sources ({activeCount}/{sources.length} active)
            </span>
            {sources.length > 0 && (
              <button
                type="button"
                onClick={handleToggleAllSources}
                className="text-[10px] font-semibold text-indigo-700 hover:text-indigo-900 transition-colors dark:text-indigo-400 dark:hover:text-indigo-300 cursor-pointer"
              >
                {activeCount === sources.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>

          <div className="space-y-2">
            {isLoadingSources ? (
              <div className="py-6 text-center text-xs text-slate-600 dark:text-zinc-500">
                <Loader2 className="mx-auto mb-1 h-4 w-4 animate-spin text-indigo-600" />
                Loading sources…
              </div>
            ) : sources.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300/80 bg-white/50 backdrop-blur-sm p-4 text-center text-xs leading-relaxed text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.01] dark:text-zinc-400">
                No sources yet. Upload lecture slides, notes, URLs, or YouTube videos to ground AI
                responses.
              </div>
            ) : (
              sources.map((source) => {
                const expanded = expandedSourceId === source.id;
                return (
                  <div
                    key={source.id}
                    className={`rounded-xl border p-2.5 transition-colors backdrop-blur-sm ${
                      source.is_selected
                        ? 'border-indigo-400/70 bg-indigo-50/70 text-slate-900 shadow-xs dark:border-indigo-500/30 dark:bg-indigo-950/20 dark:text-zinc-200 dark:shadow-none'
                        : 'border-white/60 bg-white/60 text-slate-800 dark:border-white/[0.06] dark:bg-zinc-900/60 dark:text-zinc-300'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={source.is_selected}
                        onChange={() => handleToggleSource(source.id)}
                        className="mt-1 h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-700"
                        title="Toggle source grounding"
                        aria-label={`Use ${source.title} for AI grounding`}
                      />
                      <button
                        type="button"
                        onClick={() => setExpandedSourceId(expanded ? null : source.id)}
                        aria-expanded={expanded}
                        aria-label={`${expanded ? 'Hide' : 'Show'} preview for ${source.title}`}
                        className="min-w-0 flex-1 cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-1.5">
                          <SourceTypeIcon source_type={source.source_type} />
                          <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-900 dark:text-zinc-200" title={source.title}>
                            {source.title}
                          </p>
                          {expanded ? (
                            <ChevronDown className="h-3 w-3 shrink-0 text-slate-500 dark:text-zinc-500" />
                          ) : (
                            <ChevronRight className="h-3 w-3 shrink-0 text-slate-500 dark:text-zinc-500" />
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-600 dark:text-zinc-500 font-medium">
                          <span className="font-mono uppercase">{source.source_type}</span>
                          {source.file_size > 0 && (
                            <>
                              <span>•</span>
                              <span>{(source.file_size / 1024).toFixed(1)} KB</span>
                            </>
                          )}
                          {source.page_count && (
                            <>
                              <span>•</span>
                              <span>{source.page_count} pgs</span>
                            </>
                          )}
                        </div>
                      </button>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <SourceStatusBadge status={source.status} />
                        <button
                          type="button"
                          onClick={() => handleDeleteSource(source.id)}
                          className="p-1 text-zinc-500 transition-colors hover:text-rose-400 cursor-pointer"
                          title="Remove source"
                          aria-label={`Remove ${source.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Expandable compact preview (metadata, never raw extracted text dumps) */}
                    {expanded && <SourcePreview source={source} />}

                    {/* No Transcript action banner for YouTube videos */}
                    {source.status === 'no_transcript' && (
                      <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
                        <p className="text-[10px] leading-tight text-amber-300/90">
                          Video saved without subtitles. Paste transcript to ground AI answers.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setPasteTranscriptSource(source);
                            setPasteTranscriptText('');
                          }}
                          className="shrink-0 cursor-pointer rounded-md border border-amber-500/30 bg-amber-500/20 px-2 py-1 text-[10px] font-medium text-amber-200 transition-colors hover:bg-amber-500/30"
                        >
                          Paste Transcript
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* YouTube educational search */}
        <CollapsibleSection
          icon={<Video className="h-3.5 w-3.5 shrink-0 text-rose-400" />}
          label="YouTube Search"
          badge={
            !youtubeConfigured ? (
              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-mono text-amber-400">
                Setup Required
              </span>
            ) : undefined
          }
        >
          <form onSubmit={handleSearchYouTube} className="mb-2.5 flex gap-2">
            <input
              type="text"
              value={youtubeQuery}
              onChange={(e) => setYoutubeQuery(e.target.value)}
              placeholder="Search lecture videos…"
              aria-label="Search YouTube videos"
              className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-zinc-800/80 px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-red-500"
            />
            <button
              type="submit"
              disabled={youtubeLoading}
              className="shrink-0 cursor-pointer rounded-lg bg-red-600/80 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              {youtubeLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Search'}
            </button>
          </form>

          {!youtubeConfigured && (
            <div className="mb-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-[11px] leading-relaxed text-amber-300">
              {youtubeMessage ||
                'Set YOUTUBE_API_KEY in the backend .env file to enable real YouTube Data API search.'}
            </div>
          )}

          {youtubeSearched && (
            <div className="space-y-2">
              {youtubeResults.length === 0 ? (
                <p className="py-1 text-center text-xs text-zinc-500">
                  No educational videos found for this query.
                </p>
              ) : (
                youtubeResults.map((v) => (
                  <div
                    key={v.video_id}
                    className="space-y-1.5 rounded-xl border border-white/[0.06] bg-zinc-800/50 p-2 transition-colors hover:bg-zinc-800"
                  >
                    <div className="flex items-center gap-2.5">
                      {v.thumbnail && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={v.thumbnail}
                          alt={v.title}
                          className="h-10 w-16 shrink-0 rounded-md object-cover"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <a
                          href={v.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-xs font-medium text-zinc-200 transition-colors hover:text-red-400"
                        >
                          {v.title}
                        </a>
                        <p className="text-[10px] text-zinc-500">{v.channel}</p>
                      </div>
                      <a
                        href={v.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zinc-500 transition-colors hover:text-white"
                        title="Open video"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                    <div className="flex justify-end border-t border-white/[0.04] pt-1">
                      <button
                        type="button"
                        disabled={savingVideoId === v.video_id}
                        onClick={() => handleSaveYouTubeVideo(v)}
                        className="flex cursor-pointer items-center gap-1 text-[10px] text-indigo-400 transition-colors hover:text-indigo-300 disabled:opacity-50"
                      >
                        {savingVideoId === v.video_id ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Saving…</span>
                          </>
                        ) : (
                          <>
                            <Plus className="h-3 w-3" />
                            <span>Save to Notebook</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CollapsibleSection>

        {/* Google Drive */}
        <CollapsibleSection
          icon={<Folder className="h-3.5 w-3.5 shrink-0 text-blue-400" />}
          label="Google Drive"
          badge={
            <span
              className={`rounded-full px-1.5 py-0.5 text-[9px] font-mono ${
                driveStatus?.connected
                  ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                  : driveStatus?.enabled
                    ? 'border border-blue-500/20 bg-blue-500/10 text-blue-400'
                    : 'border border-zinc-500/20 bg-zinc-500/10 text-zinc-400'
              }`}
            >
              {driveStatus?.connected
                ? driveStatus.account_email || 'Connected'
                : driveStatus?.enabled
                  ? 'Not connected'
                  : 'Disabled'}
            </span>
          }
        >
          {/* Integration disabled via GOOGLE_DRIVE_ENABLED */}
          {driveStatus && !driveStatus.enabled && (
            <div className="rounded-lg border border-white/[0.04] bg-zinc-800/40 p-2.5 text-[10px] leading-relaxed text-zinc-500">
              <p className="mb-1.5 font-semibold text-zinc-400">Google Drive is disabled</p>
              <p>
                The integration is turned off on the server. Set{' '}
                <code className="font-mono text-zinc-400">GOOGLE_DRIVE_ENABLED=true</code> in the
                backend <code className="font-mono text-zinc-400">.env</code>, together with the
                OAuth credentials, then restart the backend.
              </p>
            </div>
          )}

          {/* Enabled but OAuth credentials missing */}
          {driveStatus && driveStatus.enabled && !driveStatus.configured && (
            <div className="space-y-1 rounded-lg border border-white/[0.04] bg-zinc-800/40 p-2.5 text-[10px] leading-relaxed text-zinc-500">
              <p className="font-semibold text-zinc-400">Backend configuration required:</p>
              <p>
                1. In Google Cloud Console enable the Drive API, create an OAuth 2.0 Client ID
                (Web application).
              </p>
              <p>
                2. Set <code className="font-mono text-zinc-400">GOOGLE_DRIVE_CLIENT_ID</code>,{' '}
                <code className="font-mono text-zinc-400">GOOGLE_DRIVE_CLIENT_SECRET</code> and{' '}
                <code className="font-mono text-zinc-400">GOOGLE_DRIVE_REDIRECT_URI</code> in the
                backend <code className="font-mono text-zinc-400">.env</code>.
              </p>
              <p>
                3. Add this exact callback route as an Authorized redirect URI:{' '}
                <code className="font-mono break-all text-zinc-400">
                  {getApiBaseOrigin()}/api/v1/ai/drive/callback
                </code>
              </p>
            </div>
          )}

          {/* Enabled + configured, awaiting authorization */}
          {driveStatus && driveStatus.enabled && driveStatus.configured && !driveStatus.connected && (
            <div className="space-y-2.5">
              <p className="text-[11px] leading-relaxed text-zinc-400">{driveStatus.message}</p>
              <button
                type="button"
                onClick={handleConnectDrive}
                disabled={isConnectingDrive}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-600/20 px-3 py-2 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-600/30 disabled:opacity-50"
              >
                {isConnectingDrive ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Folder className="h-3.5 w-3.5" />
                )}
                Connect Google Account
              </button>
            </div>
          )}

          {/* Fully connected: account status, file selection, disconnect */}
          {driveStatus && driveStatus.enabled && driveStatus.configured && driveStatus.connected && (
            <div className="space-y-2.5">
              <p className="text-[11px] leading-relaxed text-zinc-400">{driveStatus.message}</p>
              {driveStatus.scopes && driveStatus.scopes.length > 0 && (
                <p className="text-[10px] leading-relaxed text-zinc-500">
                  Authorized access is limited to files selected via the Google Picker plus
                  metadata-only listings ({driveStatus.scopes.length}{' '}
                  {driveStatus.scopes.length === 1 ? 'scope' : 'scopes'}).
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={showDriveChooseFiles}
                  className="flex-1 cursor-pointer rounded-lg border border-blue-500/30 bg-blue-600/20 px-3 py-2 text-center text-xs font-medium text-blue-300 transition-colors hover:bg-blue-600/30"
                >
                  Choose Drive Files
                </button>
                <button
                  type="button"
                  onClick={handleDisconnectDrive}
                  className="cursor-pointer rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:border-rose-500/30 hover:text-rose-400"
                  title="Disconnect Google Drive and revoke authorization"
                >
                  Disconnect
                </button>
              </div>
              <button
                type="button"
                onClick={handleOpenDriveFiles}
                className="text-[10px] font-medium text-blue-400 transition-colors hover:text-blue-300"
              >
                Browse recent Drive documents (metadata list)
              </button>
            </div>
          )}

          {!driveStatus && (
            <div className="flex items-center gap-2 py-1 text-[11px] text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
              Checking Drive status…
            </div>
          )}
        </CollapsibleSection>

        {!currentNotebookId && notebooks.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-[11px] text-amber-300">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Select or create a notebook to add sources.</span>
          </div>
        )}
      </DrawerShell>

      {/* ===== Modals ===== */}

      {/* New Notebook Modal */}
      {showNewNotebookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8 dark:border-white/[0.1] dark:bg-zinc-900">
            <h2 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">Create New Study Notebook</h2>
            <p className="mb-4 text-xs text-slate-600 dark:text-zinc-400">
              A notebook organizes course chapters, slide decks, and lecture notes for focused AI
              citations.
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Notebook Title *
                </label>
                <input
                  value={newNotebookTitle}
                  onChange={(e) => setNewNotebookTitle(e.target.value)}
                  placeholder="e.g. Organic Chemistry — Semester 1"
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/[0.08] dark:bg-zinc-800/80 dark:text-white dark:placeholder:text-zinc-500"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Description (optional)
                </label>
                <textarea
                  value={newNotebookDesc}
                  onChange={(e) => setNewNotebookDesc(e.target.value)}
                  placeholder="e.g. Reaction mechanisms, reaction rates, lab notes"
                  rows={2}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/[0.08] dark:bg-zinc-800/80 dark:text-white dark:placeholder:text-zinc-500"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowNewNotebookModal(false)}
                className="flex-1 cursor-pointer rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateNotebook}
                disabled={!newNotebookTitle.trim()}
                className="flex-1 cursor-pointer rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500 disabled:opacity-50"
              >
                Create Notebook
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Notebook Modal */}
      {showRenameNotebookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8 dark:border-white/[0.1] dark:bg-zinc-900">
            <h2 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">Rename Study Notebook</h2>
            <p className="mb-4 text-xs text-slate-600 dark:text-zinc-400">
              Update the title or description of this study notebook.
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Notebook Title *
                </label>
                <input
                  value={renameNotebookTitle}
                  onChange={(e) => setRenameNotebookTitle(e.target.value)}
                  placeholder="e.g. Organic Chemistry — Semester 1"
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/[0.08] dark:bg-zinc-800/80 dark:text-white dark:placeholder:text-zinc-500"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Description (optional)
                </label>
                <textarea
                  value={renameNotebookDesc}
                  onChange={(e) => setRenameNotebookDesc(e.target.value)}
                  placeholder="e.g. Reaction mechanisms, reaction rates, lab notes"
                  rows={2}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/[0.08] dark:bg-zinc-800/80 dark:text-white dark:placeholder:text-zinc-500"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowRenameNotebookModal(false)}
                className="flex-1 cursor-pointer rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRenameNotebook}
                disabled={!renameNotebookTitle.trim() || isRenamingNotebook}
                className="flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500 disabled:opacity-50"
              >
                {isRenamingNotebook ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving…</span>
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import URL Modal */}
      {showImportUrlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8 dark:border-white/[0.1] dark:bg-zinc-900">
            <div className="mb-2 flex items-center gap-2">
              <Globe className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Import Public URL</h2>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
              Import study materials from a public article, documentation page, or web-hosted PDF to
              ground AI responses.
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Webpage or PDF URL *
                </label>
                <input
                  type="url"
                  value={importUrlInput}
                  onChange={(e) => setImportUrlInput(e.target.value)}
                  placeholder="https://en.wikipedia.org/wiki/Nucleophilic_substitution"
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none dark:border-white/[0.08] dark:bg-zinc-800/80 dark:text-white dark:placeholder:text-zinc-500"
                  required
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-500">
                Note: Localhost, private IPs, and internal endpoints are blocked for security.
              </p>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowImportUrlModal(false);
                  setImportUrlInput('');
                }}
                className="flex-1 cursor-pointer rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportUrl}
                disabled={!importUrlInput.trim() || isImportingUrl}
                className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-cyan-600/30 transition-all hover:bg-cyan-500 disabled:opacity-50"
              >
                {isImportingUrl ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Extracting Content…</span>
                  </>
                ) : (
                  'Import & Index'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paste Transcript Modal */}
      {pasteTranscriptSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8 dark:border-white/[0.1] dark:bg-zinc-900">
            <div className="mb-2 flex items-center gap-2">
              <Video className="h-5 w-5 text-rose-500 dark:text-rose-400" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Paste Video Transcript</h2>
            </div>
            <p className="mb-1 text-xs text-slate-600 dark:text-zinc-400">
              Provide the transcript or lesson notes for &quot;{pasteTranscriptSource.title}&quot;.
            </p>
            <p className="mb-4 text-[11px] text-slate-500 dark:text-zinc-500">
              Timestamps like [01:23] are automatically recognized and will be cited in AI
              responses.
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Transcript / Captions Text *
                </label>
                <textarea
                  value={pasteTranscriptText}
                  onChange={(e) => setPasteTranscriptText(e.target.value)}
                  placeholder="Paste captions or video transcript here... [00:05] Today we will discuss nucleophilic substitution..."
                  rows={8}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/[0.08] dark:bg-zinc-800/80 dark:text-white dark:placeholder:text-zinc-500"
                  required
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setPasteTranscriptSource(null);
                  setPasteTranscriptText('');
                }}
                className="flex-1 cursor-pointer rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePasteTranscript}
                disabled={!pasteTranscriptText.trim() || isSubmittingTranscript}
                className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500 disabled:opacity-50"
              >
                {isSubmittingTranscript ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Indexing Transcript…</span>
                  </>
                ) : (
                  'Activate for AI Grounding'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Drive File Browser Modal */}
      {driveFilesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8 dark:border-white/[0.1] dark:bg-zinc-900">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
                <Folder className="h-5 w-5 text-blue-500 dark:text-blue-400" />
                Import from Google Drive
              </h2>
              <button
                type="button"
                onClick={() => setDriveFilesModalOpen(false)}
                className="cursor-pointer text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-xs text-slate-600 dark:text-zinc-400">
              Select a PDF, Word document, or text file to index into &quot;
              {notebooks.find((n) => n.id === currentNotebookId)?.title || 'active notebook'}
              &quot;. Files readable through the minimal <code className="font-mono text-[10px] text-blue-600 dark:text-blue-300">drive.file</code> scope
              can be imported directly; others open via the Google Picker.
            </p>

            {isLoadingDriveFiles ? (
              <div className="space-y-2 py-8 text-center text-xs text-slate-500 dark:text-zinc-400">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-blue-500 dark:text-blue-400" />
                <p>Loading files from Google Drive…</p>
              </div>
            ) : driveFiles.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-zinc-500">
                No compatible documents (.pdf, .docx, .txt, or Google Docs) found in your Google
                Drive.
              </div>
            ) : (
              <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
                {driveFiles.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 transition-colors hover:bg-slate-100 dark:border-white/[0.08] dark:bg-zinc-800/60 dark:hover:bg-zinc-800"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <FileText className="h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-900 dark:text-zinc-200">{f.name}</p>
                        <p className="font-mono text-[10px] text-slate-500 dark:text-zinc-500">
                          {f.size ? `${(f.size / 1024).toFixed(1)} KB` : 'Google Doc'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isImportingDriveFile === f.id}
                      onClick={() => handleImportDriveFile(f)}
                      className="shrink-0 cursor-pointer rounded-lg border border-blue-500/30 bg-blue-600/10 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-600/20 dark:border-blue-500/30 dark:bg-blue-600/30 dark:text-blue-300 dark:hover:bg-blue-600/50 disabled:opacity-50"
                    >
                      {isImportingDriveFile === f.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        'Import'
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setDriveFilesModalOpen(false)}
                className="cursor-pointer rounded-xl bg-slate-100 px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Google Picker Modal (real OAuth-backed file selection) */}
      <DrivePickerModal
        open={drivePickerModalOpen}
        onClose={() => setDrivePickerModalOpen(false)}
        onFilesPicked={handlePickDriveFiles}
      />
    </>
  );
}
