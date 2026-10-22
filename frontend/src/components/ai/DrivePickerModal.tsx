'use client';

/**
 * Google Picker modal.
 *
 * Uses the Google Identity Services token client to mint a short-lived
 * in-memory access token (scope: drive.file) and the Picker API to let the
 * user select files granted to the app. Tokens are NEVER written to
 * browser storage — they live only in component memory for the Picker
 * session, per Google's standard Picker pattern.
 *
 * Requires GOOGLE_DRIVE_API_KEY + GOOGLE_DRIVE_APP_ID on the backend and an
 * OAuth client authorized for this origin.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import { aiAPI } from '@/services/api';

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const GAPI_SCRIPT_URL = 'https://apis.google.com/js/api.js';

// Types importable by the picker workflow
const PICKER_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.presentation',
].join(',');

export const DRIVE_PICKER_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export interface PickedDriveFile {
  id: string;
  name: string;
}

interface DrivePickerModalProps {
  open: boolean;
  onClose: () => void;
  onFilesPicked: (files: PickedDriveFile[]) => void;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)));
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.loaded = 'false';
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)));
    document.head.appendChild(script);
  });
}

function loadPickerApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.gapi) {
      reject(new Error('Google API script not available'));
      return;
    }
    window.gapi.load('picker', {
      callback: () => resolve(),
    });
  });
}

export default function DrivePickerModal({ open, onClose, onFilesPicked }: DrivePickerModalProps) {
  const [error, setError] = useState('');
  const [initializing, setInitializing] = useState(false);
  const pickerRef = useRef<{ dispose(): void } | null>(null);
  const resolvedRef = useRef(false);
  // Keep latest callbacks in refs so the picker session survives parent re-renders
  const onCloseRef = useRef(onClose);
  const onFilesPickedRef = useRef(onFilesPicked);
  useEffect(() => {
    onCloseRef.current = onClose;
    onFilesPickedRef.current = onFilesPicked;
  }, [onClose, onFilesPicked]);

  const cleanupPicker = useCallback(() => {
    try {
      pickerRef.current?.dispose();
    } catch {
      /* picker already gone */
    }
    pickerRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      cleanupPicker();
      return;
    }

    let cancelled = false;
    setInitializing(true);
    setError('');
    resolvedRef.current = false;

    (async () => {
      try {
        // 0. Fetch Picker config from the backend (never embeds secrets client-side).
        const config = await aiAPI.getDrivePickerConfig();

        // 1. Short-lived token for the Picker session (drive.file only).
        await loadScript(GIS_SCRIPT_URL);
        if (cancelled || !window.google?.accounts?.oauth2) throw new Error('Google Identity Services failed to load');
        const access_token = await new Promise<string>((resolve, reject) => {
          const tokenClient = window.google!.accounts!.oauth2!.initTokenClient({
            client_id: config.client_id,
            scope: DRIVE_PICKER_SCOPE,
            callback: (response) => {
              if (response?.access_token) resolve(response.access_token);
              else reject(new Error('Google authorization was cancelled or failed.'));
            },
            error_callback: (err) => reject(new Error(err?.message || 'Google authorization failed.')),
          });
          tokenClient.requestAccessToken({ prompt: '' });
        });
        if (cancelled) return;

        // 2. Load and open the Picker.
        await loadScript(GAPI_SCRIPT_URL);
        await loadPickerApi();
        if (cancelled || !window.google?.picker) throw new Error('Google Picker failed to load');

        const picker = new window.google.picker.PickerBuilder()
          .setOAuthToken(access_token)
          .setApiKey(config.api_key)
          .setAppId(config.app_id)
          .addView(
            new window.google.picker.View(window.google.picker.ViewId.DOCS).setMimeTypes(
              PICKER_MIME_TYPES
            )
          )
          .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
          .setCallback((response) => {
            if (resolvedRef.current) return;
            if (response.action === window.google!.picker!.Action.PICKED) {
              resolvedRef.current = true;
              cleanupPicker();
              const files = (response.docs ?? []).map((d) => ({ id: d.id, name: d.name }));
              onFilesPickedRef.current(files);
            } else if (response.action === window.google!.picker!.Action.CANCEL) {
              onCloseRef.current();
            }
          })
          .build();
        pickerRef.current = picker;
        picker.setVisible(true);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not open the Google Picker.');
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();

    return () => {
      cancelled = true;
      cleanupPicker();
    };
  }, [open, cleanupPicker]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8 dark:border-white/[0.1] dark:bg-zinc-900">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 cursor-pointer text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-white"
          aria-label="Close Google Picker"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">Import from Google Drive</h2>
        <p className="mb-4 text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
          Select study documents in the Google Picker. Only files you pick here become accessible
          to the app, matching the minimal <code className="font-mono text-[10px] text-blue-600 dark:text-blue-300">drive.file</code>{' '}
          authorization scope.
        </p>

        {initializing && (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500 dark:text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500 dark:text-blue-400" />
            Opening Google Picker…
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/5 dark:text-amber-300">
            <p className="mb-1 font-semibold">Google Picker unavailable</p>
            <p className="text-slate-600 dark:text-zinc-400">{error}</p>
            <p className="mt-1.5 text-slate-500 dark:text-zinc-500">
              The Picker needs GOOGLE_DRIVE_API_KEY and GOOGLE_DRIVE_APP_ID configured in the
              backend, and the OAuth client origin must match this app&apos;s address. You can still
              browse your Drive via the file list.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-white/[0.06]">
          <a
            href="https://developers.google.com/drive/picker/reference"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-400"
          >
            <ExternalLink className="h-3 w-3" />
            About the Google Picker
          </a>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-xl bg-slate-100 px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
