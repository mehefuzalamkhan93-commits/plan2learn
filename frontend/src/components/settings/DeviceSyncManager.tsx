'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Laptop,
  Smartphone,
  Tablet,
  Monitor,
  RefreshCw,
  Trash2,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  Wifi,
  Loader2,
} from 'lucide-react';
import { authAPI } from '@/services/api';
import { DeviceSessionOut } from '@/types';
import { useToast } from '@/components/ui/useToast';
import { cn } from '@/lib/utils';

export default function DeviceSyncManager() {
  const { toast } = useToast();
  const [devices, setDevices] = useState<DeviceSessionOut[]>([]);
  const [maxAllowed, setMaxAllowed] = useState(2);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchDevices = useCallback(async (showToast = false) => {
    setIsRefreshing(true);
    try {
      const res = await authAPI.getDevices();
      if (res) {
        setDevices(res.devices || []);
        setMaxAllowed(res.max_allowed || 2);
        if (showToast) {
          toast({
            title: 'Devices Refreshed',
            description: 'Latest device session statuses retrieved.',
            variant: 'default',
          });
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch devices:', err);
      toast({
        title: 'Error Loading Devices',
        description: err?.response?.data?.detail || 'Could not load active device sessions.',
        variant: 'error',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const handleRevoke = async (sessionId: string, deviceName: string) => {
    setRevokingId(sessionId);
    try {
      await authAPI.revokeDevice(sessionId);
      toast({
        title: 'Device Disconnected',
        description: `Successfully signed out ${deviceName}.`,
        variant: 'default',
      });
      // Refresh device list
      await fetchDevices();
    } catch (err: any) {
      console.error('Failed to revoke device session:', err);
      toast({
        title: 'Revoke Failed',
        description: err?.response?.data?.detail || 'Unable to disconnect this device.',
        variant: 'error',
      });
    } finally {
      setRevokingId(null);
    }
  };

  const formatLastActive = (dateStr?: string) => {
    if (!dateStr) return 'Recently';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'Recently';
      const now = new Date();
      const diffSecs = Math.floor((now.getTime() - date.getTime()) / 1000);
      if (diffSecs < 60) return 'Active just now';
      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } catch {
      return 'Recently';
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'mobile':
        return <Smartphone className="h-5 w-5 text-indigo-400 light:text-indigo-600" />;
      case 'tablet':
        return <Tablet className="h-5 w-5 text-purple-400 light:text-purple-600" />;
      case 'desktop':
        return <Laptop className="h-5 w-5 text-sky-400 light:text-sky-600" />;
      default:
        return <Monitor className="h-5 w-5 text-zinc-400 light:text-zinc-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Device Limit & Sync Summary Card */}
      <div className="rounded-xl border border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-zinc-900/60 dark:bg-zinc-900/60 light:bg-slate-50 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 light:bg-indigo-50 light:text-indigo-600 light:border-indigo-200">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white dark:text-white light:text-slate-900">
                Multi-Device Synchronization
              </h4>
              <p className="text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-500">
                Maximum {maxAllowed} active devices per student account
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchDevices(true)}
            disabled={isRefreshing}
            className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 bg-white/[0.05] dark:bg-white/[0.05] light:bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-300 dark:text-zinc-300 light:text-slate-700 hover:bg-white/10 dark:hover:bg-white/10 light:hover:bg-slate-100 transition-colors disabled:opacity-50"
            title="Refresh device list"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {/* Capacity Indicator Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400 dark:text-zinc-400 light:text-slate-600 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Sync Engine: Active (15s Heartbeat)
            </span>
            <span className="font-semibold text-zinc-200 dark:text-zinc-200 light:text-slate-900">
              {devices.length} / {maxAllowed} Devices Used
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-zinc-800 dark:bg-zinc-800 light:bg-slate-200 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                devices.length >= maxAllowed ? 'bg-indigo-500' : 'bg-emerald-500'
              )}
              style={{ width: `${Math.min(100, (devices.length / maxAllowed) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Active Device List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 light:text-slate-500">
            Connected Devices ({devices.length})
          </h5>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-500 light:text-slate-400">
            Phone, PC, or Tablet
          </span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-zinc-400 dark:text-zinc-400 light:text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
            <span className="ml-2 text-xs">Loading active sessions...</span>
          </div>
        ) : devices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.1] dark:border-white/[0.1] light:border-slate-300 p-6 text-center text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-500">
            No active device sessions found.
          </div>
        ) : (
          <div className="space-y-2.5">
            {devices.map((device) => {
              const isCurrent = device.is_current;
              const isRevoking = revokingId === device.id;

              return (
                <div
                  key={device.id}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-xl border p-3.5 transition-all',
                    isCurrent
                      ? 'border-indigo-500/40 bg-indigo-500/5 dark:border-indigo-500/40 dark:bg-indigo-500/5 light:border-indigo-200 light:bg-indigo-50/50'
                      : 'border-white/[0.08] dark:border-white/[0.08] light:border-slate-200 bg-zinc-900/40 dark:bg-zinc-900/40 light:bg-white'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800/80 dark:bg-zinc-800/80 light:bg-slate-100 border border-white/[0.05] dark:border-white/[0.05] light:border-slate-200">
                      {getDeviceIcon(device.device_type)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white dark:text-white light:text-slate-900 truncate">
                          {device.device_name}
                        </span>
                        {isCurrent ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400 light:text-emerald-700 light:bg-emerald-50 light:border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" /> This Device
                          </span>
                        ) : null}
                        <span className="rounded-md bg-white/[0.05] dark:bg-white/[0.05] light:bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono uppercase text-zinc-400 dark:text-zinc-400 light:text-slate-600">
                          {device.device_type}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-500 mt-0.5">
                        <span>{formatLastActive(device.last_active || device.last_active_at)}</span>
                        {device.ip_address && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-[11px]">{device.ip_address}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isCurrent ? (
                      <span className="text-xs text-emerald-400 light:text-emerald-600 font-medium px-2 py-1">
                        Active
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRevoke(device.id, device.device_name)}
                        disabled={isRevoking}
                        className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 light:text-rose-700 light:bg-rose-50 light:border-rose-200 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                        title="Disconnect this remote device session"
                      >
                        {isRevoking ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        <span>Disconnect</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FIFO Policy & Sync Information */}
      <div className="rounded-xl border border-white/[0.06] dark:border-white/[0.06] light:border-slate-200 bg-white/[0.02] dark:bg-white/[0.02] light:bg-slate-50/70 p-4 space-y-2 text-xs text-zinc-400 dark:text-zinc-400 light:text-slate-600">
        <div className="flex items-center gap-2 text-zinc-200 dark:text-zinc-200 light:text-slate-800 font-medium">
          <Wifi className="h-4 w-4 text-indigo-400" />
          How Cross-Device Sync &amp; 2-Device Limit Works
        </div>
        <ul className="list-disc list-inside space-y-1.5 ml-1 text-[11px] leading-relaxed">
          <li>
            <strong className="text-zinc-300 dark:text-zinc-300 light:text-slate-700">Any Device Pair:</strong> You can stay logged in on a Phone &amp; PC, Phone &amp; Tablet, two Phones, or two PCs simultaneously.
          </li>
          <li>
            <strong className="text-zinc-300 dark:text-zinc-300 light:text-slate-700">Instant Sync:</strong> Study plans, AI notebook notes, flashcard mastery, and active sessions stay in continuous sync via background heartbeats and tab focus triggers.
          </li>
          <li>
            <strong className="text-zinc-300 dark:text-zinc-300 light:text-slate-700">Automatic FIFO Eviction:</strong> If you sign into a 3rd device, your oldest active device session is automatically and safely logged out so you are never locked out of your learning materials.
          </li>
        </ul>
      </div>
    </div>
  );
}
