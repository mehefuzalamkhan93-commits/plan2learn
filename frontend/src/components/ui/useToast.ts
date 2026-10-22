import { useState, useCallback } from 'react';

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: 'default' | 'error';
}

export function useToast() {
  const toast = useCallback(({ title, description, variant = 'default' }: ToastOptions) => {
    if (typeof window !== 'undefined') {
      // In production web apps, log or dispatch custom toast event
      if (variant === 'error') {
        console.error(`[Toast Error] ${title}: ${description || ''}`);
      } else {
        console.log(`[Toast] ${title}: ${description || ''}`);
      }
    }
  }, []);

  return { toast };
}
